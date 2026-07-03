/*
  # Fix budget_immutable_on_update RLS policy (re-apply)

  ## Problem
  The `budget_immutable_on_update` policy on `project_costings` was created in
  migration 002 with both USING and WITH CHECK clauses:

    USING     (NOT (stage = 'budget' AND status = 'evp_approved'))
    WITH CHECK (NOT (stage = 'budget' AND status = 'evp_approved'))

  PostgreSQL evaluates WITH CHECK against the NEW row after an UPDATE.
  When EVP approves a budget costing (status: 'cm_approved' → 'evp_approved'),
  the resulting row has stage='budget' AND status='evp_approved', so WITH CHECK
  evaluates NOT(TRUE) = FALSE — the update is blocked with a 403 RLS error.

  Migration 005 (20260412155025) was written to fix this but was not applied to
  the live database. This migration re-applies the same fix.

  ## Fix
  Drop the policy and recreate with ONLY the USING clause (no WITH CHECK).
  The USING clause checks the CURRENT/OLD row before the update runs, which
  correctly prevents editing rows that are already evp_approved while allowing
  the transition INTO evp_approved status.

  ## Impact
  - Fixes: EVP "Approve" button on budget costings in Approvals page (403 error)
  - Fixes: "Activate Project" button on CostingTab for EVP role (403 error)
  - No data is changed; only the RLS policy is updated.
*/

DROP POLICY IF EXISTS "budget_immutable_on_update" ON project_costings;

CREATE POLICY "budget_immutable_on_update"
  ON project_costings
  FOR UPDATE
  TO authenticated
  USING (NOT (stage = 'budget' AND status = 'evp_approved'));
