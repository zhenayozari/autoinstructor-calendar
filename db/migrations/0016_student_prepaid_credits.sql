create table if not exists public.student_prepaid_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  student_access_id uuid not null
    references public.student_accesses(id)
    on delete cascade,
  instructor_id uuid not null,
  school_id uuid not null
    references public.schools(id)
    on delete restrict,
  lesson_type_id uuid not null
    references public.lesson_types(id)
    on delete restrict,
  quantity integer not null,
  calculated_unit_price integer not null,
  calculated_total_amount bigint not null,
  final_unit_price integer not null,
  final_total_amount bigint not null,
  paid_at timestamptz not null default now(),
  payment_note text,
  status text not null default 'active',
  cancelled_at timestamptz,
  cancelled_by_member_id uuid references public.organization_members(id)
    on delete set null,
  created_by_member_id uuid references public.organization_members(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_prepaid_credits_quantity_check
    check (quantity between 1 and 5000),
  constraint student_prepaid_credits_calculated_unit_price_check
    check (calculated_unit_price between 0 and 10000000),
  constraint student_prepaid_credits_calculated_total_check
    check (calculated_total_amount = calculated_unit_price::bigint * quantity),
  constraint student_prepaid_credits_final_unit_price_check
    check (final_unit_price between 0 and 10000000),
  constraint student_prepaid_credits_final_total_check
    check (final_total_amount = final_unit_price::bigint * quantity),
  constraint student_prepaid_credits_payment_note_length_check
    check (payment_note is null or length(payment_note) <= 1000),
  constraint student_prepaid_credits_status_check
    check (status in ('active', 'cancelled')),
  constraint student_prepaid_credits_cancelled_check
    check (
      (status = 'active' and cancelled_at is null)
      or (status = 'cancelled' and cancelled_at is not null)
    ),
  constraint student_prepaid_credits_instructor_org_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade
);

create index if not exists student_prepaid_credits_access_idx
  on public.student_prepaid_credits(student_access_id, status, created_at desc);

create index if not exists student_prepaid_credits_matching_idx
  on public.student_prepaid_credits(
    student_access_id,
    school_id,
    lesson_type_id,
    status,
    paid_at
  );

create table if not exists public.student_prepaid_credit_usages (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null
    references public.student_prepaid_credits(id)
    on delete restrict,
  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,
  amount integer not null,
  used_at timestamptz not null default now(),
  status text not null default 'active',
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint student_prepaid_credit_usages_amount_check
    check (amount between 0 and 10000000),
  constraint student_prepaid_credit_usages_status_check
    check (status in ('active', 'reversed')),
  constraint student_prepaid_credit_usages_reversed_check
    check (
      (status = 'active' and reversed_at is null)
      or (status = 'reversed' and reversed_at is not null)
    ),
  constraint student_prepaid_credit_usages_booking_unique
    unique (booking_id)
);

create index if not exists student_prepaid_credit_usages_credit_idx
  on public.student_prepaid_credit_usages(credit_id, status, used_at);

create index if not exists student_prepaid_credit_usages_booking_idx
  on public.student_prepaid_credit_usages(booking_id, status);

create or replace function public.set_student_prepaid_credits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_prepaid_credits_set_updated_at
  on public.student_prepaid_credits;

create trigger student_prepaid_credits_set_updated_at
before update on public.student_prepaid_credits
for each row execute function public.set_student_prepaid_credits_updated_at();
