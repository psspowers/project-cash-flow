# Deployment

## Environment variables required for production

| Variable | Where to set | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Hosting provider env vars | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Hosting provider env vars | Your Supabase anon/public key |

These must be set on the hosting provider (e.g. Vercel, Netlify) before deploying. Vite embeds them at build time — they are not secret and will appear in the compiled JS bundle. Never put the `service_role` key in frontend environment variables.

---

## Pre-deployment checklist

1. All migrations have been applied to the production Supabase project
2. `npm run build` completes with zero errors
3. `npm run typecheck` completes with zero errors
4. `npm run lint` has no blocking errors
5. Environment variables are set on the hosting provider

---

## Build

```bash
npm run build
```

Output goes to `dist/`. This is a static site — serve the contents of `dist/` from any static hosting provider or CDN.

The build will warn about chunk size (`> 500 kB`). This is expected given the recharts and dnd-kit dependencies. It does not block deployment.

---

## Applying database migrations

Migrations live in `supabase/migrations/` as numbered SQL files. Apply them in filename-alphabetical order (the timestamp prefix guarantees this).

**Option A — Supabase Dashboard SQL editor:**
Paste each migration file's contents and run it. Check for errors before running the next.

**Option B — Supabase MCP tool (in development context):**
Use `mcp__supabase__apply_migration` to apply a migration programmatically.

Never apply migrations out of order. Never re-run a migration that has already been applied — they use `IF NOT EXISTS` guards, but re-running can still cause unexpected state.

---

## Data import files

The `supabase/data_import/` folder contains one-time data population scripts. These are not migrations — they are idempotent data loads tied to specific projects. Do not re-run them in production unless you have confirmed the target data has been cleared first.

---

## Rollback

There is no automatic rollback. If a migration causes a problem:

1. Identify the offending column/table
2. Write a new forward migration that corrects the state
3. Never use `DROP` on a column or table that may still hold data — use `ALTER TABLE … ALTER COLUMN` or add a replacement column

---

## Supabase Edge Functions

If Edge Functions are deployed (check `supabase/functions/`):

- They are deployed via the `mcp__supabase__deploy_edge_function` tool
- Secrets are configured separately in the Supabase dashboard under Edge Functions → Secrets
- The Supabase CLI is not used in this project

---

*Update this file when the hosting provider, build process, or migration strategy changes.*
