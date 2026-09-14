"use server";

import { revalidatePath } from "next/cache";
import { setAppUserSession } from "@/lib/app-users/session";
import {
  hashAppUserPassword,
  verifyAppUserPassword,
} from "@/lib/app-users/password";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryOne } from "@/lib/db/postgres";
import { logAuditEvent } from "@/lib/audit-log";

export type AccountCredentialsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type CurrentAccountCredentials = {
  email: string;
  password_hash: string;
};

function readString(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value.trim() : "";
}

function validateEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Введите корректную эл. почту для входа");
  }

  if (email.length > 254) {
    throw new Error("Эл. почта слишком длинная");
  }

  return email;
}

function validateNewPassword(password: string) {
  if (password.length < 8 || password.length > 72) {
    throw new Error("Новый пароль должен содержать от 8 до 72 символов");
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  ) {
    return "Такая эл. почта уже используется другим пользователем";
  }

  return "Не удалось обновить данные входа";
}

export async function updateAccountCredentialsAction(
  previousState: AccountCredentialsActionState,
  formData: FormData,
): Promise<AccountCredentialsActionState> {
  void previousState;
  const membership = await requireActiveOrganizationMember();

  try {
    if (!isPostgresBackend()) {
      throw new Error("Смена данных входа доступна в PostgreSQL-режиме");
    }

    const email = validateEmail(readString(formData, "email"));
    const currentPassword = readString(formData, "current_password");
    const newPassword = readString(formData, "new_password");
    const newPasswordRepeat = readString(formData, "new_password_repeat");

    if (!currentPassword) {
      throw new Error("Введите текущий пароль");
    }

    if ((newPassword || newPasswordRepeat) && newPassword !== newPasswordRepeat) {
      throw new Error("Новый пароль и повтор не совпадают");
    }

    if (newPassword) {
      validateNewPassword(newPassword);
    }

    const currentAccount = await queryOne<CurrentAccountCredentials>(
      `
        select email, password_hash
        from public.app_users
        where id = $1
          and is_active = true
        limit 1
      `,
      [membership.user.id],
    );

    if (!currentAccount) {
      throw new Error("Аккаунт не найден");
    }

    if (!verifyAppUserPassword(currentPassword, currentAccount.password_hash)) {
      throw new Error("Текущий пароль указан неверно");
    }

    const emailChanged = email !== currentAccount.email;
    const passwordChanged = Boolean(newPassword);

    if (!emailChanged && !passwordChanged) {
      throw new Error("Нет изменений для сохранения");
    }

    await executeQuery(
      `
        update public.app_users
        set email = $1,
            password_hash = coalesce($2, password_hash),
            password_reset_required = case when $2 is null then password_reset_required else false end
        where id = $3
      `,
      [
        email,
        newPassword ? hashAppUserPassword(newPassword) : null,
        membership.user.id,
      ],
    );

    await setAppUserSession({
      userId: membership.user.id,
      email,
    });

    await logAuditEvent({
      membership,
      action: "account_credentials_updated",
      entityType: "app_user",
      entityId: membership.user.id,
      metadata: {
        email_changed: emailChanged,
        password_changed: passwordChanged,
      },
    });

    revalidatePath("/admin/profile");
    revalidatePath("/director/settings");

    return {
      status: "success",
      message: "Данные входа обновлены",
    };
  } catch (error) {
    console.error("updateAccountCredentialsAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
