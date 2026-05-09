/*
  # Fix Walailak – PSS2025-106 Invoice Date Issues

  ## Problems

  ### M2 (invoice 2789023124) — invoice_date is NULL
  - Excel date: 03/13/2026 (MM/DD/YYYY) = 2026-03-13
  Fix: set invoice_date to 2026-03-13.

  ### M3 (invoice 2789022498) — invoice_date day/month swapped
  - DB: 2026-08-01 (stored as Aug 1)
  - Excel: 01/08/2026 (MM/DD/YYYY) = Jan 8, 2026
  Fix: correct to 2026-01-08.
*/

-- M2: set missing invoice_date
UPDATE vendor_invoices
SET invoice_date = '2026-03-13'
WHERE id = 'ccc6a0c8-9020-4d9f-83a7-b51af25ce4fa';

-- M3: correct swapped date
UPDATE vendor_invoices
SET invoice_date = '2026-01-08'
WHERE id = 'aaaaaaaa-2000-0000-0000-000100000003';
