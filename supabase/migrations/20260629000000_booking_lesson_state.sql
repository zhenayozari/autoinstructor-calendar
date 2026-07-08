-- Track whether a confirmed booking was actually held.

alter table public.bookings
  add column lesson_state text not null default 'scheduled';

alter table public.bookings
  add column completed_at timestamptz;

alter table public.bookings
  add column instructor_note text;

alter table public.bookings
  add constraint bookings_lesson_state_check check (
    lesson_state in ('scheduled', 'completed', 'no_show')
  );

alter table public.bookings
  add constraint bookings_lesson_state_completed_at_check check (
    (lesson_state = 'completed' and completed_at is not null)
    or (lesson_state <> 'completed' and completed_at is null)
  );

alter table public.bookings
  add constraint bookings_instructor_note_length check (
    instructor_note is null
    or length(trim(instructor_note)) <= 1000
  );

create index bookings_lesson_state_idx
  on public.bookings(lesson_state);

create index bookings_completed_at_idx
  on public.bookings(completed_at)
  where completed_at is not null;
