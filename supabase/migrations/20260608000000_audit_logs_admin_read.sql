-- Allow admins to read audit_logs from the website.
grant select on table public.audit_logs to authenticated;

drop policy if exists "admins can read audit logs" on public.audit_logs;
create policy "admins can read audit logs"
on public.audit_logs
for select
to authenticated
using (private.is_noc_admin(auth.uid()));
