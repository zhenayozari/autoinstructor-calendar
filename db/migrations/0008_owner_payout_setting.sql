alter table public.organizations
  add column if not exists include_owner_in_payouts boolean not null default false;
