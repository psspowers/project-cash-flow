/*
  # PSS Cash Flow System — Schema Step 2

  ## Summary
  Extends the schema to support complete project cash flow data import.

  ## Changes
  1. `purchase_orders` — adds 4 new columns for milestone tracking
  2. `po_milestones` — new table for supplier milestone payment schedules
  3. `client_milestones` — new table for client payment plan milestones
  4. `client_invoices` — new table for PSS invoices issued to client per milestone

  Note: vendor_invoices already exists with an alternative schema from a prior migration.

  ## Security
  - RLS enabled on all new tables
  - All authenticated users: SELECT
  - Privileged roles (cost_controller, accounts_supervisor, accounts_manager, evp, ceo): INSERT/UPDATE/DELETE
*/

-- ============================================================
-- 1. MODIFY purchase_orders
-- ============================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS has_supplier_milestones  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pending_invoice_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_remaining_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_name_raw        TEXT;

-- ============================================================
-- 2. CREATE po_milestones
-- ============================================================

CREATE TABLE IF NOT EXISTS po_milestones (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id    UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  milestone_number     INTEGER NOT NULL,
  milestone_pct        NUMERIC(5,4) NOT NULL,
  amount_due           NUMERIC(15,2) NOT NULL,
  invoice_no           TEXT,
  invoice_date         DATE,
  invoice_value        NUMERIC(15,2),
  paid_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  planned_payment_date DATE,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'invoiced', 'paid')),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_order_id, milestone_number)
);

-- ============================================================
-- 3. CREATE client_milestones
-- ============================================================

CREATE TABLE IF NOT EXISTS client_milestones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_number      INTEGER NOT NULL,
  milestone_description TEXT NOT NULL,
  milestone_pct         NUMERIC(5,4) NOT NULL,
  payment_plan_amount   NUMERIC(15,2) NOT NULL,
  planned_receive_date  DATE,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending',
                          'invoiced',
                          'partially_received',
                          'received'
                        )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, milestone_number)
);

-- ============================================================
-- 4. CREATE client_invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS client_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_milestone_id UUID NOT NULL REFERENCES client_milestones(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES projects(id),
  invoice_no          TEXT NOT NULL,
  invoice_date        DATE,
  invoice_amount      NUMERIC(15,2) NOT NULL,
  received_amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  pending_amount      NUMERIC(15,2)
                      GENERATED ALWAYS AS (invoice_amount - received_amount) STORED,
  receipt_date        DATE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'partially_received', 'received')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE po_milestones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invoices   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read po_milestones"
    ON po_milestones FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated read client_milestones"
    ON client_milestones FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated read client_invoices"
    ON client_invoices FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged insert po_milestones"
    ON po_milestones FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged update po_milestones"
    ON po_milestones FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged delete po_milestones"
    ON po_milestones FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged insert client_milestones"
    ON client_milestones FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged update client_milestones"
    ON client_milestones FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged delete client_milestones"
    ON client_milestones FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged insert client_invoices"
    ON client_invoices FOR INSERT TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged update client_invoices"
    ON client_invoices FOR UPDATE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Privileged delete client_invoices"
    ON client_invoices FOR DELETE TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('cost_controller','accounts_supervisor','accounts_manager','evp','ceo')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 6. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_po_milestones_po_id
  ON po_milestones(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_client_milestones_project_id
  ON client_milestones(project_id);

CREATE INDEX IF NOT EXISTS idx_client_invoices_milestone_id
  ON client_invoices(client_milestone_id);

CREATE INDEX IF NOT EXISTS idx_client_invoices_project_id
  ON client_invoices(project_id);

-- ============================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_po_milestones_updated_at') THEN
    CREATE TRIGGER trg_po_milestones_updated_at
      BEFORE UPDATE ON po_milestones
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_client_milestones_updated_at') THEN
    CREATE TRIGGER trg_client_milestones_updated_at
      BEFORE UPDATE ON client_milestones
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_client_invoices_updated_at') THEN
    CREATE TRIGGER trg_client_invoices_updated_at
      BEFORE UPDATE ON client_invoices
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
