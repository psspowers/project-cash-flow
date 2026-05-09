/*
  # Fix incorrect invoice_date on two vendor invoices — Nanaphan project

  ## Problem
  Two invoices have invoice_date that does not match the Excel source of truth.
  Both were stored as 2025-06-08 (Jun 8) when the correct date is 2025-01-09 (9 Jan 2025,
  read from DD/MM/YYYY format in the Excel: 09/01/2025).

  1. PSS2025-071 / M2 — invoice NCE-NP6808-007
     - DB value : 2025-06-08
     - Excel     : 2025-01-09  (Column S – Pay Date)

  2. PSS2025-072R1 / M2 — invoice NCE-NP6808-006
     - DB value : 2025-06-08
     - Excel     : 2025-01-09  (Column S – Pay Date)

  ## Fix
  Update invoice_date to 2025-01-09 identified by vendor_invoice_no.
*/

UPDATE vendor_invoices
SET invoice_date = '2025-01-09'
WHERE vendor_invoice_no = 'NCE-NP6808-007'
  AND project_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

UPDATE vendor_invoices
SET invoice_date = '2025-01-09'
WHERE vendor_invoice_no = 'NCE-NP6808-006'
  AND project_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
