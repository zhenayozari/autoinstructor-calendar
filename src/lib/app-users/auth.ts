import "server-only";

import { queryOne } from "@/lib/db/postgres";
import {
  hashAppUserPassword,
  verifyAppUserPassword,
} from "@/lib/app-users/password";

let dummyPasswordHash: string | null = null;

function getDummyPasswordHash() {
  dummyPasswordHash ??= hashAppUserPassword("invalid-login-password");
  return dummyPasswordHash;
}

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  password_reset_required: boolean;
};

type AppUserWithPassword = AppUser & {
  password_hash: string;
};

export async function getAppUserById(userId: string) {
  return queryOne<AppUser>(
    `
      select id, email, name, phone, password_reset_required
      from public.app_users
      where id = $1
        and is_active = true
      limit 1
    `,
    [userId],
  );
}

export async function verifyAppUserCredentials({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  const user = await queryOne<AppUserWithPassword>(
    `
      select id, email, name, phone, password_hash, password_reset_required
      from public.app_users
      where email = $1
        and is_active = true
      limit 1
    `,
    [email.trim().toLowerCase()],
  );

  const passwordHash = user?.password_hash ?? getDummyPasswordHash();

  if (!verifyAppUserPassword(password, passwordHash) || !user) {
    return null;
  }

  const { password_hash, ...safeUser } = user;
  void password_hash;

  return safeUser;
}
