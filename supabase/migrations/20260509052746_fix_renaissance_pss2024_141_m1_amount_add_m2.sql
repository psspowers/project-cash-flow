/*
  # Fix Renaissance – PSS2024-141 M1 Wrong Amount and Missing M2

  ## Problems

  ### M1 stored with full contract value instead of milestone amount
  - DB M1 amount_due = 121,766.00 (= full contract incl. VAT)
  - Excel M1 amount_due = 24,353.20
  - DB M1 invoice IV2406047 invoice_amount_incl_vat = 121,766.00 (wrong)
  - Correct invoice value = 24,353.20, fully paid
  Fix: correct amount_due on milestone and invoice amounts.

  ### M2 milestone and invoice missing entirely
  - Excel M2: amount_due = 97,412.80, invoice IV2410022 dated 10/12/2024 (MM/DD = Oct 12),
    invoice_value = 97,412.80, fully paid
  Fix: insert po_milestones and vendor_invoices records for M2.
*/

-- Fix M1 milestone amount_due
UPDATE po_milestones
SET amount_due = 24353.20
WHERE id = '11111111-1111-0000-0000-001200000001';

-- Fix M1 invoice amount (received_amount matches corrected amount, net_payable stays 0)
UPDATE vendor_invoices
SET invoice_amount_incl_vat = 24353.20,
    received_amount = 24353.20,
    net_payable = 0
WHERE id = '11111111-2000-0000-0000-001200000001';

-- Insert M2 milestone
INSERT INTO po_milestones (
  id, purchase_order_id, milestone_number, amount_due, milestone_pct,
  planned_payment_date, status, created_at
)
VALUES (
  '11111111-1111-0000-0000-001200000002',
  '11111111-1000-0000-0000-000000000012',
  2,
  97412.80,
  0.0,
  NULL,
  'paid',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Insert M2 invoice IV2410022
INSERT INTO vendor_invoices (
  id, po_milestone_id, vendor_invoice_no, invoice_date,
  invoice_amount_incl_vat, received_amount, net_payable,
  status, created_at
)
VALUES (
  '11111111-2000-0000-0000-001200000002',
  '11111111-1111-0000-0000-001200000002',
  'IV2410022',
  '2024-10-12',
  97412.80,
  97412.80,
  0,
  'paid',
  now()
)
ON CONFLICT (id) DO NOTHING;
