"use server";

import { headers } from "next/headers";
import { hashStudentAccessSecret } from "@/lib/student-access";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryOne } from "@/lib/db/postgres";
import { getLegalDocumentDefinition } from "@/lib/legal-document-definitions";
import { getPublishedLegalDocumentsForAudience } from "@/lib/legal-documents";
import {
  getLegalAcceptanceFieldName,
} from "@/lib/student-legal-requirements";
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

function getRequestIp(headersList: Headers) {
  return (
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip")?.trim() ||
    null
  );
}

async function getRegistrationInstructor(token: string) {
  if (isPostgresBackend()) {
    const settings = await queryOne<{
      instructor_id: string;
      student_registration_enabled: boolean;
    }>(
      `
        select instructor_id, student_registration_enabled
        from public.instructor_settings
        where student_registration_token = $1
        limit 1
      `,
      [token],
    );

    if (!settings?.student_registration_enabled) {
      throw new Error("Ссылка регистрации недоступна");
    }

    const instructor = await queryOne<{
      id: string;
      organization_id: string;
      is_active: boolean;
    }>(
      `
        select id, organization_id, is_active
        from public.instructors
        where id = $1
        limit 1
      `,
      [settings.instructor_id],
    );

    if (!instructor?.is_active) {
      throw new Error("Сейчас регистрация недоступна");
    }

    return instructor;
  }

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

    const instructor = await getRegistrationInstructor(token);

    if (isPostgresBackend()) {
      if (!firstName || !lastName || !studentPhone) {
        throw new Error("Заполните фамилию, имя и способ связи");
      }

      const publishedDocuments = await getPublishedLegalDocumentsForAudience(
        instructor.organization_id,
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
      const existingAccess = await queryOne<{ id: string }>(
        `
          select id
          from public.student_accesses
          where organization_id = $1
            and login = $2
          limit 1
        `,
        [instructor.organization_id, login],
      );

      if (existingAccess) {
        throw new Error("Такой логин уже занят");
      }

      try {
        await executeQuery(
          `
            insert into public.student_registration_requests (
              organization_id, instructor_id, first_name, last_name,
              student_phone, school_text, login, password_hash,
              personal_data_consent_at, personal_data_consent_source,
              personal_data_consent_ip, personal_data_consent_user_agent,
              personal_data_consent_document_ids,
              personal_data_consent_document_versions
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12::uuid[], $13::jsonb)
          `,
          [
            instructor.organization_id,
            instructor.id,
            firstName,
            lastName,
            studentPhone,
            schoolText,
            login,
            hashStudentAccessSecret(secret),
            "student_registration",
            getRequestIp(headersList),
            headersList.get("user-agent"),
            consentDocumentIds,
            JSON.stringify(consentDocumentVersions),
          ],
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505"
        ) {
          throw new Error("Заявка с таким логином уже ожидает подтверждения");
        }

        throw error;
      }

      const name = getDisplayName(firstName, lastName);

      return {
        status: "success",
        message: name
          ? `${name}, заявка отправлена. Инструктор подтвердит доступ.`
          : "Заявка отправлена. Инструктор подтвердит доступ.",
      };
    }

    const supabase = createAdminClient();
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
