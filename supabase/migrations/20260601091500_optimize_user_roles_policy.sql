drop policy if exists "users can read own noc roles" on public.user_roles;
drop policy if exists "noc admins can read all roles" on public.user_roles;

create policy "users can read own roles or admins can read all roles"
on public.user_roles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or private.is_noc_admin((select auth.uid()))
);
