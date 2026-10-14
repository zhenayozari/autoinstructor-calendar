"use server";

import { redirect } from "next/navigation";
import {
  getDummyStudentAccessSecretHash,
  hashStudentAccessSecret,
  isLegacyStudentAccessSecretHash,
  verifyStudentAccessSecret,
} from "@/lib/student-access";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  getLoginRateLimitHelpText,
  getLoginRateLimitMessage,
  getRequestIp,
  recordFailedLogin,
} from "@/lib/auth/login-rate-limit";
import { executeQuery, queryOne } from "@/lib/db/postgres";
import { setStudentSession } from "@/lib/student-session";

export type StudentLoginActionState = {
  status: "idle" | "error";
  message: string;
  retryAfterSeconds?: number;
  helpText?: string;
};

export async function studentLoginAction(
  previousState: StudentLoginActionState,
  formData: FormData,
): Promise<StudentLoginActionState> {
  void previousState;

  const rawLogin = formData.get("login");
  const rawSecret = formData.get("secret");

  if (
    typeof rawLogin !== "string" ||
    typeof rawSecret !== "string" ||
    !rawLogin.trim() ||
    !rawSecret.trim()
  ) {
    return {
      status: "error",
      message: "Введите логин и ПИН-код/пароль",
    };
  }

  const login = rawLogin.trim().toLocaleLowerCase("ru-RU");
  const secret = rawSecret.trim();

  const ipAddress = await getRequestIp();
  const rateLimit = await checkLoginRateLimit({
    identifier: login,
    ipAddress,
  });

  if (rateLimit.isBlocked) {
    return {
      status: "error",
      message: getLoginRateLimitMessage(rateLimit.retryAfterSeconds),
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      helpText: getLoginRateLimitHelpText("инструктором"),
    };
  }

  const access = await queryOne<{
    id: string;
    password_hash: string;
    is_active: boolean;
  }>(
    `
      select id, password_hash, is_active
      from public.student_accesses
      where login = $1
      limit 1
    `,
    [login],
  );
  const passwordHash =
    access?.password_hash ?? getDummyStudentAccessSecretHash();
  const isValidSecret = verifyStudentAccessSecret(secret, passwordHash);

  if (!access || !access.is_active || !isValidSecret) {
    await recordFailedLogin({
      identifier: login,
      ipAddress,
    });

    return {
      status: "error",
      message: "Неверный логин или ПИН-код/пароль",
    };
  }

  if (isLegacyStudentAccessSecretHash(access.password_hash)) {
    await executeQuery(
      `
        update public.student_accesses
        set password_hash = $2
        where id = $1
      `,
      [access.id, hashStudentAccessSecret(secret)],
    );
  }

  await clearLoginRateLimit({
    identifier: login,
    ipAddress,
  });

  await setStudentSession(access.id);
  redirect("/student");
}
