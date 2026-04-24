/*
  # Phase 2 – Populate Planned Payment Dates

  ## Summary
  Two-part migration to populate date fields that power the Cash Flow Planner timeline.

  ## Part A — vendor_invoices.planned_payment_date
  - Paid invoices: planned_payment_date = invoice_date (payment already occurred)
  - Received (unpaid) invoices: planned_payment_date = invoice_date + 30 days (standard payment terms)
  - Only touches rows where planned_payment_date IS NULL

  ## Part B — client_milestones.planned_receive_date
  - Populates expected client payment receipt dates for 3 projects extracted from Excel forecast:
    Walailak (8 milestones), KKU (8 milestones), RCP (8 milestones), LPF2/Meat Frozen (8 milestones)
  - Only touches rows where planned_receive_date IS NULL

  ## Notes
  - No rows are deleted or restructured — pure UPDATE, fully reversible
  - All updates are idempotent (WHERE planned_X IS NULL guards against re-runs)
*/

-- ── PART A: vendor_invoices.planned_payment_date ─────────────────────────────

-- Paid invoices: payment already happened on invoice_date
UPDATE vendor_invoices
SET planned_payment_date = invoice_date
WHERE status = 'paid'
  AND invoice_date IS NOT NULL
  AND planned_payment_date IS NULL;

-- Received but unpaid: default to invoice_date + 30 days
UPDATE vendor_invoices
SET planned_payment_date = invoice_date + INTERVAL '30 days'
WHERE status = 'received'
  AND invoice_date IS NOT NULL
  AND planned_payment_date IS NULL;

-- ── PART B: client_milestones.planned_receive_date ───────────────────────────

-- Walailak
UPDATE client_milestones SET planned_receive_date = '2025-05-01'
WHERE milestone_number = 1 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2025-05-01'
WHERE milestone_number = 2 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2025-06-01'
WHERE milestone_number = 3 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2025-06-01'
WHERE milestone_number = 4 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2025-07-01'
WHERE milestone_number = 5 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2025-11-01'
WHERE milestone_number = 6 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2025-12-01'
WHERE milestone_number = 7 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2025-12-01'
WHERE milestone_number = 8 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%Walailak%' LIMIT 1);

-- KKU
UPDATE client_milestones SET planned_receive_date = '2026-03-10'
WHERE milestone_number = 1 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 2 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 3 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-06-01'
WHERE milestone_number = 4 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-08-01'
WHERE milestone_number = 5 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-10-01'
WHERE milestone_number = 6 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-11-01'
WHERE milestone_number = 7 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-12-01'
WHERE milestone_number = 8 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%KKU%' LIMIT 1);

-- RCP
UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 1 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 2 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 3 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 4 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 5 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-06-01'
WHERE milestone_number = 6 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-08-01'
WHERE milestone_number = 7 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-10-01'
WHERE milestone_number = 8 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE name ILIKE '%RCP%' LIMIT 1);

-- LPF2 / Meat Frozen
UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 1 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 2 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-03-23'
WHERE milestone_number = 3 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-05-01'
WHERE milestone_number = 4 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-07-01'
WHERE milestone_number = 5 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-09-01'
WHERE milestone_number = 6 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-11-01'
WHERE milestone_number = 7 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);

UPDATE client_milestones SET planned_receive_date = '2026-12-01'
WHERE milestone_number = 8 AND planned_receive_date IS NULL
  AND project_id = (SELECT id FROM projects WHERE (name ILIKE '%LPF2%' OR name ILIKE '%Meat Frozen%') LIMIT 1);
