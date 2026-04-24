# Component Library Reference

Shared UI components in `src/components/ui/`. Use these before creating new ones.

---

## Badge

`src/components/ui/Badge.tsx`

Displays a coloured status pill.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `label` | string | Yes | Text displayed inside the badge |
| `variant` | `'green' \| 'amber' \| 'red' \| 'gray' \| 'blue' \| 'default'` | No | Colour scheme. Defaults to `'default'` (gray) |

### Usage

```tsx
import Badge from '../components/ui/Badge';

<Badge label="Approved" variant="green" />
<Badge label="Pending" variant="amber" />
<Badge label="Rejected" variant="red" />
<Badge label="Draft" variant="gray" />
<Badge label="Active" variant="blue" />
```

### Variant colours

| Variant | Background | Text |
|---|---|---|
| `green` | green-100 | green-700 |
| `amber` | amber-100 | amber-700 |
| `red` | red-100 | red-700 |
| `blue` | blue-100 | blue-700 |
| `gray` / `default` | gray-100 | gray-600 |

### Mapping status strings to variants

A common pattern is a helper function on the page:

```typescript
function statusVariant(status: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === 'approved' || status === 'evp_approved' || status === 'active') return 'green';
  if (status === 'pending_approval' || status === 'submitted') return 'amber';
  if (status === 'rejected' || status === 'cm_rejected' || status === 'evp_rejected') return 'red';
  if (status === 'draft') return 'gray';
  return 'blue';
}
```

---

## MetricCard

`src/components/ui/MetricCard.tsx`

KPI summary card with a title, primary value, subtitle, icon, and optional trend indicator.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `title` | string | Yes | Card label (small text above value) |
| `value` | string | Yes | Primary displayed value |
| `sub` | string | No | Subtitle below the value |
| `icon` | ReactNode | No | Icon shown in top-right corner |
| `accent` | `'blue' \| 'green' \| 'amber' \| 'red' \| 'default'` | No | Left border accent colour |
| `trend` | `'up' \| 'down' \| 'neutral'` | No | Arrow indicator |

### Usage

```tsx
import MetricCard from '../components/ui/MetricCard';
import { DollarSign } from 'lucide-react';

<MetricCard
  title="Total Contract Value"
  value="฿42.50M"
  sub="3 active projects"
  icon={<DollarSign size={18} />}
  accent="blue"
/>
```

### Making a card clickable

Wrap with a `div` with `onClick` and `cursor-pointer`:

```tsx
<div onClick={() => navigate('/approvals')} className="cursor-pointer">
  <MetricCard title="Awaiting Action" value="3" accent="amber" />
</div>
```

---

## VendorCombobox

`src/components/ui/VendorCombobox.tsx`

Searchable dropdown for selecting an entity (vendor, client, or any entity type). Supports keyboard navigation.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `value` | string \| null | Yes | Currently selected entity ID |
| `onChange` | `(id: string \| null) => void` | Yes | Called when selection changes |
| `entities` | `Entity[]` | Yes | List of entities to choose from |
| `placeholder` | string | No | Placeholder text when nothing selected |
| `disabled` | boolean | No | Disables the control |

### Usage

```tsx
import VendorCombobox from '../components/ui/VendorCombobox';

const [vendorId, setVendorId] = useState<string | null>(null);

<VendorCombobox
  value={vendorId}
  onChange={setVendorId}
  entities={vendors}
  placeholder="Select vendor..."
/>
```

The component renders the entity's `name` as the display value. Filtering is case-insensitive substring match on the name.

---

## Layout components

### AppLayout

`src/components/Layout/AppLayout.tsx`

Shell wrapper for all authenticated pages. Renders Sidebar + Topbar + a main content area. All routes in `App.tsx` are wrapped with `<AppLayout>`.

### Sidebar

`src/components/Layout/Sidebar.tsx`

Left navigation. Menu items are defined as an array with `to`, `icon`, `label`, and `roles` fields. Items are hidden when the current user's role is not in the `roles` array.

### Topbar

`src/components/Layout/Topbar.tsx`

Top bar with the current page title derived from the route, and the user's avatar initials with a sign-out option.

---

*Update this file when a component's prop interface changes.*
