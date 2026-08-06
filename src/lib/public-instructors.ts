import "server-only";

import { createClient } from "@/lib/supabase/server";

export type InstructorCapability = "driving" | "theory";

export type PublicInstructor = {
  id: string;
  slug: string;
  organization_id: string;
  public_name: string | null;
  photo_url: string | null;
  short_bio: string | null;
  contact_text: string | null;
  car_description: string | null;
  experience_text: string | null;
  capabilities: InstructorCapability[];
};

type InstructorRow = Omit<PublicInstructor, "capabilities">;

type InstructorSiteSettingsRow = {
  instructor_id: string;
  is_visible: boolean;
  show_photo: boolean;
  show_bio: boolean;
  show_contact: boolean;
  show_car: boolean;
  show_experience: boolean;
  public_note: string | null;
  public_contact: string | null;
  sort_order: number | null;
};

export async function getPublicInstructors(
  capability?: InstructorCapability,
) {
  const supabase = await createClient();
  const { data: instructorData, error: instructorError } = await supabase
    .from("instructors")
    .select(
      "id, organization_id, slug, public_name, photo_url, short_bio, contact_text, car_description, experience_text",
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
  const instructorIds = instructorRows.map((instructor) => instructor.id);

  if (instructorRows.length === 0) {
    return {
      instructors: [] as PublicInstructor[],
      error: null,
    };
  }

  const { data: settingsData, error: settingsError } = await supabase
    .from("instructor_site_settings")
    .select(
      "instructor_id, is_visible, show_photo, show_bio, show_contact, show_car, show_experience, public_note, public_contact, sort_order",
    )
    .in("instructor_id", instructorIds);

  if (settingsError) {
    return {
      instructors: [] as PublicInstructor[],
      error: settingsError,
    };
  }

  const { data: capabilityData, error: capabilityError } = await supabase
    .from("instructor_capabilities")
    .select("instructor_id, capability")
    .in("instructor_id", instructorIds);

  if (capabilityError) {
    return {
      instructors: [] as PublicInstructor[],
      error: capabilityError,
    };
  }

  const capabilitiesByInstructor = new Map<string, InstructorCapability[]>();
  const settingsByInstructorId = new Map(
    ((settingsData ?? []) as InstructorSiteSettingsRow[]).map((settings) => [
      settings.instructor_id,
      settings,
    ]),
  );

  for (const item of capabilityData ?? []) {
    const current = capabilitiesByInstructor.get(item.instructor_id) ?? [];
    current.push(item.capability as InstructorCapability);
    capabilitiesByInstructor.set(item.instructor_id, current);
  }

  const instructors = instructorRows
    .filter((instructor) => {
      const settings = settingsByInstructorId.get(instructor.id);

      return settings ? settings.is_visible : true;
    })
    .filter(
      (instructor) =>
        !capability ||
        capabilitiesByInstructor.get(instructor.id)?.includes(capability),
    )
    .map((instructor) => {
      const settings = settingsByInstructorId.get(instructor.id);
      const showPhoto = settings?.show_photo ?? true;
      const showBio = settings?.show_bio ?? true;
      const showContact = settings?.show_contact ?? false;
      const showCar = settings?.show_car ?? true;
      const showExperience = settings?.show_experience ?? true;

      return {
        ...instructor,
        photo_url: showPhoto ? instructor.photo_url : null,
        short_bio: showBio
          ? settings?.public_note || instructor.short_bio
          : null,
        contact_text: showContact
          ? settings?.public_contact || instructor.contact_text
          : null,
        car_description: showCar ? instructor.car_description : null,
        experience_text: showExperience ? instructor.experience_text : null,
        capabilities: capabilitiesByInstructor.get(instructor.id) ?? [],
      };
    })
    .sort((first, second) => {
      const firstOrder = settingsByInstructorId.get(first.id)?.sort_order ?? 100;
      const secondOrder =
        settingsByInstructorId.get(second.id)?.sort_order ?? 100;

      return (
        firstOrder - secondOrder ||
        (first.public_name ?? "").localeCompare(second.public_name ?? "")
      );
    });

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
