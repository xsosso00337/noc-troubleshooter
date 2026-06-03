create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists public.noc_files (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('cmts', 'pon', 'legacy_node', 'other')),
  original_filename text not null,
  sha256 text,
  row_count integer not null default 0 check (row_count >= 0),
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.noc_assets (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references public.noc_files(id) on delete set null,
  cmts text,
  mac_domain text,
  upstream_port text,
  upstream_connector text,
  downstream_port text,
  node text,
  receiver text,
  return_source text,
  receiver_brand text,
  receiver_rack text,
  sst text,
  hub_max text,
  max_rack text,
  demax_rack text,
  demux_wavelength text,
  dwdm_splitter text,
  edfa text,
  wdm text,
  mux text,
  dcm text,
  demux_a text,
  demux_b text,
  tx_a text,
  tx_channel text,
  tx_a_rack text,
  pre_amp text,
  fiber_down_a text,
  fiber_up_a text,
  tx_b text,
  tx_b_rack text,
  line_code text,
  source text,
  status text,
  source_file text,
  source_sheet text,
  source_row integer,
  search_text text not null default '',
  raw_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);

create table if not exists public.noc_pon_assets (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references public.noc_files(id) on delete set null,
  source_id text,
  headend text,
  olt_frame text,
  olt_card text,
  olt_port_id text,
  pon_no text,
  node text,
  building_id text,
  building_name text,
  building_type text,
  serviceable_units text,
  address_range text,
  building_units text,
  fiber_core_he text,
  olt_port text,
  patch_panel text,
  edfa text,
  notify_date text,
  patch_done_date text,
  pon_done_date text,
  note text,
  extra_note text,
  system_id text,
  edfa_code text,
  only_area text,
  first_splitter text,
  second_splitter text,
  pon_user_type text,
  olt_name text,
  network_code text,
  original_olt text,
  source_file text,
  source_sheet text,
  source_row integer,
  search_text text not null default '',
  raw_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);

create table if not exists public.noc_legacy_nodes (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references public.noc_files(id) on delete set null,
  source_id text,
  node text,
  cmts text,
  mac_domain text,
  upstream_port text,
  upstream_connector text,
  downstream_port text,
  tx_channel text,
  mux text,
  hub text,
  dcm text,
  return_receiver text,
  demux_a text,
  demux_b text,
  index_channel text,
  source_file text,
  source_sheet text,
  source_row integer,
  warning text,
  search_text text not null default '',
  raw_data jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  action text not null,
  filters jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists noc_files_source_type_idx on public.noc_files (source_type);
create index if not exists noc_files_imported_at_idx on public.noc_files (imported_at desc);

create index if not exists noc_assets_cmts_idx on public.noc_assets (cmts);
create index if not exists noc_assets_node_idx on public.noc_assets (node);
create index if not exists noc_assets_hub_max_idx on public.noc_assets (hub_max);
create index if not exists noc_assets_line_code_idx on public.noc_assets (line_code);
create index if not exists noc_assets_search_idx on public.noc_assets using gin (search_text gin_trgm_ops);
create index if not exists noc_assets_raw_data_idx on public.noc_assets using gin (raw_data jsonb_path_ops);

create index if not exists noc_pon_assets_olt_card_idx on public.noc_pon_assets (olt_card);
create index if not exists noc_pon_assets_node_idx on public.noc_pon_assets (node);
create index if not exists noc_pon_assets_building_id_idx on public.noc_pon_assets (building_id);
create index if not exists noc_pon_assets_pon_done_date_idx on public.noc_pon_assets (pon_done_date);
create index if not exists noc_pon_assets_search_idx on public.noc_pon_assets using gin (search_text gin_trgm_ops);
create index if not exists noc_pon_assets_raw_data_idx on public.noc_pon_assets using gin (raw_data jsonb_path_ops);

create index if not exists noc_legacy_nodes_node_idx on public.noc_legacy_nodes (node);
create index if not exists noc_legacy_nodes_cmts_idx on public.noc_legacy_nodes (cmts);
create index if not exists noc_legacy_nodes_search_idx on public.noc_legacy_nodes using gin (search_text gin_trgm_ops);
create index if not exists noc_legacy_nodes_raw_data_idx on public.noc_legacy_nodes using gin (raw_data jsonb_path_ops);

create index if not exists audit_logs_user_id_created_at_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_action_created_at_idx on public.audit_logs (action, created_at desc);

create or replace function private.compact_search_text(parts text[])
returns text
language sql
immutable
as $$
  select coalesce(lower(trim(regexp_replace(array_to_string(parts, ' '), '[[:space:]]+', ' ', 'g'))), '');
$$;

create or replace function private.set_noc_assets_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := private.compact_search_text(array[
    new.cmts, new.mac_domain, new.upstream_port, new.upstream_connector,
    new.downstream_port, new.node, new.receiver, new.return_source,
    new.receiver_brand, new.receiver_rack, new.sst, new.hub_max,
    new.max_rack, new.demax_rack, new.demux_wavelength, new.dwdm_splitter,
    new.edfa, new.wdm, new.mux, new.dcm, new.demux_a, new.demux_b,
    new.tx_a, new.tx_channel, new.tx_a_rack, new.pre_amp, new.fiber_down_a,
    new.fiber_up_a, new.tx_b, new.tx_b_rack, new.line_code, new.source,
    new.status, new.source_file, new.source_sheet, new.raw_data::text
  ]);
  return new;
end;
$$;

create or replace function private.set_noc_pon_assets_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := private.compact_search_text(array[
    new.source_id, new.headend, new.olt_frame, new.olt_card, new.olt_port_id,
    new.pon_no, new.node, new.building_id, new.building_name, new.building_type,
    new.serviceable_units, new.address_range, new.building_units, new.fiber_core_he,
    new.olt_port, new.patch_panel, new.edfa, new.notify_date, new.patch_done_date,
    new.pon_done_date, new.note, new.extra_note, new.system_id, new.edfa_code,
    new.only_area, new.first_splitter, new.second_splitter, new.pon_user_type,
    new.olt_name, new.network_code, new.original_olt, new.source_file,
    new.source_sheet, new.raw_data::text
  ]);
  return new;
end;
$$;

create or replace function private.set_noc_legacy_nodes_search_text()
returns trigger
language plpgsql
as $$
begin
  new.search_text := private.compact_search_text(array[
    new.source_id, new.node, new.cmts, new.mac_domain, new.upstream_port,
    new.upstream_connector, new.downstream_port, new.tx_channel, new.mux,
    new.hub, new.dcm, new.return_receiver, new.demux_a, new.demux_b,
    new.index_channel, new.source_file, new.source_sheet, new.warning,
    new.raw_data::text
  ]);
  return new;
end;
$$;

revoke all on function private.compact_search_text(text[]) from public, anon, authenticated;
revoke all on function private.set_noc_assets_search_text() from public, anon, authenticated;
revoke all on function private.set_noc_pon_assets_search_text() from public, anon, authenticated;
revoke all on function private.set_noc_legacy_nodes_search_text() from public, anon, authenticated;
grant execute on function private.compact_search_text(text[]) to service_role;
grant execute on function private.set_noc_assets_search_text() to service_role;
grant execute on function private.set_noc_pon_assets_search_text() to service_role;
grant execute on function private.set_noc_legacy_nodes_search_text() to service_role;

drop trigger if exists set_noc_assets_search_text on public.noc_assets;
create trigger set_noc_assets_search_text
before insert or update on public.noc_assets
for each row execute function private.set_noc_assets_search_text();

drop trigger if exists set_noc_pon_assets_search_text on public.noc_pon_assets;
create trigger set_noc_pon_assets_search_text
before insert or update on public.noc_pon_assets
for each row execute function private.set_noc_pon_assets_search_text();

drop trigger if exists set_noc_legacy_nodes_search_text on public.noc_legacy_nodes;
create trigger set_noc_legacy_nodes_search_text
before insert or update on public.noc_legacy_nodes
for each row execute function private.set_noc_legacy_nodes_search_text();

alter table public.noc_files enable row level security;
alter table public.noc_assets enable row level security;
alter table public.noc_pon_assets enable row level security;
alter table public.noc_legacy_nodes enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.noc_files from public, anon, authenticated;
revoke all on table public.noc_assets from public, anon, authenticated;
revoke all on table public.noc_pon_assets from public, anon, authenticated;
revoke all on table public.noc_legacy_nodes from public, anon, authenticated;
revoke all on table public.audit_logs from public, anon, authenticated;

grant select on table public.noc_files to authenticated;
grant select on table public.noc_assets to authenticated;
grant select on table public.noc_pon_assets to authenticated;
grant select on table public.noc_legacy_nodes to authenticated;
grant insert on table public.audit_logs to authenticated;

grant select, insert, update, delete on table public.noc_files to service_role;
grant select, insert, update, delete on table public.noc_assets to service_role;
grant select, insert, update, delete on table public.noc_pon_assets to service_role;
grant select, insert, update, delete on table public.noc_legacy_nodes to service_role;
grant select, insert, update, delete on table public.audit_logs to service_role;

drop policy if exists "authenticated can read noc files" on public.noc_files;
create policy "authenticated can read noc files"
on public.noc_files
for select
to authenticated
using (true);

drop policy if exists "authenticated can read noc assets" on public.noc_assets;
create policy "authenticated can read noc assets"
on public.noc_assets
for select
to authenticated
using (true);

drop policy if exists "authenticated can read noc pon assets" on public.noc_pon_assets;
create policy "authenticated can read noc pon assets"
on public.noc_pon_assets
for select
to authenticated
using (true);

drop policy if exists "authenticated can read noc legacy nodes" on public.noc_legacy_nodes;
create policy "authenticated can read noc legacy nodes"
on public.noc_legacy_nodes
for select
to authenticated
using (true);

drop policy if exists "authenticated can insert own audit logs" on public.audit_logs;
create policy "authenticated can insert own audit logs"
on public.audit_logs
for insert
to authenticated
with check ((select auth.uid()) = user_id);
