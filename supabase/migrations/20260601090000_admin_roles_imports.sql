create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.noc_import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references public.noc_files(id) on delete set null,
  table_name text not null check (table_name in ('noc_assets', 'noc_pon_assets', 'noc_legacy_nodes')),
  original_filename text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  row_count integer not null default 0 check (row_count >= 0),
  error_message text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_roles_role_idx
on public.user_roles (role);

create index if not exists user_roles_created_by_idx
on public.user_roles (created_by);

create index if not exists noc_import_jobs_created_by_created_at_idx
on public.noc_import_jobs (created_by, created_at desc);

create index if not exists noc_import_jobs_status_created_at_idx
on public.noc_import_jobs (status, created_at desc);

create index if not exists noc_import_jobs_source_file_id_idx
on public.noc_import_jobs (source_file_id);

create or replace function private.is_noc_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = check_user_id
      and role = 'admin'
  );
$$;

create or replace function private.grant_noc_role_by_email(target_email text, target_role text default 'admin')
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  target_user_id uuid;
begin
  if target_role not in ('admin', 'editor', 'viewer') then
    raise exception 'unsupported role: %', target_role;
  end if;

  select id
    into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  order by created_at desc
  limit 1;

  if target_user_id is null then
    raise exception 'no auth user found for email: %', target_email;
  end if;

  insert into public.user_roles (user_id, role)
  values (target_user_id, target_role)
  on conflict (user_id, role) do nothing;

  return target_user_id;
end;
$$;

revoke all on function private.is_noc_admin(uuid) from public, anon, authenticated;
revoke all on function private.grant_noc_role_by_email(text, text) from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_noc_admin(uuid) to authenticated, service_role;
grant execute on function private.grant_noc_role_by_email(text, text) to service_role;

alter table public.user_roles enable row level security;
alter table public.noc_import_jobs enable row level security;

revoke all on table public.user_roles from public, anon, authenticated;
revoke all on table public.noc_import_jobs from public, anon, authenticated;

grant select, insert, update, delete on table public.user_roles to authenticated;
grant select, insert, update on table public.noc_import_jobs to authenticated;
grant select, insert, update, delete on table public.user_roles to service_role;
grant select, insert, update, delete on table public.noc_import_jobs to service_role;

drop policy if exists "users can read own noc roles" on public.user_roles;
create policy "users can read own noc roles"
on public.user_roles
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "noc admins can read all roles" on public.user_roles;
create policy "noc admins can read all roles"
on public.user_roles
for select
to authenticated
using (private.is_noc_admin((select auth.uid())));

drop policy if exists "noc admins can insert roles" on public.user_roles;
create policy "noc admins can insert roles"
on public.user_roles
for insert
to authenticated
with check (private.is_noc_admin((select auth.uid())));

drop policy if exists "noc admins can update roles" on public.user_roles;
create policy "noc admins can update roles"
on public.user_roles
for update
to authenticated
using (private.is_noc_admin((select auth.uid())))
with check (private.is_noc_admin((select auth.uid())));

drop policy if exists "noc admins can delete roles" on public.user_roles;
create policy "noc admins can delete roles"
on public.user_roles
for delete
to authenticated
using (private.is_noc_admin((select auth.uid())));

drop policy if exists "noc admins can read import jobs" on public.noc_import_jobs;
create policy "noc admins can read import jobs"
on public.noc_import_jobs
for select
to authenticated
using (private.is_noc_admin((select auth.uid())));

drop policy if exists "noc admins can insert import jobs" on public.noc_import_jobs;
create policy "noc admins can insert import jobs"
on public.noc_import_jobs
for insert
to authenticated
with check (
  private.is_noc_admin((select auth.uid()))
  and created_by = (select auth.uid())
);

drop policy if exists "noc admins can update import jobs" on public.noc_import_jobs;
create policy "noc admins can update import jobs"
on public.noc_import_jobs
for update
to authenticated
using (private.is_noc_admin((select auth.uid())))
with check (private.is_noc_admin((select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'noc-imports',
  'noc-imports',
  false,
  52428800,
  array[
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "noc admins can read import files" on storage.objects;
create policy "noc admins can read import files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'noc-imports'
  and private.is_noc_admin((select auth.uid()))
);

drop policy if exists "noc admins can upload import files" on storage.objects;
create policy "noc admins can upload import files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'noc-imports'
  and owner = (select auth.uid())
  and private.is_noc_admin((select auth.uid()))
);

drop policy if exists "noc admins can update import files" on storage.objects;
create policy "noc admins can update import files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'noc-imports'
  and private.is_noc_admin((select auth.uid()))
)
with check (
  bucket_id = 'noc-imports'
  and private.is_noc_admin((select auth.uid()))
);

drop policy if exists "noc admins can delete import files" on storage.objects;
create policy "noc admins can delete import files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'noc-imports'
  and private.is_noc_admin((select auth.uid()))
);
