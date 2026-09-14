import "server-only";

import { isPostgresBackend } from "@/lib/backend-mode";
import { queryOne, queryRows } from "@/lib/db/postgres";
import {
  getLegalDocumentDefinitionBySlug,
  LEGAL_DOCUMENT_DEFINITIONS,
} from "@/lib/legal-document-definitions";
import type { LegalDocument, LegalDocumentType } from "@/lib/types";

type LegalDocumentAudience = "student" | "staff";

function isMissingTableError(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "42P01" || error.code === "42703")
  );
}

export async function getLegalDocumentsForOrganization(organizationId: string) {
  if (!isPostgresBackend()) {
    return [];
  }

  try {
    return await queryRows<LegalDocument>(
      `
        select id, organization_id, document_type, title, version_label,
               original_file_name, storage_path, mime_type, file_size_bytes::text as file_size_bytes,
               status, published_at::text as published_at,
               show_for_students, show_for_staff, show_on_site,
               created_by_member_id, created_at::text as created_at,
               updated_at::text as updated_at
        from public.legal_documents
        where organization_id = $1
        order by document_type, created_at desc
      `,
      [organizationId],
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function getPublishedLegalDocuments(organizationId: string) {
  if (!isPostgresBackend()) {
    return [];
  }

  const documents = await getLegalDocumentsForOrganization(organizationId);
  const orderByType = new Map(
    LEGAL_DOCUMENT_DEFINITIONS.map((definition, index) => [
      definition.type,
      index,
    ]),
  );

  return documents
    .filter((document) => document.status === "published")
    .sort(
      (first, second) =>
        (orderByType.get(first.document_type) ?? 99) -
        (orderByType.get(second.document_type) ?? 99),
    );
}

export async function getPublishedLegalDocumentsForAudience(
  organizationId: string,
  audience: LegalDocumentAudience,
) {
  const documents = await getPublishedLegalDocuments(organizationId);

  return documents.filter((document) =>
    audience === "student"
      ? document.show_for_students
      : document.show_for_staff,
  );
}

export async function getPublishedLegalDocumentsForSite(organizationId: string) {
  const documents = await getPublishedLegalDocuments(organizationId);

  return documents.filter((document) => document.show_on_site);
}

export async function getPublishedLegalDocumentBySlug(slug: string) {
  if (!isPostgresBackend()) {
    return null;
  }

  const definition = getLegalDocumentDefinitionBySlug(slug);

  if (!definition) {
    return null;
  }

  try {
    return await queryOne<LegalDocument>(
      `
        select id, organization_id, document_type, title, version_label,
               original_file_name, storage_path, mime_type, file_size_bytes::text as file_size_bytes,
               status, published_at::text as published_at,
               show_for_students, show_for_staff, show_on_site,
               created_by_member_id, created_at::text as created_at,
               updated_at::text as updated_at
        from public.legal_documents
        where document_type = $1
          and status = 'published'
        order by published_at desc, created_at desc
        limit 1
      `,
      [definition.type],
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }

    throw error;
  }
}

export function getLegalDocumentPublicPath(type: LegalDocumentType) {
  const definition = LEGAL_DOCUMENT_DEFINITIONS.find(
    (item) => item.type === type,
  );

  return definition ? `/legal/${definition.slug}` : null;
}
