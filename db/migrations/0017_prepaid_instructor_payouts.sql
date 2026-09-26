alter table public.instructor_payout_entries
  add column if not exists student_prepaid_credit_id uuid
    references public.student_prepaid_credits(id)
    on delete set null;

alter table public.instructor_payout_entries
  drop constraint if exists instructor_payout_entries_entry_type_check;

alter table public.instructor_payout_entries
  add constraint instructor_payout_entries_entry_type_check check (
    entry_type in (
      'booking_accrual',
      'prepaid_credit_accrual',
      'manual_adjustment',
      'cancellation_adjustment',
      'no_show_adjustment'
    )
  );

alter table public.instructor_payout_entries
  drop constraint if exists instructor_payout_entries_prepaid_credit_required_check;

alter table public.instructor_payout_entries
  add constraint instructor_payout_entries_prepaid_credit_required_check check (
    entry_type <> 'prepaid_credit_accrual'
    or student_prepaid_credit_id is not null
  );

create unique index if not exists instructor_payout_entries_one_prepaid_credit_idx
  on public.instructor_payout_entries(student_prepaid_credit_id)
  where entry_type = 'prepaid_credit_accrual'
    and student_prepaid_credit_id is not null;

insert into public.instructor_payout_entries (
  organization_id,
  instructor_id,
  student_prepaid_credit_id,
  school_id,
  lesson_type_id,
  student_access_id,
  rate_rule_id,
  entry_type,
  accrual_policy,
  status,
  amount,
  planned_at,
  event_at,
  note
)
select credits.organization_id,
       credits.instructor_id,
       credits.id,
       credits.school_id,
       credits.lesson_type_id,
       credits.student_access_id,
       rules.id,
       'prepaid_credit_accrual',
       'prepaid',
       'planned',
       rules.amount * credits.quantity,
       credits.paid_at,
       credits.paid_at,
       'Предоплата инструктора за оплаченный лимит занятий'
from public.student_prepaid_credits credits
join lateral (
  select rate_rules.id, rate_rules.amount
  from public.instructor_payout_rate_rules rate_rules
  where rate_rules.organization_id = credits.organization_id
    and rate_rules.instructor_id = credits.instructor_id
    and rate_rules.is_active = true
    and (rate_rules.school_id is null or rate_rules.school_id = credits.school_id)
    and (rate_rules.lesson_type_id is null or rate_rules.lesson_type_id = credits.lesson_type_id)
    and (rate_rules.booking_category is null or rate_rules.booking_category = 'regular')
    and rate_rules.effective_from <= credits.paid_at::date
    and (rate_rules.effective_to is null or rate_rules.effective_to >= credits.paid_at::date)
  order by
    case when rate_rules.school_id is null then 0 else 1 end desc,
    case when rate_rules.lesson_type_id is null then 0 else 1 end desc,
    case when rate_rules.booking_category is null then 0 else 1 end desc,
    rate_rules.effective_from desc,
    rate_rules.created_at desc
  limit 1
) rules on true
where credits.status = 'active'
 and rules.amount > 0
 and rules.amount * credits.quantity <= 10000000
 and not exists (
   select 1
   from public.instructor_payout_entries existing
   where existing.student_prepaid_credit_id = credits.id
     and existing.entry_type = 'prepaid_credit_accrual'
 );

drop view if exists public.instructor_payout_entry_balances;

create view public.instructor_payout_entry_balances as
select
  entries.*,
  coalesce(sum(allocations.amount), 0)::integer as paid_amount,
  (entries.amount - coalesce(sum(allocations.amount), 0))::integer as remaining_amount
from public.instructor_payout_entries entries
left join public.instructor_payout_payment_allocations allocations
  on allocations.payout_entry_id = entries.id
group by entries.id;
