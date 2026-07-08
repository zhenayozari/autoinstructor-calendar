import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveOrganizationMembership } from "@/lib/auth";

type ActiveInstructorsQuery = PromiseLike<{
  data: unknown[] | null;
  error: { message: string } | null;
}> & {
  eq(column: string, value: unknown): ActiveInstructorsQuery;
  order(column: string): ActiveInstructorsQuery;
};

type InstructorsTable = {
  select(columns: string): ActiveInstructorsQuery;
};

export function buildActiveInstructorsQuery(
  supabase: SupabaseClient,
  membership: ActiveOrganizationMembership,
  columns = "id, name, slug, public_name, timezone",
) {
  const instructorsTable = supabase.from(
    "instructors",
  ) as unknown as InstructorsTable;
  let query = instructorsTable
    .select(columns)
    .eq("organization_id", membership.organizationId)
    .eq("is_active", true)
    .order("name");

  if (membership.isInstructor && membership.instructorId) {
    query = query.eq("id", membership.instructorId);
  }

  return query;
}

export function getSelectedInstructorId(
  membership: ActiveOrganizationMembership,
  requestedInstructorId: string | null | undefined,
) {
  if (membership.isOwnerOrAdmin && requestedInstructorId) {
    return requestedInstructorId;
  }

  return membership.instructorId;
}

export function getSelectedInstructor<T extends { id: string }>(
  instructors: T[],
  selectedInstructorId: string | null | undefined,
) {
  return (
    instructors.find((instructor) => instructor.id === selectedInstructorId) ??
    instructors[0] ??
    null
  );
}

export function getInitialInstructorId<T extends { id: string }>(
  instructors: T[],
  membershipInstructorId: string | null | undefined,
) {
  if (
    membershipInstructorId &&
    instructors.some((instructor) => instructor.id === membershipInstructorId)
  ) {
    return membershipInstructorId;
  }

  return "";
}
