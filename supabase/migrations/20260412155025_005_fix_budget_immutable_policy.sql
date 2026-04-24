/*
  # Fix budget_immutable_on_update RLS policy

  ## Problem
  The WITH CHECK clause on the budget_immutable_on_update policy was:
    NOT (stage = 'budget' AND status = 'evp_approved')

  This checks the NEW row state after an UPDATE. So when EVP approves the budget
  (setting status from 'cm_approved' -> 'evp_approved'), the WITH CHECK evaluates
  the resulting row: stage='budget' AND status='evp_approved' = TRUE,
  so WITH CHECK = NOT TRUE = FALSE → the update is BLOCKED silently.

  ## Fix
  The policy intent is: once a budget is evp_approved, no further edits are allowed.
  The USING clause (which checks the CURRENT/OLD row) already enforces this correctly:
    USING (NOT (stage = 'budget' AND status = 'evp_approved'))
  
  The WITH CHECK should only block changes that RESULT in an invalid state from
  already-approved rows — but that's already handled by USING preventing access 
  to those rows in the first place.

  Solution: remove the WITH CHECK clause so only USING applies (prevents editing 
  rows that are already evp_approved, but allows the transition into evp_approved).
*/

DROP POLICY IF EXISTS "budget_immutable_on_update" ON project_costings;

CREATE POLICY "budget_immutable_on_update"
  ON project_costings
  FOR UPDATE
  TO authenticated
  USING (NOT (stage = 'budget' AND status = 'evp_approved'));
