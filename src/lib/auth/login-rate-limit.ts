import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { executeQuery, queryRows } from "@/lib/db/postgres";

const WINDOW_SECONDS = 60;
const ACCOUNT_LIMIT = 5;
const ACCOUNT_IP_LIMIT = 5;
const IP_LIMIT = 30;

type RateLimitScope = "account" | "account_ip" | "ip";

type RateLimitRow = {
  scope: RateLimitScope;
  blocked_until: string | null;
};

export type LoginRateLimitState = {
  isBlocked: boolean;
  retryAfterSeconds: number;
};

function getRateLimitSecret() {
  const secret =
    process.env.AUTH_RATE_LIMIT_SECRET ??
    process.env.APP_SESSION_SECRET ??
    process.env.STUDENT_ACCESS_SALT ??
    process.env.BOOKING_CODE_SALT;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_RATE_LIMIT_SECRET must be at least 32 characters");
  }

  return secret;
}

function hashRateLimitKey(value: string) {
  return createHmac("sha256", getRateLimitSecret())
    .update(value, "utf8")
    .digest("hex");
}

function normalizeIdentifier(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function getKeyParts(identifier: string, ipAddress: string) {
  const accountKey = `account:${normalizeIdentifier(identifier)}`;
  const accountIpKey = `account_ip:${normalizeIdentifier(identifier)}:${ipAddress}`;
  const ipKey = `ip:${ipAddress}`;

  return [
    { scope: "account" as const, keyHash: hashRateLimitKey(accountKey) },
    { scope: "account_ip" as const, keyHash: hashRateLimitKey(accountIpKey) },
    { scope: "ip" as const, keyHash: hashRateLimitKey(ipKey) },
  ];
}

export async function getRequestIp() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const forwardedIp = forwardedFor?.split(",")[0]?.trim();
  const realIp = requestHeaders.get("x-real-ip")?.trim();

  return forwardedIp || realIp || "unknown";
}

export async function checkLoginRateLimit({
  identifier,
  ipAddress,
}: {
  identifier: string;
  ipAddress: string;
}): Promise<LoginRateLimitState> {
  const keys = getKeyParts(identifier, ipAddress);
  const rows = await queryRows<RateLimitRow>(
    `
      select scope, blocked_until::text as blocked_until
      from public.auth_login_rate_limits
      where (scope, key_hash) in (($1, $2), ($3, $4), ($5, $6))
    `,
    [
      keys[0].scope,
      keys[0].keyHash,
      keys[1].scope,
      keys[1].keyHash,
      keys[2].scope,
      keys[2].keyHash,
    ],
  );

  const retryAfterSeconds = rows.reduce((maximum, row) => {
    if (!row.blocked_until) {
      return maximum;
    }

    const remaining = Math.ceil(
      (new Date(row.blocked_until).getTime() - Date.now()) / 1000,
    );

    return Math.max(maximum, remaining);
  }, 0);

  return {
    isBlocked: retryAfterSeconds > 0,
    retryAfterSeconds: Math.max(0, retryAfterSeconds),
  };
}

function getLimit(scope: RateLimitScope) {
  return scope === "account"
    ? ACCOUNT_LIMIT
    : scope === "account_ip"
      ? ACCOUNT_IP_LIMIT
      : IP_LIMIT;
}

export async function recordFailedLogin({
  identifier,
  ipAddress,
}: {
  identifier: string;
  ipAddress: string;
}) {
  const keys = getKeyParts(identifier, ipAddress);

  for (const key of keys) {
    const limit = getLimit(key.scope);

    await executeQuery(
      `
        insert into public.auth_login_rate_limits (
          scope, key_hash, failed_count, window_started_at,
          last_failed_at, blocked_until
        )
        values (
          $1, $2, 1, now(), now(),
          case when $3 <= 1 then now() + ($4 * interval '1 second') else null end
        )
        on conflict (scope, key_hash) do update
        set failed_count = case
          when auth_login_rate_limits.window_started_at <= now() - ($4 * interval '1 second')
            then 1
          else auth_login_rate_limits.failed_count + 1
        end,
        window_started_at = case
          when auth_login_rate_limits.window_started_at <= now() - ($4 * interval '1 second')
            then now()
          else auth_login_rate_limits.window_started_at
        end,
        last_failed_at = now(),
        blocked_until = case
          when (
            case
              when auth_login_rate_limits.window_started_at <= now() - ($4 * interval '1 second')
                then 1
              else auth_login_rate_limits.failed_count + 1
            end
          ) >= $3
            then now() + ($4 * interval '1 second')
          else null
        end
      `,
      [key.scope, key.keyHash, limit, WINDOW_SECONDS],
    );
  }
}

export async function clearLoginRateLimit({
  identifier,
  ipAddress,
}: {
  identifier: string;
  ipAddress: string;
}) {
  const keys = getKeyParts(identifier, ipAddress);

  await executeQuery(
    `
      delete from public.auth_login_rate_limits
      where (scope, key_hash) in (($1, $2), ($3, $4))
    `,
    [
      keys[0].scope,
      keys[0].keyHash,
      keys[1].scope,
      keys[1].keyHash,
    ],
  );
}

export function getLoginRateLimitMessage(retryAfterSeconds: number) {
  return `Слишком много попыток входа. Повторите через ${retryAfterSeconds} секунд.`;
}

export function getLoginRateLimitHelpText(subject: string) {
  return `Если не помните пароль, свяжитесь со своим ${subject} и попросите прислать новый пароль или сбросить его.`;
}
