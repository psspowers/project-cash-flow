/*
  # PSS Power Solutions — Schema Update v2

  ## New Tables
  - project_costings: Estimation and Budget records per project (immutable once EVP-approved)
  - variation_orders: Additive scope change records with client PO reference required

  ## Modified Tables
  - user_profiles: added avatar_initials column
  - vendor_invoices: added cash flow planner fields (planned_payment_date, etc.)

  ## Security
  - RLS enabled on all new tables
  - Budget record is immutable via RLS policy once stage=budget AND status=evp_approved
*/

-- Add avatar_initials to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'avatar_initials'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN avatar_initials text;
  END IF;
END $$;

-- project_costings table
CREATE TABLE IF NOT EXISTS project_costings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  stage text NOT NULL CHECK (stage IN ('estimation','budget')),
  sales_price_excl_vat numeric DEFAULT 0,
  sales_price_incl_vat numeric DEFAULT 0,
  cost_01_civil numeric DEFAULT 0,
  cost_02_pv_modules numeric DEFAULT 0,
  cost_03_mounting numeric DEFAULT 0,
  cost_04_inverters numeric DEFAULT 0,
  cost_05_hv_switchgear numeric DEFAULT 0,
  cost_06_cabling numeric DEFAULT 0,
  cost_07_installation numeric DEFAULT 0,
  cost_08_engineering numeric DEFAULT 0,
  cost_09_logistics numeric DEFAULT 0,
  cost_10_testing numeric DEFAULT 0,
  total_cost_excl_vat numeric GENERATED ALWAYS AS (
    cost_01_civil + cost_02_pv_modules + cost_03_mounting +
    cost_04_inverters + cost_05_hv_switchgear + cost_06_cabling +
    cost_07_installation + cost_08_engineering +
    cost_09_logistics + cost_10_testing
  ) STORED,
  gross_margin_amount numeric DEFAULT 0,
  gross_margin_pct numeric DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','submitted','cm_approved','cm_rejected','evp_approved','evp_rejected'
  )),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  cm_approved_by uuid REFERENCES auth.users(id),
  cm_approved_at timestamptz,
  cm_comments text,
  evp_approved_by uuid REFERENCES auth.users(id),
  evp_approved_at timestamptz,
  evp_comments text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_costings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project_costings"
  ON project_costings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert project_costings"
  ON project_costings FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "budget_immutable_on_update"
  ON project_costings FOR UPDATE TO authenticated
  USING (NOT (stage = 'budget' AND status = 'evp_approved'))
  WITH CHECK (NOT (stage = 'budget' AND status = 'evp_approved'));

CREATE POLICY "budget_immutable_on_delete"
  ON project_costings FOR DELETE TO authenticated
  USING (NOT (stage = 'budget' AND status = 'evp_approved'));

-- variation_orders table
CREATE TABLE IF NOT EXISTS variation_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  vo_number text NOT NULL,
  client_po_reference text NOT NULL,
  description text NOT NULL,
  revenue_increase numeric DEFAULT 0,
  cost_01_civil numeric DEFAULT 0,
  cost_02_pv_modules numeric DEFAULT 0,
  cost_03_mounting numeric DEFAULT 0,
  cost_04_inverters numeric DEFAULT 0,
  cost_05_hv_switchgear numeric DEFAULT 0,
  cost_06_cabling numeric DEFAULT 0,
  cost_07_installation numeric DEFAULT 0,
  cost_08_engineering numeric DEFAULT 0,
  cost_09_logistics numeric DEFAULT 0,
  cost_10_testing numeric DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft','evp_approved')),
  submitted_by uuid REFERENCES auth.users(id),
  submitted_at timestamptz,
  evp_approved_by uuid REFERENCES auth.users(id),
  evp_approved_at timestamptz,
  evp_comments text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE variation_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read variation_orders"
  ON variation_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert variation_orders"
  ON variation_orders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update variation_orders"
  ON variation_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Add cash flow planner fields to vendor_invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vendor_invoices' AND column_name='original_due_date') THEN
    ALTER TABLE vendor_invoices ADD COLUMN original_due_date date;
    ALTER TABLE vendor_invoices ADD COLUMN planned_payment_date date;
    ALTER TABLE vendor_invoices ADD COLUMN planning_notes text;
    ALTER TABLE vendor_invoices ADD COLUMN date_moved_by uuid REFERENCES auth.users(id);
    ALTER TABLE vendor_invoices ADD COLUMN date_moved_at timestamptz;
    ALTER TABLE vendor_invoices ADD COLUMN vendor_notified boolean DEFAULT false;
    ALTER TABLE vendor_invoices ADD COLUMN vendor_notified_at timestamptz;
  END IF;
END $$;

-- Add planned_date to milestones (for cash flow planner income cards)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='milestones' AND column_name='planned_date_override') THEN
    ALTER TABLE milestones ADD COLUMN planned_date_override date;
  END IF;
END $$;
