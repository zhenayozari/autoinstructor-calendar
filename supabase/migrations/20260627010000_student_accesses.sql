create table public.student_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  display_label text not null,
  login text not null,
  password_hash text not null,
  total_lesson_limit integer,
  weekly_lesson_limit integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_accesses_label_length check (
    length(trim(display_label)) between 1 and 80
  ),
  constraint student_accesses_login_format check (
    login ~ '^[a-z0-9][a-z0-9_-]{2,49}$'
  ),
  constraint student_accesses_password_hash_length check (
    length(trim(password_hash)) >= 32
  ),
  constraint student_accesses_total_limit_check check (
    total_lesson_limit is null or total_lesson_limit between 1 and 500
  ),
  constraint student_accesses_weekly_limit_check check (
    weekly_lesson_limit is null or weekly_lesson_limit between 1 and 50
  ),
  constraint student_accesses_org_login_unique unique (organization_id, login)
);

create index student_accesses_instructor_idx
  on public.student_accesses(instructor_id, is_active, display_label);

create table public.student_access_lesson_types (
  student_access_id uuid not null
    references public.student_accesses(id)
    on delete cascade,
  lesson_type_id uuid not null
    references public.lesson_types(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  primary key (student_access_id, lesson_type_id)
);

create index student_access_lesson_types_lesson_type_idx
  on public.student_access_lesson_types(lesson_type_id);

create or replace function public.set_student_accesses_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_student_accesses_updated_at_trigger
before update
on public.student_accesses
for each row
execute function public.set_student_accesses_updated_at();

alter table public.student_accesses enable row level security;
alter table public.student_access_lesson_types enable row level security;

revoke all on public.student_accesses from anon, authenticated;
revoke all on public.student_access_lesson_types from anon, authenticated;
