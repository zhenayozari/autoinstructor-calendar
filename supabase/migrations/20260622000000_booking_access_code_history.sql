alter table public.instructor_settings
add column booking_access_code text;

alter table public.instructor_settings
add constraint instructor_settings_access_code_not_blank check (
  booking_access_code is null
  or length(trim(booking_access_code)) > 0
);

create table public.booking_access_code_history (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  access_code text not null,
  created_at timestamptz not null default now(),
  constraint booking_access_code_history_code_not_blank check (
    length(trim(access_code)) > 0
  )
);

create index booking_access_code_history_instructor_created_idx
  on public.booking_access_code_history(instructor_id, created_at desc);

alter table public.booking_access_code_history enable row level security;

revoke all on public.booking_access_code_history from anon, authenticated;

create or replace function public.set_booking_access_code(
  target_instructor_id uuid,
  new_access_code text,
  new_access_code_hash text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  changed_at timestamptz := now();
begin
  if length(trim(new_access_code)) = 0 then
    raise exception 'Access code must not be blank';
  end if;

  insert into public.instructor_settings (
    instructor_id,
    booking_access_code,
    booking_access_code_hash,
    booking_access_code_updated_at
  )
  values (
    target_instructor_id,
    new_access_code,
    new_access_code_hash,
    changed_at
  )
  on conflict (instructor_id) do update
  set
    booking_access_code = excluded.booking_access_code,
    booking_access_code_hash = excluded.booking_access_code_hash,
    booking_access_code_updated_at = excluded.booking_access_code_updated_at;

  insert into public.booking_access_code_history (
    instructor_id,
    access_code,
    created_at
  )
  values (
    target_instructor_id,
    new_access_code,
    changed_at
  );
end;
$$;

revoke all on function public.set_booking_access_code(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.set_booking_access_code(uuid, text, text)
to service_role;
