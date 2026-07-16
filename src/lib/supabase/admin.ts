import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseSecretKey, getSupabaseUrl } from "./config";

export function hasSupabaseAdminKey() {
  return Boolean(getSupabaseSecretKey());
}

export function createAdminClient() {
  const secretKey = getSupabaseSecretKey();

  if (!secretKey) {
    throw new Error(
      "Добавьте служебный ключ проекта для административных операций",
    );
  }

  return createClient(getSupabaseUrl(), secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
