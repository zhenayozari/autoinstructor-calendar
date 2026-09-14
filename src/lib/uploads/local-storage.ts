import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export function getUploadsDir() {
  const uploadsDir = process.env.UPLOADS_DIR;

  if (!uploadsDir) {
    throw new Error("UPLOADS_DIR is not configured");
  }

  return uploadsDir;
}

function getUploadsPublicPath() {
  return process.env.UPLOADS_PUBLIC_PATH ?? "/uploads";
}

export function getLocalUploadPublicUrl(relativePath: string) {
  return `${getUploadsPublicPath().replace(/\/$/, "")}/${relativePath.replace(/\\/g, "/")}`;
}

export async function saveLocalImageUpload({
  file,
  bucket,
  maxSize,
}: {
  file: File;
  bucket: "instructor-photos" | "public-site";
  maxSize: number;
}) {
  const extension = ALLOWED_IMAGE_TYPES.get(file.type);

  if (!extension) {
    throw new Error("Разрешены только JPEG, PNG, WebP и GIF");
  }

  if (file.size > maxSize) {
    throw new Error("Файл слишком большой");
  }

  const fileName = `${Date.now()}-${randomBytes(6).toString("hex")}.${extension}`;
  const relativePath = `${bucket}/${fileName}`;
  const fullPath = path.join(getUploadsDir(), bucket, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer, { flag: "wx" });

  return {
    relativePath,
    publicUrl: getLocalUploadPublicUrl(relativePath),
  };
}
