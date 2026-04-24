# Supabase Query Patterns

Common patterns, conventions, and gotchas for querying the database.

---

## Client setup

The Supabase client is a singleton at `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

Import it everywhere as:
```typescript
import { supabase } from '../lib/supabase';
```

---

## `maybeSingle()` vs `single()`

Always use `maybeSingle()` when you expect zero or one row.

```typescript
// Correct — returns null if not found, no error
const { data, error } = await supabase
  .from('user_profiles')
  .select('*')
  .eq('id', userId)
  .maybeSingle();

// Wrong — throws a PostgrestError if no row matches
const { data, error } = await supabase
  .from('user_profiles')
  .select('*')
  .eq('id', userId)
  .single();
```

Use `single()` only when the row is guaranteed to exist (e.g. fetching a row you just inserted by its returned ID).

---

## Joining through a foreign key

Use the `!column_name` syntax to specify which foreign key to join through when there are multiple foreign keys to the same table:

```typescript
// po_milestones has a FK to purchase_orders via purchase_order_id
supabase
  .from('po_milestones')
  .select('*, purchase_order:purchase_orders!purchase_order_id(project_id, approved_by)')
```

Without the `!purchase_order_id` hint, PostgREST may fail to resolve the join if the table has more than one FK to the target.

The joined object comes back as a nested object:

```typescript
// Raw result shape
{
  purchase_order_id: 'uuid',
  amount_due: 100000,
  purchase_order: {
    project_id: 'uuid',
    approved_by: 'uuid' | null
  }
}
```

---

## Normalizing join results

After a query with joins, normalize immediately — do not pass raw join objects into component state:

```typescript
const normalized = (data ?? []).map((pm: {
  purchase_order_id: string;
  amount_due: number;
  purchase_order: { project_id: string; approved_by: string | null } | null;
}) => ({
  project_id: pm.purchase_order?.project_id ?? '',
  purchase_order_id: pm.purchase_order_id,
  amount_due: pm.amount_due,
  is_approved: pm.purchase_order?.approved_by != null,
}));
```

Filter out rows where a required joined field resolved to empty:

```typescript
.filter(row => row.project_id !== '')
```

---

## Parallel fetching with Promise.all

For pages that need multiple queries, use `Promise.all` to run them concurrently:

```typescript
const [
  { data: projects },
  { data: milestones },
  { data: purchaseOrders },
] = await Promise.all([
  supabase.from('projects').select('*'),
  supabase.from('milestones').select('*'),
  supabase.from('purchase_orders').select('*'),
]);
```

Each query is independent so they run in parallel. This is significantly faster than sequential awaits.

---

## Upsert

Use upsert when you want to insert or update based on a unique key:

```typescript
await supabase
  .from('project_views')
  .upsert(
    { project_id: id, user_id: userId, viewed_at: new Date().toISOString() },
    { onConflict: 'project_id,user_id' }
  );
```

---

## Filtering

```typescript
// Equality
.eq('status', 'draft')

// Not equal
.neq('status', 'paid')

// In a list
.in('status', ['draft', 'pending_approval'])

// Less than or equal
.lte('planned_payment_date', '2026-07-31')

// Is null / is not null
.is('approved_by', null)
.not('approved_by', 'is', null)
```

---

## Ordering

```typescript
.order('created_at', { ascending: false })   // newest first
.order('milestone_number', { ascending: true })
```

---

## RLS debugging checklist

When a query returns empty data unexpectedly:

1. **Check authentication** — is the user actually logged in? `supabase.auth.getSession()` should return a session.
2. **Check the role** — does the user's `user_profiles.role` match what the RLS policy expects?
3. **Check the policy** — open Supabase Dashboard → Authentication → Policies and read the policy for the table and operation (SELECT / INSERT / UPDATE / DELETE).
4. **Test in SQL editor** — run the query as a superuser to see if rows exist at all.
5. **Check for 400 vs 403** — a 400 usually means a malformed query; a 403 or empty result often means RLS blocked it.

---

## Common mistake: async inside onAuthStateChange

Do not use `await` directly in the `onAuthStateChange` callback — it can deadlock the Supabase client.

```typescript
// Correct
supabase.auth.onAuthStateChange((event, session) => {
  (async () => {
    const { data } = await supabase.from('user_profiles').select('*').maybeSingle();
    // ...
  })();
});

// Wrong — can deadlock
supabase.auth.onAuthStateChange(async (event, session) => {
  const { data } = await supabase.from('user_profiles').select('*').maybeSingle();
});
```

---

*Add new patterns here as they emerge during development.*
