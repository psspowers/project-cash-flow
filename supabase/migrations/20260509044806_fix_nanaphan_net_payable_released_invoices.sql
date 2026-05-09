/*
  # Fix net_payable = 0 on unpaid released invoices — Nanaphan project

  ## Problem
  Four vendor invoices were created in `released` status but their `net_payable`
  field was left at 0 instead of being set to the invoice amount. This caused the
  PO tally (Column Q – Invoice Balance) to show 0 when it should show the full
  outstanding amount.

  ## Affected invoices
  - PSS2024-197R.1 / M1  : invoice 2025-06-0501  — 3,177,911.88
  - PSS2024-205 / M5     : invoice INV2602002    — 2,275,954.20
  - PSS2024-205 / M6     : invoice INV2602003    — 1,365,572.52
  - PSS2024-205 / M7     : invoice INV2602004    — 1,365,572.52

  ## Fix
  Set net_payable = invoice_amount_incl_vat for each invoice where the value is
  wrong (net_payable = 0 but invoice_amount_incl_vat > 0 and status = released).
  Scoped to Nanaphan project only.
*/

UPDATE vendor_invoices
SET net_payable = invoice_amount_incl_vat
WHERE project_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  AND status = 'released'
  AND (net_payable = 0 OR net_payable IS NULL)
  AND invoice_amount_incl_vat > 0;
