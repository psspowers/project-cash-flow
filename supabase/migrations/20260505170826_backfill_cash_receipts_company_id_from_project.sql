/*
  # Backfill cash_receipts.company_id from project client_entity_id

  ## What this does
  Each cash receipt belongs to a project, and each project has a client_entity_id
  pointing to the customer (subsidiary or client) who paid. The company_id column
  on cash_receipts was never populated during data migration, causing the "FROM"
  column to show "—" in the UI.

  This migration backfills company_id on every cash receipt where:
  - company_id is currently NULL
  - the linked project has a non-null client_entity_id

  ## Tables modified
  - cash_receipts: company_id populated from projects.client_entity_id

  ## No data is deleted or overwritten — only NULL values are filled in.
*/

UPDATE cash_receipts cr
SET company_id = p.client_entity_id
FROM projects p
WHERE cr.project_id = p.id
  AND cr.company_id IS NULL
  AND p.client_entity_id IS NOT NULL;
