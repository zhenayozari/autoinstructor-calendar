"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { hashAppUserPassword } from "@/lib/app-users/password";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryOne, withTransaction } from "@/lib/db/postgres";
import { getLegalDocumentDefinition } from "@/lib/legal-document-definitions";
import { getPublishedLegalDocumentsForAudience } from "@/lib/legal-documents";
import {
  getLegalAcceptanceFieldName,
} from "@/lib/student-legal-requirements";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

export type StaffRegistrationActionState = {
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
    throw new Error(`Поле "${field}" обязательно`);
  }

  return value;
}

function validateLength(value: string | null, max: number, label: string) {
  if (value && value.length > max) {
    throw new Error(`${label} не должно быть длиннее ${max} символов`);
  }

  return value;
}

function validateEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Введите корректную эл. почту");
  }

  return email.toLowerCase();
}

function validatePassword(password: string) {
  if (password.length < 8 || password.length > 72) {
    throw new Error("Пароль должен быть от 8 до 72 символов");
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось отправить заявку сотрудника";
}

function createEmployeeSlug() {
  return `employee-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

function getRequestIp(headersList: Headers) {
  return (
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headersList.get("x-real-ip")?.trim() ||
    null
  );
}

export async function submitStaffRegistrationAction(
  previousState: StaffRegistrationActionState,
  formData: FormData,
): Promise<StaffRegistrationActionState> {
  void previousState;

  let createdUserId: string | null = null;
  let createdInstructorId: string | null = null;

  try {
    const token = readRequiredString(formData, "token");
    const name = validateLength(readRequiredString(formData, "name"), 160, "Имя");
    const phone = validateLength(readOptionalString(formData, "phone"), 40, "Телефон");
    const email = validateEmail(readRequiredString(formData, "email"));
    const password = readRequiredString(formData, "password");
    validatePassword(password);

    if (isPostgresBackend()) {
      const invitation = await queryOne<{
        id: string;
        organization_id: string;
        status: string;
        expires_at: string;
      }>(
        `
          select id, organization_id, status, expires_at::text as expires_at
          from public.staff_invitations
          where token = $1
        `,
        [token],
      );

      if (!invitation) {
        throw new Error("Приглашение не найдено");
      }

      if (invitation.status === "submitted") {
        return {
          status: "success",
          message: "Заявка уже отправлена. Руководитель подтвердит доступ.",
        };
      }

      if (invitation.status === "approved") {
        return {
          status: "success",
          message: "Доступ уже подтверждён. Можно войти в кабинет инструктора.",
        };
      }

      if (invitation.status !== "invited") {
        throw new Error("Это приглашение уже не активно");
      }

      if (new Date(invitation.expires_at).getTime() < Date.now()) {
        await withTransaction(async (client) => {
          await client.query(
            `
              update public.staff_invitations
              set status = 'expired',
                  updated_at = now()
              where id = $1
            `,
            [invitation.id],
          );
        });
        throw new Error("Срок действия приглашения истёк");
      }

      const publishedDocuments = await getPublishedLegalDocumentsForAudience(
        invitation.organization_id,
        "staff",
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

      await withTransaction(async (client) => {
        const { rows: userRows } = await client.query<{ id: string }>(
          `
            insert into public.app_users (email, password_hash, name, phone)
            values ($1, $2, $3, $4)
            returning id
          `,
          [email, hashAppUserPassword(password), name, phone],
        );
        const userId = userRows[0]?.id;

        if (!userId) {
          throw new Error("Не удалось создать аккаунт");
        }

        createdUserId = userId;
        const { rows: instructorRows } = await client.query<{ id: string }>(
          `
            insert into public.instructors (
              organization_id, name, slug, public_name, timezone, is_active,
              public_is_visible, contact_text, profile_updated_at
            )
            values ($1, $2, $3, $4, $5, false, false, $6, now())
            returning id
          `,
          [
            invitation.organization_id,
            name,
            createEmployeeSlug(),
            name,
            DEFAULT_TIMEZONE,
            phone,
          ],
        );
        const instructorId = instructorRows[0]?.id;

        if (!instructorId) {
          throw new Error("Не удалось создать профиль инструктора");
        }

        createdInstructorId = instructorId;

        await client.query(
          `
            insert into public.instructor_settings (instructor_id)
            values ($1)
          `,
          [instructorId],
        );
        await client.query(
          `
            insert into public.instructor_capabilities (instructor_id, capability)
            values ($1, 'driving'), ($1, 'theory')
          `,
          [instructorId],
        );
        await client.query(
          `
            insert into public.organization_members (
              organization_id, user_id, instructor_id, role, is_active
            )
            values ($1, $2, $3, 'instructor', false)
          `,
          [invitation.organization_id, userId, instructorId],
        );
        await client.query(
          `
            update public.staff_invitations
            set status = 'submitted',
                submitted_name = $1,
                submitted_email = $2,
                submitted_phone = $3,
                user_id = $4,
                instructor_id = $5,
                personal_data_consent_at = now(),
                personal_data_consent_source = 'staff_registration',
                personal_data_consent_ip = $6,
                personal_data_consent_user_agent = $7,
                personal_data_consent_document_ids = $8::uuid[],
                personal_data_consent_document_versions = $9::jsonb,
                submitted_at = now(),
                updated_at = now()
            where id = $10
          `,
          [
            name,
            email,
            phone,
            userId,
            instructorId,
            getRequestIp(headersList),
            headersList.get("user-agent"),
            consentDocumentIds,
            JSON.stringify(consentDocumentVersions),
            invitation.id,
          ],
        );
      });

      return {
        status: "success",
        message: "Заявка отправлена. После подтверждения руководителем можно будет войти.",
      };
    }

    const supabase = createAdminClient();
    const { data: invitation, error: invitationError } = await supabase
      .from("staff_invitations")
      .select("id, organization_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (invitationError) {
      throw new Error(invitationError.message);
    }

    if (!invitation) {
      throw new Error("Приглашение не найдено");
    }

    if (invitation.status === "submitted") {
      return {
        status: "success",
        message: "Заявка уже отправлена. Руководитель подтвердит доступ.",
      };
    }

    if (invitation.status === "approved") {
      return {
        status: "success",
        message: "Доступ уже подтверждён. Можно войти в кабинет инструктора.",
      };
    }

    if (invitation.status !== "invited") {
      throw new Error("Это приглашение уже не активно");
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      await supabase
        .from("staff_invitations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", invitation.id);
      throw new Error("Срок действия приглашения истёк");
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone,
          staff_invitation_id: invitation.id,
        },
      });

    if (authError || !authData.user) {
      const message = authError?.message.toLowerCase() ?? "";

      if (
        message.includes("already") ||
        message.includes("registered") ||
        message.includes("exists")
      ) {
        throw new Error("Пользователь с такой эл. почтой уже существует");
      }

      throw new Error(authError?.message ?? "Не удалось создать аккаунт");
    }

    createdUserId = authData.user.id;

    const { data: instructor, error: instructorError } = await supabase
      .from("instructors")
      .insert({
        organization_id: invitation.organization_id,
        name,
        slug: createEmployeeSlug(),
        public_name: name,
        timezone: DEFAULT_TIMEZONE,
        is_active: false,
        public_is_visible: false,
        contact_text: phone,
        profile_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (instructorError || !instructor) {
      throw new Error(
        instructorError?.message ?? "Не удалось создать профиль инструктора",
      );
    }

    createdInstructorId = instructor.id;

    const { error: settingsError } = await supabase
      .from("instructor_settings")
      .insert({ instructor_id: instructor.id });

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    const { error: capabilitiesError } = await supabase
      .from("instructor_capabilities")
      .insert([
        { instructor_id: instructor.id, capability: "driving" },
        { instructor_id: instructor.id, capability: "theory" },
      ]);

    if (capabilitiesError) {
      throw new Error(capabilitiesError.message);
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: invitation.organization_id,
        user_id: authData.user.id,
        instructor_id: instructor.id,
        role: "instructor",
        is_active: false,
      });

    if (memberError) {
      throw new Error(memberError.message);
    }

    const { error: updateError } = await supabase
      .from("staff_invitations")
      .update({
        status: "submitted",
        submitted_name: name,
        submitted_email: email,
        submitted_phone: phone,
        user_id: authData.user.id,
        instructor_id: instructor.id,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      status: "success",
      message: "Заявка отправлена. После подтверждения руководителем можно будет войти.",
    };
  } catch (error) {
    console.error("submitStaffRegistrationAction:", error);

    try {
      if (isPostgresBackend()) {
        return {
          status: "error",
          message: getErrorMessage(error),
        };
      }

      const supabase = createAdminClient();

      if (createdInstructorId) {
        await supabase.from("instructors").delete().eq("id", createdInstructorId);
      }

      if (createdUserId) {
        await supabase.auth.admin.deleteUser(createdUserId);
      }
    } catch (cleanupError) {
      console.error("submitStaffRegistrationAction cleanup:", cleanupError);
    }

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
