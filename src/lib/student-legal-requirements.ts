import type { LegalDocumentType } from "@/lib/types";

export const REQUIRED_STUDENT_LEGAL_DOCUMENT_TYPES: LegalDocumentType[] = [
  "offer",
  "privacy_policy",
  "personal_data_consent",
];

export function getLegalAcceptanceFieldName(type: LegalDocumentType) {
  return `legal_accept_${type}`;
}

export function getLegalAcceptanceLead(type: LegalDocumentType) {
  if (type === "offer") {
    return "Я принимаю условия документа";
  }

  if (type === "privacy_policy") {
    return "Я ознакомился(лась) с документом";
  }

  return "Я даю согласие согласно документу";
}
