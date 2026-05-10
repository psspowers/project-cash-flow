# Authentication and Roles

## Authentication mechanism

The system uses Supabase email/password authentication. There are no magic links, social providers, or SSO. Email confirmation is disabled — accounts are created by an administrator directly in the Supabase dashboard or via the `setupUsers` utility.

Session management is handled by `src/context/AuthContext.tsx`. On mount it calls `supabase.auth.getSession()`, then subscribes to `onAuthStateChange`. When a session exists it fetches the matching row from `user_profiles` to load the user's role and display name.

---

## Roles

Eight roles exist in the system. The `role` column on `user_profiles` controls what each user sees and can do.

| Role constant | Display name | Primary responsibility |
|---|---|---|
| `cost_controller` | Cost Controller | Creates and submits project costings and POs |
| `construction_manager` | Construction Manager | First-level approver for costings and progress reports |
| `evp` | EVP | Final approver for costings, mid-value POs, vendor invoices, cash transfers |
| `accounts_supervisor` | Accounts Supervisor | Manages vendor invoices, payment planning, vouchers |
| `accounts_manager` | Accounts Manager | Signs off vouchers requiring manager approval (≥ ฿3M) |
| `ceo` | CEO | Final approver for high-value POs and cash transfers; sees CEO alerts |
| `procurement` | Procurement | Creates POs, manages suppliers |
| `banking_finance_officer` | Banking & Finance Officer | Treasury and cash flow management |

---

## Role groups (src/config/roles.ts)

Avoid checking individual roles in scattered `if` statements. Use these group constants:

| Constant | Members |
|---|---|
| `PROCUREMENT_WRITE_ROLES` | cost_controller, procurement |
| `PROCUREMENT_READ_ROLES` | cost_controller, procurement, accounts_supervisor, accounts_manager, evp, ceo |
| `ANALYZER_ROLES` | cost_controller, accounts_supervisor, accounts_manager, evp, ceo |
| `FINANCE_ROLES` | accounts_manager, accounts_supervisor, ceo |

```typescript
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../config/roles';
if (hasRole(profile?.role, PROCUREMENT_WRITE_ROLES)) { /* show create button */ }
```

---

## Permission matrix

### Project costings

| Action | cost_controller | construction_manager | evp | ceo |
|---|---|---|---|---|
| Create / edit draft | Yes | | | |
| Submit for CM review | Yes | | | |
| CM approve / reject | | Yes | | |
| EVP approve / reject | | | Yes | |

### Purchase orders

Approval is routed by **PO value threshold**:

| Action | cost_controller | procurement | construction_manager | evp | ceo |
|---|---|---|---|---|---|
| Create draft PO | Yes | Yes | | | |
| Submit for approval | Yes | Yes | | | |
| CC approve / reject (all values) | Yes | | | | |
| CM approve / reject PO < ฿1M | | | Yes | | |
| EVP approve / reject PO ฿1M – ฿5M | | | | Yes | |
| CEO approve / reject PO ≥ ฿5M | | | | | Yes |
| Monitor all pending (read-only) | Yes | | | | |
| View all POs | Yes | Yes | Yes | Yes | Yes |

Threshold constants in `src/services/workflow.ts`: `PO_THRESHOLD_CM = 1_000_000`, `PO_THRESHOLD_EVP = 5_000_000`.

### Vendor invoices and progress reports

| Action | accounts_supervisor | construction_manager | evp |
|---|---|---|---|
| Record vendor invoice | Yes | | |
| Submit progress report | Yes | | |
| CM approve progress report | | Yes | |
| EVP approve vendor invoice | | | Yes |
| Plan payment dates | Yes | | |

### Payment vouchers

| Action | accounts_supervisor | accounts_manager | ceo |
|---|---|---|---|
| Create voucher | Yes | | |
| Approve voucher < ฿3M | Auto-approved | | |
| Approve voucher ≥ ฿3M | | Yes | |
| CEO notification for ≥ ฿3M | | | Notified |

### Cash transfers between projects

| Action | evp | ceo |
|---|---|---|
| Recommend transfer | Yes | |
| Final approval | | Yes |

### CEO Alerts

| Role | Sees CEO Alerts page |
|---|---|
| `ceo` | Yes |
| `evp` | Yes |
| All others | No |

---

## Sidebar visibility by role

The sidebar hides menu items the current user's role cannot access. This is a UX convenience only — RLS enforces actual access at the database level.

| Menu item | Visible to |
|---|---|
| Dashboard | All |
| Projects | All |
| Purchase Orders | All |
| Suppliers | All |
| Approvals | All (badge shows their own pending count) |
| Payment Queue | accounts_supervisor, accounts_manager, evp, ceo |
| Cash Receipts | accounts_supervisor, accounts_manager, evp, ceo |
| Treasury | accounts_supervisor, accounts_manager, banking_finance_officer, evp, ceo |
| WHT Report | accounts_supervisor, accounts_manager, evp, ceo |
| VAT Report | accounts_supervisor, accounts_manager, evp, ceo |
| CEO Alerts | ceo, evp |
| Cash Flow Planner | evp, ceo, banking_finance_officer |
| Cost Variance | All |
| Monthly Analyzer | cost_controller, accounts_supervisor, accounts_manager, evp, ceo |
| Checks | accounts_supervisor, accounts_manager, evp, ceo |
| Workflow | evp, ceo |
| Notifications | All (via bell icon in Topbar → /notifications) |

---

## How role checks work in the frontend

```typescript
// Reading the current user's role:
const { profile } = useAuth();
if (profile?.role === 'evp') { /* show approve button */ }

// Using group constants (preferred):
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../config/roles';
if (hasRole(profile?.role, PROCUREMENT_WRITE_ROLES)) { /* show PO create button */ }
```

The `useAuth()` hook returns `{ user, profile, loading, signOut, refreshProfile }`. `profile` is the `user_profiles` row — it includes `role`, `full_name`, and `avatar_initials`.

---

## Development: test role switcher

A role switcher is visible in the Topbar during development. It stores an override in `sessionStorage` under `dev_role_override`. The `AuthContext` reads this value and returns a mocked profile role, enabling single-account testing of all role views without logging out.

---

## Creating a new user

1. Create the auth account in Supabase Dashboard → Authentication → Users
2. Insert a matching row into `user_profiles`:

```sql
INSERT INTO user_profiles (id, full_name, email, role, avatar_initials)
VALUES (
  '<auth-user-uuid>',
  'Jane Smith',
  'jane@example.com',
  'accounts_supervisor',
  'JS'
);
```

The `id` must match the UUID from `auth.users`. Valid role values are: `cost_controller`, `construction_manager`, `evp`, `accounts_supervisor`, `accounts_manager`, `ceo`, `procurement`, `banking_finance_officer`.

---

*Update this file when roles are added, renamed, or when permission boundaries change.*
