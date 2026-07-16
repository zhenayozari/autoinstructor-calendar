"use server";

import { redirect } from "next/navigation";
import { verifyStudentAccessSecret } from "@/lib/student-access";
import { setStudentSession } from "@/lib/student-session";
import { createAdminClient } from "@/lib/supabase/admin";

export type StudentLoginActionState = {
  status: "idle" | "error";
  message: string;
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
  const supabase = createAdminClient();
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

  if (
    !access ||
    !access.is_active ||
    !verifyStudentAccessSecret(secret, access.password_hash)
  ) {
    return {
      status: "error",
      message: "Неверный логин или ПИН-код/пароль",
    };
  }

  await setStudentSession(access.id);
  redirect("/student");
}
