alter table public.lesson_types
  add column default_price_amount integer;

alter table public.lesson_types
  add constraint lesson_types_default_price_amount_check
  check (
    default_price_amount is null
    or default_price_amount between 0 and 10000000
  );

alter table public.bookings
  add column price_amount integer;

alter table public.bookings
  add constraint bookings_price_amount_check
  check (
    price_amount is null
    or price_amount between 0 and 10000000
  );
