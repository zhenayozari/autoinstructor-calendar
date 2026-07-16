alter table public.organization_site_settings
  add column if not exists landing_content jsonb not null default '{}'::jsonb;
