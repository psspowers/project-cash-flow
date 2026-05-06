
/*
  # Fix two misclassified vendor invoices

  ## Problem
  Two invoices are marked as 'paid' but have received_amount = 0, meaning they
  have not actually been paid. This causes them to appear in the Paid Invoices
  tab instead of the Invoice Balance tab, understating the ฿65.2M balance total.

  ## Changes

  ### vendor_invoices — status corrections
  1. INV2602003 (Nanapan SSV M6, ฿1,365,572.52)
     - Was: status = 'paid', received_amount = 0
     - Now: status = 'released'
  2. 2789023124 (Walailak REPCO M2, ฿10,111,500)
     - Was: status = 'paid', received_amount = 0
     - Now: status = 'released'

  ## Expected outcome
  Both invoices will now appear in the Invoice Balance pivot table and the
  Dashboard Col O total will increase by ฿11,477,072.52 to reflect the
  correct outstanding payable figure.
*/

UPDATE vendor_invoices
SET status = 'released'
WHERE vendor_invoice_no = 'INV2602003'
  AND status = 'paid'
  AND received_amount = 0;

UPDATE vendor_invoices
SET status = 'released'
WHERE vendor_invoice_no = '2789023124'
  AND status = 'paid'
  AND received_amount = 0;
