import type { LegalDocumentType } from "@/lib/types";

export type LegalDocumentDefinition = {
  type: LegalDocumentType;
  slug: string;
  label: string;
  shortLabel: string;
  defaultTitle: string;
};

export const LEGAL_DOCUMENT_DEFINITIONS = [
  {
    type: "offer",
    slug: "offer",
    label: "Публичная оферта",
    shortLabel: "Оферта",
    defaultTitle: "Публичная оферта",
  },
  {
    type: "privacy_policy",
    slug: "privacy",
    label: "Политика обработки персональных данных",
    shortLabel: "Политика ПД",
    defaultTitle: "Политика обработки персональных данных",
  },
  {
    type: "personal_data_consent",
    slug: "personal-data-consent",
    label: "Согласие на обработку персональных данных",
    shortLabel: "Согласие ПД",
    defaultTitle: "Согласие на обработку персональных данных",
  },
] as const satisfies LegalDocumentDefinition[];

const definitionsByType = new Map<string, LegalDocumentDefinition>(
  LEGAL_DOCUMENT_DEFINITIONS.map((definition) => [
    definition.type,
    definition,
  ]),
);
const definitionsBySlug = new Map<string, LegalDocumentDefinition>(
  LEGAL_DOCUMENT_DEFINITIONS.map((definition) => [
    definition.slug,
    definition,
  ]),
);

export function getLegalDocumentDefinition(type: string) {
  return definitionsByType.get(type as LegalDocumentType) ?? null;
}

export function getLegalDocumentDefinitionBySlug(slug: string) {
  return definitionsBySlug.get(slug) ?? null;
}

export function isLegalDocumentType(value: string): value is LegalDocumentType {
  return definitionsByType.has(value as LegalDocumentType);
}
