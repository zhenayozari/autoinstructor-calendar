alter table public.instructor_payout_entries
  add column if not exists debt_resolution text;

alter table public.instructor_payout_entries
  add column if not exists debt_resolution_at timestamptz;

alter table public.instructor_payout_entries
  add column if not exists debt_resolution_note text;

alter table public.instructor_payout_entries
  drop constraint if exists instructor_payout_entries_debt_resolution_check;

alter table public.instructor_payout_entries
  add constraint instructor_payout_entries_debt_resolution_check check (
    debt_resolution is null or debt_resolution = 'withhold'
  );

alter table public.instructor_payout_entries
  drop constraint if exists instructor_payout_entries_debt_resolution_note_length_check;

alter table public.instructor_payout_entries
  add constraint instructor_payout_entries_debt_resolution_note_length_check check (
    debt_resolution_note is null or length(debt_resolution_note) <= 1000
  );

create table if not exists public.instructor_payout_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instructor_id uuid not null,
  amount integer not null,
  returned_at timestamptz not null default now(),
  return_note text,
  created_by_member_id uuid references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint instructor_payout_returns_instructor_org_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade,
  constraint instructor_payout_returns_amount_check
    check (amount > 0 and amount <= 10000000),
  constraint instructor_payout_returns_note_length_check
    check (return_note is null or length(return_note) <= 1000)
);

create index if not exists instructor_payout_returns_org_instructor_date_idx
  on public.instructor_payout_returns(organization_id, instructor_id, returned_at desc);

create table if not exists public.instructor_payout_return_allocations (
  return_id uuid not null
    references public.instructor_payout_returns(id)
    on delete cascade,
  payout_entry_id uuid not null
    references public.instructor_payout_entries(id)
    on delete cascade,
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key (return_id, payout_entry_id),
  constraint instructor_payout_return_allocations_amount_check
    check (amount > 0 and amount <= 10000000)
);

create index if not exists instructor_payout_return_allocations_entry_idx
  on public.instructor_payout_return_allocations(payout_entry_id);

drop view if exists public.instructor_payout_summary;
drop view if exists public.instructor_payout_entry_balances;

create view public.instructor_payout_entry_balances as
select
  entries.*,
  coalesce(payments.paid_amount, 0)::integer as paid_amount,
  (
    entries.amount
    - coalesce(payments.paid_amount, 0)
    + coalesce(returns.returned_amount, 0)
  )::integer as remaining_amount,
  coalesce(returns.returned_amount, 0)::integer as returned_amount
from public.instructor_payout_entries entries
left join lateral (
  select sum(allocations.amount)::integer as paid_amount
  from public.instructor_payout_payment_allocations allocations
  where allocations.payout_entry_id = entries.id
) payments on true
left join lateral (
  select sum(allocations.amount)::integer as returned_amount
  from public.instructor_payout_return_allocations allocations
  where allocations.payout_entry_id = entries.id
) returns on true;

create view public.instructor_payout_summary as
select
  entries.organization_id,
  entries.instructor_id,
  coalesce(sum(entries.amount) filter (where entries.status = 'planned'), 0)::integer
    as planned_amount,
  coalesce(sum(balances.paid_amount) filter (where entries.status = 'planned'), 0)::integer
    as paid_amount,
  coalesce(sum(balances.remaining_amount) filter (where entries.status = 'planned'), 0)::integer
    as remaining_amount
from public.instructor_payout_entries entries
join public.instructor_payout_entry_balances balances on balances.id = entries.id
group by entries.organization_id, entries.instructor_id;
