create table public.school_lesson_type_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  school_id uuid not null
    references public.schools(id)
    on delete cascade,
  lesson_type_id uuid not null
    references public.lesson_types(id)
    on delete cascade,
  price_amount integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_lesson_type_prices_amount_check check (
    price_amount >= 0 and price_amount <= 10000000
  ),
  constraint school_lesson_type_prices_unique unique (
    organization_id,
    school_id,
    lesson_type_id
  )
);

create index school_lesson_type_prices_organization_idx
  on public.school_lesson_type_prices(organization_id);

create index school_lesson_type_prices_school_idx
  on public.school_lesson_type_prices(school_id);

insert into public.school_lesson_type_prices (
  organization_id,
  school_id,
  lesson_type_id,
  price_amount
)
select
  schools.organization_id,
  schools.id,
  lesson_types.id,
  lesson_types.default_price_amount
from public.schools
cross join public.lesson_types
where lesson_types.default_price_amount is not null
on conflict (organization_id, school_id, lesson_type_id) do nothing;

update public.lesson_types
set default_price_amount = null
where default_price_amount is not null;

alter table public.school_lesson_type_prices enable row level security;

revoke all on public.school_lesson_type_prices from anon, authenticated;
grant select, insert, update, delete on public.school_lesson_type_prices to authenticated;

create policy "Organization members can read source lesson prices"
  on public.school_lesson_type_prices
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy "Owners can create source lesson prices"
  on public.school_lesson_type_prices
  for insert
  to authenticated
  with check (public.is_organization_owner(organization_id));

create policy "Owners can update source lesson prices"
  on public.school_lesson_type_prices
  for update
  to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));

create policy "Owners can delete source lesson prices"
  on public.school_lesson_type_prices
  for delete
  to authenticated
  using (public.is_organization_owner(organization_id));
