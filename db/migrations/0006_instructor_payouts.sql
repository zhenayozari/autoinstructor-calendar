do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schools_id_organization_unique'
  ) then
    alter table public.schools
      add constraint schools_id_organization_unique unique (id, organization_id);
  end if;
end;
$$;

create table if not exists public.instructor_payout_settings (
  instructor_id uuid primary key,
  organization_id uuid not null,
  accrual_policy text not null default 'postpaid',
  weekly_lesson_limit integer,
  source_visibility_mode text not null default 'all_active',
  show_client_prices boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_payout_settings_instructor_org_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade,
  constraint instructor_payout_settings_accrual_policy_check check (
    accrual_policy in ('prepaid', 'postpaid')
  ),
  constraint instructor_payout_settings_weekly_limit_check check (
    weekly_lesson_limit is null or weekly_lesson_limit between 1 and 200
  ),
  constraint instructor_payout_settings_source_visibility_check check (
    source_visibility_mode in ('all_active', 'selected_only')
  )
);

create index if not exists instructor_payout_settings_org_idx
  on public.instructor_payout_settings(organization_id);

create table if not exists public.instructor_source_visibility (
  instructor_id uuid not null,
  organization_id uuid not null,
  school_id uuid not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (instructor_id, school_id),
  constraint instructor_source_visibility_instructor_org_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade,
  constraint instructor_source_visibility_school_org_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id)
    on delete cascade
);

create index if not exists instructor_source_visibility_org_school_idx
  on public.instructor_source_visibility(organization_id, school_id, is_visible);

create table if not exists public.instructor_payout_rate_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instructor_id uuid not null,
  school_id uuid,
  lesson_type_id uuid references public.lesson_types(id) on delete cascade,
  booking_category text,
  amount integer not null,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_payout_rate_rules_instructor_org_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade,
  constraint instructor_payout_rate_rules_school_org_fk
    foreign key (school_id, organization_id)
    references public.schools(id, organization_id)
    on delete cascade,
  constraint instructor_payout_rate_rules_booking_category_check check (
    booking_category is null or booking_category in ('regular', 'extra', 'gift')
  ),
  constraint instructor_payout_rate_rules_amount_check check (
    amount between 0 and 10000000
  ),
  constraint instructor_payout_rate_rules_effective_range_check check (
    effective_to is null or effective_to >= effective_from
  ),
  constraint instructor_payout_rate_rules_note_length_check check (
    note is null or length(note) <= 500
  )
);

create index if not exists instructor_payout_rate_rules_lookup_idx
  on public.instructor_payout_rate_rules(
    organization_id,
    instructor_id,
    is_active,
    effective_from,
    effective_to
  );

create index if not exists instructor_payout_rate_rules_school_lesson_idx
  on public.instructor_payout_rate_rules(school_id, lesson_type_id, booking_category);

create table if not exists public.instructor_payout_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instructor_id uuid not null,
  booking_id uuid references public.bookings(id) on delete set null,
  slot_id uuid references public.slots(id) on delete set null,
  school_id uuid references public.schools(id) on delete set null,
  lesson_type_id uuid references public.lesson_types(id) on delete set null,
  student_access_id uuid references public.student_accesses(id) on delete set null,
  rate_rule_id uuid references public.instructor_payout_rate_rules(id) on delete set null,
  entry_type text not null default 'booking_accrual',
  accrual_policy text not null,
  status text not null default 'planned',
  amount integer not null,
  planned_at timestamptz not null default now(),
  event_at timestamptz,
  cancelled_at timestamptz,
  note text,
  created_by_member_id uuid references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_payout_entries_instructor_org_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade,
  constraint instructor_payout_entries_entry_type_check check (
    entry_type in (
      'booking_accrual',
      'manual_adjustment',
      'cancellation_adjustment',
      'no_show_adjustment'
    )
  ),
  constraint instructor_payout_entries_accrual_policy_check check (
    accrual_policy in ('prepaid', 'postpaid')
  ),
  constraint instructor_payout_entries_status_check check (
    status in ('planned', 'cancelled')
  ),
  constraint instructor_payout_entries_amount_check check (
    amount <> 0 and amount between -10000000 and 10000000
  ),
  constraint instructor_payout_entries_booking_required_check check (
    entry_type <> 'booking_accrual' or booking_id is not null
  ),
  constraint instructor_payout_entries_cancelled_at_check check (
    (status = 'cancelled' and cancelled_at is not null)
    or (status = 'planned' and cancelled_at is null)
  ),
  constraint instructor_payout_entries_note_length_check check (
    note is null or length(note) <= 1000
  )
);

create unique index if not exists instructor_payout_entries_one_accrual_per_booking_idx
  on public.instructor_payout_entries(booking_id)
  where entry_type = 'booking_accrual' and booking_id is not null;

create index if not exists instructor_payout_entries_org_instructor_status_idx
  on public.instructor_payout_entries(organization_id, instructor_id, status, planned_at desc);

create index if not exists instructor_payout_entries_booking_idx
  on public.instructor_payout_entries(booking_id)
  where booking_id is not null;

create table if not exists public.instructor_payout_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instructor_id uuid not null,
  amount integer not null,
  paid_at timestamptz not null default now(),
  payment_note text,
  created_by_member_id uuid references public.organization_members(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint instructor_payout_payments_instructor_org_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade,
  constraint instructor_payout_payments_amount_check check (
    amount > 0 and amount <= 10000000
  ),
  constraint instructor_payout_payments_note_length_check check (
    payment_note is null or length(payment_note) <= 1000
  )
);

create index if not exists instructor_payout_payments_org_instructor_paid_idx
  on public.instructor_payout_payments(organization_id, instructor_id, paid_at desc);

create table if not exists public.instructor_payout_payment_allocations (
  payment_id uuid not null
    references public.instructor_payout_payments(id)
    on delete cascade,
  payout_entry_id uuid not null
    references public.instructor_payout_entries(id)
    on delete cascade,
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key (payment_id, payout_entry_id),
  constraint instructor_payout_payment_allocations_amount_check check (
    amount > 0 and amount <= 10000000
  )
);

create index if not exists instructor_payout_payment_allocations_entry_idx
  on public.instructor_payout_payment_allocations(payout_entry_id);

create or replace view public.instructor_payout_entry_balances as
select
  entries.*,
  coalesce(sum(allocations.amount), 0)::integer as paid_amount,
  (entries.amount - coalesce(sum(allocations.amount), 0))::integer as remaining_amount
from public.instructor_payout_entries entries
left join public.instructor_payout_payment_allocations allocations
  on allocations.payout_entry_id = entries.id
group by entries.id;

create or replace view public.instructor_payout_summary as
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

create or replace function public.set_instructor_payout_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_instructor_payout_settings_updated_at_trigger'
  ) then
    create trigger set_instructor_payout_settings_updated_at_trigger
    before update
    on public.instructor_payout_settings
    for each row
    execute function public.set_instructor_payout_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_instructor_source_visibility_updated_at_trigger'
  ) then
    create trigger set_instructor_source_visibility_updated_at_trigger
    before update
    on public.instructor_source_visibility
    for each row
    execute function public.set_instructor_payout_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_instructor_payout_rate_rules_updated_at_trigger'
  ) then
    create trigger set_instructor_payout_rate_rules_updated_at_trigger
    before update
    on public.instructor_payout_rate_rules
    for each row
    execute function public.set_instructor_payout_updated_at();
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_instructor_payout_entries_updated_at_trigger'
  ) then
    create trigger set_instructor_payout_entries_updated_at_trigger
    before update
    on public.instructor_payout_entries
    for each row
    execute function public.set_instructor_payout_updated_at();
  end if;
end;
$$;
