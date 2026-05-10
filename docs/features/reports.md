# Reports Feature

## VAT Report (`/vat-report`)

Shows VAT amounts from vendor invoices and purchase orders for a selected period.

**Data source:** `vendor_invoices` — the `invoice_amount_incl_vat` and `net_payable` columns. VAT is implied as the difference (`invoice_amount_incl_vat - net_payable - wht_3pct`).

**Who can access:** accounts_supervisor, accounts_manager, evp, ceo (enforced in Sidebar visibility; route is accessible to all authenticated users).

---

## WHT Report (`/wht-report`)

Shows Withholding Tax (3%) deducted from vendor payments for a selected period.

**Data source:** `vendor_invoices.wht_3pct` and `payment_vouchers.wht_amount`.

**Purpose:** The amounts in this report are what must be remitted to the Revenue Department each month.

**Who can access:** accounts_supervisor, accounts_manager, evp, ceo.

---

## Treasury (`/treasury`)

Replaces the old `/loan-ledger` route (which now redirects here). Provides a unified view of all treasury positions.

**Sections:**
- **Loans** — borrowing and lending facilities tracked via `loans` table
- **Loan transactions** — event-sourced ledger (`loan_transactions`) with drawdown, repayment, interest, and fee events; balances are computed, not stored
- **SG&A actuals** — monthly actual overhead figures entered by Finance roles via `sga_actuals` table
- **Treasury adjustments** — one-off fiscal-year adjustments via `treasury_adjustments` table

**Data sources:**
- `loans` — principal, facility type (borrowing/lending), counterparty, due date
- `loan_transactions` — event type (drawdown, repayment, interest, fee), cash flow direction, amount, date
- `sga_actuals` — year, month, amount
- `treasury_adjustments` — label, amount, fiscal_year

**Who can access:** accounts_supervisor, accounts_manager, banking_finance_officer, evp, ceo.

---

## Cost Variance (`/variance`)

Compares budget costing per category against actual PO spend per category across all active projects.

**Data sources:**
- `project_costings` (stage = `budget`, status = `evp_approved`) — planned cost per category
- `purchase_orders` — actual committed cost per category (approved POs only)

**Columns per category:**
- Budget amount
- Committed amount (sum of approved PO amounts)
- Variance (budget − committed)
- Variance %

A category is flagged as overrun when committed > budget.

**Who can access:** All roles (visible in sidebar for all).

---

## CEO Alerts (`/ceo-alerts`)

Not a traditional report — this page surfaces payment vouchers ≥ ฿3M that are in `pending_manager` or `approved` status, giving the CEO and EVP visibility of large outflows before or as they happen.

**Data source:** `payment_vouchers` where `net_paid >= 3,000,000`.

**Who can access:** ceo, evp only.

---

## Monthly Analyzer (`/monthly-analyzer`)

Pivot-style financial analysis across all projects for a selected month. Shows cash in, uninvoiced pipeline, and balance summaries. Used by the Finance team and management to assess monthly financial health.

**Data sources:** `milestone_invoices`, `cash_receipts`, `vendor_invoices`, `payment_vouchers`, `purchase_orders`.

**Who can access:** cost_controller, accounts_supervisor, accounts_manager, evp, ceo (ANALYZER_ROLES).

---

## Workflow Efficiency (`/workflow`)

Shows approval cycle time metrics — how long POs and invoices spend at each stage. Identifies bottlenecks in the approval chain.

**Data source:** `po_audit_log` — timestamps of each status transition per PO.

**Who can access:** evp, ceo.

---

*Update this file when report logic, data sources, or access controls change.*
