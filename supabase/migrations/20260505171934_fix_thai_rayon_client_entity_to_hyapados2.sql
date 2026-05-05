/*
  # Fix Thai Rayon projects client_entity_id to HYAPADOS 2 CO.,LTD.

  ## What this does
  Both Thai Rayon projects (one with no client set, one incorrectly linked to
  "Thai Rayon Public Co Ltd") should have HYAPADOS 2 CO.,LTD. as the customer.

  ## Tables modified
  1. projects — client_entity_id set for both Thai Rayon entries
  2. cash_receipts — company_id corrected for receipts linked to those projects
*/

UPDATE projects
SET client_entity_id = '11111111-1111-1111-1111-111111111101'
WHERE name ILIKE '%thai ra%';

UPDATE cash_receipts cr
SET company_id = '11111111-1111-1111-1111-111111111101'
FROM projects p
WHERE cr.project_id = p.id
  AND p.name ILIKE '%thai ra%';
