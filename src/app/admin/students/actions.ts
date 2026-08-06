"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  requireActiveOrganizationMember,
  requireInstructorAccess,
} from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { hashStudentAccessSecret } from "@/lib/student-access";
import {
  STUDENT_SECRET_MAX_LENGTH,
  STUDENT_SECRET_MIN_LENGTH,
} from "@/lib/student-secret-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingPricingTableError } from "@/lib/pricing";
import type { BookingCategory } from "@/lib/types";

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

async function validateRequiredSchoolId(formData: FormData, organizationId: string) {
  return validateSchoolId(
    readRequiredString(formData, "school_id"),
    organizationId,
  );
}

async function replaceAccessLessonTypes({
  supabase,
  accessId,
  lessonTypeIds,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  accessId: string;
  lessonTypeIds: string[];
}) {
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
  supabase: ReturnType<typeof createAdminClient>;
  packageId: string;
  lessonTypeIds: string[];
}) {
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
  totalLessonLimit,
  weeklyLessonLimit,
  isActive,
  lessonTypeIds,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  accessId: string;
  organizationId: string;
  instructorId: string;
  schoolId: string | null;
  totalLessonLimit: number | null;
  weeklyLessonLimit: number | null;
  isActive: boolean;
  lessonTypeIds: string[];
}) {
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
  supabase: ReturnType<typeof createAdminClient>;
  accessId: string;
  fallbackLessonTypeIds: string[];
}) {
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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_accesses")
    .select("id, instructor_id, organization_id, login")
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
    },
  };
}

async function getManageableStudentLessonPackage(packageId: string) {
  const membership = await requireActiveOrganizationMember();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_lesson_packages")
    .select("id, student_access_id, instructor_id, organization_id, sort_order")
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
    },
  };
}

function assertOwnerCanDelete(membership: Awaited<ReturnType<typeof requireActiveOrganizationMember>>) {
  if (membership.role !== "owner") {
    throw new Error("Удалять навсегда может только руководитель");
  }
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
  revalidatePath("/student");
}

async function deleteStudentAccessById(accessId: string, formData: FormData) {
  assertDeleteConfirmed(formData);

  const { membership, access } = await getManageableAccess(accessId);
  assertOwnerCanDelete(membership);

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

async function getManageableRegistrationRequest(requestId: string) {
  const membership = await requireActiveOrganizationMember();
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
    const displayLabel = readRequiredString(formData, "display_label");
    const studentPhone = validateStudentPhone(
      readOptionalString(formData, "student_phone"),
    );
    const login = normalizeLogin(readRequiredString(formData, "login"));
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
    const schoolId = await validateRequiredSchoolId(
      formData,
      membership.organizationId,
    );
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );

    validateLogin(login);
    validateSecret(secret);

    if (displayLabel.length > 80) {
      throw new Error("Метка ученика должна быть не длиннее 80 символов");
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
      message: "Ученик добавлен. Скопируйте логин и ПИН-код и передайте ученику.",
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
    const schoolId = await validateRequiredSchoolId(
      formData,
      request.organization_id,
    );
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );

    if (displayLabel.length > 80) {
      throw new Error("Метка ученика должна быть не длиннее 80 символов");
    }

    validateLogin(login);

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
    const schoolId = await validateSchoolId(
      readOptionalString(formData, "school_id"),
      access.organization_id,
    );
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
    const displayLabel = readRequiredString(formData, "display_label");
    const login = readRequiredString(formData, "login");
    const studentPhone = readOptionalString(formData, "student_phone");
    const newSecret = readOptionalString(formData, "new_secret");
    const { membership, access } = await getManageableAccess(accessId);

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

    revalidatePath("/admin/students");

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

export async function toggleStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    const isActive = formData.get("is_active") === "true";
    const { membership, access } = await getManageableAccess(accessId);
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
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );
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
    const isActive = formData.get("is_active") === "on";
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_lesson_packages")
      .update({
        school_id: schoolId,
        booking_category: bookingCategory,
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
