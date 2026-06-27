import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function getStudentAccessSalt() {
  const salt = process.env.STUDENT_ACCESS_SALT ?? process.env.BOOKING_CODE_SALT;

  if (!salt) {
    throw new Error("STUDENT_ACCESS_SALT or BOOKING_CODE_SALT is not configured");
  }

  return salt;
}

export function normalizeStudentAccessSecret(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

export function hashStudentAccessSecret(value: string) {
  return createHash("sha256")
    .update(normalizeStudentAccessSecret(value) + getStudentAccessSalt(), "utf8")
    .digest("hex");
}

export function verifyStudentAccessSecret(value: string, expectedHash: string) {
  const actualBuffer = Buffer.from(hashStudentAccessSecret(value), "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
