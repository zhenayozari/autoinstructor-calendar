import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function getBookingCodeSalt() {
  const salt = process.env.BOOKING_CODE_SALT;

  if (!salt) {
    throw new Error("BOOKING_CODE_SALT is not configured");
  }

  return salt;
}

export function normalizeBookingAccessCode(code: string) {
  return code.trim().toLocaleLowerCase("ru-RU");
}

export function hashBookingAccessCode(code: string) {
  return createHash("sha256")
    .update(normalizeBookingAccessCode(code) + getBookingCodeSalt(), "utf8")
    .digest("hex");
}

export function verifyBookingAccessCode(code: string, expectedHash: string) {
  const actualHash = hashBookingAccessCode(code);
  const legacyHash = createHash("sha256")
    .update(code + getBookingCodeSalt(), "utf8")
    .digest("hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  const legacyBuffer = Buffer.from(legacyHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  return (
    (actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)) ||
    (legacyBuffer.length === expectedBuffer.length &&
      timingSafeEqual(legacyBuffer, expectedBuffer))
  );
}
