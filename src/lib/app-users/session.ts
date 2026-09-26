import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { executeQuery, queryOne } from "@/lib/db/postgres";

export const APP_USER_SESSION_COOKIE = "app_user_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type AppUserSessionPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function setAppUserSession(userId: string) {
  const cookieStore = await cookies();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await executeQuery(
    `
      insert into public.app_user_sessions (
        app_user_id, token_hash, expires_at
      )
      values ($1, $2, $3)
    `,
    [userId, hashSessionToken(token), expiresAt.toISOString()],
  );

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
  const token = cookieStore.get(APP_USER_SESSION_COOKIE)?.value;

  if (token) {
    await executeQuery(
      `
        update public.app_user_sessions
        set revoked_at = coalesce(revoked_at, now())
        where token_hash = $1
      `,
      [hashSessionToken(token)],
    );
  }

  cookieStore.delete(APP_USER_SESSION_COOKIE);
}

export async function revokeAllAppUserSessions(userId: string) {
  await executeQuery(
    `
      update public.app_user_sessions
      set revoked_at = coalesce(revoked_at, now())
      where app_user_id = $1
        and revoked_at is null
    `,
    [userId],
  );
}

export async function getAppUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_USER_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await queryOne<{
    app_user_id: string;
    email: string;
    created_at: string;
    expires_at: string;
  }>(
    `
      select sessions.app_user_id,
             users.email,
             sessions.created_at::text as created_at,
             sessions.expires_at::text as expires_at
      from public.app_user_sessions sessions
      join public.app_users users on users.id = sessions.app_user_id
      where sessions.token_hash = $1
        and sessions.revoked_at is null
        and sessions.expires_at > now()
        and users.is_active = true
      limit 1
    `,
    [hashSessionToken(token)],
  );

  if (!session) {
    return null;
  }

  return {
    sub: session.app_user_id,
    email: session.email,
    iat: Math.floor(new Date(session.created_at).getTime() / 1000),
    exp: Math.floor(new Date(session.expires_at).getTime() / 1000),
  } satisfies AppUserSessionPayload;
}
