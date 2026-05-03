# Authentication and Roles

## Authentication mechanism

The system uses Supabase email/password authentication. There are no magic links, social providers, or SSO. Email confirmation is disabled — accounts are created by an administrator directly in the Supabase dashboard or via the `setupUsers` utility.

Session management is handled by `src/context/AuthContext.tsx`. On mount it calls `supabase.auth.getSession()`, then subscribes to `onAuthStateChange`. When a session exists it fetches the matching row from `user_profiles` to load the user's role and display name.

---

## Roles

Six roles exist in the system. The `role` column on `user_profiles` controls what each user sees and can do.

| Role constant | Display name | Primary responsibility |
|---|---|---|
| `cost_controller` | Cost Controller | Creates and submits project costings and POs |
| `construction_manager` | Construction Manager | First-level approver for costings and progress reports |
| `evp` | EVP | Final approver for costings, POs, vendor invoices, cash transfers |
| `accounts_supervisor` | Accounts Supervisor | Manages vendor invoices, payment planning, vouchers |
| `accounts_manager` | Accounts Manager | Signs off vouchers requiring manager approval (≥ ฿3M) |
| `ceo` | CEO | Final approver for large payments and cash transfers; sees CEO alerts |

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

Approval is routed by **PO value threshold** (verified 2026-05-03 from `src/pages/Approvals.tsx`):

| Action | cost_controller | construction_manager | evp | ceo |
|---|---|---|---|---|
| Create draft PO | Yes | | | |
| Submit for approval | Yes | | | |
| Approve / reject PO < ฿1M | | Yes | | |
| Approve / reject PO ฿1M – ฿5M | | | Yes | |
| Approve / reject PO ≥ ฿5M | | | | Yes |
| Monitor all pending (read-only) | Yes | | | |
| View all POs | Yes | Yes | Yes | Yes |

Constants in code: `PO_THRESHOLD_CM = 1_000_000` and `PO_THRESHOLD_EVP = 5_000_000`

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
| Approvals | All (badge shows their own pending count) |
| Payment Queue | accounts_supervisor, accounts_manager, evp, ceo |
| Cash Receipts | accounts_supervisor, accounts_manager, evp, ceo |
| Loan Ledger | accounts_supervisor, accounts_manager, evp, ceo |
| WHT Report | accounts_supervisor, accounts_manager, evp, ceo |
| VAT Report | accounts_supervisor, accounts_manager, evp, ceo |
| CEO Alerts | ceo, evp |
| Cash Flow Planner | evp, ceo |
| Cost Variance | All |

---

## How role checks work in the frontend

```typescript
// Reading the current user's role:
const { profile } = useAuth();
if (profile?.role === 'evp') { /* show approve button */ }

// Pending approval count is role-aware:
const pendingCount = getPendingApprovals(profile?.role, pendingReports, vouchers, pendingCostings);
```

The `useAuth()` hook returns `{ user, profile, loading }`. `profile` is the `user_profiles` row — it includes `role`, `full_name`, and `avatar_initials`.

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

The `id` must match the UUID from `auth.users`.

---

*Update this file when roles are added, renamed, or when permission boundaries change.*
