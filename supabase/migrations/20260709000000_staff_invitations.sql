create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  invited_by_member_id uuid
    references public.organization_members(id)
    on delete set null,
  token text not null unique,
  status text not null default 'invited',
  invited_name text,
  invited_email text,
  invited_phone text,
  submitted_name text,
  submitted_email text,
  submitted_phone text,
  user_id uuid
    references auth.users(id)
    on delete set null,
  instructor_id uuid
    references public.instructors(id)
    on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_invitations_status_check check (
    status in ('invited', 'submitted', 'approved', 'rejected', 'expired')
  ),
  constraint staff_invitations_token_not_blank check (length(trim(token)) > 0),
  constraint staff_invitations_invited_name_length check (
    invited_name is null or length(invited_name) <= 160
  ),
  constraint staff_invitations_invited_email_length check (
    invited_email is null or length(invited_email) <= 254
  ),
  constraint staff_invitations_invited_phone_length check (
    invited_phone is null or length(invited_phone) <= 40
  ),
  constraint staff_invitations_submitted_name_length check (
    submitted_name is null or length(submitted_name) <= 160
  ),
  constraint staff_invitations_submitted_email_length check (
    submitted_email is null or length(submitted_email) <= 254
  ),
  constraint staff_invitations_submitted_phone_length check (
    submitted_phone is null or length(submitted_phone) <= 40
  )
);

create index staff_invitations_organization_status_idx
  on public.staff_invitations(organization_id, status, created_at desc);

create index staff_invitations_token_idx
  on public.staff_invitations(token);

alter table public.staff_invitations enable row level security;

revoke all on public.staff_invitations from anon, authenticated;
