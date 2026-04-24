/*
  # Fix Naresuan Milestone 2 — split into two invoices

  ## Summary
  Milestone 2 of the Naresuan project (project_id bbbb…) has a Payment Plan of
  20,223,000 THB but was actually invoiced in two separate PSS invoices:
    - IV2025080014  dated 2025-08-19  for 13,564,390.00 (received)
    - IV2025090015  dated 2025-09-18  for  1,308,610.00 (received)

  The migration step (008) inserted a single row copying the full
  planned_amount_incl_vat as invoice_amount, which is incorrect.
  This migration:
    1. Removes that placeholder row for IV2025080014.
    2. Inserts the two correct invoice rows with accurate amounts.

  Note: The remaining balance of 20,223,000 - 13,564,390 - 1,308,610 = 5,350,000
  is not yet invoiced and is represented only by the planned_amount on the milestone.
*/

-- Remove the auto-migrated placeholder for Milestone 2 / IV2025080014
DELETE FROM milestone_invoices
WHERE milestone_id = '6102d3c7-1ea8-465b-a5b0-c838502d4990'
  AND invoice_no = 'IV2025080014';

-- Insert the two real invoices
INSERT INTO milestone_invoices
  (milestone_id, project_id, invoice_no, invoice_date, invoice_amount, received_amount, receipt_date, status)
VALUES
  (
    '6102d3c7-1ea8-465b-a5b0-c838502d4990',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'IV2025080014',
    '2025-08-19',
    13564390.00,
    13564390.00,
    '2025-08-19',
    'received'
  ),
  (
    '6102d3c7-1ea8-465b-a5b0-c838502d4990',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'IV2025090015',
    '2025-09-18',
    1308610.00,
    1308610.00,
    '2025-09-18',
    'received'
  );
