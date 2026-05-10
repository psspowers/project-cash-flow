# Local Development Setup

For a developer starting from scratch. Follow steps in order.

---

## Prerequisites

- Node.js 18 or later
- npm 9 or later
- A Supabase project (already provisioned — get credentials from the team lead)

---

## Step 1 — Clone and install

```bash
git clone <repository-url>
cd <project-folder>
npm install
```

---

## Step 2 — Configure environment variables

Create a `.env` file in the project root. Copy the values from the team's shared credentials:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Both values are available in the Supabase Dashboard under **Project Settings → API**.

The Supabase client (`src/lib/supabase.ts`) reads these at build time via Vite's `import.meta.env`.

---

## Step 3 — Verify the database is ready

The shared Supabase project already has all migrations applied. To confirm:

1. Open Supabase Dashboard → Table Editor
2. You should see tables: `projects`, `purchase_orders`, `user_profiles`, `notifications`, `loan_transactions`, etc.
3. If tables are missing, apply migrations in filename-alphabetical order from `supabase/migrations/` via the Supabase SQL editor

---

## Step 4 — Create your user account

1. Go to Supabase Dashboard → Authentication → Users → **Add user**
2. Enter your email and a password
3. Copy the generated UUID
4. Run this in the Supabase SQL editor:

```sql
INSERT INTO user_profiles (id, full_name, email, role, avatar_initials)
VALUES (
  '<your-uuid-here>',
  'Your Name',
  'your@email.com',
  'evp',   -- or whichever role you need for testing
  'YN'
);
```

Valid role values: `cost_controller`, `construction_manager`, `evp`, `accounts_supervisor`, `accounts_manager`, `ceo`, `procurement`, `banking_finance_officer`.

---

## Step 5 — Start the dev server

```bash
npm run dev
```

Navigate to `http://localhost:5173`. Log in with the credentials you created in step 4.

The Topbar includes a **Test Mode** role switcher — use it to switch between role views without logging out.

---

## Step 6 — Run type checking

```bash
npm run typecheck
```

This runs `tsc --noEmit` against `tsconfig.app.json`. Fix any errors before committing.

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript type check, no output files |
| `npm run lint` | ESLint across all source files |
| `npm run preview` | Serve the production build locally |

---

## Troubleshooting

**"Invalid API key" error on startup**
Check that `.env` exists and that both variables are set. Vite requires a restart after `.env` changes.

**Login succeeds but profile is missing / role is undefined**
The `user_profiles` row is missing. Run the INSERT from Step 4.

**Blank page after login**
Open the browser console. A Supabase RLS error (status 400 or empty data) usually means the user's role doesn't have read access to the queried table. Check that the role value in `user_profiles` matches one of the eight valid roles exactly.

**Role switcher in Topbar shows wrong role after switch**
The switcher writes to `sessionStorage`. Clear it with `sessionStorage.removeItem('dev_role_override')` in the browser console, or select "Reset to Actual Role" from the dropdown.

---

*Update this file when environment variables, tooling, or the Supabase project URL changes.*
