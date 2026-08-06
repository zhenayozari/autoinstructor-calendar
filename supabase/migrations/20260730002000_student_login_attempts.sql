create table if not exists public.student_login_attempts (
  login text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  constraint student_login_attempts_login_not_blank check (
    length(trim(login)) > 0
  ),
  constraint student_login_attempts_failed_count_check check (
    failed_count >= 0 and failed_count <= 100
  )
);

create index if not exists student_login_attempts_locked_until_idx
  on public.student_login_attempts(locked_until);

alter table public.student_login_attempts enable row level security;

revoke all on public.student_login_attempts from anon, authenticated;
grant all on public.student_login_attempts to service_role;
