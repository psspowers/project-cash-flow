/*
  # Fix Naresuan – net_payable = 0 on Unpaid/Released Invoices

  ## Problem
  Three invoices with zero received_amount were incorrectly stored with net_payable = 0.
  The correct net_payable = invoice_amount_incl_vat - received_amount.

  ## Corrections
  - PSS2025-087/M2 (BI11-25100208): invoice 4,341,204.00, paid 0 → net_payable = 4,341,204.00
  - PSS2025-132/M1 (CRL25-11-00004): invoice 2,056,319.58, paid 0 → net_payable = 2,056,319.58
  - PSS2025-166/M1 (CRL25-11-00006): invoice 17,119,831.50, paid 0 → net_payable = 17,119,831.50
*/

UPDATE vendor_invoices
SET net_payable = invoice_amount_incl_vat - received_amount
WHERE id IN (
  'bbbbbbbb-2000-0000-0000-001900000002',
  'bbbbbbbb-2000-0000-0000-002300000001',
  'bbbbbbbb-2000-0000-0000-002200000001'
)
AND net_payable = 0
AND received_amount = 0;
