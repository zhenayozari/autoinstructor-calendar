alter table public.instructor_payout_rate_rules
  add column if not exists disabled_at timestamptz;

update public.instructor_payout_rate_rules
set disabled_at = updated_at
where is_active = false
  and disabled_at is null;
