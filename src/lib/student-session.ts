import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const STUDENT_SESSION_COOKIE = "student_access_session";

export type CurrentStudentAccess = {
  id: string;
  organizationId: string;
  instructorId: string;
  displayLabel: string;
  login: string;
  totalLessonLimit: number | null;
  weeklyLessonLimit: number | null;
  isActive: boolean;
  lessonTypeIds: string[];
};

function getStudentSessionSalt() {
  const salt = process.env.STUDENT_ACCESS_SALT ?? process.env.BOOKING_CODE_SALT;

  if (!salt) {
    throw new Error("STUDENT_ACCESS_SALT or BOOKING_CODE_SALT is not configured");
  }

  return salt;
}

function signStudentAccessId(accessId: string) {
  return createHmac("sha256", getStudentSessionSalt())
    .update(accessId, "utf8")
    .digest("hex");
}

function isValidSignature(accessId: string, signature: string) {
  const expected = signStudentAccessId(accessId);
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function createStudentSessionValue(accessId: string) {
  return `${accessId}.${signStudentAccessId(accessId)}`;
}

export async function setStudentSession(accessId: string) {
  const cookieStore = await cookies();

  cookieStore.set(STUDENT_SESSION_COOKIE, createStudentSessionValue(accessId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearStudentSession() {
  const cookieStore = await cookies();
  cookieStore.delete(STUDENT_SESSION_COOKIE);
}

export async function getCurrentStudentAccess() {
  const cookieStore = await cookies();
  const value = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;

  if (!value) {
    return null;
  }

  const [accessId, signature] = value.split(".");

  if (!accessId || !signature || !isValidSignature(accessId, signature)) {
    return null;
  }

  const supabase = createAdminClient();
  const { data: access, error } = await supabase
    .from("student_accesses")
    .select(
      "id, organization_id, instructor_id, display_label, login, total_lesson_limit, weekly_lesson_limit, is_active",
    )
    .eq("id", accessId)
    .maybeSingle();

  if (error || !access || !access.is_active) {
    return null;
  }

  const { data: lessonTypes, error: lessonTypesError } = await supabase
    .from("student_access_lesson_types")
    .select("lesson_type_id")
    .eq("student_access_id", access.id);

  if (lessonTypesError) {
    return null;
  }

  return {
    id: access.id,
    organizationId: access.organization_id,
    instructorId: access.instructor_id,
    displayLabel: access.display_label,
    login: access.login,
    totalLessonLimit: access.total_lesson_limit,
    weeklyLessonLimit: access.weekly_lesson_limit,
    isActive: access.is_active,
    lessonTypeIds: (lessonTypes ?? []).map((item) => item.lesson_type_id),
  } satisfies CurrentStudentAccess;
}

export async function requireCurrentStudentAccess() {
  const access = await getCurrentStudentAccess();

  if (!access) {
    redirect("/student/login");
  }

  return access;
}
