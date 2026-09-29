alter table public.instructor_payout_settings
  add column if not exists private_extra_full_payout_enabled boolean not null default false;
