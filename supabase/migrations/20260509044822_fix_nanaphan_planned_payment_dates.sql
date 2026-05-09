/*
  # Fix incorrect planned_payment_date on two PO milestones — Nanaphan project

  ## Problem
  Two milestones have planned payment dates that do not match the Excel source of truth.

  1. PSS2024-142 / M2 (Envision)
     - DB value : 2026-05-04
     - Excel     : 2026-01-06  (6 Jan 2026, Column T)

  2. PSS2025-070R2 / M5 (NP.ELECTRIC)
     - DB value : 2025-07-01  (stored as Jul 1 — wrong interpretation of DD/MM/YYYY)
     - Excel     : 2025-01-07  (7 Jan 2025, Column T)

  ## Fix
  Update planned_payment_date to the correct values for each milestone,
  identified by PO number + milestone_number.
*/

-- Fix PSS2024-142 / M2
UPDATE po_milestones
SET planned_payment_date = '2026-01-06'
WHERE purchase_order_id = (
  SELECT id FROM purchase_orders
  WHERE pss_po_no = 'PSS2024-142'
    AND project_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
)
AND milestone_number = 2;

-- Fix PSS2025-070R2 / M5
UPDATE po_milestones
SET planned_payment_date = '2025-01-07'
WHERE purchase_order_id = (
  SELECT id FROM purchase_orders
  WHERE pss_po_no = 'PSS2025-070R2'
    AND project_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
)
AND milestone_number = 5;
