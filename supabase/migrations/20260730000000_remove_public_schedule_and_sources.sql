-- The public landing no longer exposes a shared schedule or source catalog.
-- Students and staff read these records through server actions with scoped checks.

revoke all on public.public_schedule_slots from anon, authenticated;
grant select on public.public_schedule_slots to service_role;

revoke all on public.schools from anon;

drop policy if exists "Active schools are publicly readable"
on public.schools;
