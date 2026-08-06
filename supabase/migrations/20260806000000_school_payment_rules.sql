alter table public.schools
  add column if not exists payment_rule text not null default 'manual';

alter table public.schools
  drop constraint if exists schools_payment_rule_check;

alter table public.schools
  add constraint schools_payment_rule_check
  check (payment_rule in ('manual', 'prepaid', 'settle_later'));
