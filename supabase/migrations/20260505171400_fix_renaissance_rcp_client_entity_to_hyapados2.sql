/*
  # Fix Renaissance and RCP projects client_entity_id to HYAPADOS 2 CO.,LTD.

  ## What this does
  Renaissance and RCP projects were linked to their site-owner entities
  ("Renaissance Hotel", "RCP Co.,Ltd.") as the client. The correct
  customer/payer is HYAPADOS 2 CO.,LTD. — the PSS subsidiary that holds
  the EPC contracts and issues invoices for these projects.

  ## Tables modified
  1. projects — client_entity_id corrected for Renaissance and RCP
  2. cash_receipts — company_id corrected for receipts linked to those projects
*/

UPDATE projects
SET client_entity_id = '11111111-1111-1111-1111-111111111101'
WHERE id IN (
  '11111111-aaaa-bbbb-cccc-aaaaaaaaaaaa',  -- Renaissance
  '44444444-aaaa-bbbb-cccc-aaaaaaaaaaaa'   -- RCP
);

UPDATE cash_receipts cr
SET company_id = '11111111-1111-1111-1111-111111111101'
FROM projects p
WHERE cr.project_id = p.id
  AND p.id IN (
    '11111111-aaaa-bbbb-cccc-aaaaaaaaaaaa',
    '44444444-aaaa-bbbb-cccc-aaaaaaaaaaaa'
  );
