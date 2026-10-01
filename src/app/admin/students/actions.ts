"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireActiveOrganizationMember,
  requireInstructorAccess,
  type ActiveOrganizationMembership,
} from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryOne, queryRows, withTransaction } from "@/lib/db/postgres";
import { logAuditEvent } from "@/lib/audit-log";
import { hashStudentAccessSecret } from "@/lib/student-access";
import { revokeAllStudentSessions } from "@/lib/student-session";
import {
  STUDENT_SECRET_MAX_LENGTH,
  STUDENT_SECRET_MIN_LENGTH,
} from "@/lib/student-secret-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingPricingTableError } from "@/lib/pricing";
import { purgeStudentAccessData } from "@/lib/destructive-data-cleanup";
import type { BookingCategory, SchoolPaymentRule } from "@/lib/types";
import {
  createInstructorPayoutEntryForPrepaidCredit,
  syncInstructorPayoutEntryForPrepaidCredit,
} from "@/lib/instructor-payouts";

export type StudentAccessActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type StudentRegistrationLinkActionState = StudentAccessActionState;

function readRequiredString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле «${field}» обязательно`);
  }

  return value.trim();
}

function readOptionalString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function readOptionalLimit(formData: FormData, field: string, max: number) {
  const value = readOptionalString(formData, field);

  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`Поле «${field}» должно быть целым числом от 1 до ${max}`);
  }

  return parsed;
}

function readOptionalMoneyAmount(formData: FormData, field: string) {
  const value = readOptionalString(formData, field);

  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000_000) {
    throw new Error(`Поле «${field}» должно быть целым числом от 0 до 10000000`);
  }

  return parsed;
}

function readPaymentRuleOverride(
  formData: FormData,
): SchoolPaymentRule | null {
  const value = readOptionalString(formData, "payment_rule_override");

  if (value === null) {
    return null;
  }

  if (value === "manual" || value === "prepaid" || value === "settle_later") {
    return value;
  }

  throw new Error("Некорректное правило оплаты");
}

function readLessonTypeIds(formData: FormData) {
  return formData
    .getAll("lesson_type_ids")
    .filter((value): value is string => typeof value === "string" && Boolean(value));
}

function readBookingCategory(formData: FormData): BookingCategory {
  const value = formData.get("booking_category");

  if (value === "extra" || value === "gift") {
    return value;
  }

  return "regular";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию";
}

function isPostgresErrorCode(error: unknown, code: string) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code
  );
}

function normalizeLogin(login: string) {
  return login.trim().toLocaleLowerCase("ru-RU");
}

function validateLogin(login: string) {
  if (!/^[a-z0-9][a-z0-9_-]{2,49}$/.test(login)) {
    throw new Error(
      "Логин должен быть 3–50 символов: латинские буквы, цифры, дефис или подчёркивание",
    );
  }
}

function validateSecret(secret: string) {
  if (
    secret.length < STUDENT_SECRET_MIN_LENGTH ||
    secret.length > STUDENT_SECRET_MAX_LENGTH
  ) {
    throw new Error(
      `ПИН-код/пароль должен содержать от ${STUDENT_SECRET_MIN_LENGTH} до ${STUDENT_SECRET_MAX_LENGTH} символов`,
    );
  }
}

function validateStudentPhone(phone: string | null) {
  if (phone && phone.length > 200) {
    throw new Error("Способ связи должен быть не длиннее 200 символов");
  }

  return phone;
}

async function validateLessonTypes(lessonTypeIds: string[]) {
  if (lessonTypeIds.length === 0) {
    throw new Error("Выберите хотя бы один разрешённый тип занятия");
  }

  const uniqueIds = [...new Set(lessonTypeIds)];

  if (isPostgresBackend()) {
    const data = await queryRows<{ id: string }>(
      `
        select id
        from public.lesson_types
        where id = any($1::uuid[])
      `,
      [uniqueIds],
    );

    if (data.length !== uniqueIds.length) {
      throw new Error("Один из выбранных типов занятий не найден");
    }

    return uniqueIds;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("lesson_types")
    .select("id")
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Один из выбранных типов занятий не найден");
  }

  return uniqueIds;
}

async function validateSchoolId(
  schoolId: string | null,
  organizationId: string,
) {
  if (!schoolId) {
    return null;
  }

  if (isPostgresBackend()) {
    const data = await queryOne<{ id: string }>(
      `
        select id
        from public.schools
        where id = $1
          and organization_id = $2
        limit 1
      `,
      [schoolId, organizationId],
    );

    if (!data) {
      throw new Error("Автошкола не найдена");
    }

    return schoolId;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("schools")
    .select("id")
    .eq("id", schoolId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Автошкола не найдена");
  }

  return schoolId;
}

async function validateRequiredSchoolId(
  formData: FormData,
  organizationId: string,
): Promise<string> {
  const schoolId = await validateSchoolId(
    readRequiredString(formData, "school_id"),
    organizationId,
  );

  if (!schoolId) {
    throw new Error("Выберите источник ученика");
  }

  return schoolId;
}

async function replaceAccessLessonTypes({
  supabase,
  accessId,
  lessonTypeIds,
}: {
  supabase?: ReturnType<typeof createAdminClient>;
  accessId: string;
  lessonTypeIds: string[];
}) {
  if (isPostgresBackend()) {
    await executeQuery(
      `
        delete from public.student_access_lesson_types
        where student_access_id = $1
      `,
      [accessId],
    );

    if (lessonTypeIds.length === 0) {
      return;
    }

    await executeQuery(
      `
        insert into public.student_access_lesson_types (
          student_access_id, lesson_type_id
        )
        select $1::uuid, unnest($2::uuid[])
      `,
      [accessId, lessonTypeIds],
    );
    return;
  }

  if (!supabase) {
    throw new Error("Supabase client is required");
  }

  const { error: deleteError } = await supabase
    .from("student_access_lesson_types")
    .delete()
    .eq("student_access_id", accessId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (lessonTypeIds.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("student_access_lesson_types")
    .insert(
      lessonTypeIds.map((lessonTypeId) => ({
        student_access_id: accessId,
        lesson_type_id: lessonTypeId,
      })),
    );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function replacePackageLessonTypes({
  supabase,
  packageId,
  lessonTypeIds,
}: {
  supabase?: ReturnType<typeof createAdminClient>;
  packageId: string;
  lessonTypeIds: string[];
}) {
  if (isPostgresBackend()) {
    await executeQuery(
      `
        delete from public.student_lesson_package_types
        where package_id = $1
      `,
      [packageId],
    );

    if (lessonTypeIds.length === 0) {
      return;
    }

    await executeQuery(
      `
        insert into public.student_lesson_package_types (
          package_id, lesson_type_id
        )
        select $1::uuid, unnest($2::uuid[])
      `,
      [packageId, lessonTypeIds],
    );
    return;
  }

  if (!supabase) {
    throw new Error("Supabase client is required");
  }

  const { error: deleteError } = await supabase
    .from("student_lesson_package_types")
    .delete()
    .eq("package_id", packageId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (lessonTypeIds.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from("student_lesson_package_types")
    .insert(
      lessonTypeIds.map((lessonTypeId) => ({
        package_id: packageId,
        lesson_type_id: lessonTypeId,
      })),
    );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function syncPrimaryStudentLessonPackage({
  supabase,
  accessId,
  organizationId,
  instructorId,
  schoolId,
  customPriceAmount,
  paymentRuleOverride,
  totalLessonLimit,
  weeklyLessonLimit,
  isActive,
  lessonTypeIds,
}: {
  supabase?: ReturnType<typeof createAdminClient>;
  accessId: string;
  organizationId: string;
  instructorId: string;
  schoolId: string | null;
  customPriceAmount: number | null;
  paymentRuleOverride: SchoolPaymentRule | null;
  totalLessonLimit: number | null;
  weeklyLessonLimit: number | null;
  isActive: boolean;
  lessonTypeIds: string[];
}) {
  if (isPostgresBackend()) {
    const existingPackage = await queryOne<{ id: string }>(
      `
        select id
        from public.student_lesson_packages
        where student_access_id = $1
          and sort_order = 100
        limit 1
      `,
      [accessId],
    );
    let packageId = existingPackage?.id;

    if (packageId) {
      await executeQuery(
        `
          update public.student_lesson_packages
          set organization_id = $1,
              instructor_id = $2,
              school_id = $3,
              booking_category = 'regular',
              custom_price_amount = $4,
              payment_rule_override = $5,
              total_lesson_limit = $6,
              weekly_lesson_limit = $7,
              is_active = $8,
              updated_at = now()
          where id = $9
        `,
        [
          organizationId,
          instructorId,
          schoolId,
          customPriceAmount,
          paymentRuleOverride,
          totalLessonLimit,
          weeklyLessonLimit,
          isActive,
          packageId,
        ],
      );
    } else {
      const packageRow = await queryOne<{ id: string }>(
        `
          insert into public.student_lesson_packages (
            student_access_id, organization_id, instructor_id, school_id,
            booking_category, custom_price_amount, payment_rule_override,
            total_lesson_limit, weekly_lesson_limit, is_active, sort_order
          )
          values ($1, $2, $3, $4, 'regular', $5, $6, $7, $8, $9, 100)
          returning id
        `,
        [
          accessId,
          organizationId,
          instructorId,
          schoolId,
          customPriceAmount,
          paymentRuleOverride,
          totalLessonLimit,
          weeklyLessonLimit,
          isActive,
        ],
      );

      if (!packageRow) {
        throw new Error("Не удалось создать доступ к занятиям");
      }

      packageId = packageRow.id;
    }

    await replacePackageLessonTypes({
      supabase,
      packageId,
      lessonTypeIds,
    });

    return packageId;
  }

  if (!supabase) {
    throw new Error("Supabase client is required");
  }

  const { data: existingPackage, error: packageLookupError } = await supabase
    .from("student_lesson_packages")
    .select("id")
    .eq("student_access_id", accessId)
    .eq("sort_order", 100)
    .maybeSingle();

  if (packageLookupError) {
    if (isMissingPricingTableError(packageLookupError)) {
      return null;
    }

    throw new Error(packageLookupError.message);
  }

  let packageId = existingPackage?.id as string | undefined;

  if (packageId) {
    const { error } = await supabase
      .from("student_lesson_packages")
      .update({
        organization_id: organizationId,
        instructor_id: instructorId,
        school_id: schoolId,
        booking_category: "regular",
        custom_price_amount: customPriceAmount,
        payment_rule_override: paymentRuleOverride,
        total_lesson_limit: totalLessonLimit,
        weekly_lesson_limit: weeklyLessonLimit,
        is_active: isActive,
      })
      .eq("id", packageId);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { data, error } = await supabase
      .from("student_lesson_packages")
      .insert({
        student_access_id: accessId,
        organization_id: organizationId,
        instructor_id: instructorId,
        school_id: schoolId,
        booking_category: "regular",
        custom_price_amount: customPriceAmount,
        payment_rule_override: paymentRuleOverride,
        total_lesson_limit: totalLessonLimit,
        weekly_lesson_limit: weeklyLessonLimit,
        is_active: isActive,
        sort_order: 100,
      })
      .select("id")
      .single();

    if (error || !data) {
      if (isMissingPricingTableError(error)) {
        return null;
      }

      throw new Error(error?.message ?? "Не удалось создать доступ к занятиям");
    }

    packageId = data.id as string;
  }

  await replacePackageLessonTypes({
    supabase,
    packageId,
    lessonTypeIds,
  });

  return packageId;
}

async function syncAccessLessonTypesFromPackages({
  supabase,
  accessId,
  fallbackLessonTypeIds,
}: {
  supabase?: ReturnType<typeof createAdminClient>;
  accessId: string;
  fallbackLessonTypeIds: string[];
}) {
  if (isPostgresBackend()) {
    const packages = await queryRows<{ id: string }>(
      `
        select id
        from public.student_lesson_packages
        where student_access_id = $1
          and is_active = true
      `,
      [accessId],
    );
    const packageIds = packages.map((item) => item.id);
    const lessonTypeIds = new Set(fallbackLessonTypeIds);

    if (packageIds.length > 0) {
      const packageTypes = await queryRows<{ lesson_type_id: string }>(
        `
          select lesson_type_id
          from public.student_lesson_package_types
          where package_id = any($1::uuid[])
        `,
        [packageIds],
      );

      for (const item of packageTypes) {
        lessonTypeIds.add(item.lesson_type_id);
      }
    }

    await replaceAccessLessonTypes({
      supabase,
      accessId,
      lessonTypeIds: [...lessonTypeIds],
    });
    return;
  }

  if (!supabase) {
    throw new Error("Supabase client is required");
  }

  const { data: packages, error: packageError } = await supabase
    .from("student_lesson_packages")
    .select("id")
    .eq("student_access_id", accessId)
    .eq("is_active", true);

  if (packageError) {
    if (isMissingPricingTableError(packageError)) {
      await replaceAccessLessonTypes({
        supabase,
        accessId,
        lessonTypeIds: fallbackLessonTypeIds,
      });
      return;
    }

    throw new Error(packageError.message);
  }

  const packageIds = (packages ?? []).map((item) => item.id as string);
  const lessonTypeIds = new Set(fallbackLessonTypeIds);

  if (packageIds.length > 0) {
    const { data: packageTypes, error: packageTypesError } = await supabase
      .from("student_lesson_package_types")
      .select("lesson_type_id")
      .in("package_id", packageIds);

    if (packageTypesError) {
      throw new Error(packageTypesError.message);
    }

    for (const item of packageTypes ?? []) {
      lessonTypeIds.add(item.lesson_type_id as string);
    }
  }

  await replaceAccessLessonTypes({
    supabase,
    accessId,
    lessonTypeIds: [...lessonTypeIds],
  });
}

async function getManageableAccess(accessId: string) {
  const membership = await requireActiveOrganizationMember();

  if (isPostgresBackend()) {
    const data = await queryOne<{
      id: string;
      instructor_id: string;
      organization_id: string;
      login: string;
      display_label: string;
      student_phone: string | null;
      school_id: string | null;
    }>(
      `
        select id, instructor_id, organization_id, login, display_label,
               student_phone, school_id
        from public.student_accesses
        where id = $1
          and organization_id = $2
        limit 1
      `,
      [accessId, membership.organizationId],
    );

    if (!data) {
      throw new Error("Учебный доступ не найден");
    }

    await requireInstructorAccess(data.instructor_id);

    return {
      membership,
      access: data,
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_accesses")
    .select("id, instructor_id, organization_id, login, display_label, student_phone, school_id")
    .eq("id", accessId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Учебный доступ не найден");
  }

  await requireInstructorAccess(data.instructor_id);

  return {
    membership,
    access: data as {
      id: string;
      instructor_id: string;
      organization_id: string;
      login: string;
      display_label: string;
      student_phone: string | null;
      school_id: string | null;
    },
  };
}

async function getManageableStudentLessonPackage(packageId: string) {
  const membership = await requireActiveOrganizationMember();

  if (isPostgresBackend()) {
    const data = await queryOne<{
      id: string;
      student_access_id: string;
      instructor_id: string;
      organization_id: string;
      sort_order: number;
      school_id: string | null;
      custom_price_amount: number | null;
      payment_rule_override: SchoolPaymentRule | null;
    }>(
      `
        select id, student_access_id, instructor_id, organization_id, sort_order,
               school_id, custom_price_amount, payment_rule_override
        from public.student_lesson_packages
        where id = $1
          and organization_id = $2
        limit 1
      `,
      [packageId, membership.organizationId],
    );

    if (!data) {
      throw new Error("Доступ к занятиям не найден");
    }

    await requireInstructorAccess(data.instructor_id);

    return {
      membership,
      packageRow: data,
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_lesson_packages")
    .select("id, student_access_id, instructor_id, organization_id, sort_order, school_id, custom_price_amount, payment_rule_override")
    .eq("id", packageId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error) {
    if (isMissingPricingTableError(error)) {
      throw new Error(
        "Сначала примените миграцию для пакетов занятий в Supabase",
      );
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Доступ к занятиям не найден");
  }

  await requireInstructorAccess(data.instructor_id as string);

  return {
    membership,
    packageRow: data as {
      id: string;
      student_access_id: string;
      instructor_id: string;
      organization_id: string;
      sort_order: number;
      school_id: string | null;
      custom_price_amount: number | null;
      payment_rule_override: SchoolPaymentRule | null;
    },
  };
}

function assertOwnerCanDelete(membership: Awaited<ReturnType<typeof requireActiveOrganizationMember>>) {
  if (membership.role !== "owner") {
    throw new Error("Удалять навсегда может только руководитель");
  }
}

function canManageStudentPrices(membership: ActiveOrganizationMembership) {
  return membership.role === "owner";
}

function normalizeSourceName(value: string) {
  return value.trim().toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");
}

function isPrivateStudentSourceName(value: string) {
  const name = normalizeSourceName(value);

  return name === "частные ученики" || name === "частный ученик";
}

async function canManageStudentLessonPackages({
  membership,
  instructorId,
}: {
  membership: ActiveOrganizationMembership;
  instructorId: string;
}) {
  if (membership.role === "owner") {
    return true;
  }

  if (!isPostgresBackend()) {
    return false;
  }

  const settings = await queryOne<{ can_manage_student_packages: boolean }>(
    `
      select can_manage_student_packages
      from public.instructor_payout_settings
      where organization_id = $1
        and instructor_id = $2
      limit 1
    `,
    [membership.organizationId, instructorId],
  );

  return settings?.can_manage_student_packages ?? false;
}

async function canManagePrivateStudentPackagePrice({
  membership,
  instructorId,
  schoolId,
  bookingCategory,
}: {
  membership: ActiveOrganizationMembership;
  instructorId: string;
  schoolId: string;
  bookingCategory: BookingCategory;
}) {
  if (membership.role === "owner") {
    return true;
  }

  if (!isPostgresBackend() || bookingCategory !== "extra") {
    return false;
  }

  const settings = await queryOne<{
    can_manage_student_packages: boolean;
    source_visibility_mode: "all_active" | "selected_only";
  }>(
    `
      select can_manage_student_packages, source_visibility_mode
      from public.instructor_payout_settings
      where organization_id = $1
        and instructor_id = $2
      limit 1
    `,
    [membership.organizationId, instructorId],
  );

  if (!settings?.can_manage_student_packages) {
    return false;
  }

  const school = await queryOne<{ name: string; is_active: boolean }>(
    `
      select name, is_active
      from public.schools
      where id = $1
        and organization_id = $2
      limit 1
    `,
    [schoolId, membership.organizationId],
  );

  if (
    !school ||
    !school.is_active ||
    !isPrivateStudentSourceName(school.name)
  ) {
    return false;
  }

  if (settings.source_visibility_mode === "all_active") {
    return true;
  }

  const visibility = await queryOne<{ is_visible: boolean }>(
    `
      select is_visible
      from public.instructor_source_visibility
      where organization_id = $1
        and instructor_id = $2
        and school_id = $3
      limit 1
    `,
    [membership.organizationId, instructorId, schoolId],
  );

  return visibility?.is_visible ?? false;
}

async function canManagePrivateStudentPackageTerms({
  membership,
  instructorId,
  schoolId,
  bookingCategory,
}: {
  membership: ActiveOrganizationMembership;
  instructorId: string;
  schoolId: string;
  bookingCategory: BookingCategory;
}) {
  if (!isPostgresBackend()) {
    return false;
  }

  const school = await queryOne<{ name: string; is_active: boolean }>(
    `
      select name, is_active
      from public.schools
      where id = $1
        and organization_id = $2
      limit 1
    `,
    [schoolId, membership.organizationId],
  );

  if (
    !school ||
    !school.is_active ||
    !isPrivateStudentSourceName(school.name)
  ) {
    return false;
  }

  if (membership.role === "owner") {
    return true;
  }

  return canManagePrivateStudentPackagePrice({
    membership,
    instructorId,
    schoolId,
    bookingCategory,
  });
}

async function assertCanManageStudentLessonPackages({
  membership,
  instructorId,
}: {
  membership: ActiveOrganizationMembership;
  instructorId: string;
}) {
  const allowed = await canManageStudentLessonPackages({
    membership,
    instructorId,
  });

  if (!allowed) {
    throw new Error(
      "Дополнительные доступы ученика может менять только руководитель или сотрудник с разрешением руководителя",
    );
  }
}

function assertCanManageStudentPrepaidCredits(
  membership: ActiveOrganizationMembership,
) {
  if (membership.role !== "owner") {
    throw new Error("Предоплатами учеников может управлять только руководитель");
  }
}

async function getPrimaryPackageTerms({
  accessId,
  supabase,
}: {
  accessId: string;
  supabase?: ReturnType<typeof createAdminClient>;
}) {
  if (isPostgresBackend()) {
    const row = await queryOne<{
      custom_price_amount: number | null;
      payment_rule_override: SchoolPaymentRule | null;
    }>(
      `
        select custom_price_amount, payment_rule_override
        from public.student_lesson_packages
        where student_access_id = $1
          and sort_order = 100
        limit 1
      `,
      [accessId],
    );

    return {
      customPriceAmount: row?.custom_price_amount ?? null,
      paymentRuleOverride: row?.payment_rule_override ?? null,
    };
  }

  const client = supabase ?? createAdminClient();
  const { data, error } = await client
    .from("student_lesson_packages")
    .select("custom_price_amount, payment_rule_override")
    .eq("student_access_id", accessId)
    .eq("sort_order", 100)
    .maybeSingle();

  if (error && !isMissingPricingTableError(error)) {
    throw new Error(error.message);
  }

  return {
    customPriceAmount:
      typeof data?.custom_price_amount === "number"
        ? data.custom_price_amount
        : null,
    paymentRuleOverride:
      data?.payment_rule_override === "manual" ||
      data?.payment_rule_override === "prepaid" ||
      data?.payment_rule_override === "settle_later"
        ? data.payment_rule_override
        : null,
  };
}

function assertDeleteConfirmed(formData: FormData) {
  if (formData.get("confirm_delete") !== "yes") {
    throw new Error("Подтвердите удаление");
  }
}

function revalidateStudentAccessPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/reports");
  revalidatePath("/director");
  revalidatePath("/director/students");
  revalidatePath("/director/reports");
  revalidatePath("/director/finances");
  revalidatePath("/student");
}

async function deleteStudentAccessById(accessId: string, formData: FormData) {
  assertDeleteConfirmed(formData);

  const { membership, access } = await getManageableAccess(accessId);
  assertOwnerCanDelete(membership);

  if (isPostgresBackend()) {
    await withTransaction((client) =>
      purgeStudentAccessData({
        client,
        organizationId: membership.organizationId,
        studentAccessId: access.id,
      }),
    );

    await logAuditEvent({
      membership,
      action: "student_access.deleted",
      entityType: "student_access",
      entityId: access.id,
      metadata: {
        instructor_id: access.instructor_id,
      },
    });

    revalidateStudentAccessPaths();
    return;
  }

  const supabase = createAdminClient();
  const { error: bookingsError } = await supabase
    .from("bookings")
    .delete()
    .eq("student_access_id", access.id);

  if (bookingsError) {
    throw new Error(bookingsError.message);
  }

  const { error: lessonTypesError } = await supabase
    .from("student_access_lesson_types")
    .delete()
    .eq("student_access_id", access.id);

  if (lessonTypesError) {
    throw new Error(lessonTypesError.message);
  }

  const { error: accessError } = await supabase
    .from("student_accesses")
    .delete()
    .eq("id", access.id)
    .eq("organization_id", membership.organizationId);

  if (accessError) {
    throw new Error(accessError.message);
  }

  await logAuditEvent({
    membership,
    action: "student_access.deleted",
    entityType: "student_access",
    entityId: access.id,
    metadata: {
      instructor_id: access.instructor_id,
    },
  });

  revalidateStudentAccessPaths();
}

async function restoreStudentAccessById(accessId: string) {
  const { membership, access } = await getManageableAccess(accessId);

  if (isPostgresBackend()) {
    await executeQuery(
      `
        update public.student_accesses
        set is_archived = false,
            archived_at = null,
            is_active = true,
            updated_at = now()
        where id = $1
          and instructor_id = $2
      `,
      [access.id, access.instructor_id],
    );

    await logAuditEvent({
      membership,
      action: "student_access.restored",
      entityType: "student_access",
      entityId: access.id,
      metadata: {
        instructor_id: access.instructor_id,
      },
    });

    revalidateStudentAccessPaths();
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("student_accesses")
    .update({
      is_archived: false,
      archived_at: null,
      is_active: true,
    })
    .eq("id", access.id)
    .eq("instructor_id", access.instructor_id);

  if (error) {
    throw new Error(error.message);
  }

  await logAuditEvent({
    membership,
    action: "student_access.restored",
    entityType: "student_access",
    entityId: access.id,
    metadata: {
      instructor_id: access.instructor_id,
    },
  });

  revalidateStudentAccessPaths();
}

async function getManageableRegistrationRequest(requestId: string) {
  const membership = await requireActiveOrganizationMember();

  if (isPostgresBackend()) {
    const data = await queryOne<{
      id: string;
      organization_id: string;
      instructor_id: string;
      first_name: string | null;
      last_name: string | null;
      student_phone: string | null;
      login: string;
      password_hash: string;
      status: "pending" | "approved" | "rejected";
      personal_data_consent_at: string | null;
      personal_data_consent_source: string | null;
      personal_data_consent_ip: string | null;
      personal_data_consent_user_agent: string | null;
      personal_data_consent_document_ids: string[];
      personal_data_consent_document_versions: unknown;
    }>(
      `
        select id, organization_id, instructor_id, first_name, last_name,
               student_phone, login, password_hash, status,
               personal_data_consent_at::text as personal_data_consent_at,
               personal_data_consent_source, personal_data_consent_ip,
               personal_data_consent_user_agent,
               personal_data_consent_document_ids,
               personal_data_consent_document_versions
        from public.student_registration_requests
        where id = $1
          and organization_id = $2
        limit 1
      `,
      [requestId, membership.organizationId],
    );

    if (!data) {
      throw new Error("Заявка не найдена");
    }

    await requireInstructorAccess(data.instructor_id);

    if (data.status !== "pending") {
      throw new Error("Эта заявка уже обработана");
    }

    return {
      membership,
      request: data,
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_registration_requests")
    .select(
      "id, organization_id, instructor_id, first_name, last_name, student_phone, login, password_hash, status",
    )
    .eq("id", requestId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Заявка не найдена");
  }

  await requireInstructorAccess(data.instructor_id);

  if (data.status !== "pending") {
    throw new Error("Эта заявка уже обработана");
  }

  return {
    membership,
    request: data as {
      id: string;
      organization_id: string;
      instructor_id: string;
      first_name: string | null;
      last_name: string | null;
      student_phone: string | null;
      login: string;
      password_hash: string;
      status: "pending" | "approved" | "rejected";
      personal_data_consent_at?: string | null;
      personal_data_consent_source?: string | null;
      personal_data_consent_ip?: string | null;
      personal_data_consent_user_agent?: string | null;
      personal_data_consent_document_ids?: string[];
      personal_data_consent_document_versions?: unknown;
    },
  };
}

export async function createStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    const membership = await requireInstructorAccess(instructorId);
    const login = normalizeLogin(readRequiredString(formData, "login"));
    const displayLabel =
      readOptionalString(formData, "display_label") ?? `Ученик ${login}`;
    const studentPhone = validateStudentPhone(
      readOptionalString(formData, "student_phone"),
    );
    const secret = readRequiredString(formData, "secret");
    const totalLessonLimit = readOptionalLimit(
      formData,
      "total_lesson_limit",
      500,
    );
    const weeklyLessonLimit = readOptionalLimit(
      formData,
      "weekly_lesson_limit",
      50,
    );
    const customPriceAmount = readOptionalMoneyAmount(
      formData,
      "custom_price_amount",
    );
    const schoolId = await validateRequiredSchoolId(
      formData,
      membership.organizationId,
    );
    const paymentRuleOverride = readPaymentRuleOverride(formData);
    const canManagePrivateTerms = await canManagePrivateStudentPackageTerms({
      membership,
      instructorId,
      schoolId,
      bookingCategory: "regular",
    });
    const effectiveCustomPriceAmount = canManageStudentPrices(membership)
      ? customPriceAmount
      : null;
    const effectivePaymentRuleOverride = canManagePrivateTerms
      ? paymentRuleOverride
      : null;
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );

    validateLogin(login);
    validateSecret(secret);

    if (displayLabel.length > 80) {
      throw new Error("Метка ученика должна быть не длиннее 80 символов");
    }

    if (isPostgresBackend()) {
      const access = await queryOne<{ id: string }>(
        `
          insert into public.student_accesses (
            organization_id, instructor_id, display_label, student_phone,
            login, password_hash, total_lesson_limit, weekly_lesson_limit,
            school_id, is_active
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          returning id
        `,
        [
          membership.organizationId,
          instructorId,
          displayLabel,
          studentPhone,
          login,
          hashStudentAccessSecret(secret),
          totalLessonLimit,
          weeklyLessonLimit,
          schoolId,
          isActive,
        ],
      ).catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new Error("Такой логин уже используется");
        }

        throw error;
      });

      if (!access) {
        throw new Error("Не удалось добавить ученика");
      }

      try {
        await replaceAccessLessonTypes({
          accessId: access.id,
          lessonTypeIds,
        });
        await syncPrimaryStudentLessonPackage({
          accessId: access.id,
          organizationId: membership.organizationId,
          instructorId,
          schoolId,
          customPriceAmount: effectiveCustomPriceAmount,
          paymentRuleOverride: effectivePaymentRuleOverride,
          totalLessonLimit,
          weeklyLessonLimit,
          isActive,
          lessonTypeIds,
        });
      } catch (lessonTypesError) {
        await executeQuery(
          `
            delete from public.student_accesses
            where id = $1
          `,
          [access.id],
        );
        throw lessonTypesError;
      }

      revalidatePath("/admin/students");

      return {
        status: "success",
        message:
          "Доступ создан. Передайте ученику логин и ПИН-код: кабинет откроется после заполнения профиля и согласия.",
      };
    }

    const supabase = createAdminClient();
    const { data: access, error } = await supabase
      .from("student_accesses")
      .insert({
        organization_id: membership.organizationId,
        instructor_id: instructorId,
        display_label: displayLabel,
        student_phone: studentPhone,
        login,
        password_hash: hashStudentAccessSecret(secret),
        total_lesson_limit: totalLessonLimit,
        weekly_lesson_limit: weeklyLessonLimit,
        school_id: schoolId,
        is_active: isActive,
      })
      .select("id")
      .single();

    if (error || !access) {
      if (error?.code === "23505") {
        throw new Error("Такой логин уже используется");
      }

      throw new Error(error?.message ?? "Не удалось добавить ученика");
    }

    try {
      await replaceAccessLessonTypes({
        supabase,
        accessId: access.id,
        lessonTypeIds,
      });
      await syncPrimaryStudentLessonPackage({
        supabase,
        accessId: access.id,
        organizationId: membership.organizationId,
        instructorId,
        schoolId,
        customPriceAmount: effectiveCustomPriceAmount,
        paymentRuleOverride: effectivePaymentRuleOverride,
        totalLessonLimit,
        weeklyLessonLimit,
        isActive,
        lessonTypeIds,
      });
    } catch (lessonTypesError) {
      await supabase.from("student_accesses").delete().eq("id", access.id);
      throw lessonTypesError;
    }

    revalidatePath("/admin/students");

    return {
      status: "success",
      message:
        "Доступ создан. Передайте ученику логин и ПИН-код: кабинет откроется после заполнения профиля и согласия.",
    };
  } catch (error) {
    console.error("createStudentAccessAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function approveStudentRegistrationRequestAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const requestId = readRequiredString(formData, "request_id");
    const { membership, request } =
      await getManageableRegistrationRequest(requestId);
    const displayLabel = readRequiredString(formData, "display_label");
    const login = normalizeLogin(readRequiredString(formData, "login"));
    const studentPhone = validateStudentPhone(
      readOptionalString(formData, "student_phone"),
    );
    const totalLessonLimit = readOptionalLimit(
      formData,
      "total_lesson_limit",
      500,
    );
    const weeklyLessonLimit = readOptionalLimit(
      formData,
      "weekly_lesson_limit",
      50,
    );
    const customPriceAmount = readOptionalMoneyAmount(
      formData,
      "custom_price_amount",
    );
    const schoolId = await validateRequiredSchoolId(
      formData,
      request.organization_id,
    );
    const paymentRuleOverride = readPaymentRuleOverride(formData);
    const canManagePrivateTerms = await canManagePrivateStudentPackageTerms({
      membership,
      instructorId: request.instructor_id,
      schoolId,
      bookingCategory: "regular",
    });
    const effectiveCustomPriceAmount = canManageStudentPrices(membership)
      ? customPriceAmount
      : null;
    const effectivePaymentRuleOverride = canManagePrivateTerms
      ? paymentRuleOverride
      : null;
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );
    const requestProfileCompleted = Boolean(
      request.first_name &&
        request.last_name &&
        request.student_phone &&
        request.personal_data_consent_at,
    );

    if (displayLabel.length > 80) {
      throw new Error("Метка ученика должна быть не длиннее 80 символов");
    }

    validateLogin(login);

    if (isPostgresBackend()) {
      const existingAccess = await queryOne<{ id: string }>(
        `
          select id
          from public.student_accesses
          where organization_id = $1
            and login = $2
          limit 1
        `,
        [request.organization_id, login],
      );

      if (existingAccess) {
        throw new Error("Такой логин уже используется активным учеником");
      }

      const access = await queryOne<{ id: string }>(
        `
          insert into public.student_accesses (
            organization_id, instructor_id, display_label, first_name,
            last_name, student_phone, login, password_hash,
            total_lesson_limit, weekly_lesson_limit, school_id, is_active,
            profile_completed_at, personal_data_consent_at,
            personal_data_consent_source, personal_data_consent_ip,
            personal_data_consent_user_agent,
            personal_data_consent_document_ids,
            personal_data_consent_document_versions
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18::uuid[], $19::jsonb
          )
          returning id
        `,
        [
          request.organization_id,
          request.instructor_id,
          displayLabel,
          requestProfileCompleted ? request.first_name : null,
          requestProfileCompleted ? request.last_name : null,
          studentPhone,
          login,
          request.password_hash,
          totalLessonLimit,
          weeklyLessonLimit,
          schoolId,
          isActive,
          requestProfileCompleted ? new Date().toISOString() : null,
          request.personal_data_consent_at ?? null,
          request.personal_data_consent_source ?? null,
          request.personal_data_consent_ip ?? null,
          request.personal_data_consent_user_agent ?? null,
          request.personal_data_consent_document_ids ?? [],
          JSON.stringify(request.personal_data_consent_document_versions ?? []),
        ],
      ).catch((error: unknown) => {
        if (isPostgresErrorCode(error, "23505")) {
          throw new Error("Такой логин уже используется");
        }

        throw error;
      });

      if (!access) {
        throw new Error("Не удалось подтвердить ученика");
      }

      try {
        await replaceAccessLessonTypes({
          accessId: access.id,
          lessonTypeIds,
        });
        await syncPrimaryStudentLessonPackage({
          accessId: access.id,
          organizationId: request.organization_id,
          instructorId: request.instructor_id,
          schoolId,
          customPriceAmount: effectiveCustomPriceAmount,
          paymentRuleOverride: effectivePaymentRuleOverride,
          totalLessonLimit,
          weeklyLessonLimit,
          isActive,
          lessonTypeIds,
        });
      } catch (lessonTypesError) {
        await executeQuery(
          `
            delete from public.student_accesses
            where id = $1
          `,
          [access.id],
        );
        throw lessonTypesError;
      }

      await executeQuery(
        `
          update public.student_registration_requests
          set status = 'approved',
              reviewed_at = $1,
              updated_at = now()
          where id = $2
            and status = 'pending'
        `,
        [new Date().toISOString(), request.id],
      );

      await logAuditEvent({
        membership,
        action: "student_registration.approved",
        entityType: "student_registration_request",
        entityId: request.id,
        metadata: {
          instructor_id: request.instructor_id,
          student_access_id: access.id,
          is_active: isActive,
          lesson_type_count: lessonTypeIds.length,
        },
      });

      revalidatePath("/admin/students");

      return {
        status: "success",
        message: "Заявка подтверждена. Ученик добавлен в активные.",
      };
    }

    const supabase = createAdminClient();
    const { data: existingAccess, error: accessCheckError } = await supabase
      .from("student_accesses")
      .select("id")
      .eq("organization_id", request.organization_id)
      .eq("login", login)
      .maybeSingle();

    if (accessCheckError) {
      throw new Error(accessCheckError.message);
    }

    if (existingAccess) {
      throw new Error("Такой логин уже используется активным учеником");
    }

    const { data: access, error } = await supabase
      .from("student_accesses")
      .insert({
        organization_id: request.organization_id,
        instructor_id: request.instructor_id,
        display_label: displayLabel,
        student_phone: studentPhone,
        login,
        password_hash: request.password_hash,
        total_lesson_limit: totalLessonLimit,
        weekly_lesson_limit: weeklyLessonLimit,
        school_id: schoolId,
        is_active: isActive,
      })
      .select("id")
      .single();

    if (error || !access) {
      if (error?.code === "23505") {
        throw new Error("Такой логин уже используется");
      }

      throw new Error(error?.message ?? "Не удалось подтвердить ученика");
    }

    try {
      await replaceAccessLessonTypes({
        supabase,
        accessId: access.id,
        lessonTypeIds,
      });
      await syncPrimaryStudentLessonPackage({
        supabase,
        accessId: access.id,
        organizationId: request.organization_id,
        instructorId: request.instructor_id,
        schoolId,
        customPriceAmount: effectiveCustomPriceAmount,
        paymentRuleOverride: effectivePaymentRuleOverride,
        totalLessonLimit,
        weeklyLessonLimit,
        isActive,
        lessonTypeIds,
      });
    } catch (lessonTypesError) {
      await supabase.from("student_accesses").delete().eq("id", access.id);
      throw lessonTypesError;
    }

    const { error: requestError } = await supabase
      .from("student_registration_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("status", "pending");

    if (requestError) {
      throw new Error(requestError.message);
    }

    await logAuditEvent({
      membership,
      action: "student_registration.approved",
      entityType: "student_registration_request",
      entityId: request.id,
      metadata: {
        instructor_id: request.instructor_id,
        student_access_id: access.id,
        is_active: isActive,
        lesson_type_count: lessonTypeIds.length,
      },
    });

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: "Заявка подтверждена. Ученик добавлен в активные.",
    };
  } catch (error) {
    console.error("approveStudentRegistrationRequestAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function rejectStudentRegistrationRequestAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const requestId = readRequiredString(formData, "request_id");
    const { membership, request } =
      await getManageableRegistrationRequest(requestId);

    if (isPostgresBackend()) {
      await executeQuery(
        `
          update public.student_registration_requests
          set status = 'rejected',
              reviewed_at = $1,
              updated_at = now()
          where id = $2
            and status = 'pending'
        `,
        [new Date().toISOString(), request.id],
      );

      await logAuditEvent({
        membership,
        action: "student_registration.rejected",
        entityType: "student_registration_request",
        entityId: request.id,
        metadata: {
          instructor_id: request.instructor_id,
        },
      });

      revalidatePath("/admin/students");

      return {
        status: "success",
        message: "Заявка отклонена",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_registration_requests")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("status", "pending");

    if (error) {
      throw new Error(error.message);
    }

    await logAuditEvent({
      membership,
      action: "student_registration.rejected",
      entityType: "student_registration_request",
      entityId: request.id,
      metadata: {
        instructor_id: request.instructor_id,
      },
    });

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: "Заявка отклонена",
    };
  } catch (error) {
    console.error("rejectStudentRegistrationRequestAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    const { membership, access } = await getManageableAccess(accessId);
    const displayLabel = readRequiredString(formData, "display_label");
    const login = normalizeLogin(readRequiredString(formData, "login"));
    const studentPhone = validateStudentPhone(
      readOptionalString(formData, "student_phone"),
    );
    const totalLessonLimit = readOptionalLimit(
      formData,
      "total_lesson_limit",
      500,
    );
    const weeklyLessonLimit = readOptionalLimit(
      formData,
      "weekly_lesson_limit",
      50,
    );
    const customPriceAmount = readOptionalMoneyAmount(
      formData,
      "custom_price_amount",
    );
    const schoolId = await validateSchoolId(
      readOptionalString(formData, "school_id"),
      access.organization_id,
    );
    const paymentRuleOverride = readPaymentRuleOverride(formData);
    const primaryPackageTerms = await getPrimaryPackageTerms({
      accessId: access.id,
    });
    const canManagePrivateTerms = schoolId
      ? await canManagePrivateStudentPackageTerms({
          membership,
          instructorId: access.instructor_id,
          schoolId,
          bookingCategory: "regular",
        })
      : false;
    const effectiveCustomPriceAmount = canManageStudentPrices(membership)
      ? customPriceAmount
      : primaryPackageTerms.customPriceAmount;
    const effectivePaymentRuleOverride = canManagePrivateTerms
      ? paymentRuleOverride
      : schoolId === access.school_id
        ? primaryPackageTerms.paymentRuleOverride
        : null;
    const isActive = formData.get("is_active") === "on";
    const newSecret = readOptionalString(formData, "new_secret");
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );

    if (displayLabel.length > 80) {
      throw new Error("Метка ученика должна быть не длиннее 80 символов");
    }

    validateLogin(login);

    const updates: {
      display_label: string;
      login: string;
      student_phone: string | null;
      total_lesson_limit: number | null;
      weekly_lesson_limit: number | null;
      school_id: string | null;
      is_active: boolean;
      password_hash?: string;
    } = {
      display_label: displayLabel,
      login,
      student_phone: studentPhone,
      total_lesson_limit: totalLessonLimit,
      weekly_lesson_limit: weeklyLessonLimit,
      school_id: schoolId,
      is_active: isActive,
    };

    if (newSecret) {
      validateSecret(newSecret);
      updates.password_hash = hashStudentAccessSecret(newSecret);
    }

    if (isPostgresBackend()) {
      try {
        if (updates.password_hash) {
          await executeQuery(
            `
              update public.student_accesses
              set display_label = $1,
                  login = $2,
                  student_phone = $3,
                  total_lesson_limit = $4,
                  weekly_lesson_limit = $5,
                  school_id = $6,
                  is_active = $7,
                  password_hash = $8,
                  updated_at = now()
              where id = $9
                and instructor_id = $10
            `,
            [
              updates.display_label,
              updates.login,
              updates.student_phone,
              updates.total_lesson_limit,
              updates.weekly_lesson_limit,
              updates.school_id,
              updates.is_active,
              updates.password_hash,
              access.id,
              access.instructor_id,
            ],
          );
        } else {
          await executeQuery(
            `
              update public.student_accesses
              set display_label = $1,
                  login = $2,
                  student_phone = $3,
                  total_lesson_limit = $4,
                  weekly_lesson_limit = $5,
                  school_id = $6,
                  is_active = $7,
                  updated_at = now()
              where id = $8
                and instructor_id = $9
            `,
            [
              updates.display_label,
              updates.login,
              updates.student_phone,
              updates.total_lesson_limit,
              updates.weekly_lesson_limit,
              updates.school_id,
              updates.is_active,
              access.id,
              access.instructor_id,
            ],
          );
        }
      } catch (error) {
        if (isPostgresErrorCode(error, "23505")) {
          throw new Error("Такой логин уже используется");
        }

        throw error;
      }

      if (newSecret || !isActive) {
        await revokeAllStudentSessions(access.id);
      }

      await syncPrimaryStudentLessonPackage({
        accessId: access.id,
        organizationId: access.organization_id,
        instructorId: access.instructor_id,
        schoolId,
        customPriceAmount: effectiveCustomPriceAmount,
        paymentRuleOverride: effectivePaymentRuleOverride,
        totalLessonLimit,
        weeklyLessonLimit,
        isActive,
        lessonTypeIds,
      });
      await syncAccessLessonTypesFromPackages({
        accessId: access.id,
        fallbackLessonTypeIds: lessonTypeIds,
      });

      await logAuditEvent({
        membership,
        action: "student_access.updated",
        entityType: "student_access",
        entityId: access.id,
        metadata: {
          instructor_id: access.instructor_id,
          is_active: isActive,
          secret_changed: Boolean(newSecret),
          lesson_type_count: lessonTypeIds.length,
        },
      });

      revalidatePath("/admin/students");

      return {
        status: "success",
        message: newSecret
        ? "Доступ обновлён. Не забудьте передать ученику новый ПИН-код/пароль."
          : "Доступ обновлён",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_accesses")
      .update(updates)
      .eq("id", access.id)
      .eq("instructor_id", access.instructor_id);

    if (error) {
      if (error.code === "23505") {
        throw new Error("Такой логин уже используется");
      }

      throw new Error(error.message);
    }

    await syncPrimaryStudentLessonPackage({
      supabase,
      accessId: access.id,
      organizationId: access.organization_id,
      instructorId: access.instructor_id,
      schoolId,
      customPriceAmount: effectiveCustomPriceAmount,
      paymentRuleOverride: effectivePaymentRuleOverride,
      totalLessonLimit,
      weeklyLessonLimit,
      isActive,
      lessonTypeIds,
    });
    await syncAccessLessonTypesFromPackages({
      supabase,
      accessId: access.id,
      fallbackLessonTypeIds: lessonTypeIds,
    });

    await logAuditEvent({
      membership,
      action: "student_access.updated",
      entityType: "student_access",
      entityId: access.id,
      metadata: {
        instructor_id: access.instructor_id,
        is_active: isActive,
        secret_changed: Boolean(newSecret),
        lesson_type_count: lessonTypeIds.length,
      },
    });

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: newSecret
      ? "Доступ обновлён. Не забудьте передать ученику новый ПИН-код/пароль."
        : "Доступ обновлён",
    };
  } catch (error) {
    console.error("updateStudentAccessAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateStudentAccessDetailsAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    const { membership, access } = await getManageableAccess(accessId);
    const displayLabel =
      readOptionalString(formData, "display_label") ?? access.display_label;
    const login = readRequiredString(formData, "login");
    const studentPhone = formData.has("student_phone")
      ? readOptionalString(formData, "student_phone")
      : access.student_phone;
    const newSecret = readOptionalString(formData, "new_secret");

    if (displayLabel.length > 80) {
      throw new Error("Метка ученика должна быть не длиннее 80 символов");
    }

    validateLogin(login);

    const updates: {
      display_label: string;
      login: string;
      student_phone: string | null;
      password_hash?: string;
    } = {
      display_label: displayLabel,
      login,
      student_phone: studentPhone,
    };

    if (newSecret) {
      validateSecret(newSecret);
      updates.password_hash = hashStudentAccessSecret(newSecret);
    }

    if (isPostgresBackend()) {
      try {
        if (updates.password_hash) {
          await executeQuery(
            `
              update public.student_accesses
              set display_label = $1,
                  login = $2,
                  student_phone = $3,
                  password_hash = $4,
                  updated_at = now()
              where id = $5
                and instructor_id = $6
            `,
            [
              updates.display_label,
              updates.login,
              updates.student_phone,
              updates.password_hash,
              access.id,
              access.instructor_id,
            ],
          );
        } else {
          await executeQuery(
            `
              update public.student_accesses
              set display_label = $1,
                  login = $2,
                  student_phone = $3,
                  updated_at = now()
              where id = $4
                and instructor_id = $5
            `,
            [
              updates.display_label,
              updates.login,
              updates.student_phone,
              access.id,
              access.instructor_id,
            ],
          );
        }
      } catch (error) {
        if (isPostgresErrorCode(error, "23505")) {
          throw new Error("Такой логин уже используется");
        }

        throw error;
      }

      if (newSecret) {
        await revokeAllStudentSessions(access.id);
      }

      await logAuditEvent({
        membership,
        action: "student_access.details_updated",
        entityType: "student_access",
        entityId: access.id,
        metadata: {
          instructor_id: access.instructor_id,
          secret_changed: Boolean(newSecret),
        },
      });

      revalidatePath("/admin/students");

      return {
        status: "success",
        message: newSecret
          ? "Данные обновлены. Не забудьте передать ученику новый ПИН-код/пароль."
          : "Данные ученика обновлены",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_accesses")
      .update(updates)
      .eq("id", access.id)
      .eq("instructor_id", access.instructor_id);

    if (error) {
      if (error.code === "23505") {
        throw new Error("Такой логин уже используется");
      }

      throw new Error(error.message);
    }

    await logAuditEvent({
      membership,
      action: "student_access.details_updated",
      entityType: "student_access",
      entityId: access.id,
      metadata: {
        instructor_id: access.instructor_id,
        secret_changed: Boolean(newSecret),
      },
    });

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: newSecret
        ? "Данные обновлены. Не забудьте передать ученику новый ПИН-код/пароль."
        : "Данные ученика обновлены",
    };
  } catch (error) {
    console.error("updateStudentAccessDetailsAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function archiveStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    const { membership, access } = await getManageableAccess(accessId);

    if (isPostgresBackend()) {
      await executeQuery(
        `
          update public.student_accesses
          set is_archived = true,
              archived_at = $1,
              is_active = false,
              updated_at = now()
          where id = $2
            and instructor_id = $3
        `,
        [new Date().toISOString(), access.id, access.instructor_id],
      );
      await revokeAllStudentSessions(access.id);

      await logAuditEvent({
        membership,
        action: "student_access.archived",
        entityType: "student_access",
        entityId: access.id,
        metadata: {
          instructor_id: access.instructor_id,
        },
      });

      revalidateStudentAccessPaths();

      return {
        status: "success",
        message: "Ученик перемещён в архив",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_accesses")
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        is_active: false,
      })
      .eq("id", access.id)
      .eq("instructor_id", access.instructor_id);

    if (error) {
      throw new Error(error.message);
    }

    await logAuditEvent({
      membership,
      action: "student_access.archived",
      entityType: "student_access",
      entityId: access.id,
      metadata: {
        instructor_id: access.instructor_id,
      },
    });

    revalidateStudentAccessPaths();

    return {
      status: "success",
      message: "Ученик перемещён в архив",
    };
  } catch (error) {
    console.error("archiveStudentAccessAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function restoreStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    await restoreStudentAccessById(accessId);

    return {
      status: "success",
      message: "Ученик восстановлен из архива",
    };
  } catch (error) {
    console.error("restoreStudentAccessAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function deleteStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    await deleteStudentAccessById(accessId, formData);

    return {
      status: "success",
      message: "Ученик удалён вместе с его записями",
    };
  } catch (error) {
    console.error("deleteStudentAccessAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function deleteStudentAccessDirectAction(formData: FormData) {
  let status = "student-deleted";

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    await deleteStudentAccessById(accessId, formData);
  } catch (error) {
    console.error("deleteStudentAccessDirectAction:", error);
    status = "delete-error";
  }

  redirect(`/director/students?delete_status=${status}`);
}

export async function restoreStudentAccessDirectAction(formData: FormData) {
  let status = "student-restored";
  let targetStatus = "active";

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    await restoreStudentAccessById(accessId);
  } catch (error) {
    console.error("restoreStudentAccessDirectAction:", error);
    status = "restore-error";
    targetStatus = "archived";
  }

  redirect(`/director/students?status=${targetStatus}&restore_status=${status}`);
}

export async function toggleStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    const isActive = formData.get("is_active") === "true";
    const { membership, access } = await getManageableAccess(accessId);

    if (isPostgresBackend()) {
      await executeQuery(
        `
          update public.student_accesses
          set is_active = $1,
              updated_at = now()
          where id = $2
            and instructor_id = $3
        `,
        [isActive, access.id, access.instructor_id],
      );

      if (!isActive) {
        await revokeAllStudentSessions(access.id);
      }

      await logAuditEvent({
        membership,
        action: isActive ? "student_access.enabled" : "student_access.disabled",
        entityType: "student_access",
        entityId: access.id,
        metadata: {
          instructor_id: access.instructor_id,
          is_active: isActive,
        },
      });

      revalidatePath("/admin/students");

      return {
        status: "success",
        message: isActive ? "Доступ включён" : "Доступ отключён",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_accesses")
      .update({ is_active: isActive })
      .eq("id", access.id)
      .eq("instructor_id", access.instructor_id);

    if (error) {
      throw new Error(error.message);
    }

    await logAuditEvent({
      membership,
      action: isActive ? "student_access.enabled" : "student_access.disabled",
      entityType: "student_access",
      entityId: access.id,
      metadata: {
        instructor_id: access.instructor_id,
        is_active: isActive,
      },
    });

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: isActive ? "Доступ включён" : "Доступ отключён",
    };
  } catch (error) {
    console.error("toggleStudentAccessAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function addStudentLessonPackageAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    const { membership, access } = await getManageableAccess(accessId);
    await assertCanManageStudentLessonPackages({
      membership,
      instructorId: access.instructor_id,
    });
    const schoolId = await validateRequiredSchoolId(
      formData,
      access.organization_id,
    );
    const bookingCategory = readBookingCategory(formData);
    const totalLessonLimit = readOptionalLimit(
      formData,
      "total_lesson_limit",
      500,
    );
    const weeklyLessonLimit = readOptionalLimit(
      formData,
      "weekly_lesson_limit",
      50,
    );
    const customPriceAmount = readOptionalMoneyAmount(
      formData,
      "custom_price_amount",
    );
    const paymentRuleOverride = readPaymentRuleOverride(formData);
    const canManagePackagePrice = await canManagePrivateStudentPackagePrice({
      membership,
      instructorId: access.instructor_id,
      schoolId,
      bookingCategory,
    });
    const canManagePackageTerms = await canManagePrivateStudentPackageTerms({
      membership,
      instructorId: access.instructor_id,
      schoolId,
      bookingCategory,
    });
    if (customPriceAmount !== null && !canManagePackagePrice) {
      throw new Error(
        "Сотрудник может указать индивидуальную цену только для частного дополнительного занятия",
      );
    }
    if (paymentRuleOverride !== null && !canManagePackageTerms) {
      throw new Error(
        "Сотрудник может изменить правило оплаты только для частного дополнительного занятия",
      );
    }
    const effectiveCustomPriceAmount = canManagePackagePrice
      ? customPriceAmount
      : null;
    const effectivePaymentRuleOverride = canManagePackageTerms
      ? paymentRuleOverride
      : null;
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );

    if (isPostgresBackend()) {
      const lastPackage = await queryOne<{ sort_order: number | null }>(
        `
          select sort_order
          from public.student_lesson_packages
          where student_access_id = $1
          order by sort_order desc
          limit 1
        `,
        [access.id],
      );
      const sortOrder =
        typeof lastPackage?.sort_order === "number"
          ? Math.max(lastPackage.sort_order + 10, 200)
          : 200;
      const packageRow = await queryOne<{ id: string }>(
        `
          insert into public.student_lesson_packages (
            student_access_id, organization_id, instructor_id, school_id,
            booking_category, custom_price_amount, payment_rule_override,
            total_lesson_limit, weekly_lesson_limit, is_active, sort_order
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          returning id
        `,
        [
          access.id,
          membership.organizationId,
          access.instructor_id,
          schoolId,
          bookingCategory,
          effectiveCustomPriceAmount,
          effectivePaymentRuleOverride,
          totalLessonLimit,
          weeklyLessonLimit,
          isActive,
          sortOrder,
        ],
      );

      if (!packageRow) {
        throw new Error("Не удалось добавить пакет");
      }

      try {
        await replacePackageLessonTypes({
          packageId: packageRow.id,
          lessonTypeIds,
        });
        await syncAccessLessonTypesFromPackages({
          accessId: access.id,
          fallbackLessonTypeIds: lessonTypeIds,
        });
      } catch (packageTypesError) {
        await executeQuery(
          `
            delete from public.student_lesson_packages
            where id = $1
          `,
          [packageRow.id],
        );
        throw packageTypesError;
      }

      await logAuditEvent({
        membership,
        action: "student_lesson_package.created",
        entityType: "student_access",
        entityId: access.id,
        metadata: {
          instructor_id: access.instructor_id,
          school_id: schoolId,
          booking_category: bookingCategory,
          lesson_type_count: lessonTypeIds.length,
        },
      });

      revalidateStudentAccessPaths();

      return {
        status: "success",
        message: "Дополнительный доступ добавлен",
      };
    }

    const supabase = createAdminClient();
    const { data: lastPackage, error: lastPackageError } = await supabase
      .from("student_lesson_packages")
      .select("sort_order")
      .eq("student_access_id", access.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastPackageError) {
      if (isMissingPricingTableError(lastPackageError)) {
        throw new Error(
          "Сначала примените миграцию для пакетов занятий в Supabase",
        );
      }

      throw new Error(lastPackageError.message);
    }

    const sortOrder =
      typeof lastPackage?.sort_order === "number"
        ? Math.max(lastPackage.sort_order + 10, 200)
        : 200;
    const { data: packageRow, error: packageError } = await supabase
      .from("student_lesson_packages")
      .insert({
        student_access_id: access.id,
        organization_id: membership.organizationId,
        instructor_id: access.instructor_id,
        school_id: schoolId,
        booking_category: bookingCategory,
        custom_price_amount: effectiveCustomPriceAmount,
        payment_rule_override: effectivePaymentRuleOverride,
        total_lesson_limit: totalLessonLimit,
        weekly_lesson_limit: weeklyLessonLimit,
        is_active: isActive,
        sort_order: sortOrder,
      })
      .select("id")
      .single();

    if (packageError || !packageRow) {
      throw new Error(packageError?.message ?? "Не удалось добавить пакет");
    }

    try {
      await replacePackageLessonTypes({
        supabase,
        packageId: packageRow.id as string,
        lessonTypeIds,
      });
      await syncAccessLessonTypesFromPackages({
        supabase,
        accessId: access.id,
        fallbackLessonTypeIds: lessonTypeIds,
      });
    } catch (packageTypesError) {
      await supabase
        .from("student_lesson_packages")
        .delete()
        .eq("id", packageRow.id);
      throw packageTypesError;
    }

    await logAuditEvent({
      membership,
      action: "student_lesson_package.created",
      entityType: "student_access",
      entityId: access.id,
      metadata: {
        instructor_id: access.instructor_id,
        school_id: schoolId,
        booking_category: bookingCategory,
        lesson_type_count: lessonTypeIds.length,
      },
    });

    revalidateStudentAccessPaths();

    return {
      status: "success",
      message: "Дополнительный доступ добавлен",
    };
  } catch (error) {
    console.error("addStudentLessonPackageAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateStudentLessonPackageAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const packageId = readRequiredString(formData, "student_lesson_package_id");
    const { membership, packageRow } =
      await getManageableStudentLessonPackage(packageId);

    if (packageRow.sort_order <= 100) {
      throw new Error("Основной доступ редактируется в карточке ученика");
    }

    await assertCanManageStudentLessonPackages({
      membership,
      instructorId: packageRow.instructor_id,
    });

    const schoolId = await validateRequiredSchoolId(
      formData,
      packageRow.organization_id,
    );
    const bookingCategory = readBookingCategory(formData);
    const totalLessonLimit = readOptionalLimit(
      formData,
      "total_lesson_limit",
      500,
    );
    const weeklyLessonLimit = readOptionalLimit(
      formData,
      "weekly_lesson_limit",
      50,
    );
    const customPriceAmount = readOptionalMoneyAmount(
      formData,
      "custom_price_amount",
    );
    const paymentRuleOverride = readPaymentRuleOverride(formData);
    const canManagePackagePrice = await canManagePrivateStudentPackagePrice({
      membership,
      instructorId: packageRow.instructor_id,
      schoolId,
      bookingCategory,
    });
    const canManagePackageTerms = await canManagePrivateStudentPackageTerms({
      membership,
      instructorId: packageRow.instructor_id,
      schoolId,
      bookingCategory,
    });
    if (customPriceAmount !== null && !canManagePackagePrice) {
      throw new Error(
        "Сотрудник может указать индивидуальную цену только для частного дополнительного занятия",
      );
    }
    if (paymentRuleOverride !== null && !canManagePackageTerms) {
      throw new Error(
        "Сотрудник может изменить правило оплаты только для частного дополнительного занятия",
      );
    }
    const effectiveCustomPriceAmount = canManagePackagePrice
      ? customPriceAmount
      : schoolId === packageRow.school_id
        ? packageRow.custom_price_amount
        : null;
    const effectivePaymentRuleOverride = canManagePackageTerms
      ? paymentRuleOverride
      : schoolId === packageRow.school_id
        ? packageRow.payment_rule_override
        : null;
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );

    if (isPostgresBackend()) {
      await executeQuery(
        `
          update public.student_lesson_packages
          set school_id = $1,
              booking_category = $2,
              custom_price_amount = $3,
              payment_rule_override = $4,
              total_lesson_limit = $5,
              weekly_lesson_limit = $6,
              is_active = $7,
              updated_at = now()
          where id = $8
            and organization_id = $9
        `,
        [
          schoolId,
          bookingCategory,
          effectiveCustomPriceAmount,
          effectivePaymentRuleOverride,
          totalLessonLimit,
          weeklyLessonLimit,
          isActive,
          packageRow.id,
          membership.organizationId,
        ],
      );

      await replacePackageLessonTypes({
        packageId: packageRow.id,
        lessonTypeIds,
      });
      await syncAccessLessonTypesFromPackages({
        accessId: packageRow.student_access_id,
        fallbackLessonTypeIds: lessonTypeIds,
      });
      await logAuditEvent({
        membership,
        action: "student_lesson_package.updated",
        entityType: "student_access",
        entityId: packageRow.student_access_id,
        metadata: {
          package_id: packageRow.id,
          instructor_id: packageRow.instructor_id,
          school_id: schoolId,
          booking_category: bookingCategory,
          is_active: isActive,
          lesson_type_count: lessonTypeIds.length,
        },
      });

      revalidateStudentAccessPaths();

      return {
        status: "success",
        message: "Дополнительный доступ обновлён",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_lesson_packages")
      .update({
        school_id: schoolId,
        booking_category: bookingCategory,
        custom_price_amount: effectiveCustomPriceAmount,
        payment_rule_override: effectivePaymentRuleOverride,
        total_lesson_limit: totalLessonLimit,
        weekly_lesson_limit: weeklyLessonLimit,
        is_active: isActive,
      })
      .eq("id", packageRow.id)
      .eq("organization_id", membership.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    await replacePackageLessonTypes({
      supabase,
      packageId: packageRow.id,
      lessonTypeIds,
    });
    await syncAccessLessonTypesFromPackages({
      supabase,
      accessId: packageRow.student_access_id,
      fallbackLessonTypeIds: lessonTypeIds,
    });
    await logAuditEvent({
      membership,
      action: "student_lesson_package.updated",
      entityType: "student_access",
      entityId: packageRow.student_access_id,
      metadata: {
        package_id: packageRow.id,
        instructor_id: packageRow.instructor_id,
        school_id: schoolId,
        booking_category: bookingCategory,
        is_active: isActive,
        lesson_type_count: lessonTypeIds.length,
      },
    });

    revalidateStudentAccessPaths();

    return {
      status: "success",
      message: "Дополнительный доступ обновлён",
    };
  } catch (error) {
    console.error("updateStudentLessonPackageAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function deleteStudentLessonPackageAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const packageId = readRequiredString(formData, "student_lesson_package_id");
    const { membership, packageRow } =
      await getManageableStudentLessonPackage(packageId);

    if (packageRow.sort_order <= 100) {
      throw new Error("Основной доступ нельзя удалить отдельно от ученика");
    }

    await assertCanManageStudentLessonPackages({
      membership,
      instructorId: packageRow.instructor_id,
    });

    if (isPostgresBackend()) {
      const bookingCount = await queryOne<{ count: string }>(
        `
          select count(*)::text as count
          from public.bookings
          where student_lesson_package_id = $1
        `,
        [packageRow.id],
      );

      if (Number(bookingCount?.count ?? 0) > 0) {
        throw new Error(
          "По этому доступу уже есть записи. Его можно отключить, но не удалить.",
        );
      }

      await executeQuery(
        `
          delete from public.student_lesson_packages
          where id = $1
            and organization_id = $2
        `,
        [packageRow.id, membership.organizationId],
      );

      await syncAccessLessonTypesFromPackages({
        accessId: packageRow.student_access_id,
        fallbackLessonTypeIds: [],
      });
      await logAuditEvent({
        membership,
        action: "student_lesson_package.deleted",
        entityType: "student_access",
        entityId: packageRow.student_access_id,
        metadata: {
          package_id: packageRow.id,
          instructor_id: packageRow.instructor_id,
        },
      });

      revalidateStudentAccessPaths();

      return {
        status: "success",
        message: "Дополнительный доступ удалён",
      };
    }

    const supabase = createAdminClient();
    const { count, error: bookingCountError } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("student_lesson_package_id", packageRow.id);

    if (bookingCountError) {
      throw new Error(bookingCountError.message);
    }

    if ((count ?? 0) > 0) {
      throw new Error(
        "По этому доступу уже есть записи. Его можно отключить, но не удалить.",
      );
    }

    const { error } = await supabase
      .from("student_lesson_packages")
      .delete()
      .eq("id", packageRow.id)
      .eq("organization_id", membership.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    await syncAccessLessonTypesFromPackages({
      supabase,
      accessId: packageRow.student_access_id,
      fallbackLessonTypeIds: [],
    });
    await logAuditEvent({
      membership,
      action: "student_lesson_package.deleted",
      entityType: "student_access",
      entityId: packageRow.student_access_id,
      metadata: {
        package_id: packageRow.id,
        instructor_id: packageRow.instructor_id,
      },
    });

    revalidateStudentAccessPaths();

    return {
      status: "success",
      message: "Дополнительный доступ удалён",
    };
  } catch (error) {
    console.error("deleteStudentLessonPackageAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function refreshStudentRegistrationLinkAction(
  previousState: StudentRegistrationLinkActionState,
  formData: FormData,
): Promise<StudentRegistrationLinkActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    await requireInstructorAccess(instructorId);
    const token = randomBytes(24).toString("hex");

    if (isPostgresBackend()) {
      await executeQuery(
        `
          insert into public.instructor_settings (
            instructor_id, student_registration_token,
            student_registration_enabled, student_registration_token_updated_at
          )
          values ($1, $2, true, $3)
          on conflict (instructor_id) do update
          set student_registration_token = excluded.student_registration_token,
              student_registration_enabled = excluded.student_registration_enabled,
              student_registration_token_updated_at =
                excluded.student_registration_token_updated_at
        `,
        [instructorId, token, new Date().toISOString()],
      );

      revalidatePath("/admin/students");

      return {
        status: "success",
        message: "Ссылка регистрации обновлена",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("instructor_settings").upsert(
      {
        instructor_id: instructorId,
        student_registration_token: token,
        student_registration_enabled: true,
        student_registration_token_updated_at: new Date().toISOString(),
      },
      { onConflict: "instructor_id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: "Ссылка регистрации обновлена",
    };
  } catch (error) {
    console.error("refreshStudentRegistrationLinkAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

async function getPrepaidLessonPrice({
  organizationId,
  schoolId,
  lessonTypeId,
}: {
  organizationId: string;
  schoolId: string;
  lessonTypeId: string;
}) {
  const row = await queryOne<{ price_amount: number }>(
    `
      select price_amount
      from public.school_lesson_type_prices
      where organization_id = $1
        and school_id = $2
        and lesson_type_id = $3
      limit 1
    `,
    [organizationId, schoolId, lessonTypeId],
  );

  if (!row) {
    throw new Error("Для выбранного источника и типа занятия цена не задана");
  }

  return row.price_amount;
}

async function validatePrepaidLessonType(lessonTypeId: string) {
  const row = await queryOne<{ id: string; kind: "driving" | "theory" }>(
    `
      select id, kind
      from public.lesson_types
      where id = $1
        and is_active = true
      limit 1
    `,
    [lessonTypeId],
  );

  if (!row) {
    throw new Error("Выберите активный тип занятия");
  }

  return row;
}

async function validatePrepaidAccessSelection({
  accessId,
  schoolId,
  lessonTypeId,
}: {
  accessId: string;
  schoolId: string;
  lessonTypeId: string;
}) {
  const access = await queryOne<{ school_id: string | null }>(
    `
      select school_id
      from public.student_accesses
      where id = $1
      limit 1
    `,
    [accessId],
  );

  if (access?.school_id && access.school_id !== schoolId) {
    throw new Error("Источник оплаты должен совпадать с источником доступа ученика");
  }

  const allowedType = await queryOne<{ lesson_type_id: string }>(
    `
      select lesson_type_id
      from public.student_access_lesson_types
      where student_access_id = $1
        and lesson_type_id = $2
      limit 1
    `,
    [accessId, lessonTypeId],
  );

  if (!allowedType) {
    throw new Error("Выбранный тип занятия не входит в доступ ученика");
  }
}

export async function createStudentPrepaidCreditAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    if (!isPostgresBackend()) {
      throw new Error("Предоплаты доступны только в PostgreSQL-режиме");
    }

    const accessId = readRequiredString(formData, "student_access_id");
    const { membership, access } = await getManageableAccess(accessId);
    assertCanManageStudentPrepaidCredits(membership);

    const schoolId = await validateRequiredSchoolId(
      formData,
      membership.organizationId,
    );
    const lessonTypeId = readRequiredString(formData, "lesson_type_id");
    await validatePrepaidLessonType(lessonTypeId);
    await validatePrepaidAccessSelection({
      accessId,
      schoolId,
      lessonTypeId,
    });
    const quantity = readOptionalLimit(formData, "quantity", 5000);
    if (quantity === null) {
      throw new Error("Укажите количество предоплаченных занятий");
    }

    const calculatedUnitPrice = await getPrepaidLessonPrice({
      organizationId: membership.organizationId,
      schoolId,
      lessonTypeId,
    });
    const finalTotalAmount = readOptionalMoneyAmount(
      formData,
      "final_total_amount",
    );
    if (finalTotalAmount === null) {
      throw new Error("Укажите итоговую сумму оплаты");
    }
    if (finalTotalAmount % quantity !== 0) {
      throw new Error("Итоговая сумма должна делиться на количество занятий без остатка");
    }

    const paidAt = readOptionalString(formData, "paid_at");
    const paymentNote = readOptionalString(formData, "payment_note");
    if (paymentNote && paymentNote.length > 1000) {
      throw new Error("Комментарий не должен быть длиннее 1000 символов");
    }

    const credit = await withTransaction(async () => {
      const createdCredit = await queryOne<{ id: string }>(
        `
          insert into public.student_prepaid_credits (
            organization_id,
            student_access_id,
            instructor_id,
            school_id,
            lesson_type_id,
            quantity,
            calculated_unit_price,
            calculated_total_amount,
            final_unit_price,
            final_total_amount,
            paid_at,
            payment_note,
            created_by_member_id
          )
          values (
            $1, $2, $3, $4, $5, $6::integer, $7::integer,
            $7::bigint * $6::integer,
            $8::bigint / $6::integer, $8::bigint,
            coalesce($9::date, current_date), $10, $11
          )
          returning id
        `,
        [
          membership.organizationId,
          access.id,
          access.instructor_id,
          schoolId,
          lessonTypeId,
          quantity,
          calculatedUnitPrice,
          finalTotalAmount,
          paidAt,
          paymentNote,
          membership.id,
        ],
      );

      if (!createdCredit) {
        throw new Error("Не удалось сохранить предоплату");
      }

      await createInstructorPayoutEntryForPrepaidCredit({
        creditId: createdCredit.id,
        createdByMemberId: membership.id,
      });

      return createdCredit;
    });

    await logAuditEvent({
      membership,
      action: "student_prepaid_credit.created",
      entityType: "student_prepaid_credit",
      entityId: credit.id,
      metadata: {
        student_access_id: access.id,
        instructor_id: access.instructor_id,
        school_id: schoolId,
        lesson_type_id: lessonTypeId,
        quantity,
        final_total_amount: finalTotalAmount,
      },
    });

    revalidateStudentAccessPaths();
    return { status: "success", message: "Предоплата добавлена" };
  } catch (error) {
    console.error("createStudentPrepaidCreditAction:", error);
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function updateStudentPrepaidCreditAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    if (!isPostgresBackend()) {
      throw new Error("Предоплаты доступны только в PostgreSQL-режиме");
    }

    const creditId = readRequiredString(formData, "student_prepaid_credit_id");
    const membership = await requireActiveOrganizationMember();
    const credit = await queryOne<{
      id: string;
      student_access_id: string;
      instructor_id: string;
      organization_id: string;
      school_id: string;
      lesson_type_id: string;
      quantity: number;
      status: "active" | "cancelled";
      used_quantity: number;
      payout_paid_amount: number;
    }>(
      `
        select credits.id,
               credits.student_access_id,
               credits.instructor_id,
               credits.organization_id,
               credits.school_id,
               credits.lesson_type_id,
               credits.quantity,
               credits.status,
               count(usages.id) filter (where usages.status = 'active')::integer
                 as used_quantity,
               (
                 select coalesce(sum(allocations.amount), 0)::integer
                 from public.instructor_payout_entries payout_entries
                 join public.instructor_payout_payment_allocations allocations
                   on allocations.payout_entry_id = payout_entries.id
                 where payout_entries.student_prepaid_credit_id = credits.id
                   and payout_entries.entry_type = 'prepaid_credit_accrual'
               ) as payout_paid_amount
        from public.student_prepaid_credits credits
        left join public.student_prepaid_credit_usages usages
          on usages.credit_id = credits.id
        where credits.id = $1
          and credits.organization_id = $2
        group by credits.id
        limit 1
      `,
      [creditId, membership.organizationId],
    );

    if (!credit) {
      throw new Error("Предоплата не найдена");
    }
    assertCanManageStudentPrepaidCredits(membership);
    if (credit.status !== "active") {
      throw new Error("Отменённую предоплату нельзя редактировать");
    }

    const schoolId = await validateRequiredSchoolId(
      formData,
      membership.organizationId,
    );
    const lessonTypeId = readRequiredString(formData, "lesson_type_id");
    await validatePrepaidLessonType(lessonTypeId);
    await validatePrepaidAccessSelection({
      accessId: credit.student_access_id,
      schoolId,
      lessonTypeId,
    });
    const quantity = readOptionalLimit(formData, "quantity", 5000);
    if (quantity === null || quantity < credit.used_quantity) {
      throw new Error("Количество не может быть меньше уже использованных занятий");
    }
    if (
      credit.used_quantity > 0 &&
      (schoolId !== credit.school_id || lessonTypeId !== credit.lesson_type_id)
    ) {
      throw new Error("Источник и тип занятия нельзя менять после списания занятий");
    }
    if (
      credit.payout_paid_amount > 0 &&
      (quantity !== credit.quantity ||
        schoolId !== credit.school_id ||
        lessonTypeId !== credit.lesson_type_id)
    ) {
      throw new Error(
        "Количество, источник и тип нельзя менять после выплаты инструктору. Используйте отмену остатка предоплаты",
      );
    }

    const calculatedUnitPrice = await getPrepaidLessonPrice({
      organizationId: membership.organizationId,
      schoolId,
      lessonTypeId,
    });
    const finalTotalAmount = readOptionalMoneyAmount(
      formData,
      "final_total_amount",
    );
    if (finalTotalAmount === null) {
      throw new Error("Укажите итоговую сумму оплаты");
    }
    if (finalTotalAmount % quantity !== 0) {
      throw new Error("Итоговая сумма должна делиться на количество занятий без остатка");
    }

    const paidAt = readOptionalString(formData, "paid_at");
    const paymentNote = readOptionalString(formData, "payment_note");
    if (paymentNote && paymentNote.length > 1000) {
      throw new Error("Комментарий не должен быть длиннее 1000 символов");
    }

    await withTransaction(async () => {
      await executeQuery(
        `
          update public.student_prepaid_credits
          set school_id = $1::uuid,
              lesson_type_id = $2::uuid,
              quantity = $3::integer,
              calculated_unit_price = $4::integer,
              calculated_total_amount = $4::bigint * $3::integer,
              final_unit_price = $5::bigint / $3::integer,
              final_total_amount = $5::bigint,
              paid_at = coalesce($6::date, paid_at),
              payment_note = $7,
              updated_at = now()
          where id = $8
            and organization_id = $9
        `,
        [
          schoolId,
          lessonTypeId,
          quantity,
          calculatedUnitPrice,
          finalTotalAmount,
          paidAt,
          paymentNote,
          credit.id,
          membership.organizationId,
        ],
      );

      await syncInstructorPayoutEntryForPrepaidCredit(credit.id);
    });

    await logAuditEvent({
      membership,
      action: "student_prepaid_credit.updated",
      entityType: "student_prepaid_credit",
      entityId: credit.id,
      metadata: {
        student_access_id: credit.student_access_id,
        school_id: schoolId,
        lesson_type_id: lessonTypeId,
        quantity,
        final_total_amount: finalTotalAmount,
      },
    });

    revalidateStudentAccessPaths();
    return { status: "success", message: "Предоплата обновлена" };
  } catch (error) {
    console.error("updateStudentPrepaidCreditAction:", error);
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function createStudentPrepaidCreditAdjustmentAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    if (!isPostgresBackend()) {
      throw new Error("Корректировки доступны только в PostgreSQL-режиме");
    }

    const creditId = readRequiredString(formData, "student_prepaid_credit_id");
    const quantity = readOptionalLimit(formData, "quantity", 5000);
    const finalTotalAmount = readOptionalMoneyAmount(formData, "final_total_amount");
    const reason = readRequiredString(formData, "adjustment_reason");
    if (quantity === null || finalTotalAmount === null) {
      throw new Error("Укажите количество занятий и итоговую сумму");
    }
    if (reason.length > 1000) {
      throw new Error("Причина корректировки не должна быть длиннее 1000 символов");
    }

    const membership = await requireActiveOrganizationMember();
    assertCanManageStudentPrepaidCredits(membership);

    const result = await withTransaction(async (client) => {
      const creditResult = await client.query<{
        id: string;
        organization_id: string;
        quantity: number;
        final_total_amount: number;
        final_unit_price: number;
        calculated_unit_price: number;
        school_id: string;
        lesson_type_id: string;
        status: "active" | "cancelled";
        used_quantity: number;
        payout_paid_amount: number;
      }>(
        `
          select credits.id,
                 credits.organization_id,
                 credits.quantity,
                 credits.final_total_amount,
                 credits.final_unit_price,
                 credits.calculated_unit_price,
                 credits.school_id,
                 credits.lesson_type_id,
                 credits.status,
                 (
                   select count(*)::integer
                   from public.student_prepaid_credit_usages usages
                   where usages.credit_id = credits.id
                     and usages.status = 'active'
                 ) as used_quantity,
                 (
                   select coalesce(sum(allocations.amount), 0)::integer
                   from public.instructor_payout_entries entries
                   join public.instructor_payout_payment_allocations allocations
                     on allocations.payout_entry_id = entries.id
                   where entries.student_prepaid_credit_id = credits.id
                     and entries.entry_type = 'prepaid_credit_accrual'
                 ) as payout_paid_amount
          from public.student_prepaid_credits credits
          where credits.id = $1
            and credits.organization_id = $2
          for update
        `,
        [creditId, membership.organizationId],
      );
      const credit = creditResult.rows[0];
      if (!credit) throw new Error("Предоплата не найдена");
      if (credit.status !== "active") throw new Error("Отменённую предоплату нельзя корректировать");
      if (credit.used_quantity < 1) throw new Error("Корректировка нужна только после первого списания занятия");
      if (quantity < credit.used_quantity) {
        throw new Error("Количество не может быть меньше уже использованных занятий");
      }
      if (credit.payout_paid_amount > 0 && quantity !== credit.quantity) {
        throw new Error("После выплаты инструктору количество занятий менять нельзя");
      }
      if (finalTotalAmount % quantity !== 0) {
        throw new Error("Итоговая сумма должна делиться на количество занятий без остатка");
      }

      const adjustment = await client.query<{ id: string }>(
        `
          insert into public.student_prepaid_credit_adjustments (
            organization_id, credit_id, previous_quantity,
            previous_final_total_amount, new_quantity,
            new_final_total_amount, reason, created_by_member_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning id
        `,
        [
          credit.organization_id,
          credit.id,
          credit.quantity,
          credit.final_total_amount,
          quantity,
          finalTotalAmount,
          reason,
          membership.id,
        ],
      );

      await client.query(
        `
          update public.student_prepaid_credits
          set quantity = $1::integer,
              calculated_total_amount = calculated_unit_price::bigint * $1::integer,
              final_unit_price = $2::bigint / $1::integer,
              final_total_amount = $2::bigint,
              updated_at = now()
          where id = $3::uuid
        `,
        [quantity, finalTotalAmount, credit.id],
      );

      await syncInstructorPayoutEntryForPrepaidCredit(credit.id);
      return { id: adjustment.rows[0]?.id, usedQuantity: credit.used_quantity };
    });

    if (!result.id) throw new Error("Не удалось сохранить корректировку");
    await logAuditEvent({
      membership,
      action: "student_prepaid_credit.adjusted",
      entityType: "student_prepaid_credit",
      entityId: creditId,
      metadata: { adjustment_id: result.id, reason },
    });
    revalidateStudentAccessPaths();
    return { status: "success", message: "Корректировка предоплаты сохранена" };
  } catch (error) {
    console.error("createStudentPrepaidCreditAdjustmentAction:", error);
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function cancelStudentPrepaidCreditAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    if (!isPostgresBackend()) {
      throw new Error("Предоплаты доступны только в PostgreSQL-режиме");
    }

    const creditId = readRequiredString(formData, "student_prepaid_credit_id");
    const cancellationNote = readRequiredString(formData, "cancellation_note");
    if (cancellationNote.length > 900) {
      throw new Error("Причина отмены не должна быть длиннее 900 символов");
    }

    const membership = await requireActiveOrganizationMember();
    const access = await queryOne<{ instructor_id: string }>(
      `
        select instructor_id
        from public.student_prepaid_credits
        where id = $1
          and organization_id = $2
        limit 1
      `,
      [creditId, membership.organizationId],
    );
    if (!access) {
      throw new Error("Предоплата не найдена");
    }
    assertCanManageStudentPrepaidCredits(membership);

    const result = await withTransaction(async (client) => {
      const creditResult = await client.query<{
        id: string;
        student_access_id: string;
        organization_id: string;
        instructor_id: string;
        school_id: string;
        lesson_type_id: string;
        quantity: number;
        final_unit_price: number;
        status: "active" | "cancelled";
        used_quantity: number;
      }>(
        `
          select credits.id,
                 credits.student_access_id,
                 credits.organization_id,
                 credits.instructor_id,
                 credits.school_id,
                 credits.lesson_type_id,
                 credits.quantity,
                 credits.final_unit_price,
                 credits.status,
                 (
                   select count(*)::integer
                   from public.student_prepaid_credit_usages usages
                   where usages.credit_id = credits.id
                     and usages.status = 'active'
                 ) as used_quantity
          from public.student_prepaid_credits credits
          where credits.id = $1
            and credits.organization_id = $2
          for update
        `,
        [creditId, membership.organizationId],
      );
      const credit = creditResult.rows[0];
      if (!credit) {
        throw new Error("Предоплата не найдена");
      }
      if (credit.status !== "active") {
        throw new Error("Предоплата уже отменена");
      }

      const cancelledQuantity = credit.quantity - credit.used_quantity;
      if (cancelledQuantity <= 0) {
        throw new Error("Все оплаченные занятия уже использованы, отменять нечего");
      }

      const payoutResult = await client.query<{
        id: string;
        amount: number;
        paid_amount: number;
        rate_rule_id: string | null;
      }>(
        `
          select entries.id,
                 entries.amount,
                 entries.rate_rule_id,
                 (
                   select coalesce(sum(allocations.amount), 0)::integer
                   from public.instructor_payout_payment_allocations allocations
                   where allocations.payout_entry_id = entries.id
                 ) as paid_amount
          from public.instructor_payout_entries entries
          where entries.student_prepaid_credit_id = $1
            and entries.entry_type = 'prepaid_credit_accrual'
            and entries.status = 'planned'
          limit 1
          for update of entries
        `,
        [credit.id],
      );
      const payout = payoutResult.rows[0] ?? null;
      let payoutCorrectionAmount = 0;

      if (payout) {
        const rateAmount = Math.round(payout.amount / credit.quantity);
        const targetAmount = rateAmount * credit.used_quantity;
        payoutCorrectionAmount = targetAmount - payout.amount;

        if (payout.paid_amount === 0) {
          if (targetAmount === 0) {
            await client.query(
              `
                update public.instructor_payout_entries
                set status = 'cancelled',
                    cancelled_at = now(),
                    note = $2,
                    updated_at = now()
                where id = $1
              `,
              [payout.id, `Отмена предоплаты ученика: ${cancellationNote}`],
            );
          } else {
            await client.query(
              `
                update public.instructor_payout_entries
                set amount = $2,
                    note = $3,
                    updated_at = now()
                where id = $1
              `,
              [
                payout.id,
                targetAmount,
                `Оставлено начисление только за использованные занятия. ${cancellationNote}`,
              ],
            );
          }
        } else if (payoutCorrectionAmount !== 0) {
          await client.query(
            `
              insert into public.instructor_payout_entries (
                organization_id,
                instructor_id,
                student_prepaid_credit_id,
                school_id,
                lesson_type_id,
                student_access_id,
                rate_rule_id,
                entry_type,
                accrual_policy,
                status,
                amount,
                planned_at,
                event_at,
                created_by_member_id,
                note
              )
              values (
                $1, $2, $3, $4, $5, $6, $7,
                'cancellation_adjustment', 'prepaid', 'planned',
                $8, now(), now(), $9, $10
              )
            `,
            [
              credit.organization_id,
              credit.instructor_id,
              credit.id,
              credit.school_id,
              credit.lesson_type_id,
              credit.student_access_id,
              payout.rate_rule_id,
              payoutCorrectionAmount,
              membership.id,
              `Корректировка после отмены предоплаты: ${cancellationNote}`,
            ],
          );
        }
      }

      await client.query(
        `
          update public.student_prepaid_credits
          set status = 'cancelled',
              cancelled_at = now(),
              cancelled_by_member_id = $2,
              cancellation_note = $3,
              updated_at = now()
          where id = $1
        `,
        [credit.id, membership.id, cancellationNote],
      );

      return {
        studentAccessId: credit.student_access_id,
        cancelledQuantity,
        usedQuantity: credit.used_quantity,
        refundableAmount: credit.final_unit_price * cancelledQuantity,
        payoutCorrectionAmount,
      };
    });

    await logAuditEvent({
      membership,
      action: "student_prepaid_credit.cancelled",
      entityType: "student_prepaid_credit",
      entityId: creditId,
      metadata: {
        student_access_id: result.studentAccessId,
        cancelled_quantity: result.cancelledQuantity,
        used_quantity: result.usedQuantity,
        refundable_amount: result.refundableAmount,
        payout_correction_amount: result.payoutCorrectionAmount,
        cancellation_note: cancellationNote,
      },
    });

    revalidateStudentAccessPaths();
    return {
      status: "success",
      message: `Предоплата отменена. Отменено занятий: ${result.cancelledQuantity}. Сумма остатка: ${result.refundableAmount} ₽`,
    };
  } catch (error) {
    console.error("cancelStudentPrepaidCreditAction:", error);
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function createStudentPrepaidRefundAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    if (!isPostgresBackend()) {
      throw new Error("Возвраты доступны только в PostgreSQL-режиме");
    }

    const creditId = readRequiredString(formData, "student_prepaid_credit_id");
    const amount = readOptionalMoneyAmount(formData, "refund_amount");
    if (amount === null || amount <= 0) {
      throw new Error("Укажите сумму возврата ученику");
    }
    const refundedAt = readOptionalString(formData, "refunded_at");
    const refundNote = readOptionalString(formData, "refund_note");
    if (refundNote && refundNote.length > 1000) {
      throw new Error("Комментарий не должен быть длиннее 1000 символов");
    }

    const membership = await requireActiveOrganizationMember();
    const access = await queryOne<{ instructor_id: string }>(
      `
        select instructor_id
        from public.student_prepaid_credits
        where id = $1
          and organization_id = $2
        limit 1
      `,
      [creditId, membership.organizationId],
    );
    if (!access) {
      throw new Error("Предоплата не найдена");
    }
    assertCanManageStudentPrepaidCredits(membership);

    const result = await withTransaction(async (client) => {
      const creditResult = await client.query<{
        id: string;
        student_access_id: string;
        quantity: number;
        final_unit_price: number;
        status: "active" | "cancelled";
        used_quantity: number;
        refunded_amount: number;
      }>(
        `
          select credits.id,
                 credits.student_access_id,
                 credits.quantity,
                 credits.final_unit_price,
                 credits.status,
                 (
                   select count(*)::integer
                   from public.student_prepaid_credit_usages usages
                   where usages.credit_id = credits.id
                     and usages.status = 'active'
                 ) as used_quantity,
                 (
                   select coalesce(sum(refunds.amount), 0)::integer
                   from public.student_prepaid_refunds refunds
                   where refunds.credit_id = credits.id
                     and refunds.cancelled_at is null
                 ) as refunded_amount
          from public.student_prepaid_credits credits
          where credits.id = $1
            and credits.organization_id = $2
          for update
        `,
        [creditId, membership.organizationId],
      );
      const credit = creditResult.rows[0];
      if (!credit) {
        throw new Error("Предоплата не найдена");
      }
      if (credit.status !== "cancelled") {
        throw new Error("Возврат ученику можно отметить только после отмены предоплаты");
      }

      const refundableAmount =
        credit.final_unit_price * (credit.quantity - credit.used_quantity);
      const remainingRefundAmount = refundableAmount - credit.refunded_amount;
      if (remainingRefundAmount <= 0) {
        throw new Error("Вся сумма остатка уже возвращена ученику");
      }
      if (amount > remainingRefundAmount) {
        throw new Error("Сумма возврата превышает остаток к возврату ученику");
      }

      const refundResult = await client.query<{ id: string; amount: number }>(
        `
          insert into public.student_prepaid_refunds (
            organization_id,
            credit_id,
            amount,
            refunded_at,
            refund_note,
            created_by_member_id
          )
          values ($1, $2, $3, coalesce($4::date, current_date), $5, $6)
          returning id, amount
        `,
        [
          membership.organizationId,
          credit.id,
          amount,
          refundedAt,
          refundNote,
          membership.id,
        ],
      );
      const refund = refundResult.rows[0];
      if (!refund) {
        throw new Error("Не удалось сохранить возврат ученику");
      }

      return {
        id: refund.id,
        amount: refund.amount,
        studentAccessId: credit.student_access_id,
        remainingAmount: remainingRefundAmount - refund.amount,
      };
    });

    await logAuditEvent({
      membership,
      action: "student_prepaid_refund.created",
      entityType: "student_prepaid_refund",
      entityId: result.id,
      metadata: {
        student_prepaid_credit_id: creditId,
        student_access_id: result.studentAccessId,
        amount: result.amount,
        remaining_amount: result.remainingAmount,
      },
    });

    revalidateStudentAccessPaths();
    return {
      status: "success",
      message:
        result.remainingAmount > 0
          ? `Возврат ученику отмечен. Осталось вернуть: ${result.remainingAmount} ₽`
          : "Возврат ученику отмечен полностью",
    };
  } catch (error) {
    console.error("createStudentPrepaidRefundAction:", error);
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function cancelStudentPrepaidRefundAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    if (!isPostgresBackend()) {
      throw new Error("Отмена возвратов доступна только в PostgreSQL-режиме");
    }

    const refundId = readRequiredString(formData, "student_prepaid_refund_id");
    const cancellationNote = readOptionalString(formData, "cancellation_note");
    if (cancellationNote && cancellationNote.length > 1000) {
      throw new Error("Комментарий не должен быть длиннее 1000 символов");
    }

    const membership = await requireActiveOrganizationMember();
    const refund = await queryOne<{
      id: string;
      instructor_id: string;
    }>(
      `
        select refunds.id, credits.instructor_id
        from public.student_prepaid_refunds refunds
        join public.student_prepaid_credits credits on credits.id = refunds.credit_id
        where refunds.id = $1
          and refunds.organization_id = $2
          and refunds.cancelled_at is null
        limit 1
      `,
      [refundId, membership.organizationId],
    );
    if (!refund) {
      throw new Error("Возврат не найден или уже отменён");
    }

    assertCanManageStudentPrepaidCredits(membership);

    const cancelledRefund = await queryOne<{
      id: string;
      credit_id: string;
      amount: number;
    }>(
      `
        update public.student_prepaid_refunds
        set cancelled_at = now(),
            cancellation_note = $3,
            cancelled_by_member_id = $4
        where id = $1
          and organization_id = $2
          and cancelled_at is null
        returning id, credit_id, amount
      `,
      [
        refundId,
        membership.organizationId,
        cancellationNote,
        membership.id,
      ],
    );
    if (!cancelledRefund) {
      throw new Error("Возврат уже отменён");
    }

    await logAuditEvent({
      membership,
      action: "student_prepaid_refund.cancelled",
      entityType: "student_prepaid_refund",
      entityId: cancelledRefund.id,
      metadata: {
        student_prepaid_credit_id: cancelledRefund.credit_id,
        amount: cancelledRefund.amount,
        cancellation_note: cancellationNote,
      },
    });

    revalidateStudentAccessPaths();
    return {
      status: "success",
      message: "Ошибочная отметка возврата отменена",
    };
  } catch (error) {
    console.error("cancelStudentPrepaidRefundAction:", error);
    return { status: "error", message: getErrorMessage(error) };
  }
}
