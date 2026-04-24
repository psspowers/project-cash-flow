/*
  # Fix check_transfer_margin() — read from client_invoices

  ## Summary
  The check_transfer_margin trigger function was reading total received cash from
  cash_receipts.net_received, which is an empty legacy table (0 rows). This caused
  every CEO-approved transfer to be blocked with "available margin is ฿0" regardless
  of how much had actually been collected from the client.

  ## Change
  Replace the cash_receipts query with a query against client_invoices.received_amount,
  which is the authoritative source for client cash receipts going forward.

  ## Tables affected
  - No schema changes — function body only
  - check_transfer_margin() trigger function on project_cash_transfers table

  ## Security
  - No RLS changes
*/

CREATE OR REPLACE FUNCTION check_transfer_margin()
RETURNS TRIGGER AS $$
DECLARE
  v_collection_rate        numeric;
  v_contract_incl_vat      numeric;
  v_total_received         numeric;
  v_budget_cost_excl_vat   numeric;
  v_forecast_margin        numeric;
  v_releasable_margin      numeric;
  v_already_transferred    numeric;
  v_available              numeric;
BEGIN
  IF NEW.status != 'ceo_approved' THEN
    RETURN NEW;
  END IF;

  SELECT contract_incl_vat INTO v_contract_incl_vat
  FROM projects WHERE id = NEW.from_project_id;

  SELECT COALESCE(SUM(received_amount), 0) INTO v_total_received
  FROM client_invoices WHERE project_id = NEW.from_project_id;

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

  IF v_forecast_margin <= 0 THEN
    RAISE EXCEPTION
      'Transfer blocked: project has no positive forecast margin. '
      'Contract value ฿% minus budget cost ฿% = ฿%. '
      'Transfers are only permitted from profitable projects.',
      ROUND(v_contract_incl_vat),
      ROUND(v_budget_cost_excl_vat * 1.07),
      ROUND(v_forecast_margin);
  END IF;

  IF v_contract_incl_vat = 0 THEN
    RAISE EXCEPTION 'Transfer blocked: contract value is zero.';
  END IF;

  v_collection_rate    := v_total_received / v_contract_incl_vat;
  v_releasable_margin  := v_forecast_margin * v_collection_rate;

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
