create table if not exists public.app_user_sessions (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_user_sessions_token_hash_format check (
    token_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint app_user_sessions_expiry_check check (expires_at > created_at)
);

create index if not exists app_user_sessions_active_user_idx
  on public.app_user_sessions(app_user_id, expires_at)
  where revoked_at is null;

create table if not exists public.student_access_sessions (
  id uuid primary key default gen_random_uuid(),
  student_access_id uuid not null references public.student_accesses(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_access_sessions_token_hash_format check (
    token_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint student_access_sessions_expiry_check check (expires_at > created_at)
);

create index if not exists student_access_sessions_active_access_idx
  on public.student_access_sessions(student_access_id, expires_at)
  where revoked_at is null;
