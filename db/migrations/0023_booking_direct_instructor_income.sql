alter table public.bookings
  add column if not exists direct_instructor_income_amount integer,
  add column if not exists direct_instructor_income_policy text,
  add column if not exists direct_instructor_income_recognized_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_direct_instructor_income_amount_check;

alter table public.bookings
  add constraint bookings_direct_instructor_income_amount_check check (
    direct_instructor_income_amount is null
    or direct_instructor_income_amount between 0 and 10000000
  );

alter table public.bookings
  drop constraint if exists bookings_direct_instructor_income_policy_check;

alter table public.bookings
  add constraint bookings_direct_instructor_income_policy_check check (
    direct_instructor_income_policy is null
    or direct_instructor_income_policy in ('prepaid', 'postpaid')
  );

alter table public.bookings
  drop constraint if exists bookings_direct_instructor_income_fields_check;

alter table public.bookings
  add constraint bookings_direct_instructor_income_fields_check check (
    (
      direct_instructor_income_amount is null
      and direct_instructor_income_policy is null
      and direct_instructor_income_recognized_at is null
    )
    or (
      direct_instructor_income_amount is not null
      and direct_instructor_income_policy is not null
    )
  );

create index if not exists bookings_direct_instructor_income_idx
  on public.bookings(direct_instructor_income_recognized_at)
  where direct_instructor_income_amount is not null;
