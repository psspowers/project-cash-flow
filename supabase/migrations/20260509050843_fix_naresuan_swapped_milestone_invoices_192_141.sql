/*
  # Fix Naresuan – Swapped Milestone Invoice Assignments

  ## Problem
  Two POs had invoices assigned to the wrong milestones:

  ### PSS2024-192 (Green Glow Energy)
  - DB M2 holds invoice 2024/147 (Nov 2024) — should be in M3
  - DB M3 holds invoice 2024/136 (Oct 2024) — should be in M2
  Fix: swap po_milestone_id on these two invoices.

  ### PSS2025-141 (CPT Drives – RMU)
  - DB M1 holds invoice BL2025100029 (Oct 2025) — should be in M2
  - DB M2 holds invoice BL2025090042 (Sep 2025) — should be in M1
  - BL2025100029 also has wrong invoice_date 2025-09-10 → correct 2025-10-09
  Fix: swap po_milestone_id and correct the date on BL2025100029.

  ## Method
  Temporarily NULL the milestone link on one invoice per pair, then reassign both.
*/

DO $$
BEGIN
  -- ── PSS2024-192: swap M2 (2024/147) ↔ M3 (2024/136) ──────────────────────

  -- Temporarily detach 2024/147 from M2
  UPDATE vendor_invoices SET po_milestone_id = NULL
  WHERE id = 'bbbbbbbb-2000-0000-0000-000500000003';

  -- Move 2024/136 from M3 → M2
  UPDATE vendor_invoices
  SET po_milestone_id = 'bbbbbbbb-1111-0000-0000-000500000002'
  WHERE id = 'bbbbbbbb-2000-0000-0000-000500000002';

  -- Attach 2024/147 to M3
  UPDATE vendor_invoices
  SET po_milestone_id = 'bbbbbbbb-1111-0000-0000-000500000003'
  WHERE id = 'bbbbbbbb-2000-0000-0000-000500000003';


  -- ── PSS2025-141: swap M1 (BL2025100029) ↔ M2 (BL2025090042) ──────────────

  -- Temporarily detach BL2025100029 from M1
  UPDATE vendor_invoices SET po_milestone_id = NULL
  WHERE id = 'bbbbbbbb-2000-0000-0000-002600000002';

  -- Move BL2025090042 from M2 → M1
  UPDATE vendor_invoices
  SET po_milestone_id = 'bbbbbbbb-1111-0000-0000-002600000001'
  WHERE id = 'bbbbbbbb-2000-0000-0000-002600000001';

  -- Attach BL2025100029 to M2, fix its invoice_date
  UPDATE vendor_invoices
  SET po_milestone_id = 'bbbbbbbb-1111-0000-0000-002600000002',
      invoice_date = '2025-10-09'
  WHERE id = 'bbbbbbbb-2000-0000-0000-002600000002';

END $$;
