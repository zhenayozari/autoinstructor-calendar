create table if not exists public.auth_login_rate_limits (
  scope text not null,
  key_hash text not null,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  blocked_until timestamptz,
  primary key (scope, key_hash),
  constraint auth_login_rate_limits_scope_check check (
    scope in ('account', 'account_ip', 'ip')
  ),
  constraint auth_login_rate_limits_key_hash_check check (
    key_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint auth_login_rate_limits_failed_count_check check (failed_count >= 0)
);

create index if not exists auth_login_rate_limits_blocked_until_idx
  on public.auth_login_rate_limits(blocked_until);
