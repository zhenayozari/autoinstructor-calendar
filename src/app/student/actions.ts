"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryOne } from "@/lib/db/postgres";
import { getPublishedLegalDocumentsForAudience } from "@/lib/legal-documents";
import { getLegalDocumentDefinition } from "@/lib/legal-document-definitions";
import {
  clearStudentSession,
  requireCurrentStudentAccess,
} from "@/lib/student-session";
import {
  getLegalAcceptanceFieldName,
} from "@/lib/student-legal-requirements";
import { isStudentProfileConsentRequired } from "@/lib/student-profile-consent";
import {
  getEffectiveBookingPriceAmount,
  getConfiguredLessonPriceAmount,
  getConfiguredLessonPriceAmountPostgres,
  getInitialBookingPaymentFields,
  getSchoolPaymentRule,
  getSchoolPaymentRulePostgres,
} from "@/lib/pricing";
import {
  selectStudentLessonPackageForBooking,
  selectStudentLessonPackageForBookingPostgres,
} from "@/lib/student-lesson-packages";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { BookingCategory } from "@/lib/types";

export type StudentBookingActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type StudentProfileActionState = StudentBookingActionState;

export async function studentLogoutAction() {
  await clearStudentSession();
  redirect("/student/login");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию";
}

function readRequiredProfileString(formData: FormData, field: string, label: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Заполните поле «${label}»`);
  }

  const trimmed = value.trim();

  if (trimmed.length > 80) {
    throw new Error(`Поле «${label}» должно быть не длиннее 80 символов`);
  }

  return trimmed;
}

function readRequiredContact(formData: FormData) {
  const value = formData.get("student_phone");

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Укажите номер телефона или другой способ связи");
  }

  const trimmed = value.trim();

  if (trimmed.length > 200) {
    throw new Error("Способ связи должен быть не длиннее 200 символов");
  }

  return trimmed;
}

function getRequestIp(headersList: Headers) {
  return (
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip")?.trim() ||
    null
  );
}

export async function completeStudentProfileAction(
  previousState: StudentProfileActionState,
  formData: FormData,
): Promise<StudentProfileActionState> {
  void previousState;

  if (!isPostgresBackend()) {
    return {
      status: "error",
      message: "Заполнение профиля доступно в PostgreSQL-режиме.",
    };
  }

  try {
    const access = await requireCurrentStudentAccess();
    const firstName = readRequiredProfileString(formData, "first_name", "Имя");
    const lastName = readRequiredProfileString(formData, "last_name", "Фамилия");
    const studentPhone = readRequiredContact(formData);

    const publishedDocuments = await getPublishedLegalDocumentsForAudience(
      access.organizationId,
      "student",
    );
    const publishedDocumentsByType = new Map(
      publishedDocuments.map((document) => [document.document_type, document]),
    );
    const requiredDocumentTypes = publishedDocuments.map(
      (document) => document.document_type,
    );

    const missingConsentLabels = requiredDocumentTypes.filter(
      (type) => formData.get(getLegalAcceptanceFieldName(type)) !== "on",
    ).map(
      (type) => getLegalDocumentDefinition(type)?.shortLabel ?? "документ",
    );

    if (missingConsentLabels.length > 0) {
      throw new Error(
        `Подтвердите согласие по документам: ${missingConsentLabels.join(", ")}`,
      );
    }

    const headersList = await headers();
    const acceptedDocuments = requiredDocumentTypes.map((type) =>
      publishedDocumentsByType.get(type),
    ).filter((document): document is NonNullable<typeof document> =>
      Boolean(document),
    );
    const consentDocumentIds = acceptedDocuments.map((document) => document.id);
    const consentDocumentVersions = acceptedDocuments.map((document) => ({
        id: document.id,
        type: document.document_type,
        title: document.title,
        version_label: document.version_label,
        published_at: document.published_at,
      }));

    await executeQuery(
      `
        update public.student_accesses
        set first_name = $1,
            last_name = $2,
            student_phone = $3,
            display_label = $4,
            profile_completed_at = now(),
            personal_data_consent_at = now(),
            personal_data_consent_source = 'student_first_login',
            personal_data_consent_ip = $5,
            personal_data_consent_user_agent = $6,
            personal_data_consent_document_ids = $7::uuid[],
            personal_data_consent_document_versions = $8::jsonb,
            updated_at = now()
        where id = $9
      `,
      [
        firstName,
        lastName,
        studentPhone,
        `${lastName} ${firstName}`,
        getRequestIp(headersList),
        headersList.get("user-agent"),
        consentDocumentIds,
        JSON.stringify(consentDocumentVersions),
        access.id,
      ],
    );

    revalidatePath("/student");
    revalidatePath("/admin/students");
  } catch (error) {
    console.error("completeStudentProfileAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }

  redirect("/student");
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache")
  );
}

async function insertStudentBooking({
  supabase,
  slotId,
  accessId,
  studentLabel,
  packageId,
  schoolId,
  bookingCategory,
  priceAmount,
  paymentRule,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  slotId: string;
  accessId: string;
  studentLabel: string;
  packageId: string | null;
  schoolId: string | null;
  bookingCategory: BookingCategory;
  priceAmount: number | null;
  paymentRule: Awaited<ReturnType<typeof getSchoolPaymentRule>>;
}) {
  const paymentFields = getInitialBookingPaymentFields({
    priceAmount,
    paymentRule,
    bookingCategory,
  });
  const payload = {
    slot_id: slotId,
    student_access_id: accessId,
    student_label: studentLabel,
    status: "confirmed",
  };
  const extendedPayload = {
    ...payload,
    student_lesson_package_id: packageId,
    school_id: schoolId,
    price_amount: priceAmount,
    ...paymentFields,
    booking_category: bookingCategory,
  };
  const { error } = await supabase.from("bookings").insert(extendedPayload);

  if (!error || !isMissingColumnError(error)) {
    return error;
  }

  const { error: priceOnlyError } = await supabase.from("bookings").insert({
    ...payload,
    price_amount: priceAmount,
    ...paymentFields,
  });

  if (!priceOnlyError || !isMissingColumnError(priceOnlyError)) {
    return priceOnlyError;
  }

  const { error: fallbackError } = await supabase
    .from("bookings")
    .insert(payload);

  return fallbackError;
}

function isPostgresUniqueViolation(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

function getCurrentDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function insertStudentBookingPostgres({
  slotId,
  accessId,
  studentLabel,
  packageId,
  schoolId,
  bookingCategory,
  priceAmount,
  paymentRule,
}: {
  slotId: string;
  accessId: string;
  studentLabel: string;
  packageId: string | null;
  schoolId: string | null;
  bookingCategory: BookingCategory;
  priceAmount: number | null;
  paymentRule: Awaited<ReturnType<typeof getSchoolPaymentRulePostgres>>;
}) {
  const paymentFields = getInitialBookingPaymentFields({
    priceAmount,
    paymentRule,
    bookingCategory,
  });

  await executeQuery(
    `
      insert into public.bookings (
        slot_id, student_access_id, student_label,
        student_lesson_package_id, school_id, price_amount,
        paid_amount, is_paid, paid_at, booking_category, status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed')
    `,
    [
      slotId,
      accessId,
      studentLabel,
      packageId,
      schoolId,
      priceAmount,
      paymentFields.paid_amount,
      paymentFields.is_paid,
      paymentFields.paid_at,
      bookingCategory,
    ],
  );
}

export async function studentBookSlotAction(
  previousState: StudentBookingActionState,
  formData: FormData,
): Promise<StudentBookingActionState> {
  void previousState;

  try {
    const access = await requireCurrentStudentAccess();
    const slotId = formData.get("slot_id");

    if (
      isPostgresBackend() &&
      !access.profileCompletedAt &&
      (await isStudentProfileConsentRequired(access.organizationId))
    ) {
      throw new Error(
        "Сначала заполните профиль и подтвердите согласие на обработку персональных данных",
      );
    }

    if (typeof slotId !== "string" || !slotId) {
      throw new Error("Не удалось определить выбранный слот");
    }

    if (isPostgresBackend()) {
      const slot = await queryOne<{
        id: string;
        instructor_id: string;
        lesson_type_id: string;
        status: "available" | "blocked";
        is_booked: boolean;
        date: string;
        timezone: string | null;
        lesson_type_name: string;
      }>(
        `
          select id, instructor_id, lesson_type_id, status, is_booked,
                 date::text as date, timezone, lesson_type_name
          from public.public_schedule_slots
          where id = $1
          limit 1
        `,
        [slotId],
      );

      if (!slot || slot.instructor_id !== access.instructorId) {
        throw new Error("Этот слот недоступен для вашего доступа");
      }

      if (slot.status !== "available" || slot.is_booked) {
        throw new Error("Этот слот уже занят");
      }

      if (slot.date < getCurrentDate(slot.timezone ?? DEFAULT_TIMEZONE)) {
        throw new Error("Нельзя записаться на прошедшее занятие");
      }

      const selectedPackage = await selectStudentLessonPackageForBookingPostgres({
        access: {
          id: access.id,
          organization_id: access.organizationId,
          instructor_id: access.instructorId,
          school_id: access.schoolId,
          total_lesson_limit: access.totalLessonLimit,
          weekly_lesson_limit: access.weeklyLessonLimit,
        },
        lessonTypeId: slot.lesson_type_id,
        lessonDate: slot.date,
        legacyLessonTypeIds: access.lessonTypeIds,
      });

      const configuredPriceAmount =
        await getConfiguredLessonPriceAmountPostgres({
          organizationId: access.organizationId,
          schoolId: selectedPackage.schoolId,
          lessonTypeId: slot.lesson_type_id,
        });
      const priceAmount = getEffectiveBookingPriceAmount({
        priceAmount: configuredPriceAmount,
        bookingCategory: selectedPackage.bookingCategory,
      });
      const paymentRule = await getSchoolPaymentRulePostgres({
        organizationId: access.organizationId,
        schoolId: selectedPackage.schoolId,
      });

      try {
        await insertStudentBookingPostgres({
          slotId: slot.id,
          accessId: access.id,
          studentLabel: access.displayLabel,
          packageId: selectedPackage.id,
          schoolId: selectedPackage.schoolId,
          bookingCategory: selectedPackage.bookingCategory,
          priceAmount,
          paymentRule,
        });
      } catch (error) {
        if (isPostgresUniqueViolation(error)) {
          throw new Error("Этот слот уже занят");
        }

        throw error;
      }

      revalidatePath("/student");
      revalidatePath("/admin");
      revalidatePath("/admin/bookings");
      revalidatePath("/admin/schedule");
      revalidatePath("/schedule");
      revalidatePath("/instructors");

      return {
        status: "success",
        message: "Вы записаны на занятие",
      };
    }

    const supabase = createAdminClient();
    const { data: slot, error: slotError } = await supabase
      .from("public_schedule_slots")
      .select(
        "id, instructor_id, lesson_type_id, status, is_booked, date, timezone, lesson_type_name",
      )
      .eq("id", slotId)
      .maybeSingle();

    if (slotError && isMissingColumnError(slotError)) {
      throw new Error("Расписание обновляется. Попробуйте обновить страницу позже");
    }

    if (slotError) {
      throw new Error(slotError.message);
    }

    if (!slot || slot.instructor_id !== access.instructorId) {
      throw new Error("Этот слот недоступен для вашего доступа");
    }

    if (slot.status !== "available" || slot.is_booked) {
      throw new Error("Этот слот уже занят");
    }

    if (slot.date < getCurrentDate(slot.timezone ?? DEFAULT_TIMEZONE)) {
      throw new Error("Нельзя записаться на прошедшее занятие");
    }

    const selectedPackage = await selectStudentLessonPackageForBooking({
      supabase,
      access: {
        id: access.id,
        organization_id: access.organizationId,
        instructor_id: access.instructorId,
        school_id: access.schoolId,
        total_lesson_limit: access.totalLessonLimit,
        weekly_lesson_limit: access.weeklyLessonLimit,
      },
      lessonTypeId: slot.lesson_type_id,
      lessonDate: slot.date,
      legacyLessonTypeIds: access.lessonTypeIds,
    });

    const configuredPriceAmount = await getConfiguredLessonPriceAmount({
      supabase,
      organizationId: access.organizationId,
      schoolId: selectedPackage.schoolId,
      lessonTypeId: slot.lesson_type_id,
    });
    const priceAmount = getEffectiveBookingPriceAmount({
      priceAmount: configuredPriceAmount,
      bookingCategory: selectedPackage.bookingCategory,
    });
    const paymentRule = await getSchoolPaymentRule({
      supabase,
      organizationId: access.organizationId,
      schoolId: selectedPackage.schoolId,
    });
    const error = await insertStudentBooking({
      supabase,
      slotId: slot.id,
      accessId: access.id,
      studentLabel: access.displayLabel,
      packageId: selectedPackage.id,
      schoolId: selectedPackage.schoolId,
      bookingCategory: selectedPackage.bookingCategory,
      priceAmount,
      paymentRule,
    });

    if (error) {
      if (error.code === "23505") {
        throw new Error("Этот слот уже занят");
      }

      throw new Error(error.message);
    }

    revalidatePath("/student");
    revalidatePath("/admin");
    revalidatePath("/admin/bookings");
    revalidatePath("/admin/schedule");
    revalidatePath("/schedule");
    revalidatePath("/instructors");

    return {
      status: "success",
      message: "Вы записаны на занятие",
    };
  } catch (error) {
    console.error("studentBookSlotAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
