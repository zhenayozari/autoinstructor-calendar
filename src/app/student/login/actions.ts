"use server";

import { redirect } from "next/navigation";
import {
  hashStudentAccessSecret,
  isLegacyStudentAccessSecretHash,
  verifyStudentAccessSecret,
} from "@/lib/student-access";
import { setStudentSession } from "@/lib/student-session";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MINUTES = 15;
const LOCK_MINUTES = 15;

export type StudentLoginActionState = {
  status: "idle" | "error";
  message: string;
};

type LoginAttemptRow = {
  login: string;
  failed_count: number;
  locked_until: string | null;
  first_failed_at: string;
};

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function isMissingAttemptsTableError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST204" ||
    message.includes("student_login_attempts") ||
    message.includes("schema cache")
  );
}

async function getLoginAttemptStatus({
  login,
  supabase,
}: {
  login: string;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const { data, error } = await supabase
    .from("student_login_attempts")
    .select("login, failed_count, locked_until, first_failed_at")
    .eq("login", login)
    .maybeSingle();

  if (error) {
    if (isMissingAttemptsTableError(error)) {
      return { isLocked: false, attempt: null };
    }

    throw new Error(error.message);
  }

  const attempt = data as LoginAttemptRow | null;
  const lockedUntil = attempt?.locked_until
    ? new Date(attempt.locked_until)
    : null;

  return {
    isLocked: Boolean(lockedUntil && lockedUntil.getTime() > Date.now()),
    attempt,
  };
}

async function recordFailedLoginAttempt({
  login,
  attempt,
  supabase,
}: {
  login: string;
  attempt: LoginAttemptRow | null;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const now = new Date();
  const windowStartedAt = attempt?.first_failed_at
    ? new Date(attempt.first_failed_at)
    : null;
  const isSameWindow =
    windowStartedAt &&
    now.getTime() - windowStartedAt.getTime() <=
      ATTEMPT_WINDOW_MINUTES * 60 * 1000;
  const failedCount = isSameWindow && attempt ? attempt.failed_count + 1 : 1;
  const lockedUntil =
    failedCount >= MAX_FAILED_ATTEMPTS ? addMinutes(now, LOCK_MINUTES) : null;

  const { error } = await supabase.from("student_login_attempts").upsert(
    {
      login,
      failed_count: failedCount,
      locked_until: lockedUntil?.toISOString() ?? null,
      first_failed_at: isSameWindow && attempt
        ? attempt.first_failed_at
        : now.toISOString(),
      last_failed_at: now.toISOString(),
    },
    { onConflict: "login" },
  );

  if (error && !isMissingAttemptsTableError(error)) {
    throw new Error(error.message);
  }
}

async function clearLoginAttempts({
  login,
  supabase,
}: {
  login: string;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const { error } = await supabase
    .from("student_login_attempts")
    .delete()
    .eq("login", login);

  if (error && !isMissingAttemptsTableError(error)) {
    throw new Error(error.message);
  }
}

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
  const supabase = createAdminClient();

  let attempt: LoginAttemptRow | null = null;

  try {
    const attemptStatus = await getLoginAttemptStatus({ login, supabase });
    attempt = attemptStatus.attempt;

    if (attemptStatus.isLocked) {
      return {
        status: "error",
        message: "Слишком много попыток входа. Попробуйте ещё раз через 15 минут",
      };
    }
  } catch (error) {
    console.error("studentLoginAction attempts lookup:", error);
  }

  const { data: access, error } = await supabase
    .from("student_accesses")
    .select("id, password_hash, is_active")
    .eq("login", login)
    .maybeSingle();

  if (error) {
    console.error("studentLoginAction:", error);

    return {
      status: "error",
      message: "Не удалось проверить доступ. Попробуйте ещё раз",
    };
  }

  const isValidSecret =
    access && verifyStudentAccessSecret(secret, access.password_hash);

  if (!access || !access.is_active || !isValidSecret) {
    try {
      await recordFailedLoginAttempt({ login, attempt, supabase });
    } catch (attemptError) {
      console.error("studentLoginAction failed attempt:", attemptError);
    }

    return {
      status: "error",
      message: "Неверный логин или ПИН-код/пароль",
    };
  }

  if (isLegacyStudentAccessSecretHash(access.password_hash)) {
    const { error: updateError } = await supabase
      .from("student_accesses")
      .update({ password_hash: hashStudentAccessSecret(secret) })
      .eq("id", access.id);

    if (updateError) {
      console.error("studentLoginAction hash upgrade:", updateError.message);
    }
  }

  try {
    await clearLoginAttempts({ login, supabase });
  } catch (attemptError) {
    console.error("studentLoginAction clear attempts:", attemptError);
  }

  await setStudentSession(access.id);
  redirect("/student");
}
