import "server-only";

import { createClient } from "@/lib/supabase/server";

export type InstructorCapability = "driving" | "theory";

export type PublicInstructor = {
  id: string;
  slug: string;
  public_name: string | null;
  photo_url: string | null;
  short_bio: string | null;
  contact_text: string | null;
  car_description: string | null;
  experience_text: string | null;
  capabilities: InstructorCapability[];
};

type InstructorRow = Omit<PublicInstructor, "capabilities">;

export async function getPublicInstructors(
  capability?: InstructorCapability,
) {
  const supabase = await createClient();
  const { data: instructorData, error: instructorError } = await supabase
    .from("instructors")
    .select(
      "id, slug, public_name, photo_url, short_bio, contact_text, car_description, experience_text",
    )
    .eq("is_active", true)
    .eq("public_is_visible", true)
    .order("public_name");

  if (instructorError) {
    return {
      instructors: [] as PublicInstructor[],
      error: instructorError,
    };
  }

  const instructorRows = (instructorData ?? []) as InstructorRow[];

  if (instructorRows.length === 0) {
    return {
      instructors: [] as PublicInstructor[],
      error: null,
    };
  }

  const { data: capabilityData, error: capabilityError } = await supabase
    .from("instructor_capabilities")
    .select("instructor_id, capability")
    .in(
      "instructor_id",
      instructorRows.map((instructor) => instructor.id),
    );

  if (capabilityError) {
    return {
      instructors: [] as PublicInstructor[],
      error: capabilityError,
    };
  }

  const capabilitiesByInstructor = new Map<string, InstructorCapability[]>();

  for (const item of capabilityData ?? []) {
    const current = capabilitiesByInstructor.get(item.instructor_id) ?? [];
    current.push(item.capability as InstructorCapability);
    capabilitiesByInstructor.set(item.instructor_id, current);
  }

  const instructors = instructorRows
    .filter(
      (instructor) =>
        !capability ||
        capabilitiesByInstructor.get(instructor.id)?.includes(capability),
    )
    .map((instructor) => ({
      ...instructor,
      capabilities: capabilitiesByInstructor.get(instructor.id) ?? [],
    }));

  return {
    instructors,
    error: null,
  };
}

export async function getPublicInstructorBySlug(slug: string) {
  const { instructors, error } = await getPublicInstructors();

  return {
    instructor:
      instructors.find((instructor) => instructor.slug === slug) ?? null,
    error,
  };
}
