create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  actor_member_id uuid
    references public.organization_members(id)
    on delete set null,
  actor_user_id uuid
    references auth.users(id)
    on delete set null,
  actor_role text not null,
  actor_instructor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_role_check check (
    actor_role in ('owner', 'admin', 'instructor')
  ),
  constraint audit_logs_action_length check (
    length(trim(action)) > 0 and length(action) <= 120
  ),
  constraint audit_logs_entity_type_length check (
    length(trim(entity_type)) > 0 and length(entity_type) <= 80
  ),
  constraint audit_logs_entity_id_length check (
    entity_id is null or length(entity_id) <= 160
  )
);

create index audit_logs_organization_created_idx
  on public.audit_logs(organization_id, created_at desc);

create index audit_logs_actor_user_created_idx
  on public.audit_logs(actor_user_id, created_at desc);

create index audit_logs_entity_idx
  on public.audit_logs(entity_type, entity_id);

alter table public.audit_logs enable row level security;

revoke all on public.audit_logs from anon, authenticated;
grant select, insert on public.audit_logs to authenticated;

create policy "Owners can read audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_organization_owner(organization_id));

create policy "Organization members can create audit logs"
  on public.audit_logs
  for insert
  to authenticated
  with check (
    public.is_organization_member(organization_id)
    and actor_user_id = auth.uid()
  );
