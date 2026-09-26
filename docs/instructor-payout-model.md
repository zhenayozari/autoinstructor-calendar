# Instructor payout model

This model separates client payments from instructor payouts.

Client payment fields stay on `public.bookings`:

- `price_amount` is how much the student/source owes.
- `paid_amount`, `is_paid`, and `paid_at` are how much the school has received from the student/source.

Instructor payout fields live in dedicated tables:

- `instructor_payout_settings` stores one payout setup per instructor.
- `instructor_source_visibility` stores which sources are visible/available for each instructor.
- `instructor_payout_rate_rules` stores instructor payout rates.
- `instructor_payout_entries` stores planned payout entries and corrections.
- `instructor_payout_payments` stores money actually handed to the instructor.
- `instructor_payout_payment_allocations` links payments to planned entries.

## Roles

`owner` is the director/manager. The owner manages payout settings, rates, source visibility, limits, and marks instructor payouts as paid.

`instructor` is a staff instructor. The instructor sees only their own operational data and payout totals.

## Payout statuses

For the instructor:

- Planned means the system expects this amount to be paid to the instructor.
- Paid means the director has actually handed over money and recorded the payment.
- Remaining means planned minus paid.

The instructor payout summary must not use `bookings.paid_amount`; that field belongs to client payments.

## Accrual policy

`instructor_payout_settings.accrual_policy` controls when a payout entry is created.

- `prepaid`: create the payout entry when a booking becomes eligible immediately, before the lesson is completed.
- `postpaid`: create the payout entry only when the lesson is automatically completed.

Lesson completion itself remains automatic: when the slot end time passes, a scheduled booking becomes completed. The payout model should react to that event; the director or instructor should not have to manually mark every lesson as conducted.

## Corrections

If a booking is cancelled or marked as no-show:

- If the payout entry has not been paid yet, it can be cancelled.
- If money was already paid to the instructor, create a negative adjustment entry instead of rewriting history.

Manual corrections use `entry_type = 'manual_adjustment'`.

## Rates

`instructor_payout_rate_rules` stores rates separately from client prices.

A rule can be:

- general for an instructor;
- limited to a source (`school_id`);
- limited to a lesson type (`lesson_type_id`);
- limited to a booking category (`regular`, `extra`, `gift`);
- limited by dates.

When a payout entry is created, it stores the selected `rate_rule_id` and the final `amount`. Later changes to rates must not silently rewrite historical entries.

## Limits

Student lesson limits remain on student access/package tables.

Instructor workload limits live in `instructor_payout_settings.weekly_lesson_limit`. `null` means no limit.
