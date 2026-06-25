import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

function getBookingCodeSalt() {
  const salt = process.env.BOOKING_CODE_SALT;

  if (!salt) {
    throw new Error("BOOKING_CODE_SALT is not configured");
  }

  return salt;
}

export function hashBookingAccessCode(code: string) {
  return createHash("sha256")
    .update(code + getBookingCodeSalt(), "utf8")
    .digest("hex");
}

export function verifyBookingAccessCode(code: string, expectedHash: string) {
  const actualHash = hashBookingAccessCode(code);
  const actualBuffer = Buffer.from(actualHash, "hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
