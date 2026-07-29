alter table public.bookings
  add column if not exists booking_category text not null default 'regular';

alter table public.bookings
  drop constraint if exists bookings_booking_category_check;

alter table public.bookings
  add constraint bookings_booking_category_check
  check (booking_category in ('regular', 'extra', 'gift'));

create index if not exists bookings_booking_category_idx
  on public.bookings (booking_category);

comment on column public.bookings.booking_category is
  'Analytics category of a concrete booking: regular, extra, or gift. Physical lesson format stays in slots.lesson_type_id.';

with categorized_bookings as (
  select
    bookings.id,
    case
      when
        coalesce(lesson_types.tags, array[]::text[]) && array['gift', 'present']
        or lower(coalesce(lesson_types.code, '')) like '%gift%'
        or lower(lesson_types.name) like '%подар%'
      then 'gift'
      when
        coalesce(lesson_types.tags, array[]::text[]) && array['extra']
        or lower(coalesce(lesson_types.code, '')) like '%extra%'
        or lower(lesson_types.name) like '%доп%'
      then 'extra'
      else 'regular'
    end as booking_category
  from public.bookings
  join public.slots on slots.id = bookings.slot_id
  join public.lesson_types on lesson_types.id = slots.lesson_type_id
)
update public.bookings
set booking_category = categorized_bookings.booking_category
from categorized_bookings
where public.bookings.id = categorized_bookings.id;

with primary_driving_type as (
  select id
  from public.lesson_types
  where
    kind = 'driving'
    and not (
      coalesce(tags, array[]::text[]) && array['gift', 'present', 'extra']
      or lower(coalesce(code, '')) like '%gift%'
      or lower(coalesce(code, '')) like '%extra%'
      or lower(name) like '%подар%'
      or lower(name) like '%доп%'
    )
  order by is_active desc, sort_order nulls last, name
  limit 1
),
analytic_driving_types as (
  select id
  from public.lesson_types
  where
    kind = 'driving'
    and (
      coalesce(tags, array[]::text[]) && array['gift', 'present', 'extra']
      or lower(coalesce(code, '')) like '%gift%'
      or lower(coalesce(code, '')) like '%extra%'
      or lower(name) like '%подар%'
      or lower(name) like '%доп%'
    )
),
accesses_to_extend as (
  select distinct student_access_id
  from public.student_access_lesson_types
  where lesson_type_id in (select id from analytic_driving_types)
)
insert into public.student_access_lesson_types (student_access_id, lesson_type_id)
select accesses_to_extend.student_access_id, primary_driving_type.id
from accesses_to_extend
cross join primary_driving_type
on conflict do nothing;

with primary_driving_type as (
  select id
  from public.lesson_types
  where
    kind = 'driving'
    and not (
      coalesce(tags, array[]::text[]) && array['gift', 'present', 'extra']
      or lower(coalesce(code, '')) like '%gift%'
      or lower(coalesce(code, '')) like '%extra%'
      or lower(name) like '%подар%'
      or lower(name) like '%доп%'
    )
  order by is_active desc, sort_order nulls last, name
  limit 1
),
analytic_driving_types as (
  select id
  from public.lesson_types
  where
    kind = 'driving'
    and (
      coalesce(tags, array[]::text[]) && array['gift', 'present', 'extra']
      or lower(coalesce(code, '')) like '%gift%'
      or lower(coalesce(code, '')) like '%extra%'
      or lower(name) like '%подар%'
      or lower(name) like '%доп%'
    )
)
update public.slots
set lesson_type_id = primary_driving_type.id
from primary_driving_type
where public.slots.lesson_type_id in (select id from analytic_driving_types);

update public.lesson_types
set is_active = false
where
  kind = 'driving'
  and (
    coalesce(tags, array[]::text[]) && array['gift', 'present', 'extra']
    or lower(coalesce(code, '')) like '%gift%'
    or lower(coalesce(code, '')) like '%extra%'
    or lower(name) like '%подар%'
    or lower(name) like '%доп%'
  );
