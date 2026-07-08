alter table public.bookings
  add column paid_amount integer not null default 0;

alter table public.bookings
  add column payment_note text;

update public.bookings
set paid_amount = coalesce(price_amount, 0)
where is_paid = true;

alter table public.bookings
  add constraint bookings_paid_amount_check
  check (paid_amount between 0 and 10000000);

alter table public.bookings
  add constraint bookings_payment_note_length_check
  check (payment_note is null or length(payment_note) <= 500);

alter table public.bookings
  add constraint bookings_full_payment_amount_check
  check (
    is_paid = false
    or paid_amount >= coalesce(price_amount, 0)
  );
