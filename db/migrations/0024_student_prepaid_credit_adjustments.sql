create table if not exists public.student_prepaid_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  credit_id uuid not null references public.student_prepaid_credits(id) on delete restrict,
  previous_quantity integer not null,
  previous_final_total_amount bigint not null,
  new_quantity integer not null,
  new_final_total_amount bigint not null,
  reason text not null,
  created_by_member_id uuid references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint student_prepaid_credit_adjustments_quantity_check
    check (previous_quantity between 1 and 5000 and new_quantity between 1 and 5000),
  constraint student_prepaid_credit_adjustments_amount_check
    check (previous_final_total_amount >= 0 and new_final_total_amount >= 0),
  constraint student_prepaid_credit_adjustments_reason_check
    check (length(trim(reason)) between 1 and 1000)
);

create index if not exists student_prepaid_credit_adjustments_credit_date_idx
  on public.student_prepaid_credit_adjustments(credit_id, created_at desc);
