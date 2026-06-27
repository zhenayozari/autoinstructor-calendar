"use server";

import { revalidatePath } from "next/cache";
import {
  requireActiveOrganizationMember,
  requireInstructorAccess,
} from "@/lib/auth";
import { hashStudentAccessSecret } from "@/lib/student-access";
import { createAdminClient } from "@/lib/supabase/admin";

export type StudentAccessActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

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
  if (secret.length < 4 || secret.length > 72) {
    throw new Error("PIN/пароль должен содержать от 4 до 72 символов");
  }
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
    .eq("is_active", true)
    .in("id", uniqueIds);

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length !== uniqueIds.length) {
    throw new Error("Один из выбранных типов занятий не найден или отключён");
  }

  return uniqueIds;
}

async function getManageableAccess(accessId: string) {
  const membership = await requireActiveOrganizationMember();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_accesses")
    .select("id, instructor_id, organization_id")
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
        login,
        password_hash: hashStudentAccessSecret(secret),
        total_lesson_limit: totalLessonLimit,
        weekly_lesson_limit: weeklyLessonLimit,
        is_active: isActive,
      })
      .select("id")
      .single();

    if (error || !access) {
      if (error?.code === "23505") {
        throw new Error("Такой логин уже используется");
      }

      throw new Error(error?.message ?? "Не удалось создать учебный доступ");
    }

    const { error: lessonTypesError } = await supabase
      .from("student_access_lesson_types")
      .insert(
        lessonTypeIds.map((lessonTypeId) => ({
          student_access_id: access.id,
          lesson_type_id: lessonTypeId,
        })),
      );

    if (lessonTypesError) {
      await supabase.from("student_accesses").delete().eq("id", access.id);
      throw new Error(lessonTypesError.message);
    }

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: "Учебный доступ создан. Скопируйте данные и передайте ученику.",
    };
  } catch (error) {
    console.error("createStudentAccessAction:", error);

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
    const { access } = await getManageableAccess(accessId);
    const displayLabel = readRequiredString(formData, "display_label");
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
    const newSecret = readOptionalString(formData, "new_secret");
    const lessonTypeIds = await validateLessonTypes(
      readLessonTypeIds(formData),
    );

    if (displayLabel.length > 80) {
      throw new Error("Метка ученика должна быть не длиннее 80 символов");
    }

    const updates: {
      display_label: string;
      total_lesson_limit: number | null;
      weekly_lesson_limit: number | null;
      is_active: boolean;
      password_hash?: string;
    } = {
      display_label: displayLabel,
      total_lesson_limit: totalLessonLimit,
      weekly_lesson_limit: weeklyLessonLimit,
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
      throw new Error(error.message);
    }

    const { error: deleteError } = await supabase
      .from("student_access_lesson_types")
      .delete()
      .eq("student_access_id", access.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const { error: insertError } = await supabase
      .from("student_access_lesson_types")
      .insert(
        lessonTypeIds.map((lessonTypeId) => ({
          student_access_id: access.id,
          lesson_type_id: lessonTypeId,
        })),
      );

    if (insertError) {
      throw new Error(insertError.message);
    }

    revalidatePath("/admin/students");

    return {
      status: "success",
      message: newSecret
        ? "Доступ обновлён. Не забудьте передать ученику новый PIN/пароль."
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

export async function toggleStudentAccessAction(
  previousState: StudentAccessActionState,
  formData: FormData,
): Promise<StudentAccessActionState> {
  void previousState;

  try {
    const accessId = readRequiredString(formData, "student_access_id");
    const isActive = formData.get("is_active") === "true";
    const { access } = await getManageableAccess(accessId);
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("student_accesses")
      .update({ is_active: isActive })
      .eq("id", access.id)
      .eq("instructor_id", access.instructor_id);

    if (error) {
      throw new Error(error.message);
    }

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
