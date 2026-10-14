"use server";

import { redirect } from "next/navigation";
import { verifyAppUserCredentials } from "@/lib/app-users/auth";
import {
  clearAppUserSession,
  setAppUserSession,
} from "@/lib/app-users/session";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  getLoginRateLimitHelpText,
  getLoginRateLimitMessage,
  getRequestIp,
  recordFailedLogin,
} from "@/lib/auth/login-rate-limit";

export type LoginActionState = {
  status: "idle" | "error";
  message: string;
  retryAfterSeconds?: number;
  helpText?: string;
};

export async function loginAction(
  previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  void previousState;

  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return {
      status: "error",
      message: "Введите эл. почту и пароль",
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const ipAddress = await getRequestIp();
  const rateLimit = await checkLoginRateLimit({
    identifier: normalizedEmail,
    ipAddress,
  });

  if (rateLimit.isBlocked) {
    return {
      status: "error",
      message: getLoginRateLimitMessage(rateLimit.retryAfterSeconds),
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      helpText: getLoginRateLimitHelpText("руководителем"),
    };
  }

  const user = await verifyAppUserCredentials({
    email: normalizedEmail,
    password,
  });

  if (!user) {
    await recordFailedLogin({
      identifier: normalizedEmail,
      ipAddress,
    });

    return {
      status: "error",
      message: "Неверная эл. почта или пароль",
    };
  }

  await clearLoginRateLimit({
    identifier: normalizedEmail,
    ipAddress,
  });
  await setAppUserSession(user.id);

  redirect("/admin");
}

export async function logoutAction() {
  await clearAppUserSession();
  redirect("/login");
}
