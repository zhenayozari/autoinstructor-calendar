create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(trim(name)) > 0),
  constraint organizations_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

insert into public.organizations (name, slug)
values ('Автоинструктор MVP', 'autoinstructor-mvp')
on conflict (slug) do update
set name = excluded.name;

alter table public.instructors
add column organization_id uuid;

update public.instructors
set organization_id = (
  select organizations.id
  from public.organizations
  where organizations.slug = 'autoinstructor-mvp'
)
where organization_id is null;

alter table public.instructors
alter column organization_id set not null;

alter table public.instructors
add constraint instructors_organization_fk
foreign key (organization_id)
references public.organizations(id)
on delete restrict;

alter table public.instructors
add constraint instructors_id_organization_unique
unique (id, organization_id);

create index instructors_organization_id_idx
  on public.instructors(organization_id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  user_id uuid not null
    references auth.users(id)
    on delete cascade,
  instructor_id uuid,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint organization_members_role_check check (
    role in ('owner', 'admin', 'instructor')
  ),
  constraint organization_members_instructor_role_check check (
    role <> 'instructor' or instructor_id is not null
  ),
  constraint organization_members_organization_user_unique
    unique (organization_id, user_id),
  constraint organization_members_instructor_organization_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade
);

create unique index organization_members_active_owner_idx
  on public.organization_members(organization_id)
  where role = 'owner' and is_active;

create unique index organization_members_instructor_idx
  on public.organization_members(organization_id, instructor_id)
  where instructor_id is not null;

create index organization_members_user_id_idx
  on public.organization_members(user_id);

create table public.instructor_capabilities (
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  capability text not null,
  created_at timestamptz not null default now(),
  primary key (instructor_id, capability),
  constraint instructor_capabilities_capability_check check (
    capability in ('driving', 'theory')
  )
);

insert into public.instructor_capabilities (instructor_id, capability)
select instructors.id, capabilities.capability
from public.instructors
cross join (
  values ('driving'), ('theory')
) as capabilities(capability)
where instructors.slug = 'main-instructor'
on conflict (instructor_id, capability) do nothing;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.instructor_capabilities enable row level security;

revoke all on public.organizations from anon, authenticated;
revoke all on public.organization_members from anon, authenticated;
revoke all on public.instructor_capabilities from anon, authenticated;
