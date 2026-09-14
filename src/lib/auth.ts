import "server-only";

import { redirect } from "next/navigation";
import { getAppUserById } from "@/lib/app-users/auth";
import { getAppUserSession } from "@/lib/app-users/session";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryOne } from "@/lib/db/postgres";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export async function getAuthenticatedUser() {
  if (isPostgresBackend()) {
    const session = await getAppUserSession();

    if (!session) {
      return null;
    }

    const user = await getAppUserById(session.sub);

    return user
      ? ({
          id: user.id,
          email: user.email,
          user_metadata: {
            name: user.name,
            phone: user.phone,
            password_reset_required: user.password_reset_required,
          },
        } satisfies AuthenticatedUser)
      : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user satisfies AuthenticatedUser | null;
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export type ActiveOrganizationMembership = {
  id: string;
  organizationId: string;
  instructorId: string | null;
  role: "owner" | "admin" | "instructor";
  isOwnerOrAdmin: boolean;
  isInstructor: boolean;
  user: AuthenticatedUser;
};

export async function requireActiveOrganizationMember(): Promise<ActiveOrganizationMembership> {
  const user = await requireAuthenticatedUser();

  if (isPostgresBackend()) {
    const data = await queryOne<{
      id: string;
      organization_id: string;
      instructor_id: string | null;
      role: "owner" | "admin" | "instructor";
    }>(
      `
        select id, organization_id, instructor_id, role
        from public.organization_members
        where user_id = $1
          and is_active = true
        order by created_at
        limit 1
      `,
      [user.id],
    );

    if (
      !data ||
      (data.role !== "owner" &&
        data.role !== "admin" &&
        data.role !== "instructor") ||
      (data.role === "instructor" && !data.instructor_id)
    ) {
      redirect("/access-disabled");
    }

    return {
      id: data.id,
      organizationId: data.organization_id,
      instructorId: data.instructor_id,
      role: data.role,
      isOwnerOrAdmin: data.role === "owner" || data.role === "admin",
      isInstructor: data.role === "instructor",
      user,
    };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, organization_id, instructor_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("requireActiveOrganizationMember:", error);
  }

  if (
    !data ||
    (data.role !== "owner" &&
      data.role !== "admin" &&
      data.role !== "instructor") ||
    (data.role === "instructor" && !data.instructor_id)
  ) {
    redirect("/access-disabled");
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    instructorId: data.instructor_id,
    role: data.role,
    isOwnerOrAdmin: data.role === "owner" || data.role === "admin",
    isInstructor: data.role === "instructor",
    user,
  };
}

export async function requireInstructorAccess(targetInstructorId: string) {
  const membership = await requireActiveOrganizationMember();

  if (
    membership.isInstructor &&
    membership.instructorId !== targetInstructorId
  ) {
    throw new Error("Нет доступа к данным другого инструктора");
  }

  if (isPostgresBackend()) {
    const data = await queryOne<{ id: string }>(
      `
        select id
        from public.instructors
        where id = $1
          and organization_id = $2
        limit 1
      `,
      [targetInstructorId, membership.organizationId],
    );

    if (!data) {
      throw new Error("Инструктор не найден в вашей организации");
    }

    return membership;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("instructors")
    .select("id")
    .eq("id", targetInstructorId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Инструктор не найден в вашей организации");
  }

  return membership;
}
