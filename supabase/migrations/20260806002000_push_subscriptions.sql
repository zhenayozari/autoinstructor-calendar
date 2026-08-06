create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  instructor_id uuid references public.instructors(id) on delete set null,
  role text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  subscription jsonb not null,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_role_check check (role in ('owner', 'instructor')),
  constraint push_subscriptions_endpoint_not_blank check (length(trim(endpoint)) > 0),
  constraint push_subscriptions_p256dh_not_blank check (length(trim(p256dh)) > 0),
  constraint push_subscriptions_auth_secret_not_blank check (length(trim(auth_secret)) > 0)
);

create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions(organization_member_id, is_active);

create index if not exists push_subscriptions_organization_idx
  on public.push_subscriptions(organization_id, role, is_active);

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_set_updated_at
on public.push_subscriptions;

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.set_push_subscriptions_updated_at();

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "Members manage their own push subscriptions"
on public.push_subscriptions;

create policy "Members manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  )
  with check (
    user_id = auth.uid()
    and role in ('owner', 'instructor')
    and public.is_organization_member(organization_id)
  );
