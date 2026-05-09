/*
  # Fix Naresuan – Swapped Day/Month Invoice Dates

  ## Problem
  Multiple invoices were entered with DD/MM/YYYY format but stored as MM/DD,
  causing day and month to be transposed.

  ## Corrections (Excel MM/DD/YYYY authoritative)
  - PSS2024-045:  stored 2024-04-02 → correct 2024-02-04
  - PSS2024-151:  stored 2024-07-02 → correct 2024-02-07
  - PSS2025-030/M4 (INV25/09/242): stored 2025-03-09 → correct 2025-09-03
  - PSS2025-084:  stored 2025-01-10 → correct 2025-10-01
  - PSS2025-127 (INV25/09/243): stored 2025-03-09 → correct 2025-09-03
  - PSS2025-132 (CRL25-11-00004): stored 2025-03-11 → correct 2025-11-03
  - PSS2025-143 (INV25/10/260): stored 2025-07-10 → correct 2025-10-07
  - PSS2025-154 (BEST2510030): stored 2025-07-10 → correct 2025-10-07
  - PSS2025-166 (CRL25-11-00006): stored 2025-03-11 → correct 2025-11-03
  - EXP-NAR-048: stored 2025-01-03 → correct 2025-03-01
  - EXP-NAR-049: stored 2025-01-03 → correct 2025-03-01
*/

UPDATE vendor_invoices SET invoice_date = '2024-02-04'
WHERE id = 'bbbbbbbb-2000-0000-0000-000200000001';

UPDATE vendor_invoices SET invoice_date = '2024-02-07'
WHERE id = 'bbbbbbbb-2000-0000-0000-000400000001';

UPDATE vendor_invoices SET invoice_date = '2025-09-03'
WHERE id = 'bbbbbbbb-2000-0000-0000-001600000004';

UPDATE vendor_invoices SET invoice_date = '2025-10-01'
WHERE id = 'bbbbbbbb-2000-0000-0000-001700000001';

UPDATE vendor_invoices SET invoice_date = '2025-09-03'
WHERE id = 'bbbbbbbb-2000-0000-0000-002400000001';

UPDATE vendor_invoices SET invoice_date = '2025-11-03'
WHERE id = 'bbbbbbbb-2000-0000-0000-002300000001';

UPDATE vendor_invoices SET invoice_date = '2025-10-07'
WHERE id = 'bbbbbbbb-2000-0000-0000-002700000001';

UPDATE vendor_invoices SET invoice_date = '2025-10-07'
WHERE id = 'bbbbbbbb-2000-0000-0000-002900000001';

UPDATE vendor_invoices SET invoice_date = '2025-11-03'
WHERE id = 'bbbbbbbb-2000-0000-0000-002200000001';

UPDATE vendor_invoices SET invoice_date = '2025-03-01'
WHERE id = 'bbbbbbbb-2000-0000-0000-004800000001';

UPDATE vendor_invoices SET invoice_date = '2025-03-01'
WHERE id = 'bbbbbbbb-2000-0000-0000-004900000001';
