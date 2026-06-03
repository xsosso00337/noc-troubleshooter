select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'noc_files',
    'noc_assets',
    'noc_pon_assets',
    'noc_legacy_nodes',
    'audit_logs',
    'user_roles',
    'noc_import_jobs'
  )
order by c.relname;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'noc_files',
    'noc_assets',
    'noc_pon_assets',
    'noc_legacy_nodes',
    'audit_logs',
    'user_roles',
    'noc_import_jobs'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select
  'anon can select noc_assets' as check_name,
  has_table_privilege('anon', 'public.noc_assets', 'select') as result
union all
select
  'anon can select noc_pon_assets',
  has_table_privilege('anon', 'public.noc_pon_assets', 'select')
union all
select
  'anon can select noc_legacy_nodes',
  has_table_privilege('anon', 'public.noc_legacy_nodes', 'select')
union all
select
  'authenticated can select noc_assets',
  has_table_privilege('authenticated', 'public.noc_assets', 'select')
union all
select
  'authenticated can update noc_assets',
  has_table_privilege('authenticated', 'public.noc_assets', 'update')
union all
select
  'authenticated can delete noc_assets',
  has_table_privilege('authenticated', 'public.noc_assets', 'delete')
union all
select
  'authenticated can insert audit_logs',
  has_table_privilege('authenticated', 'public.audit_logs', 'insert')
union all
select
  'authenticated can select audit_logs',
  has_table_privilege('authenticated', 'public.audit_logs', 'select')
union all
select
  'anon can select user_roles',
  has_table_privilege('anon', 'public.user_roles', 'select')
union all
select
  'anon can select noc_import_jobs',
  has_table_privilege('anon', 'public.noc_import_jobs', 'select')
union all
select
  'authenticated can select user_roles',
  has_table_privilege('authenticated', 'public.user_roles', 'select')
union all
select
  'authenticated can insert noc_import_jobs',
  has_table_privilege('authenticated', 'public.noc_import_jobs', 'insert');

select
  'anon can execute private.is_noc_admin' as check_name,
  has_function_privilege('anon', 'private.is_noc_admin(uuid)', 'execute') as result
union all
select
  'authenticated can execute private.is_noc_admin',
  has_function_privilege('authenticated', 'private.is_noc_admin(uuid)', 'execute')
union all
select
  'anon can execute private.grant_noc_role_by_email',
  has_function_privilege('anon', 'private.grant_noc_role_by_email(text,text)', 'execute')
union all
select
  'authenticated can execute private.grant_noc_role_by_email',
  has_function_privilege('authenticated', 'private.grant_noc_role_by_email(text,text)', 'execute')
union all
select
  'service_role can execute private.grant_noc_role_by_email',
  has_function_privilege('service_role', 'private.grant_noc_role_by_email(text,text)', 'execute');

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'noc_files',
    'noc_assets',
    'noc_pon_assets',
    'noc_legacy_nodes',
    'audit_logs',
    'user_roles',
    'noc_import_jobs'
  )
order by tablename, policyname;

select
  trigger_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('noc_assets', 'noc_pon_assets', 'noc_legacy_nodes')
order by event_object_table, trigger_name, event_manipulation;
