alter table public.bookings
  add column if not exists lesson_units integer not null default 1;

alter table public.bookings
  drop constraint if exists bookings_lesson_units_check;

alter table public.bookings
  add constraint bookings_lesson_units_check
  check (lesson_units between 1 and 10);
