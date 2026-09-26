alter table public.student_prepaid_credits
  add column if not exists cancellation_note text;

alter table public.student_prepaid_credits
  drop constraint if exists student_prepaid_credits_cancellation_note_length_check;

alter table public.student_prepaid_credits
  add constraint student_prepaid_credits_cancellation_note_length_check
    check (cancellation_note is null or length(cancellation_note) <= 1000);

alter table public.student_prepaid_credits
  drop constraint if exists student_prepaid_credits_cancellation_note_required_check;

update public.student_prepaid_credits
set cancellation_note = 'Отменено до добавления обязательной причины'
where status = 'cancelled'
  and cancellation_note is null;

alter table public.student_prepaid_credits
  add constraint student_prepaid_credits_cancellation_note_required_check
    check (status <> 'cancelled' or cancellation_note is not null);
