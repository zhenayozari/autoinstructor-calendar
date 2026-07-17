"use server";

import { revalidatePath } from "next/cache";
import { requireDirectorAccess } from "@/lib/director-auth";
import { logAuditEvent } from "@/lib/audit-log";
import {
  DEFAULT_LANDING_CONTENT,
  normalizeLandingContent,
} from "@/lib/landing-content";
import { createAdminClient } from "@/lib/supabase/admin";

const SITE_MEDIA_BUCKET = "public-site";

export type DirectorSiteActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function readNullableText(formData: FormData, key: string) {
  const value = readText(formData, key);

  return value.length > 0 ? value : null;
}

function readCheckbox(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readNumber(formData: FormData, key: string, fallback: number) {
  const value = Number(formData.get(key));

  return Number.isFinite(value) ? value : fallback;
}

function readTextWithFallback(
  formData: FormData,
  key: string,
  fallback: string,
) {
  return readText(formData, key) || fallback;
}

function readTextItems(
  formData: FormData,
  prefix: string,
  fallback: Array<{ title: string; text: string }>,
) {
  return fallback.map((item, index) => ({
    title: readTextWithFallback(
      formData,
      `${prefix}_${index}_title`,
      item.title,
    ),
    text: readTextWithFallback(formData, `${prefix}_${index}_text`, item.text),
  }));
}

function readSignals(
  formData: FormData,
  prefix: string,
  fallback: Array<{ value: string; label: string }>,
) {
  return fallback.map((item, index) => ({
    value: readTextWithFallback(
      formData,
      `${prefix}_${index}_value`,
      item.value,
    ),
    label: readTextWithFallback(
      formData,
      `${prefix}_${index}_label`,
      item.label,
    ),
  }));
}

function readStringList(formData: FormData, prefix: string, fallback: string[]) {
  return fallback.map((item, index) =>
    readTextWithFallback(formData, `${prefix}_${index}`, item),
  );
}

function getFileExtension(file: File) {
  const [, extension = "png"] = file.name.toLowerCase().match(/\.([a-z0-9]+)$/) ?? [];

  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(extension)) {
    return extension;
  }

  return "png";
}

function readImageFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (!value.type.startsWith("image/")) {
    throw new Error("Загружать можно только изображения.");
  }

  if (value.size > 4 * 1024 * 1024) {
    throw new Error("Изображение должно быть не больше 4 МБ.");
  }

  return value;
}

async function uploadSiteImage({
  file,
  kind,
  organizationId,
  supabase,
}: {
  file: File;
  kind: "logo" | "hero";
  organizationId: string;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const { data: bucket } = await supabase.storage.getBucket(SITE_MEDIA_BUCKET);

  if (!bucket) {
    const { error: bucketError } = await supabase.storage.createBucket(
      SITE_MEDIA_BUCKET,
      {
        public: true,
        fileSizeLimit: 4 * 1024 * 1024,
        allowedMimeTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "image/svg+xml",
        ],
      },
    );

    if (bucketError) {
      throw new Error(bucketError.message);
    }
  }

  const extension = getFileExtension(file);
  const path = `${organizationId}/${kind}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type || "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(SITE_MEDIA_BUCKET).getPublicUrl(path);

  return data.publicUrl;
}

export async function updateOrganizationSiteSettingsAction(
  _prevState: DirectorSiteActionState,
  formData: FormData,
): Promise<DirectorSiteActionState> {
  const membership = await requireDirectorAccess();
  const supabase = createAdminClient();
  const { data: currentSettings } = await supabase
    .from("organization_site_settings")
    .select("landing_content")
    .eq("organization_id", membership.organizationId)
    .maybeSingle();
  const currentContent = normalizeLandingContent(
    currentSettings?.landing_content,
  );

  const heroTitle = readText(formData, "hero_title");
  const heroText = readText(formData, "hero_text");
  const situationsTitle = readText(formData, "situations_title");
  const situationsText = readText(formData, "situations_desktop_text");

  if (!heroTitle || !heroText || !situationsTitle || !situationsText) {
    return {
      status: "error",
      message: "Заполните главный экран и блок “Когда это нужно”.",
    };
  }

  let logoUrl = readText(formData, "current_logo_url");
  let heroImageUrl = readText(formData, "current_hero_image_url");
  let logoUploaded = false;
  let heroImageUploaded = false;

  try {
    const logoFile = readImageFile(formData, "logo_file");
    const heroFile = readImageFile(formData, "hero_image_file");

    if (logoFile) {
      logoUploaded = true;
      logoUrl = await uploadSiteImage({
        file: logoFile,
        kind: "logo",
        organizationId: membership.organizationId,
        supabase,
      });
    }

    if (heroFile) {
      heroImageUploaded = true;
      heroImageUrl = await uploadSiteImage({
        file: heroFile,
        kind: "hero",
        organizationId: membership.organizationId,
        supabase,
      });
    }
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Не удалось загрузить изображение.",
    };
  }

  const landingContent = {
    media: {
      logoUrl,
      logoAlt: readTextWithFallback(
        formData,
        "logo_alt",
        currentContent.media.logoAlt,
      ),
      heroImageUrl: heroImageUrl || currentContent.media.heroImageUrl,
      heroImageAlt: readTextWithFallback(
        formData,
        "hero_image_alt",
        currentContent.media.heroImageAlt,
      ),
    },
    hero: {
      enabled: readCheckbox(formData, "hero_enabled"),
      label: readTextWithFallback(
        formData,
        "hero_label",
        DEFAULT_LANDING_CONTENT.hero.label,
      ),
      title: heroTitle,
      text: heroText,
      signals: readSignals(
        formData,
        "hero_signal",
        DEFAULT_LANDING_CONTENT.hero.signals,
      ),
    },
    result: {
      enabled: readCheckbox(formData, "result_enabled"),
      title: readTextWithFallback(
        formData,
        "result_title",
        DEFAULT_LANDING_CONTENT.result.title,
      ),
      text: readTextWithFallback(
        formData,
        "result_text",
        DEFAULT_LANDING_CONTENT.result.text,
      ),
      items: readTextItems(
        formData,
        "result_item",
        DEFAULT_LANDING_CONTENT.result.items,
      ),
    },
    situations: {
      enabled: readCheckbox(formData, "situations_enabled"),
      label: readTextWithFallback(
        formData,
        "situations_label",
        DEFAULT_LANDING_CONTENT.situations.label,
      ),
      title: situationsTitle,
      desktopText: situationsText,
      mobileSummaryTitle: readTextWithFallback(
        formData,
        "situations_mobile_summary_title",
        DEFAULT_LANDING_CONTENT.situations.mobileSummaryTitle,
      ),
      mobileSummaryText: readTextWithFallback(
        formData,
        "situations_mobile_summary_text",
        DEFAULT_LANDING_CONTENT.situations.mobileSummaryText,
      ),
      items: readTextItems(
        formData,
        "situation_item",
        DEFAULT_LANDING_CONTENT.situations.items,
      ),
    },
    approach: {
      enabled: readCheckbox(formData, "approach_enabled"),
      label: readTextWithFallback(
        formData,
        "approach_label",
        DEFAULT_LANDING_CONTENT.approach.label,
      ),
      title: readTextWithFallback(
        formData,
        "approach_title",
        DEFAULT_LANDING_CONTENT.approach.title,
      ),
      text: readTextWithFallback(
        formData,
        "approach_text",
        DEFAULT_LANDING_CONTENT.approach.text,
      ),
      chips: readStringList(
        formData,
        "approach_chip",
        DEFAULT_LANDING_CONTENT.approach.chips,
      ),
    },
    process: {
      enabled: readCheckbox(formData, "process_enabled"),
      label: readTextWithFallback(
        formData,
        "process_label",
        DEFAULT_LANDING_CONTENT.process.label,
      ),
      title: readTextWithFallback(
        formData,
        "process_title",
        DEFAULT_LANDING_CONTENT.process.title,
      ),
      steps: readTextItems(
        formData,
        "process_step",
        DEFAULT_LANDING_CONTENT.process.steps,
      ),
    },
    instructors: {
      enabled: readCheckbox(formData, "instructors_enabled"),
      label: readTextWithFallback(
        formData,
        "instructors_label",
        DEFAULT_LANDING_CONTENT.instructors.label,
      ),
      title: readTextWithFallback(
        formData,
        "instructors_title",
        DEFAULT_LANDING_CONTENT.instructors.title,
      ),
    },
    contacts: {
      enabled: readCheckbox(formData, "contacts_enabled"),
      label: readTextWithFallback(
        formData,
        "contacts_label",
        DEFAULT_LANDING_CONTENT.contacts.label,
      ),
      title: readTextWithFallback(
        formData,
        "contacts_title",
        DEFAULT_LANDING_CONTENT.contacts.title,
      ),
      text: readTextWithFallback(
        formData,
        "contacts_text",
        DEFAULT_LANDING_CONTENT.contacts.text,
      ),
      phoneLabel: readTextWithFallback(
        formData,
        "contacts_phone_label",
        DEFAULT_LANDING_CONTENT.contacts.phoneLabel,
      ),
      phoneHref: readTextWithFallback(
        formData,
        "contacts_phone_href",
        DEFAULT_LANDING_CONTENT.contacts.phoneHref,
      ),
      telegramLabel: readTextWithFallback(
        formData,
        "contacts_telegram_label",
        DEFAULT_LANDING_CONTENT.contacts.telegramLabel,
      ),
      telegramUrl: readTextWithFallback(
        formData,
        "contacts_telegram_url",
        DEFAULT_LANDING_CONTENT.contacts.telegramUrl,
      ),
      maxLabel: readTextWithFallback(
        formData,
        "contacts_max_label",
        DEFAULT_LANDING_CONTENT.contacts.maxLabel,
      ),
      maxUrl: readTextWithFallback(
        formData,
        "contacts_max_url",
        DEFAULT_LANDING_CONTENT.contacts.maxUrl,
      ),
    },
    legal: {
      enabled: readCheckbox(formData, "legal_enabled"),
      linkLabel: readTextWithFallback(
        formData,
        "legal_link_label",
        DEFAULT_LANDING_CONTENT.legal.linkLabel,
      ),
      title: readTextWithFallback(
        formData,
        "legal_title",
        DEFAULT_LANDING_CONTENT.legal.title,
      ),
      text: readTextWithFallback(
        formData,
        "legal_text",
        DEFAULT_LANDING_CONTENT.legal.text,
      ),
    },
  };

  const { error } = await supabase.from("organization_site_settings").upsert(
    {
      organization_id: membership.organizationId,
      hero_label: landingContent.hero.label,
      hero_title: heroTitle,
      hero_text: heroText,
      about_title: landingContent.situations.title,
      about_text: landingContent.situations.desktopText,
      contact_phone: landingContent.contacts.phoneLabel,
      telegram_url: landingContent.contacts.telegramUrl,
      whatsapp_url: landingContent.contacts.maxUrl,
      landing_content: landingContent,
      show_about: landingContent.situations.enabled,
      show_lesson_types: readCheckbox(formData, "show_lesson_types"),
      show_instructors: landingContent.instructors.enabled,
      show_contacts: landingContent.contacts.enabled,
      show_student_login: readCheckbox(formData, "show_student_login"),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  await logAuditEvent({
    membership,
    action: "site.settings_updated",
    entityType: "organization_site_settings",
    entityId: membership.organizationId,
    metadata: {
      hero_enabled: landingContent.hero.enabled,
      situations_enabled: landingContent.situations.enabled,
      approach_enabled: landingContent.approach.enabled,
      process_enabled: landingContent.process.enabled,
      instructors_enabled: landingContent.instructors.enabled,
      contacts_enabled: landingContent.contacts.enabled,
      legal_enabled: landingContent.legal.enabled,
      logo_uploaded: logoUploaded,
      hero_image_uploaded: heroImageUploaded,
    },
  });

  revalidatePath("/");
  revalidatePath("/director/site");

  return {
    status: "success",
    message: "Настройки сайта сохранены.",
  };
}

export async function updateInstructorSiteSettingsAction(
  _prevState: DirectorSiteActionState,
  formData: FormData,
): Promise<DirectorSiteActionState> {
  const membership = await requireDirectorAccess();
  const supabase = createAdminClient();
  const instructorId = readText(formData, "instructor_id");

  if (!instructorId) {
    return {
      status: "error",
      message: "Инструктор не найден.",
    };
  }

  const { data: instructor, error: instructorError } = await supabase
    .from("instructors")
    .select("id")
    .eq("id", instructorId)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (instructorError || !instructor) {
    return {
      status: "error",
      message: "Инструктор не найден в этой школе.",
    };
  }

  const { error } = await supabase.from("instructor_site_settings").upsert(
    {
      instructor_id: instructorId,
      organization_id: membership.organizationId,
      is_visible: readCheckbox(formData, "is_visible"),
      show_photo: readCheckbox(formData, "show_photo"),
      show_bio: readCheckbox(formData, "show_bio"),
      show_contact: readCheckbox(formData, "show_contact"),
      show_car: readCheckbox(formData, "show_car"),
      show_experience: readCheckbox(formData, "show_experience"),
      public_note: readNullableText(formData, "public_note"),
      public_contact: readNullableText(formData, "public_contact"),
      sort_order: readNumber(formData, "sort_order", 100),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "instructor_id" },
  );

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  await logAuditEvent({
    membership,
    action: "site.instructor_settings_updated",
    entityType: "instructor_site_settings",
    entityId: instructorId,
    metadata: {
      is_visible: readCheckbox(formData, "is_visible"),
      show_photo: readCheckbox(formData, "show_photo"),
      show_bio: readCheckbox(formData, "show_bio"),
      show_contact: readCheckbox(formData, "show_contact"),
      show_car: readCheckbox(formData, "show_car"),
      show_experience: readCheckbox(formData, "show_experience"),
    },
  });

  revalidatePath("/");
  revalidatePath("/director/site");

  return {
    status: "success",
    message: "Настройки инструктора сохранены.",
  };
}
