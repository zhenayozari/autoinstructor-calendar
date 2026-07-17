"use server";

import { hashStudentAccessSecret } from "@/lib/student-access";
import {
  STUDENT_SECRET_MAX_LENGTH,
  STUDENT_SECRET_MIN_LENGTH,
} from "@/lib/student-secret-policy";
import { createAdminClient } from "@/lib/supabase/admin";

export type StudentRegistrationActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function readOptionalString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function readRequiredString(formData: FormData, field: string) {
  const value = readOptionalString(formData, field);

  if (!value) {
    throw new Error(`Поле «${field}» обязательно`);
  }

  return value;
}

function normalizeLogin(login: string) {
  return login.trim().toLocaleLowerCase("ru-RU");
}

function validateLogin(login: string) {
  if (!/^[a-z0-9][a-z0-9_-]{2,49}$/.test(login)) {
    throw new Error(
      "Логин должен быть 3-50 символов: латинские буквы, цифры, дефис или подчёркивание",
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

function validateLength(value: string | null, max: number, label: string) {
  if (value && value.length > max) {
    throw new Error(`${label} должно быть не длиннее ${max} символов`);
  }

  return value;
}

function getDisplayName(firstName: string | null, lastName: string | null) {
  return [lastName, firstName].filter(Boolean).join(" ").trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось отправить заявку";
}

async function getRegistrationInstructor(token: string) {
  const supabase = createAdminClient();
  const { data: settings, error: settingsError } = await supabase
    .from("instructor_settings")
    .select("instructor_id, student_registration_enabled")
    .eq("student_registration_token", token)
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  if (!settings || !settings.student_registration_enabled) {
    throw new Error("Ссылка регистрации недоступна");
  }

  const { data: instructor, error: instructorError } = await supabase
    .from("instructors")
    .select("id, organization_id, is_active")
    .eq("id", settings.instructor_id)
    .maybeSingle();

  if (instructorError) {
    throw new Error(instructorError.message);
  }

  if (!instructor?.is_active) {
    throw new Error("Сейчас регистрация недоступна");
  }

  return instructor as {
    id: string;
    organization_id: string;
    is_active: boolean;
  };
}

export async function createStudentRegistrationRequestAction(
  previousState: StudentRegistrationActionState,
  formData: FormData,
): Promise<StudentRegistrationActionState> {
  void previousState;

  try {
    const token = readRequiredString(formData, "token");
    const firstName = validateLength(
      readOptionalString(formData, "first_name"),
      80,
      "Имя",
    );
    const lastName = validateLength(
      readOptionalString(formData, "last_name"),
      80,
      "Фамилия",
    );
    const studentPhone = validateLength(
      readOptionalString(formData, "student_phone"),
      200,
      "Способ связи",
    );
    const schoolText = validateLength(
      readOptionalString(formData, "school_text"),
      120,
      "Автошкола",
    );
    const login = normalizeLogin(readRequiredString(formData, "login"));
    const secret = readRequiredString(formData, "secret");

    validateLogin(login);
    validateSecret(secret);

    const supabase = createAdminClient();
    const instructor = await getRegistrationInstructor(token);

    const { data: existingAccess, error: accessError } = await supabase
      .from("student_accesses")
      .select("id")
      .eq("organization_id", instructor.organization_id)
      .eq("login", login)
      .maybeSingle();

    if (accessError) {
      throw new Error(accessError.message);
    }

    if (existingAccess) {
      throw new Error("Такой логин уже занят");
    }

    const { error } = await supabase.from("student_registration_requests").insert({
      organization_id: instructor.organization_id,
      instructor_id: instructor.id,
      first_name: firstName,
      last_name: lastName,
      student_phone: studentPhone,
      school_text: schoolText,
      login,
      password_hash: hashStudentAccessSecret(secret),
    });

    if (error) {
      if (error.code === "23505") {
        throw new Error("Заявка с таким логином уже ожидает подтверждения");
      }

      throw new Error(error.message);
    }

    const name = getDisplayName(firstName, lastName);

    return {
      status: "success",
      message: name
        ? `${name}, заявка отправлена. Инструктор подтвердит доступ.`
        : "Заявка отправлена. Инструктор подтвердит доступ.",
    };
  } catch (error) {
    console.error("createStudentRegistrationRequestAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
