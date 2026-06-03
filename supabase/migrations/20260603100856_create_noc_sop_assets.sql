create table if not exists public.noc_sop_assets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  slug text not null unique,
  title text not null,
  caption text,
  sort_order integer not null,
  content_type text not null,
  width integer,
  height integer,
  image_base64 text not null,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint noc_sop_assets_category_check check (category in ('static_ip', 'cm_upgrade', 'optical')),
  constraint noc_sop_assets_content_type_check check (content_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  constraint noc_sop_assets_dimensions_check check (
    (width is null or width > 0)
    and (height is null or height > 0)
  )
);

create index if not exists noc_sop_assets_category_sort_idx
  on public.noc_sop_assets (category, sort_order);

alter table public.noc_sop_assets enable row level security;

drop policy if exists "authenticated can read noc sop assets" on public.noc_sop_assets;
create policy "authenticated can read noc sop assets"
  on public.noc_sop_assets
  for select
  to authenticated
  using (true);

revoke all on table public.noc_sop_assets from public, anon, authenticated;
grant select on table public.noc_sop_assets to authenticated;
grant select, insert, update, delete on table public.noc_sop_assets to service_role;
