export function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error("Не настроена ссылка проекта Supabase");
  }

  const url = new URL(value);
  return `${url.protocol}//${url.host}`;
}

export function getSupabasePublishableKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!value) {
    throw new Error("Не настроен публичный ключ проекта Supabase");
  }

  return value;
}

export function getSupabaseSecretKey() {
  return (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    null
  );
}
