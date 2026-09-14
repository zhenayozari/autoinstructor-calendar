"use server";

import { redirect } from "next/navigation";
import { verifyAppUserCredentials } from "@/lib/app-users/auth";
import {
  clearAppUserSession,
  setAppUserSession,
} from "@/lib/app-users/session";
import { isPostgresBackend } from "@/lib/backend-mode";
import { createClient } from "@/lib/supabase/server";

export type LoginActionState = {
  status: "idle" | "error";
  message: string;
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

  if (isPostgresBackend()) {
    const user = await verifyAppUserCredentials({
      email: email.trim(),
      password,
    });

    if (!user) {
      return {
        status: "error",
        message: "Неверная эл. почта или пароль",
      };
    }

    await setAppUserSession({
      userId: user.id,
      email: user.email,
    });

    redirect("/admin");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    console.error("loginAction:", error.message);

    return {
      status: "error",
      message: "Неверная эл. почта или пароль",
    };
  }

  redirect("/admin");
}

export async function logoutAction() {
  if (isPostgresBackend()) {
    await clearAppUserSession();
    redirect("/login");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
