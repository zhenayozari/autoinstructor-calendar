create table public.instructor_settings (
  instructor_id uuid primary key
    references public.instructors(id)
    on delete cascade,
  booking_access_code_hash text,
  booking_access_code_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_settings_hash_not_blank check (
    booking_access_code_hash is null
    or length(trim(booking_access_code_hash)) > 0
  )
);

create or replace function public.set_instructor_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_instructor_settings_updated_at_trigger
before update
on public.instructor_settings
for each row
execute function public.set_instructor_settings_updated_at();

alter table public.instructor_settings enable row level security;

revoke all on public.instructor_settings from anon, authenticated;
