/*
  # Create Project Expenses Table

  ## Purpose
  Adds a lightweight "direct expense" concept — costs that are recorded directly 
  against a project without going through the full PO approval workflow. Examples: 
  petty cash, small reimbursable items, miscellaneous site costs.

  ## New Tables
  - `project_expenses`
    - `id` (uuid, PK)
    - `project_id` (uuid, FK → projects)
    - `cost_category` (text) — matches CostCategory enum used in purchase_orders
    - `description` (text)
    - `amount` (numeric) — amount excl. VAT
    - `expense_date` (date)
    - `receipt_ref` (text, nullable) — optional reference number or receipt identifier
    - `submitted_by` (uuid, FK → user_profiles)
    - `status` (text) — 'draft' | 'approved' | 'rejected'
    - `approved_by` (uuid, nullable)
    - `approved_at` (timestamptz, nullable)
    - `rejection_comment` (text, nullable)
    - `created_at` (timestamptz, default now())

  ## Security
  - RLS enabled (restrictive by default)
  - SELECT: authenticated users who can read procurement data
  - INSERT: cost_controller and procurement roles only
  - UPDATE: cost_controller and procurement roles (own records), plus approvers
  - DELETE: not permitted (use rejection instead)

  ## Notes
  1. No separate approval workflow table — status is tracked inline.
  2. Integrates with project costing totals via direct queries.
  3. cost_category uses same string values as purchase_orders for consistency.
*/

CREATE TABLE IF NOT EXISTS project_expenses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  cost_category   text NOT NULL,
  description     text NOT NULL DEFAULT '',
  amount          numeric(14,2) NOT NULL DEFAULT 0,
  expense_date    date,
  receipt_ref     text,
  submitted_by    uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'rejected')),
  approved_by     uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  rejection_comment text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_expenses_project_id_idx ON project_expenses(project_id);
CREATE INDEX IF NOT EXISTS project_expenses_submitted_by_idx ON project_expenses(submitted_by);
CREATE INDEX IF NOT EXISTS project_expenses_status_idx ON project_expenses(status);

ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users who normally access procurement data
CREATE POLICY "Authenticated users can view project expenses"
  ON project_expenses FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- INSERT: cost_controller and procurement roles
CREATE POLICY "Procurement roles can create expenses"
  ON project_expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('cost_controller', 'procurement')
    )
  );

-- UPDATE: submitters can update their own draft expenses; approvers (construction_manager, evp, ceo) can update status
CREATE POLICY "Submitters can update own draft expenses"
  ON project_expenses FOR UPDATE
  TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    submitted_by = auth.uid()
  );

CREATE POLICY "Approvers can update expense status"
  ON project_expenses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('construction_manager', 'evp', 'ceo', 'cost_controller')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('construction_manager', 'evp', 'ceo', 'cost_controller')
    )
  );
