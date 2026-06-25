import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
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
  user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
};

export async function requireActiveOrganizationMember(): Promise<ActiveOrganizationMembership> {
  const user = await requireAuthenticatedUser();
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
