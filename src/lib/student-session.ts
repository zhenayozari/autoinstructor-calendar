import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows, queryOne } from "@/lib/db/postgres";
import { createAdminClient } from "@/lib/supabase/admin";

export const STUDENT_SESSION_COOKIE = "student_access_session";

export type CurrentStudentAccess = {
  id: string;
  organizationId: string;
  instructorId: string;
  schoolId: string | null;
  displayLabel: string;
  firstName: string | null;
  lastName: string | null;
  studentPhone: string | null;
  login: string;
  totalLessonLimit: number | null;
  weeklyLessonLimit: number | null;
  isActive: boolean;
  profileCompletedAt: string | null;
  personalDataConsentAt: string | null;
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

  if (isPostgresBackend()) {
    const access = await queryOne<{
      id: string;
      organization_id: string;
      instructor_id: string;
      school_id: string | null;
      display_label: string;
      first_name: string | null;
      last_name: string | null;
      student_phone: string | null;
      login: string;
      total_lesson_limit: number | null;
      weekly_lesson_limit: number | null;
      is_active: boolean;
      profile_completed_at: string | null;
      personal_data_consent_at: string | null;
    }>(
      `
        select id, organization_id, instructor_id, school_id, display_label,
               first_name, last_name, student_phone, login,
               total_lesson_limit, weekly_lesson_limit, is_active,
               profile_completed_at::text as profile_completed_at,
               personal_data_consent_at::text as personal_data_consent_at
        from public.student_accesses
        where id = $1
        limit 1
      `,
      [accessId],
    );

    if (!access?.is_active) {
      return null;
    }

    const lessonTypes = await queryRows<{ lesson_type_id: string }>(
      `
        select lesson_type_id
        from public.student_access_lesson_types
        where student_access_id = $1
      `,
      [access.id],
    );

    return {
      id: access.id,
      organizationId: access.organization_id,
      instructorId: access.instructor_id,
      schoolId: access.school_id,
      displayLabel: access.display_label,
      firstName: access.first_name,
      lastName: access.last_name,
      studentPhone: access.student_phone,
      login: access.login,
      totalLessonLimit: access.total_lesson_limit,
      weeklyLessonLimit: access.weekly_lesson_limit,
      isActive: access.is_active,
      profileCompletedAt: access.profile_completed_at,
      personalDataConsentAt: access.personal_data_consent_at,
      lessonTypeIds: lessonTypes.map((item) => item.lesson_type_id),
    } satisfies CurrentStudentAccess;
  }

  const supabase = createAdminClient();
  const { data: access, error } = await supabase
    .from("student_accesses")
    .select(
      "id, organization_id, instructor_id, school_id, display_label, login, total_lesson_limit, weekly_lesson_limit, is_active",
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
    schoolId: access.school_id,
    displayLabel: access.display_label,
    firstName: null,
    lastName: null,
    studentPhone: null,
    login: access.login,
    totalLessonLimit: access.total_lesson_limit,
    weeklyLessonLimit: access.weekly_lesson_limit,
    isActive: access.is_active,
    profileCompletedAt: new Date(0).toISOString(),
    personalDataConsentAt: new Date(0).toISOString(),
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
