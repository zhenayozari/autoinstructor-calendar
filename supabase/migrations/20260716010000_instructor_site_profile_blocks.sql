alter table public.instructor_site_settings
  add column if not exists show_car boolean not null default true,
  add column if not exists show_experience boolean not null default true;
