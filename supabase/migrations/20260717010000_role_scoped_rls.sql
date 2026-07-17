-- Tighten direct Supabase access around the same roles used by the app.
-- Server actions that use the service role continue to bypass RLS, but a
-- normal authenticated user is now limited to their organization/instructor.

create or replace function public.current_member_role(target_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select organization_members.role
  from public.organization_members
  where organization_members.organization_id = target_organization_id
    and organization_members.user_id = auth.uid()
    and organization_members.is_active
  limit 1
$$;

create or replace function public.current_member_instructor_id(target_organization_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_members.instructor_id
  from public.organization_members
  where organization_members.organization_id = target_organization_id
    and organization_members.user_id = auth.uid()
    and organization_members.is_active
  limit 1
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = target_organization_id
      and organization_members.user_id = auth.uid()
      and organization_members.is_active
  )
$$;

create or replace function public.is_organization_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_member_role(target_organization_id) = 'owner'
$$;

create or replace function public.is_organization_manager(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_member_role(target_organization_id) in ('owner', 'admin')
$$;

create or replace function public.can_manage_instructor(target_instructor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.instructors
    join public.organization_members
      on organization_members.organization_id = instructors.organization_id
    where instructors.id = target_instructor_id
      and organization_members.user_id = auth.uid()
      and organization_members.is_active
      and (
        organization_members.role in ('owner', 'admin')
        or (
          organization_members.role = 'instructor'
          and organization_members.instructor_id = target_instructor_id
        )
      )
  )
$$;

create or replace function public.can_manage_schedule_day(target_schedule_day_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_days
    where schedule_days.id = target_schedule_day_id
      and public.can_manage_instructor(schedule_days.instructor_id)
  )
$$;

create or replace function public.can_manage_slot(target_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.slots
    where slots.id = target_slot_id
      and public.can_manage_instructor(slots.instructor_id)
  )
$$;

create or replace function public.can_manage_student_access(target_access_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_accesses
    where student_accesses.id = target_access_id
      and public.can_manage_instructor(student_accesses.instructor_id)
  )
$$;

revoke all on function public.current_member_role(uuid) from public, anon;
revoke all on function public.current_member_instructor_id(uuid) from public, anon;
revoke all on function public.is_organization_member(uuid) from public, anon;
revoke all on function public.is_organization_owner(uuid) from public, anon;
revoke all on function public.is_organization_manager(uuid) from public, anon;
revoke all on function public.can_manage_instructor(uuid) from public, anon;
revoke all on function public.can_manage_schedule_day(uuid) from public, anon;
revoke all on function public.can_manage_slot(uuid) from public, anon;
revoke all on function public.can_manage_student_access(uuid) from public, anon;

grant execute on function public.current_member_role(uuid) to authenticated;
grant execute on function public.current_member_instructor_id(uuid) to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_owner(uuid) to authenticated;
grant execute on function public.is_organization_manager(uuid) to authenticated;
grant execute on function public.can_manage_instructor(uuid) to authenticated;
grant execute on function public.can_manage_schedule_day(uuid) to authenticated;
grant execute on function public.can_manage_slot(uuid) to authenticated;
grant execute on function public.can_manage_student_access(uuid) to authenticated;

-- Legacy broad policies.
drop policy if exists "Authenticated users manage schools"
on public.schools;

drop policy if exists "Authenticated users manage instructors"
on public.instructors;

drop policy if exists "Authenticated users manage lesson types"
on public.lesson_types;

drop policy if exists "Authenticated users manage schedule days"
on public.schedule_days;

drop policy if exists "Authenticated users manage slots"
on public.slots;

drop policy if exists "Authenticated users manage bookings"
on public.bookings;

-- Direct grants are useful for future client-side reads, but RLS now scopes them.
grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.instructors to authenticated;
grant select on public.instructor_capabilities to authenticated;
grant select on public.lesson_types to authenticated;
grant insert, update, delete on public.lesson_types to authenticated;
grant select, insert, update, delete on public.schedule_days to authenticated;
grant select, insert, update, delete on public.slots to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant select, insert, update, delete on public.schools to authenticated;
grant select, insert, update, delete on public.student_accesses to authenticated;
grant select, insert, update, delete on public.student_access_lesson_types to authenticated;
grant select, insert, update, delete on public.student_registration_requests to authenticated;
grant select, insert, update, delete on public.staff_invitations to authenticated;
grant select, insert, update, delete on public.organization_site_settings to authenticated;
grant select, insert, update, delete on public.instructor_site_settings to authenticated;

-- Organization shell.
drop policy if exists "Organization members can read their organization"
on public.organizations;

create policy "Organization members can read their organization"
  on public.organizations
  for select
  to authenticated
  using (public.is_organization_member(id));

drop policy if exists "Members can read their own membership"
on public.organization_members;

create policy "Members can read their own membership"
  on public.organization_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_organization_owner(organization_id)
  );

-- Instructors.
drop policy if exists "Organization members can read instructors"
on public.instructors;

create policy "Organization members can read instructors"
  on public.instructors
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists "Organization managers insert instructors"
on public.instructors;

create policy "Organization managers insert instructors"
  on public.instructors
  for insert
  to authenticated
  with check (public.is_organization_manager(organization_id));

drop policy if exists "Instructors manage allowed instructor profile"
on public.instructors;

create policy "Instructors manage allowed instructor profile"
  on public.instructors
  for update
  to authenticated
  using (public.can_manage_instructor(id))
  with check (public.can_manage_instructor(id));

drop policy if exists "Owners delete instructors"
on public.instructors;

create policy "Owners delete instructors"
  on public.instructors
  for delete
  to authenticated
  using (public.is_organization_owner(organization_id));

-- Lesson types are still global in the current schema, so only an owner can
-- change them. Any active staff member may read them.
drop policy if exists "Authenticated users can read lesson types"
on public.lesson_types;

create policy "Authenticated users can read lesson types"
  on public.lesson_types
  for select
  to authenticated
  using (true);

drop policy if exists "Owners manage lesson types"
on public.lesson_types;

create policy "Owners manage lesson types"
  on public.lesson_types
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.organization_members
      where organization_members.user_id = auth.uid()
        and organization_members.is_active
        and organization_members.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members
      where organization_members.user_id = auth.uid()
        and organization_members.is_active
        and organization_members.role = 'owner'
    )
  );

-- Schedule.
drop policy if exists "Organization members can read their schedule days"
on public.schedule_days;

create policy "Organization members can read their schedule days"
  on public.schedule_days
  for select
  to authenticated
  using (public.can_manage_instructor(instructor_id));

drop policy if exists "Organization members manage their schedule days"
on public.schedule_days;

create policy "Organization members manage their schedule days"
  on public.schedule_days
  for all
  to authenticated
  using (public.can_manage_instructor(instructor_id))
  with check (public.can_manage_instructor(instructor_id));

drop policy if exists "Organization members can read their slots"
on public.slots;

create policy "Organization members can read their slots"
  on public.slots
  for select
  to authenticated
  using (public.can_manage_instructor(instructor_id));

drop policy if exists "Organization members manage their slots"
on public.slots;

create policy "Organization members manage their slots"
  on public.slots
  for all
  to authenticated
  using (public.can_manage_instructor(instructor_id))
  with check (
    public.can_manage_instructor(instructor_id)
    and public.can_manage_schedule_day(schedule_day_id)
  );

drop policy if exists "Organization members can read their bookings"
on public.bookings;

create policy "Organization members can read their bookings"
  on public.bookings
  for select
  to authenticated
  using (public.can_manage_slot(slot_id));

drop policy if exists "Organization members manage their bookings"
on public.bookings;

create policy "Organization members manage their bookings"
  on public.bookings
  for all
  to authenticated
  using (public.can_manage_slot(slot_id))
  with check (public.can_manage_slot(slot_id));

-- Sources.
drop policy if exists "Organization members can read schools"
on public.schools;

create policy "Organization members can read schools"
  on public.schools
  for select
  to authenticated
  using (
    is_active
    or public.is_organization_member(organization_id)
  );

drop policy if exists "Owners manage schools"
on public.schools;

create policy "Owners manage schools"
  on public.schools
  for all
  to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));

-- Students and student requests.
drop policy if exists "Organization members can read manageable student accesses"
on public.student_accesses;

create policy "Organization members can read manageable student accesses"
  on public.student_accesses
  for select
  to authenticated
  using (public.can_manage_instructor(instructor_id));

drop policy if exists "Organization members manage manageable student accesses"
on public.student_accesses;

create policy "Organization members manage manageable student accesses"
  on public.student_accesses
  for all
  to authenticated
  using (public.can_manage_instructor(instructor_id))
  with check (
    public.can_manage_instructor(instructor_id)
    and public.is_organization_member(organization_id)
  );

drop policy if exists "Organization members can read student lesson links"
on public.student_access_lesson_types;

create policy "Organization members can read student lesson links"
  on public.student_access_lesson_types
  for select
  to authenticated
  using (public.can_manage_student_access(student_access_id));

drop policy if exists "Organization members manage student lesson links"
on public.student_access_lesson_types;

create policy "Organization members manage student lesson links"
  on public.student_access_lesson_types
  for all
  to authenticated
  using (public.can_manage_student_access(student_access_id))
  with check (public.can_manage_student_access(student_access_id));

drop policy if exists "Organization members can read manageable student requests"
on public.student_registration_requests;

create policy "Organization members can read manageable student requests"
  on public.student_registration_requests
  for select
  to authenticated
  using (public.can_manage_instructor(instructor_id));

drop policy if exists "Organization members manage manageable student requests"
on public.student_registration_requests;

create policy "Organization members manage manageable student requests"
  on public.student_registration_requests
  for all
  to authenticated
  using (public.can_manage_instructor(instructor_id))
  with check (
    public.can_manage_instructor(instructor_id)
    and public.is_organization_member(organization_id)
  );

-- Staff invitations are a director/owner surface.
drop policy if exists "Owners manage staff invitations"
on public.staff_invitations;

create policy "Owners manage staff invitations"
  on public.staff_invitations
  for all
  to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));

-- Public site settings: public read stays, owner writes.
drop policy if exists "Owners manage organization site settings"
on public.organization_site_settings;

create policy "Owners manage organization site settings"
  on public.organization_site_settings
  for all
  to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));

drop policy if exists "Owners manage instructor site settings"
on public.instructor_site_settings;

create policy "Owners manage instructor site settings"
  on public.instructor_site_settings
  for all
  to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));
