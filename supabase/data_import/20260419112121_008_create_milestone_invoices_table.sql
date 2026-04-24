/*
  # Create milestone_invoices table

  ## Summary
  Replaces the single pss_invoice_no / invoice_date fields on milestones with a
  dedicated child table so each milestone can carry one OR many invoices.

  ## New Tables
  - `milestone_invoices`
    - `id`                  – UUID primary key
    - `milestone_id`        – FK → milestones.id
    - `project_id`          – FK → projects.id (denormalised for easy querying)
    - `invoice_no`          – PSS invoice reference (e.g. IV2025080013)
    - `invoice_date`        – Date the invoice was issued
    - `invoice_amount`      – Amount incl. VAT on this invoice
    - `received_amount`     – Amount actually received against this invoice (0 until paid)
    - `receipt_date`        – Date payment was received
    - `status`              – 'invoiced' | 'received' | 'partial'
    - `notes`               – Free-text notes
    - `created_at`

  ## Migration of existing data
  All existing pss_invoice_no / invoice_date values on milestones are copied into
  the new table so no data is lost.  The old columns are NOT dropped (backwards
  compatibility) but the new table is the source of truth going forward.

  ## Security
  - RLS enabled; authenticated users can read/insert/update rows for projects
    they can already see (mirrors milestones policy).
*/

CREATE TABLE IF NOT EXISTS milestone_invoices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id     uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES projects(id)   ON DELETE CASCADE,
  invoice_no       text NOT NULL,
  invoice_date     date,
  invoice_amount   numeric(15,2) NOT NULL DEFAULT 0,
  received_amount  numeric(15,2) NOT NULL DEFAULT 0,
  receipt_date     date,
  status           text NOT NULL DEFAULT 'invoiced'
                   CHECK (status IN ('invoiced','partial','received')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE milestone_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view milestone invoices"
  ON milestone_invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert milestone invoices"
  ON milestone_invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update milestone invoices"
  ON milestone_invoices FOR UPDATE
  TO authenticated
  USING  (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete milestone invoices"
  ON milestone_invoices FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_milestone_invoices_milestone_id ON milestone_invoices(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_invoices_project_id   ON milestone_invoices(project_id);

-- -----------------------------------------------------------------------
-- Migrate existing single invoices from milestones into the new table
-- Only rows that already have a pss_invoice_no are migrated.
-- The amount defaults to planned_amount_incl_vat (best available figure).
-- -----------------------------------------------------------------------
INSERT INTO milestone_invoices (milestone_id, project_id, invoice_no, invoice_date, invoice_amount, received_amount, receipt_date, status)
SELECT
  m.id,
  m.project_id,
  m.pss_invoice_no,
  m.invoice_date,
  m.planned_amount_incl_vat,
  CASE WHEN m.status = 'received' THEN m.planned_amount_incl_vat ELSE 0 END,
  CASE WHEN m.status = 'received' THEN m.invoice_date ELSE NULL END,
  m.status
FROM milestones m
WHERE m.pss_invoice_no IS NOT NULL
  AND m.pss_invoice_no <> ''
ON CONFLICT DO NOTHING;
