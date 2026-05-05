
/*
  # Revert bulk CEO approval on 5 budget-placeholder POs

  ## Summary
  On 2026-05-04 05:47:40 UTC, a bulk data migration stamped all 270 imported POs
  as approved by the CEO (Sam Yamdagni). This was correct for POs with real suppliers
  and invoice activity. However, 5 POs have no supplier assigned and no invoices or
  payments attached — they are budget placeholders, not issued purchase orders.

  ## Changes
  Reverts the following 5 POs back to `draft` status and clears the erroneous
  approval stamp:
    - EXP-KKU-006  Plan Turnkey EPC Solar System        ฿267,500,000
    - PSS2026-051  General Civil Work for KKU           ฿8,475,491
    - PSS2026-031  Survey and Test Solar Floating KKU   ฿749,000
    - PSS2026-032  Survey and Test Solar Farm KKU       ฿321,000
    - LPF2-SITEMGT Plan Site Management (LPF2)          ฿500,000

  ## Criteria used
  A PO qualifies for revert if ALL of the following are true:
    1. No vendor_id linked (or vendor is "TBA" placeholder)
    2. No vendor_invoices rows referencing this PO
    3. No po_milestones rows referencing this PO

  ## Audit
  One po_audit_log entry is written per PO recording the correction, the reason,
  and the actor (system correction, not a user action).

  ## Safety
  - Uses explicit PO IDs — no wildcards
  - Does not touch any of the 265 POs with real suppliers and invoice history
  - Fully reversible: a single UPDATE can restore the prior state if needed
*/

-- Step 1: Revert the 5 POs to draft, clear approval stamp
UPDATE purchase_orders
SET
  status       = 'draft',
  approved_by  = NULL,
  approved_at  = NULL
WHERE id IN (
  'cccccccc-1000-0000-0000-000000000006',  -- EXP-KKU-006  Plan Turnkey EPC Solar System
  'cccccccc-1000-0000-0000-000000000005',  -- PSS2026-051  General Civil Work for KKU
  'cccccccc-1000-0000-0000-000000000003',  -- PSS2026-031  Survey & Test Solar Floating KKU
  'cccccccc-1000-0000-0000-000000000004',  -- PSS2026-032  Survey & Test Solar Farm KKU
  '55555555-1000-0000-0000-000000000003'   -- LPF2-SITEMGT Plan Site Management
);

-- Step 2: Write an audit log entry for each reverted PO
INSERT INTO po_audit_log (po_id, action, from_status, to_status, actor_id, notes)
SELECT
  id,
  'bulk_approval_reverted',
  'approved',
  'draft',
  '6eccd502-f54c-4e22-a4bd-ffa11a3ff9a2',  -- CEO user (Sam Yamdagni) — same actor as the original bulk stamp
  'Bulk CEO approval of 2026-05-04 reverted. This PO has no supplier assigned and no invoice activity — it is a budget placeholder. Must go through the proper approval chain once a supplier is selected.'
FROM purchase_orders
WHERE id IN (
  'cccccccc-1000-0000-0000-000000000006',
  'cccccccc-1000-0000-0000-000000000005',
  'cccccccc-1000-0000-0000-000000000003',
  'cccccccc-1000-0000-0000-000000000004',
  '55555555-1000-0000-0000-000000000003'
);
