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

## Loan Ledger (`/loan-ledger`)

Tracks all loans the company has received from or given to counterparties.

**Data sources:**
- `loans` — principal, currency, drawdown date, due date, outstanding balance, counterparty
- `loan_repayments` — payment events reducing the outstanding balance

**Columns displayed:**
- Counterparty name
- Loan type (Received / Given)
- Principal
- Currency (THB or USD; USD loans show FX rate used)
- Drawdown date, due date
- Outstanding balance
- Repayment history

**Who can access:** accounts_supervisor, accounts_manager, evp, ceo.

---

## Cost Variance (`/variance`)

Compares budget costing per category against actual PO spend per category across all active projects.

**Data sources:**
- `project_costings` (stage = `budget`, status = `evp_approved`) — planned cost per category
- `purchase_orders` — actual committed cost per category

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

*Update this file when report logic, data sources, or access controls change.*
