create table if not exists public.student_prepaid_refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  credit_id uuid not null
    references public.student_prepaid_credits(id)
    on delete restrict,
  amount integer not null,
  refunded_at timestamptz not null default now(),
  refund_note text,
  created_by_member_id uuid
    references public.organization_members(id)
    on delete set null,
  created_at timestamptz not null default now(),
  constraint student_prepaid_refunds_amount_check
    check (amount > 0 and amount <= 10000000),
  constraint student_prepaid_refunds_note_length_check
    check (refund_note is null or length(refund_note) <= 1000)
);

create index if not exists student_prepaid_refunds_credit_date_idx
  on public.student_prepaid_refunds(credit_id, refunded_at desc);

create index if not exists student_prepaid_refunds_org_date_idx
  on public.student_prepaid_refunds(organization_id, refunded_at desc);
