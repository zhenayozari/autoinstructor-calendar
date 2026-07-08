-- =============================================================
-- Schools table
-- Replaces the "автошкола" role that was previously
-- mixed into lesson_types (color, price).
-- =============================================================

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  default_price integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_name_not_blank check (length(trim(name)) > 0),
  constraint schools_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint schools_default_price_check check (
    default_price is null
    or default_price between 0 and 10000000
  )
);

create index schools_organization_active_idx
  on public.schools(organization_id, is_active, name);

create or replace function public.set_schools_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_schools_updated_at_trigger
before update
on public.schools
for each row
execute function public.set_schools_updated_at();

-- =============================================================
-- slots.school_id
-- Nullable so existing slots stay valid.
-- =============================================================

alter table public.slots
  add column school_id uuid
    references public.schools(id)
    on delete set null;

create index slots_school_id_idx
  on public.slots(school_id);

-- =============================================================
-- bookings: payment tracking
-- =============================================================

alter table public.bookings
  add column is_paid boolean not null default false;

alter table public.bookings
  add column paid_at timestamptz;

alter table public.bookings
  add constraint bookings_payment_consistency check (
    (is_paid = false and paid_at is null)
    or (is_paid = true and paid_at is not null)
  );

-- =============================================================
-- student_accesses: school link + archive
-- =============================================================

alter table public.student_accesses
  add column school_id uuid
    references public.schools(id)
    on delete set null;

alter table public.student_accesses
  add column is_archived boolean not null default false;

alter table public.student_accesses
  add column archived_at timestamptz;

alter table public.student_accesses
  add constraint student_accesses_archive_consistency check (
    (is_archived = false and archived_at is null)
    or (is_archived = true and archived_at is not null)
  );

create index student_accesses_school_id_idx
  on public.student_accesses(school_id);

-- =============================================================
-- RLS for schools
-- Same pattern as other tables: anon reads active,
-- authenticated manages all.
-- =============================================================

alter table public.schools enable row level security;

revoke all on public.schools from anon, authenticated;

grant select on public.schools to anon;
grant all on public.schools to authenticated;

create policy "Active schools are publicly readable"
  on public.schools
  for select
  to anon, authenticated
  using (is_active);

create policy "Authenticated users manage schools"
  on public.schools
  for all
  to authenticated
  using (true)
  with check (true);