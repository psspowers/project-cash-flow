# PSS Power Solutions — Chief Architect Handover Document
**Date:** 2026-04-24 (original) | **Updated:** 2026-05-03 | **Session:** Approvals audit + PO data integrity findings

---

## YOUR ROLE IN THIS PROJECT

You are the **Chief Architect**. Bolt.new is the **sole developer**.

### How you work:
- Read every file before writing any brief
- Diagnose the problem, explain why it is wrong, describe the fix in plain English
- Show example patterns — never write complete replacement blocks for Bolt to copy-paste
- One problem per brief. Bolt confirms clean build before you write the next brief
- Flag data issues separately from code issues — never conflate them

### Brief format (always use this):
```
PROBLEM: What is wrong and exactly why
LOCATION: File, function name, approximate line
WHAT TO CHANGE: Logic change in plain English
EXAMPLE: Pattern (not full replacement)
VERIFY BY: How Bolt confirms it worked
DO NOT TOUCH: What to leave alone
```

### Rules for Bolt:
- Never apply a brief without reading the target file first
- State what was found before making any change
- Build must be clean after every single change
- If anything is unclear, ask before coding

---

## SYSTEM OVERVIEW

**Client:** PSS Power Solutions (Thailand) — solar EPC company
**Stack:** React 18, TypeScript, Vite, Supabase (PostgreSQL), Recharts, Tailwind
**Repo:** https://github.com/psspowers/project-cash-flow
**Roles:** Cost Controller, Construction Manager, EVP, CEO, Accounts Supervisor, Accounts Manager

---

## DATABASE — VERIFIED SCHEMA

### Hardcoded Project IDs
```
Walailak University:  aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
Naresuan University:  bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb
Khon Kaen University: cccccccc-cccc-cccc-cccc-cccccccccccc
Nanaphan:             dddddddd-dddd-dddd-dddd-dddddddddddd
Renaissance:          11111111-aaaa-bbbb-cccc-aaaaaaaaaaaa
LPF:                  eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee
RCP:                  44444444-aaaa-bbbb-cccc-aaaaaaaaaaaa
LPF2 Meat Frozen:     55555555-aaaa-bbbb-cccc-aaaaaaaaaaaa
```

### Tables that are EMPTY / DO NOT EXIST — never query these
| Table | Status | Correct alternative |
|---|---|---|
| `cash_receipts` | EXISTS but 0 rows — legacy | `client_invoices.received_amount` |
| `milestone_invoices` | DOES NOT EXIST | `client_invoices` |
| `milestones` | EXISTS but 0 rows — legacy | `client_milestones` |
| `profiles` | DOES NOT EXIST | `user_profiles` |

### Key field rules — verified against live database
| Field | Table | Meaning | Use for |
|---|---|---|---|
| `receipt_date` | `client_invoices` | Bank cleared date | ALL cash-received calculations |
| `invoice_date` | `client_invoices` | PSS billing date | VAT reporting only |
| `voucher_date` | `payment_vouchers` | Actual bank payment date | ALL historical cash-out |
| `invoice_date` | `vendor_invoices` | Supplier billing date | Display only, never cash-out bucketing |
| `planned_receive_date` | `client_milestones` | Forecast receipt date | Forecast charts, scheduling |
| `planned_payment_date` | `vendor_invoices`, `po_milestones` | Forecast payment date | Forecast charts, scheduling |

### Multi-tranche milestones
One `client_milestone` can have multiple `client_invoices` (T1, T2, T3 tranches).
Any map of `milestone_id → single ClientInvoice` is a bug.
Correct: `milestone_id → ClientInvoice[]`
Total received per milestone = `SUM(client_invoices.received_amount)` across all linked invoices.

### Valid enum values
**purchase_orders.cost_category:**
`01_civil | 02_pv_modules | 03_mounting | 04_inverters_electrical | 05_hv_switchgear | 06_cabling | 07_installation | 08_engineering | 09_logistics | 10_testing_warranty`

**purchase_orders.status:** `draft | pending_approval | approved | partially_paid | fully_paid`
(NOTE: `cancelled` is NOT a valid status — use draft for cancelled POs)
(NOTE: `pending_approval` = submitted by Cost Controller, awaiting CM/EVP/CEO sign-off. `approved` = signed off, not yet invoiced.)

**client_invoices.status:** `pending | partially_received | received`

**client_milestones.status:** `pending | invoiced | partially_received | received`

**vendor_invoices.status:** `received | approved_cm | approved_evp | released | paid`

**payment_vouchers.status:** `draft | pending_manager | approved | issued`

---

## VERIFIED FIXES — APPLIED THIS SESSION

All confirmed with clean builds and database verification.

| # | File | Fix | Verified |
|---|---|---|---|
| 1 | `useProjectData.ts` | Added `receipt_date` to `ClientInvoiceRow` interface + Supabase query | ✅ |
| 2 | `Dashboard.tsx` | Historical chart cash-out: `vendor_invoices.invoice_date` → `payment_vouchers.voucher_date` + `net_paid` | ✅ |
| 3 | `Dashboard.tsx` | Combined chart past-months cash-out: same fix | ✅ |
| 4 | `Dashboard.tsx` | Cash-in filter: `invoice_date` → `receipt_date` in `totalReceivedThisYear`, historical chart, combined chart | ✅ |
| 5 | `CashflowTab.tsx` | Multi-tranche: `invoiceByMilestone` (single) → `invoicesByMilestone` (array) | ✅ |
| 6 | `CashflowTab.tsx` | monthMap cashIn uses `receipt_date` | ✅ |
| 7 | `CashflowTab.tsx` | monthMap cashOut uses `plannedDate` only (planning view) | ✅ |
| 8 | `OverviewTab.tsx` | `receivedDeltaMap` uses `receipt_date` | ✅ |
| 9 | `OverviewTab.tsx` | `sortedInvoicesByDate` filters/sorts by `receipt_date` | ✅ |
| 10 | `OverviewTab.tsx` | S-Curve scatter matches by `receipt_date` | ✅ |
| 11 | `OverviewTab.tsx` | `allMonths` collects `receipt_date` for X-axis range | ✅ |
| 12 | `TimelineTab.tsx` | `buildCashFlowData` cash-in uses `receipt_date` | ✅ |
| 13 | `TimelineTab.tsx` | `buildCashFlowData` cash-out uses `payment_vouchers.net_paid` by `voucher_date` | ✅ |
| 14 | `marginTransfer.ts` | `cash_receipts.net_received` → `client_invoices.received_amount` | ✅ |
| 15 | `Projects.tsx` | `cash_receipts.net_received` → `client_invoices.received_amount` | ✅ |
| 16 | `VATReport.tsx` | `milestone_invoices` → `client_invoices` | ✅ |
| 17 | `VATReport.tsx` | Input VAT filter: removed `!== 0` WHT condition — recovers ฿10.6M input VAT | ✅ |
| 18 | `PaymentQueue.tsx` | `.from('profiles')` → `.from('user_profiles')` in both notification calls | ✅ |
| 19 | `overrunNotification.ts` | `'04_inverters'` → `'04_inverters_electrical'` | ✅ |
| 20 | `overrunNotification.ts` | `'10_testing'` → `'10_testing_warranty'` | ✅ |
| 21 | `CashReceipts.tsx` | Full rebuild: reads from `client_invoices`, updates `received_amount` + `receipt_date` + `receipt_no` + `status`, updates `client_milestones.status` when fully paid | ✅ |
| 22 | `CashFlowPlanner.tsx` | Data layer rebuild: `milestones` → `client_milestones`, `cash_receipts` → `client_invoices`, all field names corrected, `applyMove` writes `planned_receive_date` | ✅ |

---

## SESSION UPDATE — 2026-05-03 (Approvals Audit)

### Findings from today

**Finding 1 — Approvals page empty queue (CM) is NOT a code bug**
The Approvals page (`src/pages/Approvals.tsx`) filters pending POs using `status = 'pending_approval'`.
The live database has zero POs with that status — total count = 0 across all projects.
The CM queue shows nothing because no PO has ever been submitted through the approval workflow.
This is a data integrity problem from the import, not a code defect.

**Finding 2 — purchase_orders.status enum was wrong in this document**
The enum listed here was `draft | partially_paid | fully_paid`.
The full correct enum is `draft | pending_approval | approved | partially_paid | fully_paid`.
The Approvals page code confirms this — it explicitly queries for `pending_approval` status.
Document corrected above.

**Finding 3 — PO approval routing is by amount threshold, not EVP-only**
The `auth-and-roles.md` permission matrix showed PO approval as an EVP-only action.
The actual code routes by value:
- CM: POs < ฿1,000,000
- EVP: ฿1,000,000 – ฿4,999,999
- CEO: ≥ ฿5,000,000
- Cost Controller: monitoring only ("With Others" tab)
Both `auth-and-roles.md` and `PSS_Master_Architect_Brief_FIXED.md` have been corrected.

**Finding 4 — Walailak POs: 3 data fields wrong on all 19 records**
| Field | Wrong value | Correct value |
|---|---|---|
| `status` | `draft` | `approved` |
| `po_amount_excl_vat` | ฿0 | `po_amount_incl_vat / 1.07` |
| `vat_7pct` | ฿0 | `po_amount_incl_vat - po_amount_excl_vat` |

Impact of wrong status:
- Orders tab shows ฿0 committed costs
- Variance tab shows no committed spend against budget
- CM Approvals queue empty (no pending_approval rows)
- Dashboard forecast excludes all Walailak PO milestones

Remediation SQL is in the Data section above.

---

## DATABASE FIXES — APPLIED THIS SESSION

| # | Fix | SQL Run |
|---|---|---|
| 1 | Milestone status backfill (received/partially_received/invoiced/pending) | ✅ Result: received=25, partially_received=17, invoiced=1, pending=22 |
| 2 | Naresuan: IV2025090015 moved from MS3 → MS2 (wrong milestone linkage) | ✅ |
| 3 | Naresuan MS3 status corrected to `pending` | ✅ |
| 4 | Planned receive dates set for KKU, RCP, LPF2, Naresuan | ✅ |
| 5 | `purchase_orders.cost_category` backfill — 247 of 259 POs categorised | ✅ Remaining 12 are cancelled POs (correctly NULL) |
| 6 | `client_invoices.receipt_date` backfill — 224 invoices updated from bank statement | ✅ |
| 7 | `client_invoices.receipt_no` backfill — REI... numbers populated | ✅ |
| 8 | `client_invoices` — `receipt_no TEXT` column added | ✅ |
| 9 | SFC Phase 2 project deleted (no child records) | ✅ |
| 10 | Partial invoice_date backfill — 40 invoices from Client_Side_Invoice_R2.xlsx | ✅ |

---

## OPEN ITEMS — PENDING

### Code fixes — architect briefs needed

| Priority | File | Issue | What to do |
|---|---|---|---|
| P1 | `Approvals.tsx` | Approvals page shows empty queue for CM even when real POs exist | Root cause is data: all imported POs have `status='draft'` not `pending_approval`. See Data section below. No code change needed — the filter logic is correct. |

### Data still needed / Data fixes pending

| Priority | Item | Detail |
|---|---|---|
| P1 | **Walailak POs — 3-field data correction** | All 19 Walailak POs were data-migrated with wrong values: `status='draft'` (should be `approved`), `po_amount_excl_vat=0` (amounts only in `po_amount_incl_vat`), `submitted_at=null`. Fix: UPDATE status to `approved`, back-calculate `po_amount_excl_vat = po_amount_incl_vat / 1.07` and `vat_7pct = po_amount_incl_vat - po_amount_excl_vat`, stamp `approved_at`. No workflow submission needed — PSS PO numbers confirm real-world approval. |
| P1 | `client_invoices.invoice_date` | 228 of 268 invoices still have NULL invoice_date. Need VAT filing data from accounts. Do NOT approximate as receipt_date minus 60 days — Thai PP.30 cross-matching risk. |
| P2 | `po_milestones.planned_payment_date` | Most are NULL. Needed for CashflowTab cash-out forecast and Dashboard forecast chart. Enter via Reschedule button per project or import from Projects_Income_Expense PO sheet. |
| P3 | Budgets for KKU, RCP, LPF2 | No EVP-approved budget costing. VarianceTab shows no baseline. Finance team to enter. |

#### Walailak PO data correction — verified SQL

```sql
-- Step 1: Correct status and approval stamp for all 19 Walailak POs
UPDATE purchase_orders
SET
  status = 'approved',
  approved_at = now()
WHERE project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND status = 'draft'
  AND pss_po_no IS NOT NULL;

-- Step 2: Back-calculate excl-VAT and VAT amounts from the incl-VAT figure
UPDATE purchase_orders
SET
  po_amount_excl_vat = ROUND(po_amount_incl_vat / 1.07, 2),
  vat_7pct = ROUND(po_amount_incl_vat - (po_amount_incl_vat / 1.07), 2)
WHERE project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND po_amount_excl_vat = 0
  AND po_amount_incl_vat > 0;

-- Verify: should return 19 rows with correct amounts
SELECT pss_po_no, po_amount_excl_vat, vat_7pct, po_amount_incl_vat, status
FROM purchase_orders
WHERE project_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ORDER BY pss_po_no;
```

### Architectural decisions open

| Item | Decision needed |
|---|---|
| `CashReceipts.tsx` historical view | Page shows pending invoices only. No view of already-paid invoices. Add "History" tab or leave as-is? |
| Walailak `IV2025070013` date anomaly | Excel shows `invoice_date = 2025-10-07` but bank receipt is `2025-07-10` — 3 months before invoice. Verify with accounts before populating. |

### Low priority / monitoring

| Item | Note |
|---|---|
| `purchase_orders.pending_remaining_amount` | Static column, not recalculated when invoices paid. Monitor for stale balances. |
| `gross_margin_amount` / `gross_margin_pct` | Stored at form-save time. Can drift if `contract_incl_vat` changes without re-saving costing. |
| Duplicate WHT columns | `purchase_orders` has both `wht_applicable` and `wht_applies` (boolean) + `wht_3pct` and `wht_rate` (numeric). Schema cleanup needed. |

---

## ORACLE SQL — RUN THESE TO VERIFY UI FIGURES

```sql
-- Total received per project (correct source)
SELECT p.name, SUM(ci.received_amount) as total_received
FROM client_invoices ci
JOIN projects p ON p.id = ci.project_id
WHERE ci.received_amount > 0
GROUP BY p.name ORDER BY total_received DESC;

-- Total paid to suppliers per project (correct source)
SELECT p.name, SUM(pv.net_paid) as total_paid
FROM payment_vouchers pv
JOIN projects p ON p.id = pv.project_id
WHERE pv.status = 'issued'
GROUP BY p.name ORDER BY total_paid DESC;

-- Cash in by month (correct bucketing)
SELECT TO_CHAR(receipt_date, 'YYYY-MM') as month,
  SUM(received_amount) as cash_in
FROM client_invoices
WHERE received_amount > 0 AND receipt_date IS NOT NULL
GROUP BY TO_CHAR(receipt_date, 'YYYY-MM') ORDER BY month;

-- Cash out by month (correct bucketing)
SELECT TO_CHAR(voucher_date, 'YYYY-MM') as month,
  SUM(net_paid) as cash_out
FROM payment_vouchers WHERE status = 'issued'
GROUP BY TO_CHAR(voucher_date, 'YYYY-MM') ORDER BY month;

-- Full project reconciliation
SELECT p.name, p.contract_incl_vat as contract,
  COALESCE(ci.received, 0) as received_from_client,
  COALESCE(pv.paid, 0) as paid_to_suppliers,
  COALESCE(ci.received, 0) - COALESCE(pv.paid, 0) as cash_margin
FROM projects p
LEFT JOIN (SELECT project_id, SUM(received_amount) as received FROM client_invoices GROUP BY project_id) ci ON ci.project_id = p.id
LEFT JOIN (SELECT project_id, SUM(net_paid) as paid FROM payment_vouchers WHERE status='issued' GROUP BY project_id) pv ON pv.project_id = p.id
WHERE p.status = 'active' ORDER BY p.name;

-- Invoice date vs receipt date gap (for VAT audit)
SELECT TO_CHAR(invoice_date,'YYYY-MM') as inv_month,
  TO_CHAR(receipt_date,'YYYY-MM') as rec_month,
  COUNT(*), SUM(received_amount)
FROM client_invoices WHERE received_amount > 0
GROUP BY TO_CHAR(invoice_date,'YYYY-MM'), TO_CHAR(receipt_date,'YYYY-MM')
ORDER BY rec_month;
```

---

## CURRENT DASHBOARD STATE (verified 2026-04-24)

| Metric | Expected value | Source |
|---|---|---|
| Total received all projects | ฿274,606,740 | `SUM(client_invoices.received_amount)` |
| Total paid to suppliers | ฿69,754,491 | `SUM(payment_vouchers.net_paid WHERE status='issued')` |
| Historical chart Dec 25 cash out | ~฿14.66M | `payment_vouchers` |
| Historical chart Mar 26 cash out | ~฿13.4M | `payment_vouchers` |
| VATReport input VAT total | ~฿10.6M | 291 vendor invoices with `wht_3pct > 0` |

