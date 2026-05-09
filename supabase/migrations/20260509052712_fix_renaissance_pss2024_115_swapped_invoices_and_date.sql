/*
  # Fix Renaissance – PSS2024-115 Swapped Milestone Invoices and Wrong Date

  ## Problems

  ### Swapped invoices (M3 ↔ M5)
  - DB M3 holds IV-PJ-2024-498 (Nov 20 2024) — Excel says M3 = IV-PJ-2024-410
  - DB M5 holds IV-PJ-2024-410 (Dec 9 2024) — Excel says M5 = IV-PJ-2024-498
  Fix: swap po_milestone_id on these two invoices.

  ### Wrong date on IV-PJ-2024-410 (M3 after swap)
  - Excel invoice date for M3: 09/12/2024 (MM/DD/YYYY) = 2024-09-12
  - DB currently shows 2024-12-09 (day/month transposed)
  Fix: correct to 2024-09-12 after reassigning to M3.

  ### Wrong date on IV-PJ-2024-455 (M4)
  - Excel invoice date: 11/06/2024 (MM/DD/YYYY) = 2024-11-06
  - DB shows 2024-06-11 (day/month transposed)
  Fix: correct to 2024-11-06.
*/

DO $$
BEGIN
  -- ── Swap M3 (IV-PJ-2024-498) ↔ M5 (IV-PJ-2024-410) ─────────────────────

  -- Detach IV-PJ-2024-498 from M3 temporarily
  UPDATE vendor_invoices SET po_milestone_id = NULL
  WHERE id = '11111111-2000-0000-0000-000800000005'; -- IV-PJ-2024-498

  -- Move IV-PJ-2024-410 from M5 → M3, fix its date to 2024-09-12
  UPDATE vendor_invoices
  SET po_milestone_id = '11111111-1111-0000-0000-000800000003',
      invoice_date = '2024-09-12'
  WHERE id = '11111111-2000-0000-0000-000800000003'; -- IV-PJ-2024-410

  -- Attach IV-PJ-2024-498 to M5
  UPDATE vendor_invoices
  SET po_milestone_id = '11111111-1111-0000-0000-000800000005'
  WHERE id = '11111111-2000-0000-0000-000800000005'; -- IV-PJ-2024-498

  -- ── Fix M4 invoice date (IV-PJ-2024-455) ─────────────────────────────────
  UPDATE vendor_invoices
  SET invoice_date = '2024-11-06'
  WHERE id = '11111111-2000-0000-0000-000800000004'; -- IV-PJ-2024-455

END $$;
