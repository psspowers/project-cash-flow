# Adding a Feature

A checklist of conventions to follow when adding a new page, data type, or UI component.

---

## 1. Define the TypeScript types first

All shared types live in `src/types/index.ts`. Add interfaces, status union types, and label maps there before writing any component code.

```typescript
// Example: a new type
export interface SiteInspection {
  id: string;
  project_id: string;
  inspection_date?: string;
  passed: boolean;
  notes?: string;
  created_at: string;
}

// Status labels follow the existing pattern
export const INSPECTION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  passed: 'Passed',
  failed: 'Failed',
};
```

---

## 2. Create the database migration

If the feature needs a new table or column, write a migration file:

- File goes in `supabase/migrations/`
- Filename format: `YYYYMMDDHHMMSS_NNN_descriptive_name.sql`
- Start with a detailed comment block explaining what the migration does
- Use `IF NOT EXISTS` / `IF EXISTS` guards
- Always enable RLS on new tables
- Always create the minimum policies needed

Apply the migration using the `mcp__supabase__apply_migration` tool (or paste into the Supabase SQL editor).

Never use `DROP`, `DELETE`, or transaction control statements (`BEGIN`/`COMMIT`) in migrations.

---

## 3. Create the page component

New pages live in `src/pages/`. One file per route. Name it `PascalCase.tsx`.

```
src/pages/SiteInspections.tsx
```

Standard page structure:

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function SiteInspections() {
  const { profile } = useAuth();
  const [data, setData] = useState<SiteInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: rows } = await supabase
      .from('site_inspections')
      .select('*')
      .order('inspection_date', { ascending: false });
    setData(rows ?? []);
    setLoading(false);
  }

  return (/* JSX */);
}
```

---

## 4. Register the route

Add the route to `src/App.tsx`:

```typescript
import SiteInspections from './pages/SiteInspections';

// Inside AppRoutes():
<Route path="/site-inspections" element={<AppLayout><SiteInspections /></AppLayout>} />
```

---

## 5. Add the sidebar link

In `src/components/Layout/Sidebar.tsx`, add an entry to the `navItems` array:

```typescript
{
  to: '/site-inspections',
  icon: <ClipboardCheck size={18} />,
  label: 'Site Inspections',
  roles: ['construction_manager', 'evp', 'ceo'],  // which roles see this link
},
```

Use a `lucide-react` icon. Do not install a different icon library.

---

## 6. Write the Supabase query

Follow these conventions:

- Use `maybeSingle()` not `single()` when expecting zero or one row
- Always handle `error` from the query response
- Normalize joined data immediately after the query — do not pass raw Supabase join objects into state

```typescript
// Fetching with a join:
const { data, error } = await supabase
  .from('site_inspections')
  .select('*, project:projects!project_id(name)')
  .order('created_at', { ascending: false });

// Normalizing the join:
const normalized = (data ?? []).map(row => ({
  ...row,
  project_name: row.project?.name ?? '',
}));
```

---

## 7. Reuse existing UI components

Check `src/components/ui/` before creating new ones:

| Component | Use for |
|---|---|
| `Badge` | Status labels with colour coding |
| `MetricCard` | KPI summary cards |
| `VendorCombobox` | Searchable vendor/entity selector |

Check `src/utils/formatters.ts` for `fmtTHB` and `fmtTHBCompact` before writing currency formatting.

---

## 8. Role-gate the UI (not just the data)

Show/hide actions based on `profile?.role`:

```typescript
const { profile } = useAuth();
// ...
{profile?.role === 'evp' && (
  <button onClick={handleApprove}>Approve</button>
)}
```

RLS enforces the actual access. The role check in the UI is to avoid confusing users with buttons they cannot use.

---

## 9. Run build before committing

```bash
npm run build
npm run typecheck
```

Both must pass with zero errors.

---

*Update this file when a convention changes intentionally — e.g. if a new shared hook replaces the useEffect+loadData pattern.*
