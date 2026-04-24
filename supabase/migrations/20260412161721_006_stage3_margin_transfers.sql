/*
  # Stage 3: Margin Transfer Workflow

  ## Summary
  Adds a two-step approval workflow to project_cash_transfers table and
  a DB-level margin guard trigger.

  ## Changes to project_cash_transfers
  - status: proposed → evp_recommended → ceo_approved | rejected
  - proposed_by / proposed_at: who submitted the transfer proposal
  - recommended_by / recommended_at / recommended_notes: EVP recommendation
  - approved_by / approved_at: CEO final approval
  - rejected_by / rejected_at / rejection_reason: rejection tracking

  ## New DB Objects
  - Function: check_transfer_margin() — validates available margin at CEO approval
  - Trigger: enforce_transfer_margin — fires BEFORE UPDATE on project_cash_transfers

  ## Security
  - RLS remains as-is (authenticated users can read/update project_cash_transfers)
*/

ALTER TABLE project_cash_transfers
  ADD COLUMN IF NOT EXISTS status text
    DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'evp_recommended', 'ceo_approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS proposed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recommended_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS recommended_at timestamptz,
  ADD COLUMN IF NOT EXISTS recommended_notes text,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

DROP TRIGGER IF EXISTS enforce_transfer_margin ON project_cash_transfers;
DROP FUNCTION IF EXISTS check_transfer_margin();

CREATE OR REPLACE FUNCTION check_transfer_margin()
RETURNS TRIGGER AS $$
DECLARE
  v_collection_rate numeric;
  v_contract_incl_vat numeric;
  v_total_received numeric;
  v_budget_cost_excl_vat numeric;
  v_forecast_margin numeric;
  v_releasable_margin numeric;
  v_already_transferred numeric;
  v_available numeric;
BEGIN
  IF NEW.status != 'ceo_approved' THEN
    RETURN NEW;
  END IF;

  SELECT contract_incl_vat INTO v_contract_incl_vat
    FROM projects WHERE id = NEW.from_project_id;

  SELECT COALESCE(SUM(net_received), 0) INTO v_total_received
    FROM cash_receipts WHERE project_id = NEW.from_project_id;

  SELECT total_cost_excl_vat INTO v_budget_cost_excl_vat
    FROM project_costings
    WHERE project_id = NEW.from_project_id
      AND stage = 'budget'
      AND status = 'evp_approved'
    LIMIT 1;

  IF v_budget_cost_excl_vat IS NULL THEN
    RAISE EXCEPTION 'Transfer blocked: project has no EVP-approved budget.';
  END IF;

  v_forecast_margin := v_contract_incl_vat - (v_budget_cost_excl_vat * 1.07);

  IF v_contract_incl_vat = 0 THEN
    RAISE EXCEPTION 'Transfer blocked: contract value is zero.';
  END IF;

  v_collection_rate := v_total_received / v_contract_incl_vat;
  v_releasable_margin := v_forecast_margin * v_collection_rate;

  SELECT COALESCE(SUM(amount), 0) INTO v_already_transferred
    FROM project_cash_transfers
    WHERE from_project_id = NEW.from_project_id
      AND status = 'ceo_approved'
      AND id != NEW.id;

  v_available := GREATEST(0, v_releasable_margin - v_already_transferred);

  IF NEW.amount > v_available THEN
    RAISE EXCEPTION
      'Transfer blocked: available margin is ฿%. Requested ฿%.',
      ROUND(v_available), ROUND(NEW.amount);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_transfer_margin
  BEFORE UPDATE ON project_cash_transfers
  FOR EACH ROW EXECUTE FUNCTION check_transfer_margin();
