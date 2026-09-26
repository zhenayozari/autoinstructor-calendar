create or replace view public.instructor_payout_summary as
with planned_entries as (
  select
    entries.organization_id,
    entries.instructor_id,
    coalesce(sum(entries.amount), 0)::integer as planned_amount
  from public.instructor_payout_entries entries
  where entries.status = 'planned'
  group by entries.organization_id, entries.instructor_id
),
paid_entries as (
  select
    entries.organization_id,
    entries.instructor_id,
    coalesce(sum(allocations.amount), 0)::integer as paid_amount
  from public.instructor_payout_entries entries
  join public.instructor_payout_payment_allocations allocations
    on allocations.payout_entry_id = entries.id
  where entries.status = 'planned'
  group by entries.organization_id, entries.instructor_id
)
select
  planned_entries.organization_id,
  planned_entries.instructor_id,
  planned_entries.planned_amount,
  coalesce(paid_entries.paid_amount, 0)::integer as paid_amount,
  greatest(
    planned_entries.planned_amount - coalesce(paid_entries.paid_amount, 0),
    0
  )::integer as remaining_amount
from planned_entries
left join paid_entries
  on paid_entries.organization_id = planned_entries.organization_id
 and paid_entries.instructor_id = planned_entries.instructor_id;
