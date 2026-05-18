/*
  # Fix RLS INSERT/UPDATE/DELETE policies to include `procurement` role

  ## Problem
  The `procurement` role (e.g. Kanokthip) is authorized at the application layer
  (PROCUREMENT_WRITE_ROLES in src/config/roles.ts) to create and edit POs, but the
  database RLS policies on three tables were written without it, causing a hard block.

  ## Changes

  ### purchase_orders
  - DROP + RECREATE INSERT policy: add `procurement`
  - DROP + RECREATE UPDATE policy: add `procurement`

  ### po_simple_payments
  - DROP + RECREATE INSERT policy: add `procurement`, `cost_controller`
  - DROP + RECREATE UPDATE policy: add `procurement`, `cost_controller`
  - DROP + RECREATE DELETE policy: add `procurement`, `cost_controller`

  ### po_milestones
  - DROP + RECREATE INSERT policy: add `procurement`
  - DROP + RECREATE UPDATE policy: add `procurement`
  - DROP + RECREATE DELETE policy: add `procurement`

  ## Roles now permitted to write on each table
  - purchase_orders write: cost_controller, construction_manager, evp,
    accounts_supervisor, accounts_manager, ceo, procurement
  - po_simple_payments write: cost_controller, procurement,
    accounts_supervisor, accounts_manager, ceo
  - po_milestones write: cost_controller, procurement,
    accounts_supervisor, accounts_manager, evp, ceo
*/

-- ───────────────────────────────────────────────
-- purchase_orders
-- ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Privileged insert purchase_orders" ON purchase_orders;
CREATE POLICY "Privileged insert purchase_orders"
  ON purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'construction_manager',
          'evp',
          'accounts_supervisor',
          'accounts_manager',
          'ceo',
          'procurement'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update purchase_orders" ON purchase_orders;
CREATE POLICY "Privileged update purchase_orders"
  ON purchase_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'construction_manager',
          'evp',
          'accounts_supervisor',
          'accounts_manager',
          'ceo',
          'procurement'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'construction_manager',
          'evp',
          'accounts_supervisor',
          'accounts_manager',
          'ceo',
          'procurement'
        ])
    )
  );

-- ───────────────────────────────────────────────
-- po_simple_payments
-- ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Privileged insert po_simple_payments" ON po_simple_payments;
CREATE POLICY "Privileged insert po_simple_payments"
  ON po_simple_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update po_simple_payments" ON po_simple_payments;
CREATE POLICY "Privileged update po_simple_payments"
  ON po_simple_payments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'ceo'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged delete po_simple_payments" ON po_simple_payments;
CREATE POLICY "Privileged delete po_simple_payments"
  ON po_simple_payments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'ceo'
        ])
    )
  );

-- ───────────────────────────────────────────────
-- po_milestones
-- ───────────────────────────────────────────────

DROP POLICY IF EXISTS "Privileged insert po_milestones" ON po_milestones;
CREATE POLICY "Privileged insert po_milestones"
  ON po_milestones FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'evp',
          'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged update po_milestones" ON po_milestones;
CREATE POLICY "Privileged update po_milestones"
  ON po_milestones FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'evp',
          'ceo'
        ])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'evp',
          'ceo'
        ])
    )
  );

DROP POLICY IF EXISTS "Privileged delete po_milestones" ON po_milestones;
CREATE POLICY "Privileged delete po_milestones"
  ON po_milestones FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = ANY (ARRAY[
          'cost_controller',
          'procurement',
          'accounts_supervisor',
          'accounts_manager',
          'evp',
          'ceo'
        ])
    )
  );
