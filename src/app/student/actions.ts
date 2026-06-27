"use server";

import { redirect } from "next/navigation";
import { clearStudentSession } from "@/lib/student-session";

export async function studentLogoutAction() {
  await clearStudentSession();
  redirect("/student/login");
}
