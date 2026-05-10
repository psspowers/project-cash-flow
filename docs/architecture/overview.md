# System Architecture Overview

## What the system does

PSS Project Management System is a financial operations platform for a solar engineering company. It tracks the full lifecycle of construction projects — from cost estimation through budget approval, procurement, vendor payments, and cash collection — giving management a real-time view of cash flow and project financial health.

---

## Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | React 18 + TypeScript | Strict mode |
| Build tool | Vite 5 | Fast HMR, ESM output |
| Styling | Tailwind CSS 3 | Utility-first, 8px spacing system |
| Routing | React Router DOM 7 | BrowserRouter, nested AppLayout wrapper |
| Backend / database | Supabase (PostgreSQL) | Auth, RLS, real-time subscriptions |
| Supabase client | @supabase/supabase-js 2 | Singleton in `src/lib/supabase.ts` |
| Forms | react-hook-form + zod | Validation at the form boundary only |
| Charts | Recharts 3 | BarChart, ComposedChart with Line/ReferenceLine |
| Drag and drop | @dnd-kit/core + sortable | Used in timeline / ordering views |
| Icons | lucide-react 0.344 | No other icon library |
| Date utilities | date-fns 4 | Formatting and arithmetic |
| Linting | ESLint 9 + typescript-eslint | Strict ruleset |

---

## High-level data flow

```
User browser
    │
    ▼
React SPA (Vite)
    │  auth session via Supabase JS client
    ▼
Supabase Auth ──► user_profiles table (role, full_name)
    │
    │  PostgREST queries (select/insert/update)
    │  Realtime subscriptions (notifications, invoice counts)
    ▼
PostgreSQL (Supabase hosted)
    │  Row Level Security enforces per-role access
    ├── projects, project_costings, variation_orders
    ├── milestones, milestone_invoices
    ├── purchase_orders, po_milestones, po_audit_log
    ├── vendor_invoices, progress_reports
    ├── payment_vouchers, checks
    ├── cash_receipts
    ├── loans, loan_transactions
    ├── project_cash_transfers
    ├── notifications
    └── tax_config, sga_actuals, treasury_adjustments
```

---

## Application entry points

```
src/main.tsx          React root mount
src/App.tsx           BrowserRouter + AuthProvider + route table
src/context/
  AuthContext.tsx     Supabase session + user_profiles fetch
  ProjectDetailContext.tsx  Shared state for the 6-tab project detail view
src/components/
  Layout/
    AppLayout.tsx     Authenticated shell: Sidebar + Topbar + main outlet
                      Also owns notification state and real-time subscriptions
                      Fires high-priority toasts for warning/error/alert types
    Sidebar.tsx       Navigation with role-based visibility and badge counts
    Topbar.tsx        Numeric unread badge, notification dropdown, user avatar
src/pages/            One file per route
src/components/       Shared and feature-specific components
src/types/index.ts    All TypeScript interfaces and enums
src/config/
  roles.ts            Role group constants (PROCUREMENT_WRITE_ROLES, etc.)
  statusConstants.ts  Invoice/PO status group arrays
src/utils/            Pure helper functions
src/services/
  workflow.ts         PO and vendor invoice state machine + notification dispatch
src/lib/supabase.ts   Supabase client singleton
src/hooks/
  useProjectData.ts   All project detail data in one coordinated fetch
  useTaxConfig.ts     VAT and WHT rate from tax_config table
```

---

## Route table

| Path | Page | Notes |
|---|---|---|
| `/dashboard` | Dashboard | KPI cards, cash flow chart, portfolio health |
| `/projects` | Projects | List with status filter |
| `/projects/:id` | ProjectDetail | 6-tab detail view |
| `/purchase-orders` | PurchaseOrders | PO list and creation wizard |
| `/suppliers` | Suppliers | Vendor/entity management |
| `/approvals` | Approvals | Role-filtered approval queue |
| `/payment-queue` | PaymentQueue | Vendor invoice payment planning |
| `/cash-receipts` | CashReceipts | Client payment recording |
| `/treasury` | TreasuryDashboard | Loans, SG&A, treasury adjustments |
| `/loan-ledger` | — | Redirects to `/treasury` |
| `/wht-report` | WHTReport | Withholding tax report |
| `/vat-report` | VATReport | VAT report |
| `/ceo-alerts` | CEOAlerts | Large payment alerts for CEO/EVP |
| `/cash-flow-planner` | CashFlowPlanner | Detailed cash flow planning |
| `/variance` | CostVariance | Budget vs actual variance |
| `/monthly-analyzer` | MonthlyAnalyzer | Monthly financial analysis pivot |
| `/checks` | CheckManagement | Physical check lifecycle management |
| `/workflow` | WorkflowEfficiency | Approval cycle time metrics |
| `/notifications` | Notifications | Full notification inbox with filters |
| `/login` | Login | Email/password auth |

---

## Key design decisions

**Supabase only — no custom API layer.** All queries go through the Supabase JS client directly from the frontend. Edge Functions are available for third-party integrations requiring secret keys.

**RLS as the security boundary.** Every table has Row Level Security enabled. Policies check `auth.uid()` and the user's role from `user_profiles`. Frontend role checks are UI-only (hide/show); the database enforces actual access.

**No global state library.** Auth context is in React Context. Page-level state uses `useState` + `useEffect`. Data is fetched fresh on navigation. `useProjectData` hook encapsulates project detail queries. `ProjectDetailContext` shares loaded data across the 6 project tabs without prop-drilling.

**Forms validate at the boundary.** `react-hook-form` + `zod` schemas handle all user input. Internal functions receive already-validated data and do not defensively re-validate.

**Notifications are an audit log.** Notifications are never deleted — only marked read (`is_read` boolean). The `AppLayout` subscribes to real-time inserts and fires in-app toasts for `warning`, `error`, and `alert` type notifications only. `info` and `success` silently increment the bell counter to avoid toast spam during bulk operations.

**Treasury is event-sourced.** Loan balances are calculated from `loan_transactions` events (drawdown, repayment, interest, fee), not stored as a mutable balance field.

---

*Update this file when a new major dependency is added or an architectural decision changes.*
