create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint instructors_name_not_blank check (length(trim(name)) > 0),
  constraint instructors_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint instructors_timezone_not_blank check (length(trim(timezone)) > 0)
);

create table public.lesson_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  color text not null,
  kind text not null,
  requires_vehicle boolean not null,
  default_duration_minutes integer not null,
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lesson_types_code_format check (code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint lesson_types_name_not_blank check (length(trim(name)) > 0),
  constraint lesson_types_description_length check (
    description is null or length(description) <= 1000
  ),
  constraint lesson_types_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint lesson_types_kind_check check (kind in ('driving', 'theory')),
  constraint lesson_types_vehicle_consistency check (
    (kind = 'driving' and requires_vehicle)
    or (kind = 'theory' and not requires_vehicle)
  ),
  constraint lesson_types_duration_check check (
    default_duration_minutes between 15 and 480
  ),
  constraint lesson_types_tags_not_blank check (
    array_position(tags, '') is null
  )
);

create index lesson_types_active_sort_idx
  on public.lesson_types(is_active, sort_order, name);

create table public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  date date not null,
  transmission text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint schedule_days_transmission_check check (
    transmission in ('automatic', 'manual') or transmission is null
  ),
  constraint schedule_days_instructor_date_unique unique (instructor_id, date),
  constraint schedule_days_id_instructor_unique unique (id, instructor_id)
);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  schedule_day_id uuid not null,
  lesson_type_id uuid not null references public.lesson_types(id) on delete restrict,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location_type text not null,
  status text not null default 'available',
  note text,
  created_at timestamptz not null default now(),
  constraint slots_schedule_day_instructor_fk
    foreign key (schedule_day_id, instructor_id)
    references public.schedule_days(id, instructor_id)
    on delete cascade,
  constraint slots_valid_time_range check (start_time < end_time),
  constraint slots_location_type_check check (
    location_type in ('in_car', 'online', 'classroom', 'other')
  ),
  constraint slots_status_check check (
    status in ('available', 'blocked', 'cancelled')
  ),
  constraint slots_note_length check (
    note is null or length(note) <= 500
  ),
  constraint slots_no_active_overlap exclude using gist (
    instructor_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status in ('available', 'blocked'))
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots(id) on delete cascade,
  student_label text not null,
  status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint bookings_student_label_length check (
    length(trim(student_label)) between 1 and 80
  ),
  constraint bookings_status_check check (
    status in ('confirmed', 'cancelled')
  ),
  constraint bookings_cancellation_consistency check (
    (status = 'confirmed' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  )
);

create unique index bookings_one_confirmed_per_slot_idx
  on public.bookings(slot_id)
  where status = 'confirmed';

create index schedule_days_instructor_date_idx
  on public.schedule_days(instructor_id, date);

create index slots_schedule_day_id_idx
  on public.slots(schedule_day_id);

create index slots_lesson_type_id_idx
  on public.slots(lesson_type_id);

create index slots_instructor_start_time_idx
  on public.slots(instructor_id, start_time);

create index bookings_slot_id_idx
  on public.bookings(slot_id);

create or replace function public.validate_slot_lesson_requirements()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  day_transmission text;
  lesson_kind text;
begin
  select schedule_days.transmission
    into day_transmission
  from public.schedule_days
  where schedule_days.id = new.schedule_day_id
    and schedule_days.instructor_id = new.instructor_id;

  select lesson_types.kind
    into lesson_kind
  from public.lesson_types
  where lesson_types.id = new.lesson_type_id;

  if lesson_kind = 'driving' and day_transmission is null then
    raise exception 'Driving slots require transmission on the schedule day';
  end if;

  return new;
end;
$$;

create trigger validate_slot_lesson_requirements_trigger
before insert or update of instructor_id, schedule_day_id, lesson_type_id, status
on public.slots
for each row
execute function public.validate_slot_lesson_requirements();

create or replace function public.prevent_removing_required_transmission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.transmission is null and old.transmission is not null and exists (
    select 1
    from public.slots
    join public.lesson_types
      on lesson_types.id = slots.lesson_type_id
    where slots.schedule_day_id = new.id
      and slots.status <> 'cancelled'
      and lesson_types.kind = 'driving'
  ) then
    raise exception 'Cannot remove transmission from a day with driving slots';
  end if;

  return new;
end;
$$;

create trigger prevent_removing_required_transmission_trigger
before update of transmission
on public.schedule_days
for each row
execute function public.prevent_removing_required_transmission();

alter table public.instructors enable row level security;
alter table public.lesson_types enable row level security;
alter table public.schedule_days enable row level security;
alter table public.slots enable row level security;
alter table public.bookings enable row level security;

create policy "Active instructors are publicly readable"
  on public.instructors
  for select
  to anon, authenticated
  using (is_active);

create policy "Authenticated users manage instructors"
  on public.instructors
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Active lesson types are publicly readable"
  on public.lesson_types
  for select
  to anon, authenticated
  using (is_active);

create policy "Authenticated users manage lesson types"
  on public.lesson_types
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Published schedule days are publicly readable"
  on public.schedule_days
  for select
  to anon, authenticated
  using (
    published_at is not null
    and published_at <= now()
    and exists (
      select 1
      from public.instructors
      where instructors.id = schedule_days.instructor_id
        and instructors.is_active
    )
  );

create policy "Authenticated users manage schedule days"
  on public.schedule_days
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Published slots are publicly readable"
  on public.slots
  for select
  to anon, authenticated
  using (
    status <> 'cancelled'
    and exists (
      select 1
      from public.schedule_days
      where schedule_days.id = slots.schedule_day_id
        and schedule_days.published_at is not null
        and schedule_days.published_at <= now()
    )
  );

create policy "Authenticated users manage slots"
  on public.slots
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Anyone can book a published available slot"
  on public.bookings
  for insert
  to anon, authenticated
  with check (
    status = 'confirmed'
    and cancelled_at is null
    and exists (
      select 1
      from public.slots
      join public.schedule_days
        on schedule_days.id = slots.schedule_day_id
      join public.instructors
        on instructors.id = slots.instructor_id
      where slots.id = bookings.slot_id
        and slots.status = 'available'
        and schedule_days.published_at is not null
        and schedule_days.published_at <= now()
        and instructors.is_active
    )
  );

create policy "Authenticated users manage bookings"
  on public.bookings
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on public.instructors from anon, authenticated;
revoke all on public.lesson_types from anon, authenticated;
revoke all on public.schedule_days from anon, authenticated;
revoke all on public.slots from anon, authenticated;
revoke all on public.bookings from anon, authenticated;

grant select on public.instructors to anon;
grant select on public.lesson_types to anon;
grant select on public.schedule_days to anon;
grant select on public.slots to anon;
grant insert (slot_id, student_label) on public.bookings to anon;

grant all on public.instructors to authenticated;
grant all on public.lesson_types to authenticated;
grant all on public.schedule_days to authenticated;
grant all on public.slots to authenticated;
grant all on public.bookings to authenticated;

create view public.public_schedule_slots
with (security_barrier = true)
as
select
  slots.id,
  slots.instructor_id,
  instructors.name as instructor_name,
  instructors.slug as instructor_slug,
  instructors.timezone,
  schedule_days.date,
  schedule_days.transmission,
  slots.lesson_type_id,
  lesson_types.code as lesson_type_code,
  lesson_types.name as lesson_type_name,
  lesson_types.description as lesson_type_description,
  lesson_types.color as lesson_type_color,
  lesson_types.kind as lesson_kind,
  lesson_types.tags as lesson_type_tags,
  lesson_types.sort_order as lesson_type_sort_order,
  slots.start_time,
  slots.end_time,
  slots.location_type,
  slots.status,
  exists (
    select 1
    from public.bookings
    where bookings.slot_id = slots.id
      and bookings.status = 'confirmed'
  ) as is_booked
from public.slots
join public.schedule_days
  on schedule_days.id = slots.schedule_day_id
join public.instructors
  on instructors.id = slots.instructor_id
join public.lesson_types
  on lesson_types.id = slots.lesson_type_id
where schedule_days.published_at is not null
  and schedule_days.published_at <= now()
  and slots.status <> 'cancelled'
  and instructors.is_active
  and lesson_types.is_active;

revoke all on public.public_schedule_slots from anon, authenticated;
grant select on public.public_schedule_slots to anon, authenticated;
