/*
  # Fix RCP – net_payable = 0 on Unpaid Invoices

  ## Problem
  Three PSS2025-150 invoices have been received but not yet paid.
  net_payable was incorrectly stored as 0 for all three.

  ## Corrections
  - M2 (BI6903002): invoice 2,024,816.64, paid 0 → net_payable = 2,024,816.64
  - M3 (BI6904014): invoice 6,074,449.92, paid 0 → net_payable = 6,074,449.92
  - M4 (BI6904015): invoice 3,037,224.96, paid 0 → net_payable = 3,037,224.96
*/

UPDATE vendor_invoices
SET net_payable = invoice_amount_incl_vat - received_amount
WHERE id IN (
  '44444444-2000-0000-0000-000100000002',
  '44444444-2000-0000-0000-000100000003',
  '44444444-2000-0000-0000-000100000004'
)
AND net_payable = 0
AND received_amount = 0;
