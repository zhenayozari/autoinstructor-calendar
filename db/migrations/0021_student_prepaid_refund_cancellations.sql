alter table public.student_prepaid_refunds
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_note text,
  add column if not exists cancelled_by_member_id uuid
    references public.organization_members(id)
    on delete set null;

alter table public.student_prepaid_refunds
  drop constraint if exists student_prepaid_refunds_cancellation_note_length_check;

alter table public.student_prepaid_refunds
  add constraint student_prepaid_refunds_cancellation_note_length_check
    check (cancellation_note is null or length(cancellation_note) <= 1000);

create index if not exists student_prepaid_refunds_active_credit_date_idx
  on public.student_prepaid_refunds(credit_id, refunded_at desc)
  where cancelled_at is null;
