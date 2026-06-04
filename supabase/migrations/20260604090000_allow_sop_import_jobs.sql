alter table public.noc_import_jobs
  drop constraint if exists noc_import_jobs_table_name_check;

alter table public.noc_import_jobs
  add constraint noc_import_jobs_table_name_check
  check (table_name in ('noc_assets', 'noc_pon_assets', 'noc_legacy_nodes', 'noc_sop_assets'));
