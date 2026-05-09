/*
  # Fix Walailak – net_payable = 0 on Unpaid Invoices

  ## Problem
  Four invoices with zero received_amount were incorrectly stored with net_payable = 0.

  ## Corrections
  - EXP-WAL-002/M3 (PCI25030001): invoice 3,852,000, paid 0 → net_payable = 3,852,000
  - EXP-WAL-002/M4 (PCI25030002): invoice 3,852,000, paid 0 → net_payable = 3,852,000
  - EXP-WAL-002/M5 (PCI25030003): invoice 3,852,000, paid 0 → net_payable = 3,852,000
  - PSS2025-054/M7 (9-002/2568): invoice 189,355.76, paid 0 → net_payable = 189,355.76
*/

UPDATE vendor_invoices
SET net_payable = invoice_amount_incl_vat - received_amount
WHERE id IN (
  '871f6501-e171-474f-a5d8-28e8a29663de',
  'a4770a6b-eb28-455e-9ce9-3f46e1a79673',
  'de398828-a94d-43db-ae80-97d2e9b09037',
  'aaaaaaaa-2000-0000-0000-000600000007'
)
AND net_payable = 0
AND received_amount = 0;
