-- ============================================================
-- PSS CASH FLOW SYSTEM — SCHEMA STEP 2
-- New tables and modifications to support complete data import
-- Run in Supabase SQL Editor BEFORE any Phase 3 reimport
-- ============================================================
-- TABLES CREATED:
--   po_milestones      — supplier milestone payment schedules (REPCO-type)
--   vendor_invoices    — individual invoices under each PO or milestone
--   client_milestones  — Section 1: milestone payment plan from client
--   client_invoices    — Section 1: PSS invoices issued to client per milestone
-- TABLES MODIFIED:
--   purchase_orders    — add has_supplier_milestones, pending columns
-- ============================================================

-- ============================================================
-- 1. MODIFY purchase_orders
--    Add milestone flag and pending payment tracking
-- ============================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS has_supplier_milestones BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pending_invoice_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_remaining_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_name_raw        TEXT;
-- supplier_name_raw stores raw name from Col C (Excel) for matching to entities
-- pending_invoice_amount = invoiced but not yet paid (Col N)
-- pending_remaining_amount = not yet invoiced (Col O)

-- ============================================================
-- 2. CREATE po_milestones
--    Supplier milestone payment schedules (e.g. REPCO Walailak)
--    One row per milestone per PO
-- ============================================================

CREATE TABLE IF NOT EXISTS po_milestones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  milestone_number    INTEGER NOT NULL,
  milestone_pct       NUMERIC(5,4) NOT NULL,    -- e.g. 0.10 = 10%
  amount_due          NUMERIC(15,2) NOT NULL,   -- incl VAT, from Col E
  invoice_no          TEXT,
  invoice_date        DATE,
  invoice_value       NUMERIC(15,2),
  paid_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  planned_payment_date DATE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'invoiced', 'paid')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (purchase_order_id, milestone_number)
);

COMMENT ON TABLE po_milestones IS
  'Milestone payment schedule for supplier POs that are paid in tranches '
  '(e.g. REPCO floating solar: 10%+15%+10%+20%+20%+10%+15%). '
  'Only populated when purchase_orders.has_supplier_milestones = TRUE.';

-- ============================================================
-- 3. CREATE vendor_invoices
--    Individual invoices under each PO (or each milestone for
--    milestone-based POs). One row per invoice sub-row in Excel.
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  po_milestone_id     UUID REFERENCES po_milestones(id) ON DELETE SET NULL,
  -- po_milestone_id is NULL for simple POs, set for milestone POs
  invoice_no          TEXT NOT NULL,
  invoice_date        DATE,
  invoice_amount      NUMERIC(15,2) NOT NULL,   -- incl VAT (Col K)
  wht_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- WHT 3% for individual consultants (Prot, Rohit, Ekkawut, Nayok)
  -- WHT 0% for companies and EPC contracts
  net_payable         NUMERIC(15,2)
                      GENERATED ALWAYS AS (invoice_amount - wht_amount) STORED,
  paid_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_date        DATE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'partially_paid', 'paid')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vendor_invoices IS
  'Individual supplier invoices under each purchase order. '
  'A single PO can have multiple invoices (partial deliveries). '
  'For milestone POs, each milestone links to its own invoice via po_milestone_id. '
  'WHT applies only to individual consultants — 0% for companies.';

-- ============================================================
-- 4. CREATE client_milestones
--    Section 1 (Cash In): milestone payment plan agreed with client.
--    One row per milestone per project (8 milestones typical).
--    Percentages always sum to 100% per project.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_milestones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_number      INTEGER NOT NULL,          -- 1-8 typically
  milestone_description TEXT NOT NULL,             -- Col B description
  milestone_pct         NUMERIC(5,4) NOT NULL,     -- Col D e.g. 0.10 = 10%
  payment_plan_amount   NUMERIC(15,2) NOT NULL,    -- Col E (incl VAT)
  planned_receive_date  DATE,
  -- Planned month from monthly cash flow columns (Col P onwards)
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                          'pending',           -- milestone not yet reached
                          'invoiced',          -- PSS has sent invoice, awaiting payment
                          'partially_received',-- some payment received
                          'received'           -- fully received
                        )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, milestone_number)
);

COMMENT ON TABLE client_milestones IS
  'EPC contract milestone payment schedule — client pays PSS on milestone completion. '
  'Sourced from Section 1 (Cash In) of each project sheet. '
  'Standard 8-milestone structure: 10%+10%+15%+15%+20%+20%+5%+5% = 100%.';

-- ============================================================
-- 5. CREATE client_invoices
--    PSS invoices issued to client per milestone.
--    One milestone can have multiple invoices (partial billing).
--    Also tracks actual receipt of payment.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_milestone_id   UUID NOT NULL REFERENCES client_milestones(id) ON DELETE CASCADE,
  project_id            UUID NOT NULL REFERENCES projects(id),
  invoice_no            TEXT NOT NULL,             -- Col I (e.g. IV2025030011)
  invoice_date          DATE,                      -- Col J
  invoice_amount        NUMERIC(15,2) NOT NULL,    -- Col K (incl VAT)
  received_amount       NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Col L
  pending_amount        NUMERIC(15,2)
                        GENERATED ALWAYS AS (invoice_amount - received_amount) STORED,
  receipt_date          DATE,                      -- date payment actually received
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'partially_received', 'received')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE client_invoices IS
  'PSS invoices issued to client for each milestone. '
  'Sourced from invoice rows in Section 1 of each project sheet. '
  'Col I=invoice_no, Col J=invoice_date, Col K=invoice_amount, Col L=received_amount. '
  'pending_amount is computed: invoice_amount - received_amount.';

-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE po_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_invoices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invoices  ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated read po_milestones"
  ON po_milestones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read vendor_invoices"
  ON vendor_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read client_milestones"
  ON client_milestones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated read client_invoices"
  ON client_invoices FOR SELECT TO authenticated USING (true);

-- Cost controllers and accounts can write
CREATE POLICY "Cost controller write po_milestones"
  ON po_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('cost_controller', 'accounts_supervisor',
                   'accounts_manager', 'evp', 'ceo')
    )
  );

CREATE POLICY "Cost controller write vendor_invoices"
  ON vendor_invoices FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('cost_controller', 'accounts_supervisor',
                   'accounts_manager', 'evp', 'ceo')
    )
  );

CREATE POLICY "Cost controller write client_milestones"
  ON client_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('cost_controller', 'accounts_supervisor',
                   'accounts_manager', 'evp', 'ceo')
    )
  );

CREATE POLICY "Cost controller write client_invoices"
  ON client_invoices FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('cost_controller', 'accounts_supervisor',
                   'accounts_manager', 'evp', 'ceo')
    )
  );

-- ============================================================
-- 7. INDEXES for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_po_milestones_po_id
  ON po_milestones(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_po_id
  ON vendor_invoices(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_vendor_invoices_milestone_id
  ON vendor_invoices(po_milestone_id);

CREATE INDEX IF NOT EXISTS idx_client_milestones_project_id
  ON client_milestones(project_id);

CREATE INDEX IF NOT EXISTS idx_client_invoices_milestone_id
  ON client_invoices(client_milestone_id);

CREATE INDEX IF NOT EXISTS idx_client_invoices_project_id
  ON client_invoices(project_id);

-- ============================================================
-- 8. UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_milestones_updated_at
  BEFORE UPDATE ON po_milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vendor_invoices_updated_at
  BEFORE UPDATE ON vendor_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_client_milestones_updated_at
  BEFORE UPDATE ON client_milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_client_invoices_updated_at
  BEFORE UPDATE ON client_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 9. VERIFY — confirm all tables created correctly
-- ============================================================

SELECT
  table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'purchase_orders', 'po_milestones',
    'vendor_invoices', 'client_milestones', 'client_invoices'
  )
GROUP BY table_name
ORDER BY table_name;
