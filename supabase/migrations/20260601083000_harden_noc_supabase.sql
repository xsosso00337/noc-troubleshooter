create schema if not exists extensions;

alter extension pg_trgm set schema extensions;

alter function private.compact_search_text(text[]) set search_path = pg_catalog;
alter function private.set_noc_assets_search_text() set search_path = pg_catalog, private;
alter function private.set_noc_pon_assets_search_text() set search_path = pg_catalog, private;
alter function private.set_noc_legacy_nodes_search_text() set search_path = pg_catalog, private;

create index if not exists noc_files_imported_by_idx on public.noc_files (imported_by);
create index if not exists noc_assets_source_file_id_idx on public.noc_assets (source_file_id);
create index if not exists noc_pon_assets_source_file_id_idx on public.noc_pon_assets (source_file_id);
create index if not exists noc_legacy_nodes_source_file_id_idx on public.noc_legacy_nodes (source_file_id);
