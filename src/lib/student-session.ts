import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { executeQuery, queryRows, queryOne } from "@/lib/db/postgres";

export const STUDENT_SESSION_COOKIE = "student_access_session";
const STUDENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type CurrentStudentAccess = {
  id: string;
  organizationId: string;
  instructorId: string;
  schoolId: string | null;
  displayLabel: string;
  firstName: string | null;
  lastName: string | null;
  studentPhone: string | null;
  studentPhotoUrl: string | null;
  login: string;
  totalLessonLimit: number | null;
  weeklyLessonLimit: number | null;
  isActive: boolean;
  profileCompletedAt: string | null;
  personalDataConsentAt: string | null;
  lessonTypeIds: string[];
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function setStudentSession(accessId: string) {
  const cookieStore = await cookies();
  const value = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + STUDENT_SESSION_TTL_SECONDS * 1000,
  );

  await executeQuery(
    `
      insert into public.student_access_sessions (
        student_access_id, token_hash, expires_at
      )
      values ($1, $2, $3)
    `,
    [accessId, hashSessionToken(value), expiresAt.toISOString()],
  );

  cookieStore.set(STUDENT_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STUDENT_SESSION_TTL_SECONDS,
  });
}

export async function clearStudentSession() {
  const cookieStore = await cookies();
  const value = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;

  if (value) {
    await executeQuery(
      `
        update public.student_access_sessions
        set revoked_at = coalesce(revoked_at, now())
        where token_hash = $1
      `,
      [hashSessionToken(value)],
    );
  }

  cookieStore.delete(STUDENT_SESSION_COOKIE);
}

export async function revokeAllStudentSessions(accessId: string) {
  await executeQuery(
    `
      update public.student_access_sessions
      set revoked_at = coalesce(revoked_at, now())
      where student_access_id = $1
        and revoked_at is null
    `,
    [accessId],
  );
}

export async function getCurrentStudentAccess() {
  const cookieStore = await cookies();
  const value = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;

  if (!value) {
    return null;
  }

  const session = await queryOne<{ student_access_id: string }>(
    `
      select student_access_id
      from public.student_access_sessions
      where token_hash = $1
        and revoked_at is null
        and expires_at > now()
      limit 1
    `,
    [hashSessionToken(value)],
  );

  if (!session) {
    return null;
  }

  const access = await queryOne<{
    id: string;
    organization_id: string;
    instructor_id: string;
    school_id: string | null;
    display_label: string;
    first_name: string | null;
    last_name: string | null;
    student_phone: string | null;
    student_photo_url: string | null;
    login: string;
    total_lesson_limit: number | null;
    weekly_lesson_limit: number | null;
    is_active: boolean;
    profile_completed_at: string | null;
    personal_data_consent_at: string | null;
  }>(
    `
      select id, organization_id, instructor_id, school_id, display_label,
             first_name, last_name, student_phone, student_photo_url, login,
             total_lesson_limit, weekly_lesson_limit, is_active,
             profile_completed_at::text as profile_completed_at,
             personal_data_consent_at::text as personal_data_consent_at
      from public.student_accesses
      where id = $1
      limit 1
    `,
    [session.student_access_id],
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
    studentPhotoUrl: access.student_photo_url,
    login: access.login,
    totalLessonLimit: access.total_lesson_limit,
    weeklyLessonLimit: access.weekly_lesson_limit,
    isActive: access.is_active,
    profileCompletedAt: access.profile_completed_at,
    personalDataConsentAt: access.personal_data_consent_at,
    lessonTypeIds: lessonTypes.map((item) => item.lesson_type_id),
  } satisfies CurrentStudentAccess;
}

export async function requireCurrentStudentAccess() {
  const access = await getCurrentStudentAccess();

  if (!access) {
    redirect("/student/login");
  }

  return access;
}
