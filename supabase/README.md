# Supabase setup for NOC Troubleshooter

This folder is the Supabase-side handoff. It does not require Lovable credits.

## 1. Pick a non-production project first

Use a staging/dev Supabase project first. The migration creates internal lookup tables in the `public` schema and protects them with RLS.

## 2. Apply the migrations

In Supabase Dashboard:

1. Open the target project.
2. Go to SQL Editor.
3. Paste and run the migration files in timestamp order.

Current migration set:

- `supabase/migrations/20260601000000_create_noc_tables.sql`
- `supabase/migrations/20260601083000_harden_noc_supabase.sql`
- `supabase/migrations/20260601090000_admin_roles_imports.sql`
- `supabase/migrations/20260601091500_optimize_user_roles_policy.sql`
- `supabase/migrations/20260603100856_create_noc_sop_assets.sql`
- `supabase/migrations/20260603112600_harden_noc_sop_asset_grants.sql`

If you use Supabase CLI later:

```bash
supabase db push
```

## 3. Verify RLS and grants

Run:

```text
supabase/verification/20260601_verify_noc_security.sql
```

Expected highlights:

- every `noc_*` table and `audit_logs` has `rls_enabled = true`
- `anon can select noc_assets` is `false`
- `anon can select noc_pon_assets` is `false`
- `anon can select noc_legacy_nodes` is `false`
- `authenticated can select noc_assets` is `true`
- `authenticated can update noc_assets` is `false`
- `authenticated can delete noc_assets` is `false`
- `authenticated can insert audit_logs` is `true`
- `authenticated can select audit_logs` is `false`
- `noc_sop_assets` has RLS enabled and only `authenticated` can select SOP screenshots

## 4. Configure Auth

In Supabase Dashboard:

1. Go to Authentication > Providers.
2. Keep Email enabled.
3. Decide whether email confirmation is required before sign-in.
4. Create the internal users under Authentication > Users.

The frontend uses `signInWithPassword`, so users need email/password credentials.

## 5. Bootstrap the first admin

Create the first Supabase Auth user in Dashboard or by invite, then assign the role once from a trusted environment:

```sql
select private.grant_noc_role_by_email('admin@example.com', 'admin');
```

After that, use the `admin-users` Edge Function to invite/create future accounts from a logged-in admin session. Account deletion is not exposed in the website UI. Do not use `user_metadata` for authorization; role checks read `public.user_roles`.

## 6. Import data

Keep raw CSV/Excel outside Git. Use CSV exports and the local import script:

```bash
npm run import:noc -- --file ./private-data/cmts.csv --table noc_assets
npm run import:noc -- --file ./private-data/pon.csv --table noc_pon_assets
npm run import:noc -- --file ./private-data/nodes.csv --table noc_legacy_nodes
```

The script requires local-only environment variables:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_for_local_import_only
```

Do not add the service role key to Lovable.

For a Lovable admin upload flow, call the deployed `noc-import-excel` Edge Function with a base64 Excel/CSV file. The function requires a logged-in `admin` or `editor`, parses the first sheet, writes to the selected NOC table, and records the job in `noc_import_jobs`.

The React app exposes the same flow at `/import` for signed-in `admin` and `editor` users.

Allowed target tables:

- `noc_assets`
- `noc_pon_assets`
- `noc_legacy_nodes`

## 7. Frontend environment values

When Lovable credits are available again, set only:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_public_key
```

The browser key is allowed to exist client-side because RLS and grants protect the tables.

## 8. SOP screenshots

The unmasked Solid IP / CM SOP screenshots live in `public.noc_sop_assets` as authenticated-only rows. They should not be committed to Git or uploaded to public frontend assets.

The optical balance SOP remains as local SVG files in `assets/`, because those diagrams do not contain the same internal request screenshots.
