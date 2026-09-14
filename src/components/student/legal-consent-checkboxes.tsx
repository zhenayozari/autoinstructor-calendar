"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { LEGAL_DOCUMENT_DEFINITIONS } from "@/lib/legal-document-definitions";
import {
  getLegalAcceptanceFieldName,
  getLegalAcceptanceLead,
  REQUIRED_STUDENT_LEGAL_DOCUMENT_TYPES,
} from "@/lib/student-legal-requirements";
import type { LegalDocumentType } from "@/lib/types";

type PublishedLegalDocumentLink = {
  id: string;
  title: string;
  href: string;
  documentType: string;
};

export function hasRequiredStudentLegalDocuments(
  documents: PublishedLegalDocumentLink[],
  requiredDocumentTypes: LegalDocumentType[] = REQUIRED_STUDENT_LEGAL_DOCUMENT_TYPES,
) {
  return requiredDocumentTypes.every((type) =>
    documents.some((document) => document.documentType === type),
  );
}

export const hasRequiredLegalDocuments = hasRequiredStudentLegalDocuments;

export function LegalConsentCheckboxes({
  documents,
  disabled = false,
  required = true,
  requiredDocumentTypes = REQUIRED_STUDENT_LEGAL_DOCUMENT_TYPES,
}: {
  documents: PublishedLegalDocumentLink[];
  disabled?: boolean;
  required?: boolean;
  requiredDocumentTypes?: LegalDocumentType[];
}) {
  if ((!required || requiredDocumentTypes.length === 0) && documents.length === 0) {
    return null;
  }

  const documentsByType = new Map(
    documents.map((document) => [document.documentType, document]),
  );
  const missingDefinitions = requiredDocumentTypes.map((type) =>
    LEGAL_DOCUMENT_DEFINITIONS.find((definition) => definition.type === type),
  ).filter((definition): definition is NonNullable<typeof definition> => {
    if (!definition) {
      return false;
    }

    return !documentsByType.has(definition.type);
  });

  return (
    <section className="space-y-3 rounded-2xl border bg-zinc-50 p-4">
      <p className="text-sm font-semibold">Согласия</p>

      {missingDefinitions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950">
          Не опубликованы обязательные документы:{" "}
          {missingDefinitions.map((definition) => definition.shortLabel).join(", ")}.
        </div>
      )}

      {requiredDocumentTypes.length === 0 && (
        <div className="rounded-xl border bg-white px-3 py-3 text-sm leading-6 text-zinc-600">
          Для этой формы руководитель не включил обязательные документы.
        </div>
      )}

      {requiredDocumentTypes.map((type) => {
        const document = documentsByType.get(type);
        const definition = LEGAL_DOCUMENT_DEFINITIONS.find(
          (item) => item.type === type,
        );
        const label = definition?.shortLabel ?? "документ";

        return (
          <label
            key={type}
            className="flex items-start gap-3 rounded-xl border bg-white px-3 py-3 text-sm leading-6"
          >
            <input
              type="checkbox"
              name={getLegalAcceptanceFieldName(type)}
              className="mt-1 size-4"
              required={required && Boolean(document)}
              disabled={disabled || (required && !document)}
            />
            <span>
              {document ? (
                <>
                  {getLegalAcceptanceLead(type)}{" "}
                  <Link
                    href={document.href}
                    target="_blank"
                    className="font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-900"
                  >
                    {document.title}
                  </Link>
                  <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" />
                </>
              ) : (
                <>Документ «{label}» пока не опубликован.</>
              )}
            </span>
          </label>
        );
      })}
    </section>
  );
}
