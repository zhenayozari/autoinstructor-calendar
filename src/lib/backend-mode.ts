export type BackendMode = "supabase" | "postgres";

export function getBackendMode(): BackendMode {
  return process.env.APP_BACKEND === "postgres" ? "postgres" : "supabase";
}

export function isPostgresBackend() {
  return getBackendMode() === "postgres";
}

