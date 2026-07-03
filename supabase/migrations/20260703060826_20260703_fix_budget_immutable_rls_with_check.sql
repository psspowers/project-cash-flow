-- Fix budget_immutable_on_update: add explicit WITH CHECK (true) so PostgreSQL
-- does not reuse the USING expression on the new row, which blocked the
-- cm_approved → evp_approved transition.
DROP POLICY IF EXISTS "budget_immutable_on_update" ON project_costings;

CREATE POLICY "budget_immutable_on_update"
  ON project_costings
  FOR UPDATE
  TO authenticated
  USING     (NOT (stage = 'budget' AND status = 'evp_approved'))
  WITH CHECK (true);
