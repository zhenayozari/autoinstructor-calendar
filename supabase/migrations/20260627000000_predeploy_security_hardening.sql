drop policy if exists "Authenticated users manage instructors"
on public.instructors;

drop policy if exists "Authenticated users manage lesson types"
on public.lesson_types;

drop policy if exists "Authenticated users manage schedule days"
on public.schedule_days;

drop policy if exists "Authenticated users manage slots"
on public.slots;

drop policy if exists "Authenticated users manage bookings"
on public.bookings;

drop policy if exists "Published schedule days are publicly readable"
on public.schedule_days;

drop policy if exists "Published slots are publicly readable"
on public.slots;

drop policy if exists "Anyone can book a published available slot"
on public.bookings;

revoke all on public.instructors from anon, authenticated;
revoke all on public.lesson_types from anon, authenticated;
revoke all on public.schedule_days from anon, authenticated;
revoke all on public.slots from anon, authenticated;
revoke all on public.bookings from anon, authenticated;

grant select (
  id,
  slug,
  public_name,
  photo_url,
  short_bio,
  contact_text,
  car_description,
  experience_text,
  is_active,
  public_is_visible
)
on public.instructors
to anon, authenticated;

create or replace view public.public_schedule_slots
with (security_barrier = true)
as
select
  slots.id,
  slots.instructor_id,
  coalesce(instructors.public_name, 'Инструктор') as instructor_name,
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
  and schedule_days.instructor_id = slots.instructor_id
join public.instructors
  on instructors.id = slots.instructor_id
join public.lesson_types
  on lesson_types.id = slots.lesson_type_id
where schedule_days.published_at is not null
  and schedule_days.published_at <= now()
  and slots.status <> 'cancelled'
  and instructors.is_active
  and instructors.public_is_visible
  and lesson_types.is_active;

revoke all on public.public_schedule_slots from anon, authenticated;
grant select on public.public_schedule_slots to anon, authenticated;
