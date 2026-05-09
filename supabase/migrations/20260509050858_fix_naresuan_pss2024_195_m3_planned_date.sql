/*
  # Fix Naresuan – PSS2024-195/M3 Missing Planned Payment Date

  ## Problem
  PSS2024-195 (Parabolic Asia – construction permit) M3 has no planned_payment_date.
  Excel specifies planned date 10/01/2026 (MM/DD/YYYY) = 2026-10-01.
*/

UPDATE po_milestones
SET planned_payment_date = '2026-10-01'
WHERE id = '24d4bb19-f805-4a19-8090-643e98a8319f';
