# PSS Power Solutions — Financial Vocabulary Reference
*For developers building executive dashboards and reports.*
*Every business concept an EVP or CEO cares about, expressed as exact database field combinations.*
*When in doubt about what a number means — look it up here first.*

---

## How to use this document

Before wiring any field to a chart, KPI card, or table cell, find the concept in this document and use the formula exactly as written. Never use a single field in isolation when the concept requires a combination. Never label a number with a business term unless it matches the definition here.

The most common mistake: using `received_amount` (cash paid) when the concept requires `invoice_amount` (total obligation). They are different numbers with different meanings to a finance executive.

---

## Part 1 — Income Concepts (Money coming IN from clients)

---

### Total Contract Value
**What it means to an EVP:** The total amount the client has agreed to pay for this project. The ceiling on revenue.

**Database formula:**
```sql
SELECT SUM(contract_incl_vat) FROM projects WHERE id = :project_id
```
Or at portfolio level:
```sql
SELECT SUM(contract_incl_vat) FROM projects WHERE status = 'active'
```

**Include Variation Orders?** Yes, for true contract value:
```sql
base_contract + SUM(variation_orders.revenue_increase) WHERE vo.status = 'evp_approved'
```

**Excel equivalent:** Invoice sheet column J (CONTRACT Include Vat7%)
**Do NOT confuse with:** Sales price excl VAT (project_costings.sales_price_excl_vat)

---

### Cash Received (Actual Income)
**What it means to an EVP:** Real money that has arrived in the company bank account from this client.

**Database formula:**
```sql
SELECT SUM(received_amount)
FROM client_invoices
WHERE project_id = :project_id
AND received_amount > 0
```

**Excel equivalent:** Invoice sheet column N (PAID)
**Do NOT confuse with:** Invoice amount (what was billed, not what was received)

---

### Invoiced & Awaiting Payment (Column O — Income)
**What it means to an EVP:** We have sent the client an invoice. They have not paid yet. This money is legally owed to us NOW.

**Database formula:**
```sql
SELECT SUM(invoice_amount - COALESCE(received_amount, 0))
FROM client_invoices
WHERE project_id = :project_id
AND status = 'pending'
AND invoice_amount > received_amount
```

**Excel equivalent:** Invoice sheet column O (Balance)
**UI colour:** Medium green — invoiced but not yet cash
**Do NOT confuse with:** Not Yet Invoiced (column P) — that money is not legally owed yet

---

### Not Yet Invoiced (Column P — Income)
**What it means to an EVP:** Milestone work has been defined in the contract but we have not raised an invoice yet. We will receive this money when we complete the milestone. It is real revenue — it just is not documented yet.

**Database formula:**
```sql
-- Milestones with no client invoice linked
SELECT SUM(cm.payment_plan_amount)
FROM client_milestones cm
LEFT JOIN client_invoices ci ON ci.client_milestone_id = cm.id
WHERE cm.project_id = :project_id
AND cm.status != 'received'
AND ci.id IS NULL
```

**Excel equivalent:** Invoice sheet column P (NOT YET INVOICED)
**UI colour:** Light green — planned but not yet billed
**Do NOT confuse with:** Invoiced & Awaiting (column O) — that has a document behind it

---

### Total Outstanding Receivable (O + P combined — Income)
**What it means to an EVP:** Everything the company is still owed on this project. The complete answer to "how much more money are we going to collect?"

**Database formula:**
```sql
-- Column O: invoiced but unpaid
SELECT SUM(invoice_amount - COALESCE(received_amount, 0))
FROM client_invoices
WHERE project_id = :project_id AND status = 'pending'

UNION ALL

-- Column P: not yet invoiced
SELECT SUM(cm.payment_plan_amount)
FROM client_milestones cm
LEFT JOIN client_invoices ci ON ci.client_milestone_id = cm.id
WHERE cm.project_id = :project_id
AND cm.status != 'received'
AND ci.id IS NULL
```
Sum both results.

**Verification check:** Cash Received + Invoiced Awaiting + Not Yet Invoiced should equal Total Contract Value. If not, data is incomplete.

**Excel equivalent:** Sum of Invoice sheet columns O + P
**This is the number missing from the current dashboard.**

---

### Collection Rate
**What it means to an EVP:** What percentage of the total contract have we actually collected in cash?

**Database formula:**
```sql
SUM(client_invoices.received_amount) / projects.contract_incl_vat * 100
```

**Used in:** Margin Transfer eligibility calculation

---

## Part 2 — Cost Concepts (Money going OUT to suppliers)

---

### Total Budget (per category)
**What it means to an EVP:** What the approved budget says we should spend in this cost category.

**Database formula:**
```sql
SELECT cost_01_civil, cost_02_pv_modules, ... (all 10 category columns)
FROM project_costings
WHERE project_id = :project_id AND stage = 'budget' AND status = 'evp_approved'
```

**Excel equivalent:** Not in PO sheet — comes from project_costings table
**Important:** Budget only exists after EVP approval. Before that, use estimation.

---

### Total PO Committed (per category)
**What it means to an EVP:** The total value of purchase orders raised in this cost category — money we have formally committed to spend, regardless of whether invoices have arrived.

**Database formula:**
```sql
SELECT SUM(po_amount_excl_vat)
FROM purchase_orders
WHERE project_id = :project_id
AND cost_category = :category
AND status != 'cancelled'
```

**Include draft POs?** YES — a draft PO is a real commitment even if not yet EVP-approved.
**Excel equivalent:** PO sheet column H (CONTRACT w/o Vat7%) summed per project
**Do NOT label this as "Actual" in any UI — it is "Committed"**

---

### Cost Paid (Actual Cash Out)
**What it means to an EVP:** Real money that has left the company bank account to pay suppliers.

**Database formula:**
```sql
-- From vendor invoices linked to POs
SELECT SUM(vi.received_amount)
FROM vendor_invoices vi
JOIN purchase_orders po ON vi.po_id = po.id
WHERE po.project_id = :project_id
AND vi.received_amount > 0

UNION ALL

-- Orphan vendor invoices (no PO linked)
SELECT SUM(received_amount)
FROM vendor_invoices
WHERE project_id = :project_id
AND po_id IS NULL
AND received_amount > 0
```

**Excel equivalent:** PO sheet column N (PAID)
**Do NOT confuse with:** PO Committed (total PO value) — only some of that has been paid

---

### Supplier Invoiced — Not Yet Paid (Column O — Cost)
**What it means to an EVP:** A supplier has sent us an invoice. We have not paid it yet. This is money we legally owe NOW.

**Database formula:**
```sql
SELECT SUM(invoice_amount_incl_vat - COALESCE(received_amount, 0))
FROM vendor_invoices vi
JOIN purchase_orders po ON vi.po_id = po.id
WHERE po.project_id = :project_id
AND vi.invoice_amount_incl_vat > COALESCE(vi.received_amount, 0)
```

**Excel equivalent:** PO sheet column O (Balance)
**UI colour:** Medium red — invoiced by supplier but we have not paid
**Do NOT confuse with:** Not Yet Contracted (column P) — that has no document yet

---

### PO Raised — Not Yet Invoiced (Column P part 1 — Cost)
**What it means to an EVP:** We have raised a purchase order but the supplier has not yet sent us an invoice. We have committed to this spend — the invoice is coming.

**Database formula:**
```sql
-- For POs with milestone structure
SELECT SUM(pm.amount_due - COALESCE(pm.paid_amount, 0))
FROM po_milestones pm
JOIN purchase_orders po ON pm.purchase_order_id = po.id
WHERE po.project_id = :project_id
AND pm.status NOT IN ('paid', 'invoiced')

UNION ALL

-- For simple POs with no invoices yet
SELECT SUM(po.pending_remaining_amount)
FROM purchase_orders po
WHERE po.project_id = :project_id
AND po.pending_remaining_amount > 0
```

**Excel equivalent:** Part of PO sheet column P (NOT YET INVOICED)

---

### Budget Uncontracted — Not Yet PO'd (Column P part 2 — Cost)
**What it means to an EVP:** The approved budget says we will spend this amount, but we have not yet raised a purchase order for it. This spend is coming — it is built into the project plan — but there is no document trail yet.

**Database formula:**
```sql
-- Per category: Budget minus all POs raised
SELECT
  (SELECT cost_01_civil FROM project_costings WHERE project_id = :id AND stage='budget')
  - COALESCE((SELECT SUM(po_amount_excl_vat) FROM purchase_orders
    WHERE project_id = :id AND cost_category = '01_civil'), 0)
  AS uncontracted_civil
-- Repeat for all 10 categories
```

**Excel equivalent:** The unplanned portion of PO sheet column P
**This is the most commonly missing number in dashboards.**
**UI colour:** Outline/faded red — committed by budget, no PO exists yet

---

### Total Outstanding Payable (O + P combined — Cost)
**What it means to an EVP:** Everything the company still has to pay to complete this project. The complete answer to "how much more cash do we need to spend?"

**Formula:** Supplier Invoiced Unpaid (col O) + PO Raised Not Yet Invoiced (col P part 1) + Budget Uncontracted (col P part 2)

**This is the number missing from the current dashboard.**

---

### True Exposure
**What it means to a CEO:** If we had to pay everything we owe to suppliers before collecting everything clients owe us — what is the maximum cash gap we need to cover? This is the company's worst-case cash requirement.

**Formula:**
```
True Exposure = Total Outstanding Payable − Total Outstanding Receivable
```

If positive: we owe more than we are owed → cash risk
If negative: we are owed more than we owe → healthy position

**This metric does not exist anywhere in the current system. It is the single most important number for a CEO.**

---

### Net Cash Position
**What it means to an EVP:** Cash actually received from clients minus cash actually paid to suppliers. The real cash position today.

**Database formula:**
```sql
Cash Received (client_invoices.received_amount)
MINUS
Cost Paid (vendor_invoices.received_amount + orphan invoices)
```

**Note:** This can be negative mid-project (costs run ahead of receipts in EPC). Normal behaviour — the Net 90-Day Position and True Exposure tell you whether the trajectory is safe.

---

## Part 3 — Margin Concepts

---

### Budgeted Gross Margin
**What it means to an EVP:** The profit we planned to make on this project when the budget was approved.

**Database formula:**
```sql
SELECT gross_margin_amount, gross_margin_pct
FROM project_costings
WHERE project_id = :project_id AND stage = 'budget' AND status = 'evp_approved'
```

**Do NOT display as current margin** — it is the planned margin at completion, not a live figure.

---

### Forecast Margin at Completion
**What it means to an EVP:** Given what we know now — budget approved, VOs approved, overruns identified — what will the actual project profit be at completion?

**Database formula:**
```sql
(budget.sales_price_excl_vat + sum(evp_approved_vos.revenue_increase))
MINUS
(budget.total_cost_excl_vat + sum(evp_approved_vos.cost_total) + overrun_amount)
```
Where overrun_amount = MAX(0, total_po_committed - effective_budget)

---

### Releasable Margin (for transfers)
**What it means:** How much of the forecast margin has been "earned" based on how much of the contract has been collected. Used to gate margin transfers.

**Database formula:** See `computeMarginTransferPosition()` in `src/utils/marginTransfer.ts`

---

## Part 4 — Time-Based Concepts (for forecasting)

---

### Planned Receipt Date
**What it means:** When we expect to receive a client payment.
**Source:** `client_milestones.planned_receive_date`
**Note:** ±15% accuracy per product owner confirmation. Use for directional planning only.

---

### Planned Payment Date
**What it means:** When we expect to pay a supplier.
**Source:** `po_milestones.planned_payment_date` OR `vendor_invoices.planned_payment_date`

---

### Monthly Cash In (historical)
**What it means:** Actual client payments received in a specific month.
**Formula:** `SUM(client_invoices.received_amount) WHERE invoice_date LIKE 'YYYY-MM%'`

---

### Monthly Cash Out (historical)
**What it means:** Actual supplier payments made in a specific month.
**Formula:** `SUM(vendor_invoices.received_amount) WHERE invoice_date LIKE 'YYYY-MM%'`

---

### Monthly Planned In (forecast)
**What it means:** Client payments expected in a future month based on milestone dates.
**Formula:** `SUM(client_milestones.payment_plan_amount) WHERE planned_receive_date LIKE 'YYYY-MM%' AND status != 'received'`

---

### Monthly Planned Out (forecast)
**What it means:** Supplier payments expected in a future month. Must include ALL POs — approved AND draft.
**Formula:**
```sql
-- Approved POs (dark red on chart)
SUM(po_milestones.amount_due - paid_amount)
WHERE planned_payment_date LIKE 'YYYY-MM%'
AND purchase_order.approved_by IS NOT NULL

-- Draft POs (light red on chart)
SUM(po_milestones.amount_due - paid_amount)
WHERE planned_payment_date LIKE 'YYYY-MM%'
AND purchase_order.approved_by IS NULL
```

**Critical rule:** NEVER filter to approved-only for forecast. Draft POs represent real future obligations.

---

## Part 5 — Chart Colour Rules

Every chart showing money must use this colour system consistently:

### Green shades (income / cash in)
| Shade | Meaning | Data source |
|---|---|---|
| Dark solid green | Actually received — cash in bank | `client_invoices.received_amount` |
| Medium green | Invoiced, awaiting client payment | `client_invoices` balance (col O) |
| Light green | Planned, not yet invoiced | `client_milestones` uninvoiced (col P) |

### Red shades (cost / cash out)
| Shade | Meaning | Data source |
|---|---|---|
| Dark solid red | Actually paid — cash out of bank | `vendor_invoices.received_amount` |
| Medium red | Supplier has invoiced us, unpaid | `vendor_invoices` balance (col O) |
| Light red | PO raised, supplier not yet invoiced | `po_milestones` unscheduled (col P part 1) |
| Outline / faded red | Budget allocated, no PO yet | Budget minus PO total (col P part 2) |

### Blue
| Shade | Meaning |
|---|---|
| Solid blue line | Cumulative net cash position |
| Dashed blue | Forecast cumulative net |

---

## Part 6 — Forbidden Patterns

These are mistakes that make dashboards misleading to finance executives. Bolt must never do these:

**❌ Labelling PO committed value as "Actual"**
PO value is a commitment. "Actual" means cash paid. Use "Committed" or "PO Raised" instead.

**❌ Showing only invoiced pending in a "Receivables" figure**
Receivables = col O + col P. Showing only col O understates the true receivable by potentially hundreds of millions.

**❌ Filtering forecast costs to EVP-approved POs only**
Draft POs are real future obligations. Filtering them out makes the cash forecast look better than reality.

**❌ Using partially_received as a status on client_invoices**
This status does not exist on client_invoices. Valid values are pending and received only.

**❌ Reading po_milestones.project_id directly**
This column does not exist. Always join through purchase_orders to get project_id.

**❌ Reading cash_receipts table**
This table is retired. All client payment data is in client_invoices.

**❌ Showing budgeted margin % as if it is the current margin**
Budget margin is the plan. It does not update as actuals change. Label it "Budgeted" always.

