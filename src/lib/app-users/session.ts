import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const APP_USER_SESSION_COOKIE = "app_user_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type AppUserSessionPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

function getSessionSecret() {
  const secret =
    process.env.APP_SESSION_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.BOOKING_CODE_SALT;

  if (!secret || secret.length < 32) {
    throw new Error("APP_SESSION_SECRET must be at least 32 characters");
  }

  return secret;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(data: string) {
  return createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
}

function verifySignature(data: string, signature: string) {
  const actual = Buffer.from(sign(data), "base64url");
  const expected = Buffer.from(signature, "base64url");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createAppUserSessionToken({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AppUserSessionPayload = {
    sub: userId,
    email,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const body = encode(JSON.stringify(payload));

  return `${body}.${sign(body)}`;
}

export function parseAppUserSessionToken(token: string) {
  const [body, signature] = token.split(".");

  if (!body || !signature || !verifySignature(body, signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decode(body)) as AppUserSessionPayload;

    if (
      !payload.sub ||
      !payload.email ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function setAppUserSession({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const cookieStore = await cookies();
  const token = createAppUserSessionToken({ userId, email });

  cookieStore.set(APP_USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAppUserSession() {
  const cookieStore = await cookies();

  cookieStore.delete(APP_USER_SESSION_COOKIE);
}

export async function getAppUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_USER_SESSION_COOKIE)?.value;

  return token ? parseAppUserSessionToken(token) : null;
}

