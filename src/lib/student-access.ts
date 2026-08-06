import "server-only";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_VERSION = "v1";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const LEGACY_SHA256_HASH_PATTERN = /^[a-f0-9]{64}$/i;

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

function hashLegacyStudentAccessSecret(value: string) {
  return createHash("sha256")
    .update(normalizeStudentAccessSecret(value) + getStudentAccessSalt(), "utf8")
    .digest("hex");
}

function getScryptInput(value: string) {
  return `${normalizeStudentAccessSecret(value)}${getStudentAccessSalt()}`;
}

function deriveScryptHash({
  secret,
  salt,
  cost,
  blockSize,
  parallelization,
}: {
  secret: string;
  salt: Buffer;
  cost: number;
  blockSize: number;
  parallelization: number;
}) {
  return scryptSync(getScryptInput(secret), salt, SCRYPT_KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: SCRYPT_MAX_MEMORY,
  });
}

export function hashStudentAccessSecret(value: string) {
  const salt = randomBytes(16);
  const hash = deriveScryptHash({
    secret: value,
    salt,
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  });

  return [
    "scrypt",
    SCRYPT_VERSION,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export function isLegacyStudentAccessSecretHash(value: string) {
  return LEGACY_SHA256_HASH_PATTERN.test(value);
}

export function verifyStudentAccessSecret(value: string, expectedHash: string) {
  if (isLegacyStudentAccessSecretHash(expectedHash)) {
    const actualBuffer = Buffer.from(hashLegacyStudentAccessSecret(value), "hex");
    const expectedBuffer = Buffer.from(expectedHash, "hex");

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  const [
    algorithm,
    version,
    costValue,
    blockSizeValue,
    parallelizationValue,
    saltValue,
    hashValue,
  ] = expectedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    version !== SCRYPT_VERSION ||
    !costValue ||
    !blockSizeValue ||
    !parallelizationValue ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }

  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    cost < 2 ||
    cost > SCRYPT_COST * 2 ||
    blockSize < 1 ||
    blockSize > SCRYPT_BLOCK_SIZE * 4 ||
    parallelization < 1 ||
    parallelization > SCRYPT_PARALLELIZATION * 4
  ) {
    return false;
  }

  const salt = Buffer.from(saltValue, "base64url");
  const expectedBuffer = Buffer.from(hashValue, "base64url");
  const actualBuffer = deriveScryptHash({
    secret: value,
    salt,
    cost,
    blockSize,
    parallelization,
  });

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
