# PSS Power Solutions — Master Architect Brief
*Paste this document at the start of every new chat session to restore full context.*
*Last updated: April 2026*

---

## 1. Working Contract

**You (Claude)** are the **Chief Architect**. You hold the full system picture, diagnose problems, write precise briefs for Bolt, and give the product owner clear recommendations before any code is written.

**The product owner** is the innovator and decision-maker. They set direction, validate expected behaviour, and make final calls.

**Bolt.new** is the junior developer. He is capable and fast but needs precise, well-contextualised briefs to do his best work.

**Brief standard — every brief to Bolt must include:**
- Role declaration
- Task title in caps
- Context section explaining WHY (root cause, not just what to change)
- File path(s) to change
- Numbered steps with exact find/replace code blocks
- "What not to touch" section
- **Expected behaviour after fix** — what the user sees in the browser in plain English (this is the testable spec)
- Verification steps

---

## 2. What This System Is

A bespoke financial operations platform for **PSS Power Solutions**, a solar EPC (Engineering, Procurement, Construction) company operating in Thailand. Manages large-scale solar projects from estimation through construction to completion, with contract values in the tens to hundreds of millions of Thai Baht.

Replaces spreadsheet-based cash flow tracking and approval chains. Used daily by six roles.

### The 6 User Roles

| Role | Responsibilities |
|---|---|
| **Cost Controller** | Tracks budgets, raises costings, creates POs, monitors spend |
| **Construction Manager (CM)** | First-level approver for costings, progress reports, PO milestones |
| **EVP** | Second-level approver, recommends margin transfers, signs off large commitments |
| **CEO** | Final authority, receives exception alerts for payments ≥฿3M, cost overruns, rejections |
| **Accounts Supervisor** | Manages payment vouchers, checks, vendor payments |
| **Accounts Manager** | Payment approvals |

Every screen and every data action is gated by role. The approval chain is real — nothing moves from draft to paid without the correct sequence of sign-offs.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| Routing | React Router v7 |
| State | React Context + useState (no external state lib) |
| Data | Supabase JS v2 (PostgreSQL) |
| Auth | Supabase Auth (email/password, session-based) |
| Charts | Recharts |
| Drag and Drop | @dnd-kit/sortable |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Date utilities | date-fns |

---

## 4. The 9-File Architecture (ProjectDetail refactor — completed)

The original `ProjectDetail.tsx` was 3,102 lines. It was refactored into 9 focused files.

```
src/
  hooks/
    useProjectData.ts              — all 8 Supabase queries, exposes reload()

  context/
    ProjectDetailContext.tsx       — shared state contract + derived values

  pages/
    ProjectDetail.tsx              — 151-line shell (tab bar + context provider)

  components/project/
    projectDetailConstants.ts     — category maps, status banners, emptyCosting()

    tabs/
      OverviewTab.tsx             — KPIs, Revenue S-Curve, Margin Transfer
      CostingTab.tsx              — estimation/budget workflow, VOs, modals
      VarianceTab.tsx             — read-only budget vs actual table
      OrdersTab.tsx               — PO list, new PO modal, DB writes
      CashflowTab.tsx             — Cash In/Out schedules, reschedule modal
      TimelineTab.tsx             — S-curve chart, invoice history tables
```

**Pattern:** Hook owns all data fetching → Context shares data + derived values → Shell wires tabs → Each tab is self-contained with its own modals and DB writes.

---

## 5. The 18 Database Tables

| Table | Purpose |
|---|---|
| `projects` | Master project record — name, contract value, client, status |
| `project_costings` | Estimation and budget cost breakdowns (10 categories, 2 stages) |
| `variation_orders` | Post-budget cost/revenue adjustments with approval chain |
| `client_milestones` | Client revenue payment plan (% milestones, planned dates) |
| `client_invoices` | Invoices raised to client with received amounts |
| `purchase_orders` | Vendor procurement — approved_by is NULL if not EVP-approved |
| `po_milestones` | Supplier payment schedules linked via purchase_order_id (NOT project_id directly) |
| `vendor_invoices` | Invoices received from vendors, linked to POs |
| `payment_vouchers` | Internal payment requests |
| `checks` | Physical check issuance records |
| `entities` | Vendors, clients, subsidiaries, lenders |
| `loans` | Received and given loan records |
| `loan_repayments` | Repayment schedule and actuals |
| `progress_reports` | Construction progress with checklist |
| `project_cash_transfers` | Inter-project margin moves |
| `cash_receipts` | **LEGACY — retired, no longer written to** |
| `user_profiles` | Role, name, email per user |
| `notifications` | In-app alert feed |

### Critical schema facts

**`purchase_orders` approval:**
- No `evp_approved` status field
- Approval tracked via `approved_by` (UUID, null = not approved) and `approved_at`
- Status values in production: `fully_paid` (213), `partially_paid` (26), `draft` (24)

**`po_milestones` has NO `project_id`:**
- Links to project via `purchase_order_id` → `purchase_orders.project_id`
- Must join through purchase_orders to get project_id
- Status values: `pending` (18), `paid` (2), `invoiced` (1)

**`client_invoices` valid status values:**
- `pending` | `partially_received` | `received`
- `partially_received` IS VALID — clients frequently pay invoices in tranches.
  When an accounts user records a partial payment, status becomes `partially_received`.
  When fully paid, status becomes `received`.
- The CashReceipts page handles this correctly — it updates `received_amount` and
  sets status to `partially_received` or `received` based on whether the full amount is met.

**`cash_receipts` is retired:**
- Legacy table, still exists in DB but no longer written to
- All client payment data now lives in `client_invoices`
- Audit required: confirm no other pages still read from it

---

## 6. The Schema Migration — 7 Patches (ALL COMPLETE)

The system migrated from old tables (`milestones`, `milestone_invoices`, `cash_receipts`) to new tables (`client_milestones`, `client_invoices`). All 7 patches were applied by Bolt during the refactor and verified across all 9 files.

### Sanity check — these strings must have zero occurrences across all files:
`cash_receipts` / `milestone_invoices` / `setMilestones`

> **NOTE:** `partially_received` IS a valid status on both `client_invoices` and `client_milestones`. Do NOT flag it as forbidden. The migration removed it from OLD incorrect usage only. / `setReceipts` / `CashReceipt` / `MilestoneInvoice` / `msRes` / `miRes` / `receiptRes` / `receipts.map` 

> **NOTE:** `receipt_date` is the CORRECT field on `client_invoices` for the bank-cleared payment date. Do NOT flag it as forbidden. Only `invoice_date` used for cash-received bucketing is wrong.

### What changed per file:
- **`useProjectData.ts`** — Patches 1+2+3: removed old type imports, removed dead state hooks, dropped 3 old DB queries from Promise.all
- **`ProjectDetailContext.tsx`** — Patch 1: clean interface, no legacy types
- **`OverviewTab.tsx`** — Patch 5: removed `|| i.status === 'partially_received'` from invoicedAwaiting filter
- **`CashflowTab.tsx`** — Patch 6: same removal from totalCIInvoicedPending filter
- **`TimelineTab.tsx`** — Patch 4: buildCashFlowData reads clientInvoices.received_amount for historical income; Patch 7: replaced dead Cash Receipts table with Client Receipts — Invoice History (filtered to received_amount > 0, uses Badge component)

---

## 7. The Excel R2 Model — Complete Logic

The file `Projects_Income__Expense__R2.xlsx` is the master cash flow planning workbook that the finance team uses. Our database system must replicate its logic exactly.

### Three sheets

**Invoice sheet** — Income side. One block per project showing all client payment milestones with invoice numbers, dates, paid amounts, and monthly distribution columns.

**PO sheet** — Cost side. One block per project showing all purchase orders, their supplier invoices, and monthly payment distribution columns.

**Summary sheet** — Built by the `syncSummary()` Office.js function which reads pre-aggregated rows from Invoice and PO sheets.

### The sync function logic

The Summary is NOT built from individual transaction rows. It reads two pre-aggregated rows per project:
- **CASH IN row** from Invoice sheet (one per project)
- **Cash Out row** from PO sheet (one per project)

### Source rows by project

| Project | Invoice CASH IN row | PO Cash Out row | Summary Income row | Summary Cost row |
|---|---|---|---|---|
| LPF2 Meat Frozen | 14 | 13 | 4 | 16 |
| RCP | 29 | 28 | 5 | 17 |
| Khon Kaen University | 41 | 51 | 6 | 18 |
| Walailak University | 53 | 132 | 7 | 19 |
| Naresuan University | 66 | 269 | 8 | 20 |
| Nanaphan | 77 | 355 | 9 | 21 |
| Renaissance | 89 | 424 | 10 | 22 |
| LPF | 101 | 505 | 11 | 23 |

### Column mapping — Invoice sheet → Summary (Income section)

| Summary col | Invoice col idx | Field meaning |
|---|---|---|
| C | 9 (J) | Total Invoice Value (contract incl. VAT) |
| D | 13 (N) | Paid (actually received from client) |
| E | 14 (O) | Invoiced & Pending (raised but client not paid) |
| F | 15 (P) | Not Yet Invoiced |
| G → AB | 16 → 37 | Monthly cash: **Jan 2025 → Oct 2026** (22 months) |

### Column mapping — PO sheet → Summary (Cost section)

| Summary col | PO col idx | Field meaning |
|---|---|---|
| C | 9 (J) | Total Contract Value (all POs) |
| D | 12 (M) | Total Invoiced by suppliers |
| E | 13 (N) | Paid to suppliers |
| F | 14 (O) | Supplier invoiced but we haven't paid yet |
| AC | 16 (Q) | **Dec 2024** (PO costs start before income) |
| G → AB | 17 → 38 | Monthly costs: **Jan 2025 → Oct 2026** (22 months) |
| AD | 39 (AN) | Nov 2026 |
| AE | 40 (AO) | Dec 2026 |

### The full date range decoded

Excel serial numbers decoded to real months:

| Serial | Month | Summary col |
|---|---|---|
| 45627 | Dec 2024 | AC (PO only) |
| 45658 | Jan 2025 | G |
| 45689 | Feb 2025 | H |
| 45717 | Mar 2025 | I |
| 45748 | Apr 2025 | J |
| 45778 | May 2025 | K |
| 45809 | Jun 2025 | L |
| 45839 | Jul 2025 | M |
| 45870 | Aug 2025 | N |
| 45901 | Sep 2025 | O |
| 45931 | Oct 2025 | P |
| 45962 | Nov 2025 | Q |
| 45992 | Dec 2025 | R |
| 46023 | Jan 2026 | S |
| 46054 | Feb 2026 | T |
| 46082 | Mar 2026 | U |
| 46114 | Apr 2026 | V |
| 46146 | May 2026 | W |
| 46178 | Jun 2026 | X |
| 46210 | Jul 2026 | Y |
| 46242 | Aug 2026 | Z |
| 46274 | Sep 2026 | AA |
| 46306 | Oct 2026 | AB |
| 46338 | Nov 2026 | AD (PO only) |
| 46370 | Dec 2026 | AE (PO only) |

### How monthly columns work — critical insight

**The monthly columns contain BOTH actuals and planned amounts in the same cells.** Past months show what was actually paid/received. Future months show what is planned. There is no flag — the distinction is purely time-based.

This is exactly how the dashboard Combined chart mode should work.

### Database → Excel column mapping

| Excel monthly column (past month) | Database source |
|---|---|
| Income actual | `client_invoices.received_amount` grouped by `invoice_date` month |
| Cost actual | `vendor_invoices.received_amount` grouped by `invoice_date` month |

| Excel monthly column (future month) | Database source |
|---|---|
| Income planned | `client_milestones.payment_plan_amount` grouped by `planned_receive_date` month |
| Cost planned | `po_milestones.amount_due` grouped by `planned_payment_date` month |

### The Excel includes ALL purchase orders

The PO Cash Out rows include every PO regardless of approval status — draft, partial, fully paid, consulting fees, site management, everything. This is the correct behaviour. Our dashboard must match this.

---

## 8. Dashboard — Current State

### What was fixed

**Bug: Cash In showing zero on chart and YTD KPI**
- Root cause: `invoice_date` is NULL on all EPC invoices. The correct field for bank-cleared payments is `receipt_date`.
- Fixed across 7 files: all cash-in calculations now use `receipt_date`. `invoice_date` is only used for VAT reporting.
- Rule: `receipt_date` = bank cleared date (cash reality). `invoice_date` = PSS billing date (VAT only).

### What was added

**3-button chart toggle (Historical / Forecast / Combined):**
- **Historical** — last 13 months actual bar chart (original)
- **Forecast** — next 9 months planned inflows vs outflows with cumulative net line
- **Combined** — last 3 months actual (solid bars) + next 6 months forecast (50% opacity bars) with "Today" reference line

**5th KPI card — Net 90-Day Position:**
- Shows net of all planned inflows minus outflows in next 90 days
- Green when positive, red when negative
- Shows "X projects at risk" when negative
- Clicking it switches chart to Forecast mode

**Portfolio Health Row:**
- Added Next In, Next Out, 30-Day Net columns to project table
- Rows with negative 30-Day Net highlighted red with warning triangle

**Two new Supabase queries added to Dashboard loadData:**
- `client_milestones` — unpaid milestones with planned_receive_date
- `po_milestones` — via join through purchase_orders to get project_id AND approved_by

### Work in progress — PO approval split on forecast chart

**The current problem:** The forecast red bars only show PO milestones with `approved_by` not null. This makes the forecast look unrealistically positive. The Excel includes ALL POs.

**The fix being implemented:**
- Bring `approved_by` through the `purchase_orders` join in the `po_milestones` query
- Tag each milestone with `is_approved: boolean`
- Split the outflow bars into two stacked layers:
  - **Dark red** — EVP-approved PO milestones
  - **Light red (35% opacity)** — draft/unapproved PO milestones
- Update tooltip to show "Committed Out (Approved)" and "Pending Out (Draft POs)" separately
- Cumulative net line calculates against TOTAL of both layers

**Steps completed so far:**
1. State variable type updated to include `is_approved`
2. Supabase query updated to join `approved_by` from purchase_orders
3. Normalization updated to set `is_approved = pm.purchase_order?.approved_by != null`
4. Forecast data split into `outflowApproved` and `outflowDraft` fields
5. **Still needed:** Update the chart JSX to render two stacked Bar components

---

## 9. Known Gaps — Priority Order

### Tier 1 — Fix Now (functional gaps)

**Error boundaries** — No React error boundaries anywhere. A single render failure in any tab crashes the entire project detail view silently. Add at minimum at the tab level in `ProjectDetail.tsx`.

**WHT and VAT rates hardcoded** — 3% WHT and 7% VAT are hardcoded in multiple files. Any rate change requires a code deployment. Must move to a `tax_config` table in Supabase.

**`cash_receipts` table audit** — Table still exists in DB, code no longer writes to it, but other pages (WHT report, VAT report, dashboard KPIs) may still read from it. Audit required before retiring.

**Loan Ledger broken link** — `/loans` route does not exist. Feature is partially built. Either complete it or remove the link.

### Tier 2 — Fix Soon (UX and workflow)

**Orphan vendor invoices have no UI** — Tracked in code but no dedicated screen for accounts team to investigate or resolve.

**CEO approval threshold unvalidated** — Unknown whether CEO sign-off is required for budgets above a certain value. Business rule needs validating.

**New Project creation** — Client entity selection is optional but essential for the full workflow. Validation needs tightening.

**Project search** — Queries by name only. No filtering by status, client, date range.

### Tier 3 — Plan For (technical health)

**Bundle size** — 1.16 MB production JS, no code splitting. Dynamic imports needed for heavy pages.

**Query performance** — Vendor invoice query is relational and runs on every project load. Will need indexed views at scale.

**No duplicate-alert prevention at DB level** — Cost overrun notification deduplication is in application code only. Race condition possible.

**State management** — useState + Context pattern will strain if cross-page shared state is needed. Evaluate Zustand before next major feature cycle.

---

## 10. Full Feature Set (What Has Been Built)

**Project Lifecycle** — Estimation → Budget → Active → Completed status flow with contract value, client entity, and start date.

**Costing Cycle** — Two stages (Estimation + Budget) across 10 fixed cost categories. Full approval chain: Draft → Submitted → CM Approved → EVP Approved with timestamps.

**Variation Orders** — Post-budget revenue and cost adjustments with their own EVP approval chain.

**Purchase Order Management** — Full PO creation with vendor selection, cost category, VAT/WHT flags, supplier milestone support, overrun detection and alerts.

**Payment Workflow** — Payment Vouchers → Checks with supervisor, manager, and CEO (≥฿3M) sign-off. Payment Queue page by role.

**Client Revenue Tracking** — Milestone payment plan, client invoice history, cash receipts.

**Cash Flow Planning** — S-curve chart, cash flow planner with milestone rescheduling, Timeline tab per project.

**Financial Reporting** — WHT report, VAT report, Cost Variance report, Loan Ledger.

**Executive Layer** — CEO Alerts dashboard, role-specific KPIs, 13-month rolling cash flow chart.

**Margin Transfer System** — Surplus margin transfers between projects. Auto-blocked if no approved budget, negative margin, or nothing available. Requires EVP + CEO approval.

**Cost Overrun Detection** — Real-time monitoring vs budget + VOs per category. Fires EVP and CEO notifications.

---

## 11. Supabase RPC Functions

`upsert_project_view(p_user_id, p_project_id)` — Called on every project page load to track which projects each user visits most. Used for personalised project list ordering. Defined in Supabase, not in frontend codebase. Security policy and behaviour under concurrent writes has not been reviewed.

---

## 12. The 10 Cost Categories

| Key | Label |
|---|---|
| `cost_01_civil` | 01 Civil Works |
| `cost_02_pv_modules` | 02 PV Modules |
| `cost_03_mounting` | 03 Mounting |
| `cost_04_inverters_electrical` | 04 Inverters & Electrical |
| `cost_05_hv_switchgear` | 05 HV Switchgear |
| `cost_06_cabling` | 06 Cabling |
| `cost_07_installation` | 07 Installation |
| `cost_08_engineering` | 08 Engineering |
| `cost_09_logistics` | 09 Logistics |
| `cost_10_testing_warranty` | 10 Testing & Warranty |

---

## 13. Project Status Flow

`estimation_draft` → `estimation_submitted` → `estimation_cm_approved` → `estimation_approved` → `budget_draft` → `budget_submitted` → `budget_cm_approved` → `active` → `completed`

Rejection at any stage returns to the relevant `_draft` stage with a comment recorded on the project record.

---

## 14. Where to Resume Next Session

**Immediate next task:** Complete the PO approval split on the Forecast chart in `Dashboard.tsx`.

The data layer is correct (query fetches `approved_by`, normalization sets `is_approved`). The only remaining step is updating the chart JSX in the Forecast mode block to replace the single `outflow` Bar with two stacked Bars:

```tsx
// Replace single bar:
<Bar dataKey="outflow" fill="#E24B4A" ... />

// With two stacked bars:
<Bar dataKey="outflowApproved" stackId="out" fill="#E24B4A" name="Committed Out" />
<Bar dataKey="outflowDraft" stackId="out" fill="#E24B4A" opacity={0.35} name="Draft Out" />
```

And update the tooltip formatter and Legend formatter to use the new field names.

**After that, the priority list is:**
1. Error boundaries
2. WHT/VAT config table
3. `cash_receipts` audit
4. CEO approval threshold validation with product owner
5. Loan Ledger completion

---

## 15. Financial Vocabulary — Quick Reference

*Full document: PSS_Financial_Vocabulary.md — read it before building any financial UI.*

### The O+P Rule — most important concept for any developer

The Excel R2 file has two critical columns per project in both the Invoice and PO sheets:

| Column | Invoice sheet (Income) | PO sheet (Cost) |
|---|---|---|
| **O (Balance)** | Client owes us NOW — invoiced but unpaid | We owe supplier NOW — they invoiced us, unpaid |
| **P (Not Yet Invoiced)** | Client will owe us — milestone not yet invoiced | We will owe supplier — PO raised, no invoice yet |

**O alone = incomplete. O+P = the complete financial obligation.**

Every KPI card, chart, and table showing "receivables" or "payables" MUST include both O and P unless it is explicitly labelled as showing only the invoiced portion.

### Key concept definitions

| Concept | Database formula | DO NOT confuse with |
|---|---|---|
| **Cash Received** | `SUM(client_invoices.received_amount)` | Invoice amount (what was billed) |
| **Invoiced Awaiting (col O income)** | `SUM(invoice_amount - received_amount)` where status='pending' | Not Yet Invoiced |
| **Not Yet Invoiced (col P income)** | `SUM(client_milestones.payment_plan_amount)` where no invoice linked | Invoiced Awaiting |
| **Total Outstanding Receivable** | col O income + col P income | Cash Received |
| **Cost Paid** | `SUM(vendor_invoices.received_amount)` | PO committed value |
| **Supplier Invoiced Unpaid (col O cost)** | `SUM(vendor_invoice balance)` | Cost Paid |
| **PO Not Yet Invoiced (col P cost)** | `SUM(po_milestones unscheduled)` | Supplier Invoiced Unpaid |
| **Budget Uncontracted** | Budget per category minus total POs raised | PO Not Yet Invoiced |
| **Total Outstanding Payable** | col O cost + col P cost + uncontracted | Cost Paid |
| **True Exposure** | Total Outstanding Payable minus Total Outstanding Receivable | Net Cash Position |

### Forbidden patterns — Bolt must never do these

| ❌ Pattern | ✅ Correct approach |
|---|---|
| Label PO committed value as "Actual" | Label as "Committed (POs Raised)" |
| Show only col O in a "Receivables" figure | Include col O + col P |
| Filter forecast costs to approved POs only | Include ALL POs — approved AND draft |
| Use `partially_received` status on client_invoices | Valid statuses: `pending` and `received` only |
| Read `po_milestones.project_id` directly | Join through `purchase_orders` to get project_id |
| Read from `cash_receipts` table | Table is retired — use `client_invoices` |
| Show budgeted margin as current margin | Label as "Budgeted Margin" always |

### Chart colour rules (mandatory)

**Green (income):** Dark = cash received · Medium = invoiced col O · Light = planned col P
**Red (cost):** Dark = cash paid · Medium = supplier invoiced col O · Light = PO raised col P · Faded outline = budget uncontracted
**Blue:** Cumulative net cash line

---

## 16. Dashboard Audit Status

*Full document: PSS_Dashboard_Audit_Checklist.md — run after every dashboard change.*

### Current gaps by risk level

**🔴 HIGH — Fix immediately:**

| Screen | Field | Problem | Fix |
|---|---|---|---|
| Dashboard KPI | Pending Receivables | Shows col O only. Label implies total. Missing entire uninvoiced pipeline (col P). | Rename to "Invoiced & Awaiting" OR add col P and rename to "Total Outstanding" |
| Cost Variance Tab | Actual column | Shows PO committed value. Label "Actual" means cash paid to a finance executive. | Rename to "Committed (POs Raised)" or split into Committed + Paid columns |

**🟡 MEDIUM — Fix in next sprint:**

| Screen | Field | Problem |
|---|---|---|
| Dashboard KPI | Net 90-Day Position | Missing already-issued unpaid invoices from both sides |
| Dashboard Chart | Forecast bars | Missing already-issued unpaid invoices from both income and cost |
| Dashboard Table | Next In / Next Out | Should prioritise already-invoiced unpaid over unraised milestones |
| Overview Tab | Contract Value | Missing approved VO revenue additions |
| Overview Tab | Gross Margin | Shows planned margin, not tracking margin. Label must say "Budgeted" |
| Cash Flow Tab | Cash Out panel | Missing budget uncontracted amounts (col P part 2) |

**Three executive numbers that do not exist anywhere yet:**
1. **Total Outstanding Receivable** (col O + col P income) — 🔴 HIGH priority
2. **Total Outstanding Payable** (col O + col P + uncontracted cost) — 🔴 HIGH priority
3. **True Exposure** (payable minus receivable — CEO's worst-case cash requirement) — 🔴 HIGH priority

---

## 17. Future Feature — Estimation | Budget | Actual View

*Confirmed by product owner. To be designed after current dashboard work is complete.*

Will show per cost category at EVP and CEO level:
- **Estimation** — from `project_costings` where stage='estimation'
- **Budget** — from `project_costings` where stage='budget' and status='evp_approved'
- **Committed** — `SUM(purchase_orders.po_amount_excl_vat)` per category
- **Paid (True Actual)** — `SUM(vendor_invoices.received_amount)` per category

This is a four-column variance view, not three. The distinction between Committed and Paid is critical.

