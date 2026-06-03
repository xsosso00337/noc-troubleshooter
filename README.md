# NOC Troubleshooter

Lovable-compatible React app for the NOC troubleshooting tools, protected by Supabase Auth and Supabase Row Level Security.

## What changed

- Static HTML pages were migrated into a React/Vite app.
- Internal lookup data is no longer committed as `data/*.json` or embedded in HTML.
- `/login` uses Supabase Auth email/password.
- Tool routes are protected by `ProtectedRoute`.
- CMTS, PON, and legacy node lookups read from Supabase tables.
- RLS policies allow `authenticated` users to read lookup tables only.
- Normal users cannot update/delete lookup data.
- Admin/editor roles are stored in `user_roles`; role checks are not based on editable user metadata.
- Admin-only Edge Functions can invite users and import Excel/CSV without exposing the service role key.
- Query audit logs can only be inserted by the signed-in user.
- Solid IP / CM SOP screenshots are stored in Supabase behind RLS instead of public frontend assets.
- Admin/editor users can import Excel/CSV from the protected `/import` page.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Set only browser-safe values for the frontend:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_or_anon_public_key
```

Some Lovable/Supabase templates use `VITE_SUPABASE_ANON_KEY` instead of `VITE_SUPABASE_PUBLISHABLE_KEY`. This app accepts either name.

For the Lovable migration branch, `src/lib/supabase.ts` also includes the current browser-safe Supabase URL and publishable key as fallbacks, so the app can connect even if Lovable Build Secrets are not visible. Override them with the `VITE_` variables above if the Supabase project changes.

Do not put a service role key in any `VITE_` variable or Lovable frontend setting.

## Supabase migration

Review these files before applying them:

```text
supabase/migrations/
```

It creates:

- `noc_assets`
- `noc_pon_assets`
- `noc_legacy_nodes`
- `noc_files`
- `audit_logs`
- `user_roles`
- `noc_import_jobs`
- `noc_sop_assets`
- private Storage bucket `noc-imports`

Apply it only after confirming the target Supabase project is not production, or after you are ready to migrate production:

```bash
supabase db push
```

This repo does not run the migration automatically.

## Importing data

CSV and Excel files must not be committed. Keep them in `private-data/`, `imports/`, or another secure local path ignored by Git.

Use CSV headers that match either the original camelCase fields or the new snake_case fields. Unknown columns are preserved in `raw_data`.

```bash
npm run import:noc -- --file ./private-data/cmts.csv --table noc_assets
npm run import:noc -- --file ./private-data/pon.csv --table noc_pon_assets
npm run import:noc -- --file ./private-data/nodes.csv --table noc_legacy_nodes
```

For local import only, add server-side values to `.env`:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_for_local_import_only
```

Never add `SUPABASE_SERVICE_ROLE_KEY` to Lovable frontend environment variables.

## Admin accounts

Admin access has two parts:

1. The person must exist in Supabase Auth as an email/password user.
2. Their Auth user id must have `admin` in `public.user_roles`.

After the first admin exists, the deployed `admin-users` Edge Function can invite or create future users. It requires a logged-in admin JWT and uses the service role key only inside Supabase Edge Functions. User deletion is not exposed in the website UI.

Example Lovable call after login:

```ts
await supabase.functions.invoke("admin-users", {
  body: {
    action: "invite",
    email: "new-user@example.com",
    role: "viewer",
  },
});
```

The first admin should be bootstrapped once by Codex or the Supabase Dashboard after the Auth user exists.

## SOP images

The Solid IP / CM SOP page loads unmasked screenshots from `public.noc_sop_assets` after login. Do not put those screenshots in `assets/`, `public/`, JSON, CSV, or Excel files committed to Git.

The optical balance SOP currently uses the local files below. If an optical SOP image disappears, check these first:

```text
assets/optical-balance-receiver-sop.svg
assets/optical-balance-sop.svg
```

## Excel import from Lovable

The deployed `noc-import-excel` Edge Function accepts a base64 Excel/CSV file from a logged-in `admin` or `editor`, parses the first sheet, writes to the target NOC table, and records the result in `noc_import_jobs`.

The protected `/import` page provides the website upload flow for:

- CMTS / optical node data: `noc_assets`
- PON data: `noc_pon_assets`
- legacy node data: `noc_legacy_nodes`

```ts
await supabase.functions.invoke("noc-import-excel", {
  body: {
    table: "noc_assets",
    filename: file.name,
    base64: fileAsBase64,
    replaceSource: true,
  },
});
```

Allowed tables are `noc_assets`, `noc_pon_assets`, and `noc_legacy_nodes`. Unknown spreadsheet columns are preserved in `raw_data`.

## Updating data

1. Export the latest internal spreadsheet as CSV outside the repo.
2. Run the import script from a trusted local machine or CI secret environment.
3. Confirm row counts in `noc_files`.
4. Test lookups while signed in.
5. Do not commit CSV, Excel, generated JSON, `.env`, or raw internal data.

## Security notes

- The latest working tree removes committed internal JSON from the app, but the old public Git history may still contain it.
- If the previous JSON contents are sensitive, purge Git history and rotate any exposed internal references as needed.
- The frontend uses only the Supabase publishable/anon key.
- RLS, grants, and policies are defined in the migration.
- `anon` has no select grant and no select policy for internal tables.
