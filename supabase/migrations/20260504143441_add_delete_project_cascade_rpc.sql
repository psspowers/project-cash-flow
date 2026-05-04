/*
  # Add delete_project_cascade RPC Function

  ## Purpose
  Provides a safe, atomic, transaction-wrapped function to delete a project and ALL
  related data without leaving orphaned rows. This is required because most child
  tables use NO ACTION foreign keys and will block a direct DELETE on projects.

  ## Deletion Order (respects all FK constraints)
  1. checks                    — linked via payment_vouchers → project
  2. loan_repayments           — linked via payment_vouchers → project
  3. progress_reports          — direct project_id FK + po_id + vendor_invoice_id refs
  4. payment_vouchers          — direct project_id FK
  5. vendor_invoice_payments   — linked via vendor_invoices → project (cascade exists but deleting explicitly)
  6. vendor_invoices           — direct project_id FK (clears po_milestone_id refs first via nulling)
  7. purchase_orders           — direct project_id FK (cascades po_milestones, po_simple_payments)
  8. client_invoice_payments   — linked via client_invoices → project
  9. client_invoices           — direct project_id FK (cascades client_invoice_payments)
  10. cash_receipts            — direct project_id FK
  11. project_costings         — direct project_id FK
  12. variation_orders         — direct project_id FK
  13. project_cash_transfers   — from_project_id OR to_project_id matches
  14. projects                 — the project row itself
                                 (auto-cascades: milestones → milestone_invoices,
                                  client_milestones, project_views, milestone_invoices)

  ## Security
  - Function is SECURITY DEFINER so it runs with elevated privileges
  - Caller must be authenticated (enforced via RLS on underlying tables)
  - Role check (ceo/evp) and status check (estimation_draft/budget_draft) are
    enforced in the function itself — not just in the UI
*/

CREATE OR REPLACE FUNCTION public.delete_project_cascade(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_status text;
  v_caller_role text;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller has CEO or EVP role
  SELECT role INTO v_caller_role
  FROM user_profiles
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('ceo', 'evp') THEN
    RAISE EXCEPTION 'Insufficient permissions: only CEO or EVP can delete projects';
  END IF;

  -- Verify project exists and check its status
  SELECT status INTO v_project_status
  FROM projects
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  IF v_project_status NOT IN ('estimation_draft', 'budget_draft') THEN
    RAISE EXCEPTION 'Cannot delete project with status "%": only estimation_draft and budget_draft projects can be deleted', v_project_status;
  END IF;

  -- Step 1: Delete checks linked to this project's payment vouchers
  DELETE FROM checks
  WHERE voucher_id IN (
    SELECT id FROM payment_vouchers WHERE project_id = p_id
  );

  -- Step 2: Delete loan_repayments linked to this project's payment vouchers
  DELETE FROM loan_repayments
  WHERE voucher_id IN (
    SELECT id FROM payment_vouchers WHERE project_id = p_id
  );

  -- Step 3: Delete progress_reports (has project_id, po_id, and vendor_invoice_id FKs)
  DELETE FROM progress_reports
  WHERE project_id = p_id;

  -- Step 4: Delete payment_vouchers
  DELETE FROM payment_vouchers
  WHERE project_id = p_id;

  -- Step 5: Delete vendor_invoice_payments linked to this project's vendor invoices
  DELETE FROM vendor_invoice_payments
  WHERE vendor_invoice_id IN (
    SELECT id FROM vendor_invoices WHERE project_id = p_id
  );

  -- Step 6: Null out po_milestone_id references on vendor_invoices before deleting POs
  -- (vendor_invoices.po_milestone_id → po_milestones → purchase_orders, NO ACTION)
  UPDATE vendor_invoices
  SET po_milestone_id = NULL
  WHERE project_id = p_id AND po_milestone_id IS NOT NULL;

  -- Step 7: Delete vendor_invoices
  DELETE FROM vendor_invoices
  WHERE project_id = p_id;

  -- Step 8: Delete purchase_orders (cascades po_milestones, po_simple_payments)
  DELETE FROM purchase_orders
  WHERE project_id = p_id;

  -- Step 9: Delete client_invoice_payments linked to this project's client invoices
  DELETE FROM client_invoice_payments
  WHERE client_invoice_id IN (
    SELECT id FROM client_invoices WHERE project_id = p_id
  );

  -- Step 10: Delete client_invoices
  DELETE FROM client_invoices
  WHERE project_id = p_id;

  -- Step 11: Delete cash_receipts
  DELETE FROM cash_receipts
  WHERE project_id = p_id;

  -- Step 12: Delete project_costings
  DELETE FROM project_costings
  WHERE project_id = p_id;

  -- Step 13: Delete variation_orders
  DELETE FROM variation_orders
  WHERE project_id = p_id;

  -- Step 14: Delete project_cash_transfers (both directions)
  DELETE FROM project_cash_transfers
  WHERE from_project_id = p_id OR to_project_id = p_id;

  -- Step 15: Delete the project itself
  -- (auto-cascades: milestones → milestone_invoices, client_milestones, project_views)
  DELETE FROM projects
  WHERE id = p_id;

END;
$$;

-- Grant execute to authenticated users (role check is enforced inside the function)
GRANT EXECUTE ON FUNCTION public.delete_project_cascade(uuid) TO authenticated;
