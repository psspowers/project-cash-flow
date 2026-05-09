/*
  # Fix Walailak – PSS2025-131 Add Missing M2 Milestone

  ## Problem
  PSS2025-131 (ESA Report – Thai Solution Service) only has M1 in the DB.
  Excel shows M2: amount_due = 212,216.67, planned = 02/28/2027 (MM/DD = Feb 28 2027),
  no invoice yet, status pending.
*/

INSERT INTO po_milestones (
  id, purchase_order_id, milestone_number, amount_due, milestone_pct,
  planned_payment_date, status, created_at
)
VALUES (
  'aaaaaaaa-1111-0000-0000-001200000002',
  'aaaaaaaa-1000-0000-0000-000000000012',
  2,
  212216.67,
  0.0,
  '2027-02-28',
  'pending',
  now()
)
ON CONFLICT (id) DO NOTHING;
