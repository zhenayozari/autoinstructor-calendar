-- Read-only diagnostics for the Moscow timezone repair.
-- Safe to run in Supabase SQL Editor: it does not change data.

-- 1) Confirm the target instructor.
select
  id,
  name,
  public_name,
  timezone,
  is_active
from public.instructors
where name = 'Основной инструктор'
order by created_at;

-- 2) Count the data that would be affected.
with target_instructor as (
  select id
  from public.instructors
  where name = 'Основной инструктор'
)
select
  count(*) filter (where s.status <> 'cancelled') as active_slots,
  count(*) filter (where s.status = 'cancelled') as cancelled_slots,
  count(b.id) filter (where b.status = 'confirmed') as confirmed_bookings,
  count(b.id) filter (
    where b.status = 'confirmed'
      and b.lesson_state = 'scheduled'
      and s.end_time < now()
  ) as scheduled_bookings_already_past_by_utc,
  min(s.start_time) as earliest_slot_utc,
  max(s.end_time) as latest_slot_utc
from public.slots s
join target_instructor ti on ti.id = s.instructor_id
left join public.bookings b on b.slot_id = s.id;

-- 3) Preview current display, broken simple timezone switch, and safe repair.
-- current_saved_timezone: what users see now.
-- simple_moscow_without_shift: what users would see if only instructor.timezone changed.
-- safe_moscow_after_shift: what users should see after timezone + slot UTC repair.
with target_instructor as (
  select id, timezone
  from public.instructors
  where name = 'Основной инструктор'
)
select
  s.id as slot_id,
  b.id as booking_id,
  b.status as booking_status,
  b.lesson_state,
  s.status as slot_status,
  sd.date as schedule_date,
  s.start_time as current_start_utc,
  s.end_time as current_end_utc,
  s.start_time at time zone ti.timezone as current_start_saved_timezone,
  s.end_time at time zone ti.timezone as current_end_saved_timezone,
  s.start_time at time zone 'Europe/Moscow' as simple_start_moscow_without_shift,
  s.end_time at time zone 'Europe/Moscow' as simple_end_moscow_without_shift,
  ((s.start_time at time zone ti.timezone) at time zone 'Europe/Moscow') as repaired_start_utc,
  ((s.end_time at time zone ti.timezone) at time zone 'Europe/Moscow') as repaired_end_utc,
  (((s.start_time at time zone ti.timezone) at time zone 'Europe/Moscow') at time zone 'Europe/Moscow') as safe_start_moscow_after_shift,
  (((s.end_time at time zone ti.timezone) at time zone 'Europe/Moscow') at time zone 'Europe/Moscow') as safe_end_moscow_after_shift,
  (s.end_time < now()) as auto_complete_now,
  (((s.end_time at time zone ti.timezone) at time zone 'Europe/Moscow') < now()) as auto_complete_after_repair
from public.slots s
join target_instructor ti on ti.id = s.instructor_id
join public.schedule_days sd on sd.id = s.schedule_day_id
left join public.bookings b on b.slot_id = s.id and b.status = 'confirmed'
where s.status <> 'cancelled'
order by s.start_time desc
limit 80;
