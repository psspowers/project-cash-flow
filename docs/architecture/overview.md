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
| Backend / database | Supabase (PostgreSQL) | Auth, RLS, real-time |
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
    ▼
PostgreSQL (Supabase hosted)
    │  Row Level Security enforces per-role access
    ├── projects, project_costings, variation_orders
    ├── milestones, milestone_invoices
    ├── purchase_orders, po_milestones
    ├── vendor_invoices, progress_reports
    ├── payment_vouchers, checks
    ├── cash_receipts
    ├── loans, loan_repayments
    ├── project_cash_transfers
    └── notifications
```

---

## Application entry points

```
src/main.tsx          React root mount
src/App.tsx           BrowserRouter + AuthProvider + route table
src/context/
  AuthContext.tsx     Supabase session + user_profiles fetch
src/components/
  Layout/
    AppLayout.tsx     Authenticated shell (Sidebar + Topbar + outlet)
    Sidebar.tsx       Navigation with role-based visibility
    Topbar.tsx        Current page title, user avatar
src/pages/            One file per route
src/components/       Shared and feature-specific components
src/types/index.ts    All TypeScript interfaces and enums
src/utils/            Pure helper functions
src/lib/supabase.ts   Supabase client singleton
```

---

## Route table

| Path | Page | Notes |
|---|---|---|
| `/dashboard` | Dashboard | KPI cards, cash flow chart, portfolio health |
| `/projects` | Projects | List with status filter |
| `/projects/:id` | ProjectDetail | 6-tab detail view |
| `/purchase-orders` | PurchaseOrders | PO list and creation wizard |
| `/approvals` | Approvals | Role-filtered approval queue |
| `/payment-queue` | PaymentQueue | Vendor invoice payment planning |
| `/cash-receipts` | CashReceipts | Client payment recording |
| `/loan-ledger` | LoanLedger | Loans received and given |
| `/wht-report` | WHTReport | Withholding tax report |
| `/vat-report` | VATReport | VAT report |
| `/ceo-alerts` | CEOAlerts | Large payment alerts for CEO |
| `/cash-flow-planner` | CashFlowPlanner | Detailed cash flow planning |
| `/variance` | CostVariance | Budget vs actual variance |
| `/login` | Login | Email/password auth |

---

## Key design decisions

**Supabase only — no custom API layer.** All queries go through the Supabase JS client directly from the frontend. Edge Functions are available for third-party integrations requiring secret keys.

**RLS as the security boundary.** Every table has Row Level Security enabled. Policies check `auth.uid()` and the user's role from `user_profiles`. Frontend role checks are UI-only (hide/show); the database enforces actual access.

**No global state library.** Auth context is in React Context. Page-level state uses `useState` + `useEffect`. Data is fetched fresh on navigation. `useProjectData` hook encapsulates project detail queries.

**Forms validate at the boundary.** `react-hook-form` + `zod` schemas handle all user input. Internal functions receive already-validated data and do not defensively re-validate.

---

*Update this file when a new major dependency is added or an architectural decision changes.*
