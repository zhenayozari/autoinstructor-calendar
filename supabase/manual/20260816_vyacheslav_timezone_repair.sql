-- Moscow timezone repair for Vyacheslav / "Основной инструктор".
--
-- First run this file AS IS. It ends with ROLLBACK, so it previews the result
-- without changing production data.
--
-- After checking the output, replace the final ROLLBACK with COMMIT and run once.

begin;

do $$
declare
  instructor_count integer;
  current_timezone text;
begin
  select count(*)
    into instructor_count
  from public.instructors
  where name = 'Основной инструктор';

  if instructor_count <> 1 then
    raise exception 'Expected exactly one instructor named %, found %',
      'Основной инструктор',
      instructor_count;
  end if;

  select timezone
    into current_timezone
  from public.instructors
  where name = 'Основной инструктор';

  if current_timezone <> 'Asia/Irkutsk' then
    raise exception 'Expected current timezone Asia/Irkutsk, found %',
      current_timezone;
  end if;
end $$;

-- Lock the instructor row for this transaction.
select
  id,
  name,
  timezone
from public.instructors
where name = 'Основной инструктор'
for update;

-- Preview before update.
with target_instructor as (
  select id, timezone
  from public.instructors
  where name = 'Основной инструктор'
)
select
  'before' as phase,
  count(*) filter (where s.status <> 'cancelled') as active_slots,
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

-- Persistent backups are created only if the transaction is committed.
-- If this file is run as-is, ROLLBACK removes these backup tables too.
create table public.timezone_repair_20260816_instructors_backup as
select *
from public.instructors
where name = 'Основной инструктор';

create table public.timezone_repair_20260816_slots_backup as
select s.*
from public.slots s
join public.instructors i on i.id = s.instructor_id
where i.name = 'Основной инструктор';

create table public.timezone_repair_20260816_bookings_backup as
select b.*
from public.bookings b
join public.slots s on s.id = b.slot_id
join public.instructors i on i.id = s.instructor_id
where i.name = 'Основной инструктор';

-- Keep visible clock labels the same while changing the working timezone.
-- Example: 08:00 displayed in Asia/Irkutsk becomes 08:00 displayed in Europe/Moscow.
--
-- The temporary +100 years move avoids transient conflicts with
-- slots_no_active_overlap while active slots are shifted.
with target_instructor as (
  select id
  from public.instructors
  where name = 'Основной инструктор'
)
update public.slots s
set
  start_time = s.start_time + interval '100 years',
  end_time = s.end_time + interval '100 years'
from target_instructor ti
where s.instructor_id = ti.id;

with target_instructor as (
  select id, timezone as old_timezone
  from public.timezone_repair_20260816_instructors_backup
  where name = 'Основной инструктор'
),
updated_slots as (
  update public.slots s
  set
    start_time = (old_s.start_time at time zone ti.old_timezone) at time zone 'Europe/Moscow',
    end_time = (old_s.end_time at time zone ti.old_timezone) at time zone 'Europe/Moscow'
  from target_instructor ti
  join public.timezone_repair_20260816_slots_backup old_s
    on old_s.instructor_id = ti.id
  where s.id = old_s.id
  returning
    s.id,
    s.end_time as new_end_time
)
update public.bookings b
set completed_at = us.new_end_time
from updated_slots us
join public.timezone_repair_20260816_slots_backup old_s on old_s.id = us.id
where b.slot_id = us.id
  and b.completed_at is not null
  and b.completed_at = old_s.end_time;

update public.instructors
set timezone = 'Europe/Moscow'
where name = 'Основной инструктор';

-- Preview after update, still inside the transaction.
with target_instructor as (
  select id, timezone
  from public.instructors
  where name = 'Основной инструктор'
)
select
  'after' as phase,
  ti.timezone as instructor_timezone,
  count(*) filter (where s.status <> 'cancelled') as active_slots,
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
left join public.bookings b on b.slot_id = s.id
group by ti.timezone;

-- Spot-check the visible labels after repair.
select
  s.id as slot_id,
  b.id as booking_id,
  b.status as booking_status,
  b.lesson_state,
  s.status as slot_status,
  sd.date as schedule_date,
  backup_s.start_time as old_start_utc,
  backup_s.end_time as old_end_utc,
  backup_s.start_time at time zone 'Asia/Irkutsk' as old_visible_irkt,
  backup_s.end_time at time zone 'Asia/Irkutsk' as old_visible_irkt_end,
  s.start_time as new_start_utc,
  s.end_time as new_end_utc,
  s.start_time at time zone 'Europe/Moscow' as new_visible_moscow,
  s.end_time at time zone 'Europe/Moscow' as new_visible_moscow_end,
  (backup_s.start_time at time zone 'Asia/Irkutsk')
    = (s.start_time at time zone 'Europe/Moscow') as start_label_preserved,
  (backup_s.end_time at time zone 'Asia/Irkutsk')
    = (s.end_time at time zone 'Europe/Moscow') as end_label_preserved,
  (s.end_time < now()) as auto_complete_after_repair
from public.slots s
join public.timezone_repair_20260816_slots_backup backup_s on backup_s.id = s.id
join public.schedule_days sd on sd.id = s.schedule_day_id
left join public.bookings b on b.slot_id = s.id and b.status = 'confirmed'
join public.instructors i on i.id = s.instructor_id
where i.name = 'Основной инструктор'
  and s.status <> 'cancelled'
order by s.start_time desc
limit 80;

-- Safety check: every shifted slot must preserve the visible local labels.
do $$
declare
  broken_count integer;
begin
  select count(*)
    into broken_count
  from public.slots s
  join public.timezone_repair_20260816_slots_backup backup_s on backup_s.id = s.id
  join public.instructors i on i.id = s.instructor_id
  where i.name = 'Основной инструктор'
    and (
      (backup_s.start_time at time zone 'Asia/Irkutsk')
        <> (s.start_time at time zone 'Europe/Moscow')
      or
      (backup_s.end_time at time zone 'Asia/Irkutsk')
        <> (s.end_time at time zone 'Europe/Moscow')
    );

  if broken_count <> 0 then
    raise exception 'Timezone repair did not preserve % slot labels', broken_count;
  end if;
end $$;

-- IMPORTANT:
-- First run leaves data unchanged. Replace ROLLBACK with COMMIT only after
-- the preview output is checked.
rollback;
