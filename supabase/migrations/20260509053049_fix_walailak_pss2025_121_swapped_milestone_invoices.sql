/*
  # Fix Walailak – PSS2025-121 Swapped Milestone Invoices + Wrong Date

  ## Problems

  ### Invoices assigned to wrong milestones
  - DB M1 holds invoice "12" (Aug 23 2025) — Excel says M1 = invoice "10"
  - DB M2 holds invoice "10" (Jan 8 2025) — Excel says M2 = invoice "12"
  Fix: swap po_milestone_id on both invoices.

  ### M1 invoice "10" has wrong date after swap
  - Excel invoice date: 08/01/2025 (MM/DD/YYYY) = 2025-08-01
  - DB currently shows 2025-01-08 (day/month transposed)
  Fix: correct to 2025-08-01 after reassigning.
*/

DO $$
BEGIN
  -- Detach invoice "12" from M1 temporarily
  UPDATE vendor_invoices SET po_milestone_id = NULL
  WHERE id = 'aaaaaaaa-2000-0000-0000-001100000002'; -- invoice "12"

  -- Move invoice "10" from M2 → M1, fix its date to 2025-08-01
  UPDATE vendor_invoices
  SET po_milestone_id = 'aaaaaaaa-1111-0000-0000-001100000001',
      invoice_date = '2025-08-01'
  WHERE id = 'aaaaaaaa-2000-0000-0000-001100000001'; -- invoice "10"

  -- Attach invoice "12" to M2
  UPDATE vendor_invoices
  SET po_milestone_id = 'aaaaaaaa-1111-0000-0000-001100000002'
  WHERE id = 'aaaaaaaa-2000-0000-0000-001100000002'; -- invoice "12"

END $$;
