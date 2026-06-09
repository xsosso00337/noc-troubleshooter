alter table public.noc_assets
  add column if not exists power_level numeric(5,1),
  add column if not exists power_level_raw integer,
  add column if not exists power_level_imported_at timestamptz;

comment on column public.noc_assets.power_level is
  'CMTS downstream power level displayed on optical node lookup. Source raw values such as 400 are divided by 10.';

comment on column public.noc_assets.power_level_raw is
  'Original CMTS power-level value from command text, for example 400, 280, or 415.';

comment on column public.noc_assets.power_level_imported_at is
  'Timestamp when the CMTS power level was last imported for this row.';
