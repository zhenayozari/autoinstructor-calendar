create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  event_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_event_key_check check (
    event_key in (
      'student_booking_created',
      'booking_cancelled',
      'lesson_review_created',
      'student_registration_requested',
      'staff_registration_requested'
    )
  ),
  constraint notification_preferences_unique unique (
    organization_member_id,
    event_key
  )
);

create index if not exists notification_preferences_member_idx
  on public.notification_preferences(organization_member_id);

create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_preferences_set_updated_at
on public.notification_preferences;

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row
  execute function public.set_notification_preferences_updated_at();

alter table public.notification_preferences enable row level security;

grant select, insert, update, delete on public.notification_preferences to authenticated;

drop policy if exists "Members manage their own notification preferences"
on public.notification_preferences;

create policy "Members manage their own notification preferences"
  on public.notification_preferences
  for all
  to authenticated
  using (
    public.is_organization_member(organization_id)
    and exists (
      select 1
      from public.organization_members
      where organization_members.id = notification_preferences.organization_member_id
        and organization_members.user_id = auth.uid()
        and organization_members.is_active
    )
  )
  with check (
    public.is_organization_member(organization_id)
    and exists (
      select 1
      from public.organization_members
      where organization_members.id = notification_preferences.organization_member_id
        and organization_members.user_id = auth.uid()
        and organization_members.is_active
    )
  );
