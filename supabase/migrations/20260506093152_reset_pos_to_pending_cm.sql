/*
  # Reset POs to pending_cm for fresh CM approval

  Resets 8 specific POs from 'approved' back to 'pending_cm' so the
  Procurement team can go through the Construction Manager approval flow
  from the beginning. Clears approval timestamps and approver references.

  Affected POs:
    EXP-KKU-007, EXP-NAR-032, EXP-NAR-040, EXP-NAR-051,
    EXP-RCP-002, EXP-WAL-016, EXP-WAL-017, EXP-WAL-018
*/

UPDATE purchase_orders
SET
  status            = 'pending_cm',
  approved_by       = NULL,
  approved_at       = NULL,
  submitted_by      = NULL,
  submitted_at      = NULL
WHERE pss_po_no IN (
  'EXP-KKU-007',
  'EXP-NAR-032',
  'EXP-NAR-040',
  'EXP-NAR-051',
  'EXP-RCP-002',
  'EXP-WAL-016',
  'EXP-WAL-017',
  'EXP-WAL-018'
)
AND status = 'approved';
