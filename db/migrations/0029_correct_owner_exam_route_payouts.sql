-- Old exam routes were mistakenly stored as instructor payouts.
-- A route already has lesson_units = 2, so the lesson limit is recalculated
-- from the booking itself. This migration only moves the financial amount back
-- to the booking and removes payouts that have never been issued.

with eligible_entries as (
  select entries.id, entries.booking_id, entries.amount
  from public.instructor_payout_entries entries
  join public.bookings bookings on bookings.id = entries.booking_id
  left join public.instructor_payout_payment_allocations allocations
    on allocations.payout_entry_id = entries.id
  where entries.entry_type = 'booking_accrual'
    and entries.status = 'planned'
    and entries.note = 'Экзаменационный маршрут: начисление за 2 занятия'
    and bookings.lesson_units = 2
  group by entries.id, entries.booking_id, entries.amount
  having coalesce(sum(allocations.amount), 0) = 0
), updated_bookings as (
  update public.bookings bookings
  set price_amount = eligible_entries.amount,
      is_paid = coalesce(bookings.paid_amount, 0) >= eligible_entries.amount,
      paid_at = case
        when coalesce(bookings.paid_amount, 0) >= eligible_entries.amount
          then coalesce(bookings.paid_at, now())
        else null
      end
  from eligible_entries
  where bookings.id = eligible_entries.booking_id
  returning eligible_entries.id as payout_entry_id
)
delete from public.instructor_payout_entries entries
using updated_bookings
where entries.id = updated_bookings.payout_entry_id;
