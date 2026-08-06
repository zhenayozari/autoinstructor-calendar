-- Audit logs are written by server actions with the service role.
-- Authenticated clients may only read logs through owner-scoped RLS.

revoke insert, update, delete on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "Organization members can create audit logs"
on public.audit_logs;
