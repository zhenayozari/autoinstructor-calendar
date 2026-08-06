create table if not exists public.student_lesson_packages (
  id uuid primary key default gen_random_uuid(),
  student_access_id uuid not null references public.student_accesses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  booking_category text not null default 'regular',
  total_lesson_limit integer,
  weekly_lesson_limit integer,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_lesson_packages_booking_category_check
    check (booking_category in ('regular', 'extra', 'gift')),
  constraint student_lesson_packages_total_limit_check
    check (total_lesson_limit is null or total_lesson_limit > 0),
  constraint student_lesson_packages_weekly_limit_check
    check (weekly_lesson_limit is null or weekly_lesson_limit > 0)
);

create index if not exists student_lesson_packages_access_idx
  on public.student_lesson_packages(student_access_id);

create index if not exists student_lesson_packages_instructor_idx
  on public.student_lesson_packages(instructor_id, is_active, sort_order);

create index if not exists student_lesson_packages_school_idx
  on public.student_lesson_packages(school_id);

create table if not exists public.student_lesson_package_types (
  package_id uuid not null references public.student_lesson_packages(id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types(id) on delete cascade,
  primary key (package_id, lesson_type_id)
);

create index if not exists student_lesson_package_types_lesson_type_idx
  on public.student_lesson_package_types(lesson_type_id);

alter table public.bookings
  add column if not exists student_lesson_package_id uuid references public.student_lesson_packages(id) on delete set null;

alter table public.bookings
  add column if not exists school_id uuid references public.schools(id) on delete set null;

create index if not exists bookings_student_lesson_package_id_idx
  on public.bookings(student_lesson_package_id);

create index if not exists bookings_school_id_idx
  on public.bookings(school_id);

create or replace function public.set_student_lesson_packages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_lesson_packages_set_updated_at on public.student_lesson_packages;
create trigger student_lesson_packages_set_updated_at
before update on public.student_lesson_packages
for each row execute function public.set_student_lesson_packages_updated_at();

insert into public.student_lesson_packages (
  student_access_id,
  organization_id,
  instructor_id,
  school_id,
  booking_category,
  total_lesson_limit,
  weekly_lesson_limit,
  is_active,
  sort_order
)
select
  sa.id,
  sa.organization_id,
  sa.instructor_id,
  sa.school_id,
  'regular',
  sa.total_lesson_limit,
  sa.weekly_lesson_limit,
  sa.is_active and not coalesce(sa.is_archived, false),
  100
from public.student_accesses sa
where not exists (
  select 1
  from public.student_lesson_packages existing
  where existing.student_access_id = sa.id
);

insert into public.student_lesson_package_types (package_id, lesson_type_id)
select p.id, salt.lesson_type_id
from public.student_lesson_packages p
join public.student_access_lesson_types salt
  on salt.student_access_id = p.student_access_id
where not exists (
  select 1
  from public.student_lesson_package_types existing
  where existing.package_id = p.id
    and existing.lesson_type_id = salt.lesson_type_id
);

with first_packages as (
  select distinct on (student_access_id)
    id,
    student_access_id,
    school_id
  from public.student_lesson_packages
  order by student_access_id, sort_order, created_at, id
)
update public.bookings b
set
  student_lesson_package_id = coalesce(b.student_lesson_package_id, fp.id),
  school_id = coalesce(b.school_id, fp.school_id)
from first_packages fp
where b.student_access_id = fp.student_access_id
  and (b.student_lesson_package_id is null or b.school_id is null);

alter table public.student_lesson_packages enable row level security;
alter table public.student_lesson_package_types enable row level security;

revoke all on public.student_lesson_packages from anon, authenticated;
revoke all on public.student_lesson_package_types from anon, authenticated;
grant select, insert, update, delete on public.student_lesson_packages to authenticated;
grant select, insert, update, delete on public.student_lesson_package_types to authenticated;

drop policy if exists "Manage own student lesson packages" on public.student_lesson_packages;
create policy "Manage own student lesson packages"
on public.student_lesson_packages
for all
to authenticated
using (public.can_manage_instructor(instructor_id))
with check (public.can_manage_instructor(instructor_id));

drop policy if exists "Manage own student lesson package types" on public.student_lesson_package_types;
create policy "Manage own student lesson package types"
on public.student_lesson_package_types
for all
to authenticated
using (
  exists (
    select 1
    from public.student_lesson_packages p
    where p.id = student_lesson_package_types.package_id
      and public.can_manage_instructor(p.instructor_id)
  )
)
with check (
  exists (
    select 1
    from public.student_lesson_packages p
    where p.id = student_lesson_package_types.package_id
      and public.can_manage_instructor(p.instructor_id)
  )
);
