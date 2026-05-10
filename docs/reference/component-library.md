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

---

## NotifToast

`src/components/ui/NotifToast.tsx`

Non-blocking toast notification for high-priority real-time events. Rendered by `AppLayout` in a fixed bottom-right stack. Do not render this component manually — it is injected automatically when a `warning`, `error`, or `alert` notification arrives via Supabase Realtime.

### Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `notification` | `Notification` | Yes | The notification to display |
| `onDismiss` | `() => void` | Yes | Called after auto-dismiss (5s) or manual close |

### Behaviour

- Animates in on mount, animates out on dismiss
- Auto-dismisses after 5 seconds
- Shows a `×` button for manual early dismissal
- Displays the notification's `title` and (if present) `message`
- Uses `NotifTypeIcon` from `Topbar.tsx` for the type indicator

### When toasts fire vs. when they don't

| Type | Toast fires? | Bell updates? |
|---|---|---|
| `warning` | Yes | Yes |
| `error` | Yes | Yes |
| `alert` | Yes | Yes |
| `info` | No | Yes |
| `success` | No | Yes |

---

## Layout components

### AppLayout

`src/components/Layout/AppLayout.tsx`

Shell wrapper for all authenticated pages. Renders Sidebar + Topbar + a main content area + the toast stack. All routes in `App.tsx` are wrapped with `<AppLayout>`.

Owns:
- Notification state (full list, loaded once per session, kept up-to-date via Realtime)
- Released invoice count (for payment badge in sidebar)
- Toast state (high-priority notifications only)

### Sidebar

`src/components/Layout/Sidebar.tsx`

Left navigation. Menu items are defined as an array with `to`, `icon`, `label`, and `roles` fields. Items are hidden when the current user's role is not in the `roles` array. Receives `badges` prop with `{ approvals, payments, alerts }` counts.

### Topbar

`src/components/Layout/Topbar.tsx`

Top bar with optional page title, notification bell, user name/role display, and sign-out button.

- Bell shows a numeric unread count (capped at "9+")
- Dropdown shows up to 15 most recent notifications with Lucide type icons and coloured left-border stripes
- "View all notifications" link routes to `/notifications`
- Exports `notifHref`, `NotifTypeIcon`, and `typeAccent` for reuse in the Notifications inbox page

---

*Update this file when a component's prop interface changes.*
