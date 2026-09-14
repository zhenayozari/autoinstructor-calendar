"use server";

import { revalidatePath } from "next/cache";
import {
  requireActiveOrganizationMember,
  requireInstructorAccess,
} from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryOne } from "@/lib/db/postgres";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveLocalImageUpload } from "@/lib/uploads/local-storage";

export type ProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const PHOTO_BUCKET = "instructor-photos";
const MAX_PHOTO_SIZE = 2 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function readOptionalString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
}

function validateLength(
  value: string | null,
  maxLength: number,
  label: string,
) {
  if (value && value.length > maxLength) {
    throw new Error(`${label}: максимум ${maxLength} символов`);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось сохранить профиль";
}

export async function saveInstructorProfileAction(
  previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  void previousState;
  const membership = await requireActiveOrganizationMember();

  try {
    const instructorValue = formData.get("instructor_id");
    const requestedInstructorId =
      typeof instructorValue === "string" ? instructorValue.trim() : "";
    const instructorId = membership.isInstructor
      ? membership.instructorId!
      : requestedInstructorId;

    if (!instructorId) {
      throw new Error("Выберите профиль инструктора");
    }

    await requireInstructorAccess(instructorId);
    const publicName = readOptionalString(formData, "public_name");
    const shortBio = readOptionalString(formData, "short_bio");
    const contactText = readOptionalString(formData, "contact_text");
    const carDescription = readOptionalString(formData, "car_description");
    const experienceText = readOptionalString(formData, "experience_text");
    const publicIsVisible = formData.get("public_is_visible") === "on";

    validateLength(shortBio, 500, "Краткое описание");
    validateLength(contactText, 300, "Контакты");
    validateLength(carDescription, 300, "Описание автомобиля");
    validateLength(experienceText, 300, "Опыт");

    const photoValue = formData.get("photo");
    const photo =
      photoValue instanceof File && photoValue.size > 0 ? photoValue : null;

    if (photo && !PHOTO_EXTENSIONS[photo.type]) {
      throw new Error("Разрешены только JPEG, PNG и WebP");
    }

    if (photo && photo.size > MAX_PHOTO_SIZE) {
      throw new Error("Размер фотографии не должен превышать 2 MB");
    }

    let instructor: { id: string; slug: string; photo_url: string | null };

    if (isPostgresBackend()) {
      const postgresInstructor = await queryOne<{
        id: string;
        slug: string;
        photo_url: string | null;
      }>(
        `
          select id, slug, photo_url
          from public.instructors
          where organization_id = $1
            and id = $2
        `,
        [membership.organizationId, instructorId],
      );

      if (!postgresInstructor) {
        throw new Error("Основной инструктор не найден");
      }

      instructor = postgresInstructor;
      let photoUrl = instructor.photo_url;

      if (photo) {
        const upload = await saveLocalImageUpload({
          file: photo,
          bucket: PHOTO_BUCKET,
          maxSize: MAX_PHOTO_SIZE,
        });
        photoUrl = upload.publicUrl;
      }

      await executeQuery(
        `
          update public.instructors
          set public_name = $1,
              photo_url = $2,
              short_bio = $3,
              contact_text = $4,
              car_description = $5,
              experience_text = $6,
              public_is_visible = $7,
              profile_updated_at = now()
          where id = $8
        `,
        [
          publicName,
          photoUrl,
          shortBio,
          contactText,
          carDescription,
          experienceText,
          publicIsVisible,
          instructor.id,
        ],
      );
    } else {
      const supabase = createAdminClient();
      const instructorQuery = supabase
        .from("instructors")
        .select("id, slug, photo_url")
        .eq("organization_id", membership.organizationId)
        .eq("id", instructorId);

      const { data: supabaseInstructor, error: instructorError } =
        await instructorQuery.maybeSingle();

      if (instructorError || !supabaseInstructor) {
        throw new Error("Основной инструктор не найден");
      }

      instructor = supabaseInstructor;
      let photoUrl = instructor.photo_url;
      let uploadedPath: string | null = null;

      if (photo) {
        const extension = PHOTO_EXTENSIONS[photo.type];
        uploadedPath = `${instructor.id}-${Date.now()}.${extension}`;
        const fileBuffer = Buffer.from(await photo.arrayBuffer());
        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(uploadedPath, fileBuffer, {
            contentType: photo.type,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Не удалось загрузить фотографию: ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from(PHOTO_BUCKET)
          .getPublicUrl(uploadedPath);
        photoUrl = publicUrlData.publicUrl;
      }

      const { error } = await supabase
        .from("instructors")
        .update({
          public_name: publicName,
          photo_url: photoUrl,
          short_bio: shortBio,
          contact_text: contactText,
          car_description: carDescription,
          experience_text: experienceText,
          public_is_visible: publicIsVisible,
          profile_updated_at: new Date().toISOString(),
        })
        .eq("id", instructor.id);

      if (error) {
        if (uploadedPath) {
          await supabase.storage.from(PHOTO_BUCKET).remove([uploadedPath]);
        }

        throw new Error(error.message);
      }
    }

    revalidatePath("/admin/profile");
    revalidatePath("/");
    revalidatePath("/instructors");
    revalidatePath(`/instructors/${instructor.slug}`);

    return {
      status: "success",
      message: "Профиль сохранён",
    };
  } catch (error) {
    console.error("saveInstructorProfileAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
