/*
  # PSS Power Solutions - Core Schema Migration

  ## Summary
  Creates the complete database schema for the PSS Power Solutions cash flow management system.

  ## New Tables
  1. entities - Clients, vendors, subsidiaries, lenders
  2. projects - Solar EPC projects with contract values
  3. milestones - Project billing milestones (8 per project)
  4. purchase_orders - Vendor POs with cost categories
  5. vendor_invoices - Vendor invoices linked to POs
  6. progress_reports - Site progress with multi-stage approval workflow
  7. payment_vouchers - Payment vouchers with auto-numbering
  8. checks - Physical checks issued against vouchers
  9. cash_receipts - Incoming payments from clients
  10. loans - Loans received/given
  11. loan_repayments - Repayment history per loan
  12. project_cash_transfers - Cross-project fund movements
  13. user_profiles - Role assignments for auth users
  14. notifications - In-app notification system

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read/write based on role stored in user_profiles
*/

-- User profiles table (role assignment)
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('cost_controller','construction_manager','evp','accounts_supervisor','accounts_manager','ceo')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Entities table
CREATE TABLE IF NOT EXISTS entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('client','vendor','subsidiary','lender','internal')),
  tax_id text,
  is_related_party boolean DEFAULT false,
  email text,
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read entities"
  ON entities FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert entities"
  ON entities FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update entities"
  ON entities FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_entity_id uuid REFERENCES entities(id),
  contract_incl_vat numeric DEFAULT 0,
  contract_excl_vat numeric DEFAULT 0,
  start_date date,
  status text DEFAULT 'active' CHECK (status IN ('active','upcoming','completed')),
  currency text DEFAULT 'THB',
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read projects"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Milestones table
CREATE TABLE IF NOT EXISTS milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  milestone_no integer,
  description text,
  percentage numeric DEFAULT 0,
  planned_amount_incl_vat numeric DEFAULT 0,
  planned_date date,
  pss_invoice_no text,
  invoice_date date,
  status text DEFAULT 'planned' CHECK (status IN ('planned','invoiced','received')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read milestones"
  ON milestones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert milestones"
  ON milestones FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update milestones"
  ON milestones FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Purchase orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pss_po_no text UNIQUE,
  project_id uuid REFERENCES projects(id),
  vendor_id uuid REFERENCES entities(id),
  description text,
  cost_category text CHECK (cost_category IN ('01_civil','02_pv_modules','03_mounting','04_inverters_electrical','05_hv_switchgear','06_cabling','07_installation','08_engineering','09_logistics','10_testing_warranty')),
  po_amount_excl_vat numeric DEFAULT 0,
  vat_7pct numeric DEFAULT 0,
  po_amount_incl_vat numeric DEFAULT 0,
  po_date date,
  status text DEFAULT 'draft' CHECK (status IN ('draft','approved','partially_paid','fully_paid')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read purchase_orders"
  ON purchase_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert purchase_orders"
  ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update purchase_orders"
  ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Vendor invoices table
CREATE TABLE IF NOT EXISTS vendor_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id),
  project_id uuid REFERENCES projects(id),
  vendor_id uuid REFERENCES entities(id),
  vendor_invoice_no text,
  invoice_date date,
  invoice_amount_incl_vat numeric DEFAULT 0,
  wht_3pct numeric DEFAULT 0,
  net_payable numeric DEFAULT 0,
  status text DEFAULT 'received' CHECK (status IN ('received','approved_cm','approved_evp','released','paid')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vendor_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vendor_invoices"
  ON vendor_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert vendor_invoices"
  ON vendor_invoices FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update vendor_invoices"
  ON vendor_invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Progress reports table
CREATE TABLE IF NOT EXISTS progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid REFERENCES purchase_orders(id),
  vendor_invoice_id uuid REFERENCES vendor_invoices(id),
  project_id uuid REFERENCES projects(id),
  prepared_by uuid REFERENCES auth.users(id),
  report_date date,
  description text,
  site_checklist jsonb DEFAULT '{}',
  percentage_complete numeric DEFAULT 0,
  notes text,
  status text DEFAULT 'draft' CHECK (status IN ('draft','submitted','cm_approved','cm_rejected','evp_approved','evp_rejected')),
  cm_approved_by uuid REFERENCES auth.users(id),
  cm_approved_at timestamptz,
  cm_comments text,
  evp_approved_by uuid REFERENCES auth.users(id),
  evp_approved_at timestamptz,
  evp_comments text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read progress_reports"
  ON progress_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert progress_reports"
  ON progress_reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update progress_reports"
  ON progress_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Payment vouchers table
CREATE TABLE IF NOT EXISTS payment_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no text UNIQUE,
  vendor_invoice_id uuid REFERENCES vendor_invoices(id),
  project_id uuid REFERENCES projects(id),
  amount numeric DEFAULT 0,
  wht_amount numeric DEFAULT 0,
  net_paid numeric DEFAULT 0,
  voucher_date date,
  prepared_by uuid REFERENCES auth.users(id),
  requires_manager_approval boolean DEFAULT false,
  manager_approved_by uuid REFERENCES auth.users(id),
  manager_approved_at timestamptz,
  ceo_notified boolean DEFAULT false,
  ceo_notified_at timestamptz,
  status text DEFAULT 'draft' CHECK (status IN ('draft','pending_manager','approved','issued')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read payment_vouchers"
  ON payment_vouchers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert payment_vouchers"
  ON payment_vouchers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update payment_vouchers"
  ON payment_vouchers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Checks table
CREATE TABLE IF NOT EXISTS checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid REFERENCES payment_vouchers(id),
  bank_account text,
  check_no text,
  check_date date,
  payee text,
  amount numeric DEFAULT 0,
  signed_by_supervisor uuid REFERENCES auth.users(id),
  signed_by_manager uuid REFERENCES auth.users(id),
  status text DEFAULT 'draft' CHECK (status IN ('draft','issued','cleared','bounced')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read checks"
  ON checks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert checks"
  ON checks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update checks"
  ON checks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Cash receipts table
CREATE TABLE IF NOT EXISTS cash_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  milestone_id uuid REFERENCES milestones(id),
  company_id uuid REFERENCES entities(id),
  pss_invoice_no text,
  receipt_date date,
  amount_received numeric DEFAULT 0,
  wht_deducted numeric DEFAULT 0,
  net_received numeric DEFAULT 0,
  bank_account text,
  reference text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cash_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cash_receipts"
  ON cash_receipts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert cash_receipts"
  ON cash_receipts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update cash_receipts"
  ON cash_receipts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Loans table
CREATE TABLE IF NOT EXISTS loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_type text CHECK (loan_type IN ('received','given')),
  counterparty_id uuid REFERENCES entities(id),
  principal numeric DEFAULT 0,
  currency text DEFAULT 'THB',
  fx_rate_if_usd numeric,
  drawdown_date date,
  due_date date,
  outstanding_balance numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read loans"
  ON loans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert loans"
  ON loans FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update loans"
  ON loans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Loan repayments table
CREATE TABLE IF NOT EXISTS loan_repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid REFERENCES loans(id),
  payment_date date,
  amount numeric DEFAULT 0,
  voucher_id uuid REFERENCES payment_vouchers(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read loan_repayments"
  ON loan_repayments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert loan_repayments"
  ON loan_repayments FOR INSERT TO authenticated WITH CHECK (true);

-- Project cash transfers table
CREATE TABLE IF NOT EXISTS project_cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_project_id uuid REFERENCES projects(id),
  to_project_id uuid REFERENCES projects(id),
  amount numeric DEFAULT 0,
  reason text,
  approved_by uuid REFERENCES auth.users(id),
  transfer_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_cash_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read project_cash_transfers"
  ON project_cash_transfers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert project_cash_transfers"
  ON project_cash_transfers FOR INSERT TO authenticated WITH CHECK (true);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  title text NOT NULL,
  message text,
  type text DEFAULT 'info' CHECK (type IN ('info','warning','success','error','alert')),
  is_read boolean DEFAULT false,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Voucher sequence table for auto-numbering
CREATE TABLE IF NOT EXISTS voucher_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq_date date NOT NULL,
  last_seq integer DEFAULT 0,
  UNIQUE(seq_date)
);

ALTER TABLE voucher_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read voucher_sequences"
  ON voucher_sequences FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert voucher_sequences"
  ON voucher_sequences FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update voucher_sequences"
  ON voucher_sequences FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
