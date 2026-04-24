# PSS Power Solutions — Dashboard Audit Checklist
*Use this checklist every time a new chart, KPI card, or table is built or modified.*
*Purpose: Ensure every number shown to an EVP or CEO reflects the complete financial picture — not just the transactional subset.*

---

## How to use this checklist

**When building:** Before wiring any field to a UI element, answer every question in Section 1.
**When reviewing:** Run through Section 2 for every number visible on the screen.
**When approving:** The product owner signs off only when all checklist items pass.

---

## Section 1 — Pre-Build Checklist (answer before writing any code)

For every new number being added to a dashboard or report:

### 1.1 — Concept check
- [ ] Have I looked up this concept in the Financial Vocabulary Reference?
- [ ] Am I using the exact database formula defined there — not a single field in isolation?
- [ ] Does the UI label exactly match the vocabulary definition?

### 1.2 — Completeness check (the O+P test)
Ask these three questions about every financial figure:

**For INCOME figures:**
- [ ] Does this include Column O? (Invoiced but client not yet paid — `client_invoices` balance)
- [ ] Does this include Column P? (Not yet invoiced — `client_milestones` with no invoice)
- [ ] If this is meant to show TOTAL outstanding — does it include BOTH O and P?

**For COST figures:**
- [ ] Does this include Column O? (Supplier has invoiced us, we have not paid — `vendor_invoices` balance)
- [ ] Does this include Column P part 1? (PO raised, supplier not yet invoiced — `po_milestones` unscheduled)
- [ ] Does this include Column P part 2? (Budget allocated, no PO yet — budget minus PO total)
- [ ] If this is a forecast — does it include ALL POs (draft AND approved)?

### 1.3 — Label check
- [ ] If showing only cash received/paid — labelled as "Received" or "Paid" NOT "Actual"
- [ ] If showing PO committed value — labelled as "Committed" NOT "Actual"
- [ ] If showing budgeted margin — labelled as "Budgeted" NOT "Current" or "Margin"
- [ ] If showing invoiced-only receivable — labelled as "Invoiced & Awaiting" NOT "Receivables" or "Pending"

### 1.4 — Colour check
- [ ] Dark green = cash actually received
- [ ] Medium green = invoiced, awaiting client payment (col O)
- [ ] Light green = planned, not yet invoiced (col P)
- [ ] Dark red = cash actually paid
- [ ] Medium red = supplier invoiced us, we have not paid (col O)
- [ ] Light red = PO raised, no invoice yet (col P part 1)
- [ ] Faded/outline red = budget allocated, no PO raised (col P part 2)
- [ ] Blue line = cumulative net cash

### 1.5 — Forbidden pattern check
- [ ] NOT using `partially_received` as a status on `client_invoices`
- [ ] NOT reading `po_milestones.project_id` directly (join through purchase_orders)
- [ ] NOT reading from `cash_receipts` table (retired)
- [ ] NOT filtering forecast costs to EVP-approved POs only
- [ ] NOT labelling PO committed value as "Actual"

---

## Section 2 — Per-Screen Audit (current state)

Run this after any change to verify nothing regressed.

---

### Screen: Dashboard KPI Cards

**Card: Total Contract Value**
- [x] Formula: `SUM(projects.contract_incl_vat)` for active projects
- [ ] ⚠️ Missing: Does not include approved VO revenue. Add `+ SUM(evp_approved_vos.revenue_increase)` for true value.
- [x] Label correct: "Total Contract Value"
- **Status: 🟡 MEDIUM — acceptable at portfolio level, flag for improvement**

**Card: Received This Year**
- [x] Formula: `SUM(client_invoices.received_amount)` filtered by invoice_date year
- [x] Includes col O? N/A — this is cash only, correct
- [x] Label correct: "Received This Year"
- **Status: 🟢 OK**

**Card: Pending Receivables**
- [x] Formula: `SUM(client_invoices.pending_amount)` where status in ('pending')
- [x] Includes col O (invoiced pending)? YES
- [ ] ❌ Includes col P (not yet invoiced)? NO — MISSING
- [ ] ❌ Label correct? NO — "Pending Receivables" implies total. Should be "Invoiced & Awaiting"
- **Status: 🔴 HIGH — label is misleading. Missing entire uninvoiced pipeline.**
- **Fix:** Rename to "Invoiced & Awaiting" OR add col P and rename to "Total Outstanding"

**Card: Awaiting My Action**
- [x] Count metric, not financial. N/A for O+P test.
- **Status: 🟢 OK**

**Card: Net 90-Day Position**
- [x] Income formula: `SUM(client_milestones.payment_plan_amount)` due in 90 days
- [ ] ⚠️ Missing income: Already-raised client invoices pending payment due in 90 days
- [x] Cost formula: `SUM(po_milestones.amount_due - paid_amount)` due in 90 days
- [ ] ⚠️ Missing cost: Already-received vendor invoices unpaid due in 90 days
- [x] Includes both approved AND draft POs? YES (after recent fix)
- **Status: 🟡 MEDIUM — directionally correct, precise values need improvement**

---

### Screen: Dashboard Monthly Cash Flow Chart

**Historical bars**
- [x] Cash In: `SUM(client_invoices.received_amount)` by invoice_date month
- [x] Cash Out: `SUM(vendor_invoices.received_amount)` by invoice_date month
- [x] Both are actual cash — correct for historical view
- **Status: 🟢 OK**

**Forecast bars**
- [x] Planned In: `SUM(client_milestones.payment_plan_amount)` by planned_receive_date month
- [ ] ⚠️ Missing: Already-raised client invoices pending payment — should appear at planned receipt date
- [x] Planned Out approved (dark red): po_milestones where purchase_order.approved_by IS NOT NULL
- [x] Planned Out draft (light red): po_milestones where purchase_order.approved_by IS NULL
- [ ] ⚠️ Missing: Already-received vendor invoices unpaid — should appear at planned payment date
- [ ] ⚠️ Missing: Budget uncontracted amounts (col P part 2)
- **Status: 🟡 MEDIUM — better after PO split fix, still missing issued-unpaid documents**

**Combined bars**
- [x] Past 3 months: actual data (same as historical) ✓
- [x] Next 6 months: forecast data (same issues as forecast bars above)
- [x] Today reference line present
- [x] Opacity correctly differentiates actual (solid) from forecast (faded)
- **Status: 🟡 MEDIUM — inherits forecast bar issues**

---

### Screen: Dashboard Project Cash Positions Table

**Received column**
- [x] Formula: `SUM(client_invoices.received_amount)` per project
- [x] Actual cash only — correct
- **Status: 🟢 OK**

**Cost Paid column**
- [x] Formula: `SUM(vendor_invoices.received_amount)` per project
- [x] Actual cash only — correct
- **Status: 🟢 OK**

**Next In column**
- [ ] ⚠️ Shows: Next client_milestone planned_receive_date
- [ ] ⚠️ Missing: Already-raised client invoices pending — more urgent than unraised milestones
- [ ] ⚠️ Priority: Should show earliest of (pending invoice due date, next milestone date)
- **Status: 🟡 MEDIUM**

**Next Out column**
- [ ] ⚠️ Shows: Next po_milestone planned_payment_date
- [ ] ⚠️ Missing: Already-received vendor invoices unpaid — more urgent than unscheduled milestones
- **Status: 🟡 MEDIUM**

**30-Day Net column**
- [ ] ⚠️ Shows: Milestone inflows minus po_milestone outflows in 30 days
- [ ] ⚠️ Missing: Issued-but-unpaid invoices on both sides within 30 days
- **Status: 🟡 MEDIUM**

---

### Screen: Project Detail — Overview Tab

**Contract Value card**
- [x] Formula: `project.contract_incl_vat`
- [ ] ⚠️ Missing: Approved VO revenue additions
- **Status: 🟡 MEDIUM**

**Received card**
- [x] Formula: `SUM(client_invoices.received_amount)`
- **Status: 🟢 OK**

**Cost Paid card**
- [x] Formula: vendor invoices paid + orphan invoices paid
- **Status: 🟢 OK**

**Gross Margin card**
- [x] Formula: `budget.gross_margin_pct`
- [ ] ❌ Label issue: Shows PLANNED margin not CURRENT tracking margin
- [ ] ⚠️ No visual indication of how actual costs are tracking against this figure
- **Status: 🟡 MEDIUM — label must say "Budgeted Margin" not "Gross Margin"**

**Net Cash Position card**
- [x] Formula: Cash Received minus Cost Paid
- [x] This IS the actual cash position — correct for this metric
- **Status: 🟢 OK**

---

### Screen: Project Detail — Revenue Forecast Chart

**Already Received figure**
- [x] Formula: `SUM(client_invoices.received_amount)`
- **Status: 🟢 OK**

**Invoiced — Awaiting figure**
- [x] Formula: pending client invoice balances (col O)
- **Status: 🟢 OK — correctly shows col O**

**Not Yet Invoiced figure**
- [x] Formula: uninvoiced milestone amounts (col P)
- **Status: 🟢 OK — correctly shows col P**

**Verification sum**
- [x] Warning shown if O+P+Received ≠ contract value
- **Status: 🟢 OK**

---

### Screen: Project Detail — Cash Flow Tab

**Cash In panel (client milestones table)**
- [x] Shows all milestones — invoiced and uninvoiced
- [x] Shows received amounts where paid
- [x] Complete picture of income side
- **Status: 🟢 OK**

**Cash Out panel (supplier payment table)**
- [x] Shows PO milestones
- [x] Shows vendor invoices
- [x] Shows draft POs via pending_remaining_amount
- [ ] ❌ Missing: Budget uncontracted amounts per category (col P part 2)
- [ ] ⚠️ No visual distinction between col O (invoiced unpaid) and col P (not yet invoiced)
- **Status: 🟡 MEDIUM**

**Monthly Cash Flow Balance table**
- [ ] ⚠️ Inherits same gaps as Cash Out panel
- **Status: 🟡 MEDIUM**

---

### Screen: Project Detail — Cost Variance Tab

**Estimation column**
- [x] Formula: `project_costings` where stage='estimation'
- **Status: 🟢 OK**

**Budget column**
- [x] Formula: `project_costings` where stage='budget' and status='evp_approved'
- **Status: 🟢 OK**

**Actual column**
- [ ] ❌ Formula: `SUM(purchase_orders.po_amount_excl_vat)` — this is COMMITTED not ACTUAL
- [ ] ❌ Label: "Actual" is wrong. Should be "Committed (POs Raised)"
- [ ] ❌ Missing: True actual cash paid = `SUM(vendor_invoices.received_amount)` per category
- **Status: 🔴 HIGH — mislabelled and showing wrong concept**
- **Fix: Either rename to "Committed" or add a separate "Paid" column**

**Variance column**
- [ ] ⚠️ Calculated against committed POs, not true actuals
- [ ] ⚠️ Missing uncontracted budget in calculation
- **Status: 🟡 MEDIUM — directionally useful but imprecise**

---

### Screen: Project Detail — Timeline / S-Curve Tab

**S-Curve chart — Cumulative Received line**
- [x] Formula: cumulative `client_invoices.received_amount` over time
- **Status: 🟢 OK**

**S-Curve chart — Confirmed Cost Forecast line**
- [x] Shows: vendor invoices paid + approved PO milestone forecasts
- [ ] ⚠️ Missing: Draft PO milestones, uncontracted budget
- **Status: 🟡 MEDIUM**

**Client Receipts — Invoice History table**
- [x] Filtered to: `client_invoices` where received_amount > 0
- [x] Uses Badge component for status
- [x] Shows only actual receipts — correct for this view
- **Status: 🟢 OK**

---

## Section 3 — The Two Missing Executive Numbers

These numbers do not exist anywhere in the system. They must be added.

### Missing Number 1: Total Outstanding Receivable
**Screen it belongs on:** Dashboard KPI cards + Project Detail Overview
**What it shows:** Everything the company is still owed = col O + col P (income)
**Formula:**
```
SUM(client_invoice pending balances) + SUM(uninvoiced milestone amounts)
```
**Priority: 🔴 HIGH**

---

### Missing Number 2: Total Outstanding Payable
**Screen it belongs on:** Dashboard KPI cards + Project Detail Overview
**What it shows:** Everything the company still has to pay = col O + col P + uncontracted (cost)
**Formula:**
```
SUM(vendor_invoice unpaid balances)
+ SUM(po_milestone unscheduled amounts)
+ SUM(budget uncontracted per category)
```
**Priority: 🔴 HIGH**

---

### Missing Number 3: True Exposure (CEO metric)
**Screen it belongs on:** Dashboard KPI cards (CEO view only)
**What it shows:** Maximum cash the company needs if it must pay everything before collecting anything
**Formula:**
```
Total Outstanding Payable MINUS Total Outstanding Receivable
```
**Positive = cash risk. Negative = healthy position.**
**Priority: 🔴 HIGH for CEO view**

---

## Section 4 — Regression Test After Every Change

After any change to Dashboard.tsx or any project detail tab, run these checks:

1. Open dashboard → confirm "Received This Year" is not zero (was broken by receipt_date bug)
2. Switch chart to Forecast → confirm red bars are taller than green bars for months with heavy supplier payments
3. Switch chart to Combined → confirm Today line divides solid from faded bars
4. Open any active project → Cost Variance tab → confirm "Actual" column label has been corrected
5. Open any active project → Overview tab → confirm Gross Margin card says "Budgeted" not "Current"
6. Search entire codebase for `partially_received` → must return zero matches
7. Search entire codebase for `cash_receipts` → must return zero matches
8. Search entire codebase for `receipt_date` → must return zero matches

---

## Section 5 — Sign-off Gate

Before any financial dashboard feature is considered complete, the product owner must confirm:

- [ ] "The number I see matches what I would calculate from the Excel R2 file"
- [ ] "The label describes exactly what the number includes — no more, no less"
- [ ] "An EVP or CEO reading this could not misinterpret it"
- [ ] "The colour coding matches the Financial Vocabulary colour rules"
- [ ] "The O+P test passes — I am seeing the complete financial obligation, not just the documented subset"

