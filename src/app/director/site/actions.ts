"use server";

import { revalidatePath } from "next/cache";
import { requireDirectorAccess } from "@/lib/director-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryOne, withTransaction } from "@/lib/db/postgres";
import {
  getLegalDocumentDefinition,
  isLegalDocumentType,
} from "@/lib/legal-document-definitions";
import {
  DEFAULT_LANDING_CONTENT,
  normalizeLandingContent,
} from "@/lib/landing-content";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteLocalLegalDocumentUpload,
  saveLocalLegalDocumentUpload,
} from "@/lib/uploads/legal-documents";
import { saveLocalImageUpload } from "@/lib/uploads/local-storage";

const SITE_MEDIA_BUCKET = "public-site";
const ALLOWED_SITE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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

  if (["jpg", "jpeg", "png", "webp", "gif"].includes(extension)) {
    return extension;
  }

  return "png";
}

function readImageFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (!ALLOWED_SITE_IMAGE_TYPES.has(value.type)) {
    throw new Error("Загрузите изображение в формате JPEG, PNG, WebP или GIF.");
  }

  if (value.size > 4 * 1024 * 1024) {
    throw new Error("Изображение должно быть не больше 4 МБ.");
  }

  return value;
}

function readDocumentFile(formData: FormData, key: string) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    throw new Error("Выберите файл документа.");
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
  const postgresBackend = isPostgresBackend();
  const supabase = postgresBackend ? null : createAdminClient();
  const currentSettings = postgresBackend
    ? await queryOne<{ landing_content: unknown }>(
        `
          select landing_content
          from public.organization_site_settings
          where organization_id = $1
        `,
        [membership.organizationId],
      )
    : (
        await supabase!
          .from("organization_site_settings")
          .select("landing_content")
          .eq("organization_id", membership.organizationId)
          .maybeSingle()
      ).data;
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
      logoUrl = postgresBackend
        ? (
            await saveLocalImageUpload({
              file: logoFile,
              bucket: SITE_MEDIA_BUCKET,
              maxSize: 4 * 1024 * 1024,
            })
          ).publicUrl
        : await uploadSiteImage({
            file: logoFile,
            kind: "logo",
            organizationId: membership.organizationId,
            supabase: supabase!,
          });
    }

    if (heroFile) {
      heroImageUploaded = true;
      heroImageUrl = postgresBackend
        ? (
            await saveLocalImageUpload({
              file: heroFile,
              bucket: SITE_MEDIA_BUCKET,
              maxSize: 4 * 1024 * 1024,
            })
          ).publicUrl
        : await uploadSiteImage({
            file: heroFile,
            kind: "hero",
            organizationId: membership.organizationId,
            supabase: supabase!,
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
      documentsEnabled: readCheckbox(formData, "legal_documents_enabled"),
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

  if (postgresBackend) {
    await executeQuery(
      `
        insert into public.organization_site_settings (
          organization_id, hero_label, hero_title, hero_text, about_title,
          about_text, contact_phone, telegram_url, whatsapp_url, landing_content,
          show_about, show_lesson_types, show_instructors, show_contacts,
          show_student_login, require_student_profile_consent, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, now())
        on conflict (organization_id) do update
        set hero_label = excluded.hero_label,
            hero_title = excluded.hero_title,
            hero_text = excluded.hero_text,
            about_title = excluded.about_title,
            about_text = excluded.about_text,
            contact_phone = excluded.contact_phone,
            telegram_url = excluded.telegram_url,
            whatsapp_url = excluded.whatsapp_url,
            landing_content = excluded.landing_content,
            show_about = excluded.show_about,
            show_lesson_types = excluded.show_lesson_types,
            show_instructors = excluded.show_instructors,
            show_contacts = excluded.show_contacts,
            show_student_login = excluded.show_student_login,
            require_student_profile_consent = excluded.require_student_profile_consent,
            updated_at = now()
      `,
      [
        membership.organizationId,
        landingContent.hero.label,
        heroTitle,
        heroText,
        landingContent.situations.title,
        landingContent.situations.desktopText,
        landingContent.contacts.phoneLabel,
        landingContent.contacts.telegramUrl,
        landingContent.contacts.maxUrl,
        JSON.stringify(landingContent),
        landingContent.situations.enabled,
        readCheckbox(formData, "show_lesson_types"),
        landingContent.instructors.enabled,
        landingContent.contacts.enabled,
        readCheckbox(formData, "show_student_login"),
        readCheckbox(formData, "require_student_profile_consent"),
      ],
    );
  } else {
    const { error } = await supabase!.from("organization_site_settings").upsert(
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
      legal_documents_enabled: landingContent.legal.documentsEnabled,
      show_student_login: readCheckbox(formData, "show_student_login"),
      require_student_profile_consent: readCheckbox(
        formData,
        "require_student_profile_consent",
      ),
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

export async function uploadLegalDocumentAction(
  _prevState: DirectorSiteActionState,
  formData: FormData,
): Promise<DirectorSiteActionState> {
  const membership = await requireDirectorAccess();

  if (!isPostgresBackend()) {
    return {
      status: "error",
      message: "Загрузка документов доступна после переключения на PostgreSQL.",
    };
  }

  try {
    const documentType = readText(formData, "document_type");

    if (!isLegalDocumentType(documentType)) {
      throw new Error("Выберите тип документа.");
    }

    const definition = getLegalDocumentDefinition(documentType);
    const title = readTextWithFallback(
      formData,
      "title",
      definition?.defaultTitle ?? "Правовой документ",
    );
    const versionLabel = readNullableText(formData, "version_label");
    const publishNow = readCheckbox(formData, "publish_now");
    const file = readDocumentFile(formData, "document_file");
    const savedDocument = await saveLocalLegalDocumentUpload({
      file,
      organizationId: membership.organizationId,
      documentType,
    });

    const document = await withTransaction(async (client) => {
      if (publishNow) {
        await client.query(
          `
            update public.legal_documents
            set status = 'draft',
                published_at = null
            where organization_id = $1
              and document_type = $2
              and status = 'published'
          `,
          [membership.organizationId, documentType],
        );
      }

      const { rows } = await client.query<{ id: string }>(
        `
          insert into public.legal_documents (
            organization_id, document_type, title, version_label,
            original_file_name, storage_path, mime_type, file_size_bytes,
            status, published_at, created_by_member_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          returning id
        `,
        [
          membership.organizationId,
          documentType,
          title,
          versionLabel,
          savedDocument.originalFileName,
          savedDocument.storagePath,
          savedDocument.mimeType,
          savedDocument.fileSizeBytes,
          publishNow ? "published" : "draft",
          publishNow ? new Date().toISOString() : null,
          membership.id,
        ],
      );

      return rows[0] ?? null;
    });

    if (!document) {
      throw new Error("Не удалось сохранить документ.");
    }

    await logAuditEvent({
      membership,
      action: publishNow
        ? "legal_document.uploaded_published"
        : "legal_document.uploaded_draft",
      entityType: "legal_document",
      entityId: document.id,
      metadata: {
        document_type: documentType,
        mime_type: savedDocument.mimeType,
        file_size_bytes: savedDocument.fileSizeBytes,
      },
    });

    revalidatePath("/");
    revalidatePath("/director/site");
    revalidatePath(`/legal/${definition?.slug ?? ""}`);

    return {
      status: "success",
      message: publishNow
        ? "Документ загружен и опубликован."
        : "Документ загружен как черновик.",
    };
  } catch (error) {
    console.error("uploadLegalDocumentAction:", error);

    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Не удалось загрузить документ.",
    };
  }
}

export async function updateLegalDocumentAudienceAction(formData: FormData) {
  const membership = await requireDirectorAccess();

  if (!isPostgresBackend()) {
    return;
  }

  const documentId = readText(formData, "document_id");

  if (!documentId) {
    return;
  }

  const document = await queryOne<{
    id: string;
    document_type: string;
    show_for_students: boolean;
    show_for_staff: boolean;
    show_on_site: boolean;
  }>(
    `
      update public.legal_documents
      set show_for_students = $1,
          show_for_staff = $2,
          show_on_site = $3
      where id = $4
        and organization_id = $5
      returning id, document_type, show_for_students, show_for_staff, show_on_site
    `,
    [
      readCheckbox(formData, "show_for_students"),
      readCheckbox(formData, "show_for_staff"),
      readCheckbox(formData, "show_on_site"),
      documentId,
      membership.organizationId,
    ],
  );

  if (!document) {
    return;
  }

  const definition = getLegalDocumentDefinition(document.document_type);

  await logAuditEvent({
    membership,
    action: "legal_document.audience_updated",
    entityType: "legal_document",
    entityId: document.id,
    metadata: {
      document_type: document.document_type,
      show_for_students: document.show_for_students,
      show_for_staff: document.show_for_staff,
      show_on_site: document.show_on_site,
    },
  });

  revalidatePath("/");
  revalidatePath("/director/site");
  revalidatePath("/student");
  revalidatePath("/student/register");
  revalidatePath("/staff/register");
  revalidatePath(`/legal/${definition?.slug ?? ""}`);
}

export async function deleteLegalDocumentAction(formData: FormData) {
  const membership = await requireDirectorAccess();

  if (!isPostgresBackend()) {
    return;
  }

  const documentId = readText(formData, "document_id");

  if (!documentId) {
    return;
  }

  const document = await queryOne<{
    id: string;
    document_type: string;
    storage_path: string;
  }>(
    `
      delete from public.legal_documents
      where id = $1
        and organization_id = $2
      returning id, document_type, storage_path
    `,
    [documentId, membership.organizationId],
  );

  if (!document) {
    return;
  }

  try {
    await deleteLocalLegalDocumentUpload(document.storage_path);
  } catch (error) {
    console.error("deleteLegalDocumentAction file cleanup:", error);
  }

  const definition = getLegalDocumentDefinition(document.document_type);

  await logAuditEvent({
    membership,
    action: "legal_document.deleted",
    entityType: "legal_document",
    entityId: document.id,
    metadata: {
      document_type: document.document_type,
    },
  });

  revalidatePath("/");
  revalidatePath("/director/site");
  revalidatePath("/student");
  revalidatePath("/student/register");
  revalidatePath("/staff/register");
  revalidatePath(`/legal/${definition?.slug ?? ""}`);
}

export async function publishLegalDocumentAction(formData: FormData) {
  const membership = await requireDirectorAccess();

  if (!isPostgresBackend()) {
    return;
  }

  const documentId = readText(formData, "document_id");

  if (!documentId) {
    return;
  }

  const document = await queryOne<{
    id: string;
    document_type: string;
  }>(
    `
      select id, document_type
      from public.legal_documents
      where id = $1
        and organization_id = $2
      limit 1
    `,
    [documentId, membership.organizationId],
  );

  if (!document || !isLegalDocumentType(document.document_type)) {
    return;
  }

  await withTransaction(async (client) => {
    await client.query(
      `
        update public.legal_documents
        set status = 'draft',
            published_at = null
        where organization_id = $1
          and document_type = $2
          and status = 'published'
          and id <> $3
      `,
      [membership.organizationId, document.document_type, document.id],
    );
    await client.query(
      `
        update public.legal_documents
        set status = 'published',
            published_at = now()
        where id = $1
          and organization_id = $2
      `,
      [document.id, membership.organizationId],
    );
  });

  const definition = getLegalDocumentDefinition(document.document_type);

  await logAuditEvent({
    membership,
    action: "legal_document.published",
    entityType: "legal_document",
    entityId: document.id,
    metadata: {
      document_type: document.document_type,
    },
  });

  revalidatePath("/");
  revalidatePath("/director/site");
  revalidatePath(`/legal/${definition?.slug ?? ""}`);
}

export async function unpublishLegalDocumentAction(formData: FormData) {
  const membership = await requireDirectorAccess();

  if (!isPostgresBackend()) {
    return;
  }

  const documentId = readText(formData, "document_id");

  if (!documentId) {
    return;
  }

  const document = await queryOne<{
    id: string;
    document_type: string;
  }>(
    `
      update public.legal_documents
      set status = 'draft',
          published_at = null
      where id = $1
        and organization_id = $2
      returning id, document_type
    `,
    [documentId, membership.organizationId],
  );

  if (!document) {
    return;
  }

  const definition = getLegalDocumentDefinition(document.document_type);

  await logAuditEvent({
    membership,
    action: "legal_document.unpublished",
    entityType: "legal_document",
    entityId: document.id,
    metadata: {
      document_type: document.document_type,
    },
  });

  revalidatePath("/");
  revalidatePath("/director/site");
  revalidatePath(`/legal/${definition?.slug ?? ""}`);
}

export async function updateInstructorSiteSettingsAction(
  _prevState: DirectorSiteActionState,
  formData: FormData,
): Promise<DirectorSiteActionState> {
  const membership = await requireDirectorAccess();
  const postgresBackend = isPostgresBackend();
  const instructorId = readText(formData, "instructor_id");

  if (!instructorId) {
    return {
      status: "error",
      message: "Инструктор не найден.",
    };
  }

  const instructor = postgresBackend
    ? await queryOne<{ id: string }>(
        `
          select id
          from public.instructors
          where id = $1
            and organization_id = $2
        `,
        [instructorId, membership.organizationId],
      )
    : null;

  if (postgresBackend && !instructor) {
    return {
      status: "error",
      message: "Инструктор не найден в этой школе.",
    };
  }

  const supabase = postgresBackend ? null : createAdminClient();
  const supabaseInstructorResult = postgresBackend
    ? { data: instructor, error: null }
    : await supabase!
        .from("instructors")
        .select("id")
        .eq("id", instructorId)
        .eq("organization_id", membership.organizationId)
        .maybeSingle();

  if (supabaseInstructorResult.error || !supabaseInstructorResult.data) {
    return {
      status: "error",
      message: "Инструктор не найден в этой школе.",
    };
  }

  if (postgresBackend) {
    await executeQuery(
      `
        insert into public.instructor_site_settings (
          instructor_id, organization_id, is_visible, show_photo, show_bio,
          show_contact, show_car, show_experience, public_note, public_contact,
          sort_order, updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
        on conflict (instructor_id) do update
        set is_visible = excluded.is_visible,
            show_photo = excluded.show_photo,
            show_bio = excluded.show_bio,
            show_contact = excluded.show_contact,
            show_car = excluded.show_car,
            show_experience = excluded.show_experience,
            public_note = excluded.public_note,
            public_contact = excluded.public_contact,
            sort_order = excluded.sort_order,
            updated_at = now()
      `,
      [
        instructorId,
        membership.organizationId,
        readCheckbox(formData, "is_visible"),
        readCheckbox(formData, "show_photo"),
        readCheckbox(formData, "show_bio"),
        readCheckbox(formData, "show_contact"),
        readCheckbox(formData, "show_car"),
        readCheckbox(formData, "show_experience"),
        readNullableText(formData, "public_note"),
        readNullableText(formData, "public_contact"),
        readNumber(formData, "sort_order", 100),
      ],
    );
  } else {
    const { error } = await supabase!.from("instructor_site_settings").upsert(
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
