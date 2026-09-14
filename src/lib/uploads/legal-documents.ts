import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getUploadsDir } from "@/lib/uploads/local-storage";
import type { LegalDocumentType } from "@/lib/types";

const ALLOWED_LEGAL_DOCUMENT_TYPES = new Map([
  ["application/pdf", "pdf"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
]);

export const LEGAL_DOCUMENT_MAX_SIZE = 10 * 1024 * 1024;

function getLegalDocumentsDir() {
  return (
    process.env.LEGAL_DOCUMENTS_DIR ??
    path.resolve(getUploadsDir(), "..", "legal-documents")
  );
}

function getExtensionFromFileName(fileName: string) {
  return fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function getMimeTypeFromExtension(extension: string) {
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return null;
}

function normalizeMimeType(file: File) {
  if (ALLOWED_LEGAL_DOCUMENT_TYPES.has(file.type)) {
    return file.type;
  }

  return getMimeTypeFromExtension(getExtensionFromFileName(file.name));
}

export async function saveLocalLegalDocumentUpload({
  file,
  organizationId,
  documentType,
}: {
  file: File;
  organizationId: string;
  documentType: LegalDocumentType;
}) {
  const mimeType = normalizeMimeType(file);

  if (!mimeType) {
    throw new Error("Загрузите документ в формате PDF или DOCX.");
  }

  if (file.size <= 0 || file.size > LEGAL_DOCUMENT_MAX_SIZE) {
    throw new Error("Документ должен быть не больше 10 МБ.");
  }

  const extension = ALLOWED_LEGAL_DOCUMENT_TYPES.get(mimeType);

  if (!extension) {
    throw new Error("Загрузите документ в формате PDF или DOCX.");
  }

  const fileName = `${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
  const relativePath = path
    .join(organizationId, documentType, fileName)
    .replace(/\\/g, "/");
  const fullPath = path.join(getLegalDocumentsDir(), relativePath);
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer, { flag: "wx" });

  return {
    storagePath: relativePath,
    mimeType,
    fileSizeBytes: file.size,
    originalFileName: file.name.slice(0, 240) || `document.${extension}`,
  };
}

export async function readLocalLegalDocument(storagePath: string) {
  const root = path.resolve(getLegalDocumentsDir());
  const fullPath = path.resolve(root, storagePath);

  if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Недопустимый путь к документу.");
  }

  return readFile(fullPath);
}

export async function deleteLocalLegalDocumentUpload(storagePath: string) {
  const root = path.resolve(getLegalDocumentsDir());
  const fullPath = path.resolve(root, storagePath);

  if (fullPath !== root && !fullPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Недопустимый путь к документу.");
  }

  try {
    await unlink(fullPath);
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}
