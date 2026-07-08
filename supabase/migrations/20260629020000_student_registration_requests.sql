create table public.student_registration_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  first_name text,
  last_name text,
  student_phone text,
  school_text text,
  login text not null,
  password_hash text not null,
  status text not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_registration_requests_login_format check (
    login ~ '^[a-z0-9][a-z0-9_-]{2,49}$'
  ),
  constraint student_registration_requests_password_hash_length check (
    length(trim(password_hash)) >= 32
  ),
  constraint student_registration_requests_name_length check (
    (first_name is null or length(trim(first_name)) <= 80)
    and (last_name is null or length(trim(last_name)) <= 80)
  ),
  constraint student_registration_requests_phone_length check (
    student_phone is null or length(trim(student_phone)) <= 40
  ),
  constraint student_registration_requests_school_length check (
    school_text is null or length(trim(school_text)) <= 120
  ),
  constraint student_registration_requests_status_check check (
    status in ('pending', 'approved', 'rejected')
  ),
  constraint student_registration_requests_review_consistency check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null)
  )
);

create index student_registration_requests_instructor_status_idx
  on public.student_registration_requests(instructor_id, status, created_at desc);

create unique index student_registration_requests_pending_login_idx
  on public.student_registration_requests(organization_id, login)
  where status = 'pending';

create or replace function public.set_student_registration_requests_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_student_registration_requests_updated_at_trigger
before update
on public.student_registration_requests
for each row
execute function public.set_student_registration_requests_updated_at();

alter table public.student_registration_requests enable row level security;

revoke all on public.student_registration_requests from anon, authenticated;
