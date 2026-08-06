"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearStudentSession,
  requireCurrentStudentAccess,
} from "@/lib/student-session";
import {
  getEffectiveBookingPriceAmount,
  getConfiguredLessonPriceAmount,
  getInitialBookingPaymentFields,
  getSchoolPaymentRule,
} from "@/lib/pricing";
import { selectStudentLessonPackageForBooking } from "@/lib/student-lesson-packages";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingCategory } from "@/lib/types";

export type StudentBookingActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function studentLogoutAction() {
  await clearStudentSession();
  redirect("/student/login");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию";
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

export async function studentBookSlotAction(
  previousState: StudentBookingActionState,
  formData: FormData,
): Promise<StudentBookingActionState> {
  void previousState;

  try {
    const access = await requireCurrentStudentAccess();
    const slotId = formData.get("slot_id");

    if (typeof slotId !== "string" || !slotId) {
      throw new Error("Не удалось определить выбранный слот");
    }

    const supabase = createAdminClient();
    const { data: slot, error: slotError } = await supabase
      .from("public_schedule_slots")
      .select(
        "id, instructor_id, lesson_type_id, status, is_booked, date, lesson_type_name",
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
