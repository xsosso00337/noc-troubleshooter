revoke all on table public.noc_sop_assets from public, anon, authenticated;
grant select on table public.noc_sop_assets to authenticated;
grant select, insert, update, delete on table public.noc_sop_assets to service_role;
