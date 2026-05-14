export type UserRole =
  | 'cost_controller'
  | 'construction_manager'
  | 'evp'
  | 'accounts_supervisor'
  | 'accounts_manager'
  | 'ceo'
  | 'procurement'
  | 'banking_finance_officer';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_initials?: string;
  created_at: string;
}

export type SupplierType = 'company' | 'individual' | 'petty_cash';

export interface Entity {
  id: string;
  name: string;
  type: 'client' | 'vendor' | 'subsidiary' | 'lender' | 'internal';
  supplier_type?: SupplierType;
  tax_id?: string | null;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person_name?: string | null;
  contact_person_title?: string | null;
  contact_person_phone?: string | null;
  contact_person_email?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_no?: string | null;
  bank_account_name?: string | null;
  default_wht_rate?: number | null;
  is_related_party: boolean;
  is_active?: boolean;
  notes?: string | null;
  created_at: string;
}

export type ProjectStatus =
  | 'estimation_draft'
  | 'estimation_submitted'
  | 'estimation_cm_approved'
  | 'estimation_approved'
  | 'budget_draft'
  | 'budget_submitted'
  | 'budget_cm_approved'
  | 'active'
  | 'completed';

export interface Project {
  id: string;
  name: string;
  client_entity_id?: string;
  contract_incl_vat: number;
  contract_excl_vat: number;
  start_date?: string;
  status: ProjectStatus;
  currency: string;
  description?: string;
  created_at: string;
  client?: Entity;
  last_rejection_comment?: string;
  last_rejected_by?: string;
  last_rejected_at?: string;
  last_rejected_stage?: string;
  is_financials_locked: boolean;
}

export type CostingStatus = 'draft' | 'submitted' | 'cm_approved' | 'cm_rejected' | 'evp_approved' | 'evp_rejected';

export interface ProjectCosting {
  id: string;
  project_id: string;
  stage: 'estimation' | 'budget';
  sales_price_excl_vat: number;
  sales_price_incl_vat: number;
  cost_01_civil: number;
  cost_02_pv_modules: number;
  cost_03_mounting: number;
  cost_04_inverters: number;
  cost_05_hv_switchgear: number;
  cost_06_cabling: number;
  cost_07_installation: number;
  cost_08_engineering: number;
  cost_09_logistics: number;
  cost_10_testing: number;
  total_cost_excl_vat: number;
  gross_margin_amount: number;
  gross_margin_pct: number;
  notes?: string;
  status: CostingStatus;
  submitted_by?: string;
  submitted_at?: string;
  cm_approved_by?: string;
  cm_approved_at?: string;
  cm_comments?: string;
  evp_approved_by?: string;
  evp_approved_at?: string;
  evp_comments?: string;
  created_at: string;
}

export interface VariationOrder {
  id: string;
  project_id: string;
  vo_number: string;
  client_po_reference: string;
  description: string;
  revenue_increase: number;
  cost_01_civil: number;
  cost_02_pv_modules: number;
  cost_03_mounting: number;
  cost_04_inverters: number;
  cost_05_hv_switchgear: number;
  cost_06_cabling: number;
  cost_07_installation: number;
  cost_08_engineering: number;
  cost_09_logistics: number;
  cost_10_testing: number;
  status: 'draft' | 'evp_approved';
  submitted_by?: string;
  submitted_at?: string;
  evp_approved_by?: string;
  evp_approved_at?: string;
  evp_comments?: string;
  created_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  milestone_no: number;
  description?: string;
  percentage: number;
  planned_amount_incl_vat: number;
  planned_date?: string;
  planned_date_override?: string;
  pss_invoice_no?: string;
  invoice_date?: string;
  status: 'planned' | 'invoiced' | 'received';
  created_at: string;
  invoices?: MilestoneInvoice[];
}

export interface MilestoneInvoice {
  id: string;
  milestone_id: string;
  project_id: string;
  invoice_no: string;
  invoice_date?: string;
  invoice_amount: number;
  received_amount: number;
  receipt_date?: string;
  status: 'invoiced' | 'partial' | 'received';
  notes?: string;
  created_at: string;
}

export type CostCategory =
  | '01_civil'
  | '02_pv_modules'
  | '03_mounting'
  | '04_inverters_electrical'
  | '05_hv_switchgear'
  | '06_cabling'
  | '07_installation'
  | '08_engineering'
  | '09_logistics'
  | '10_testing_warranty';

export type POStatus =
  | 'draft'
  | 'pending_cc'
  | 'pending_cm'
  | 'pending_evp'
  | 'pending_ceo'
  | 'approved'
  | 'pending_revision_approval'
  | 'draft_revision'
  | 'voided'
  | 'cancelled'
  | 'partially_paid'
  | 'fully_paid';

export interface PurchaseOrder {
  id: string;
  pss_po_no: string | null;
  project_id: string;
  vendor_id: string | null;
  description?: string;
  cost_category: CostCategory;
  po_amount_excl_vat: number;
  vat_7pct: number;
  po_amount_incl_vat: number;
  wht_applies: boolean;
  wht_rate: number;
  wht_3pct: number;
  po_date?: string;
  status: POStatus;
  has_supplier_milestones: boolean;
  pending_invoice_amount: number;
  pending_remaining_amount: number;
  supplier_name_raw?: string | null;
  notes?: string;
  submitted_by?: string;
  submitted_at?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  // Versioning & revision
  version: number;
  parent_po_id?: string | null;
  revision_reason?: string | null;
  revision_requested_by?: string | null;
  revision_requested_at?: string | null;
  superseded_at?: string | null;
  created_at: string;
  vendor?: Entity;
  project?: Project;
}

export interface POAuditLog {
  id: string;
  po_id: string;
  action: string;
  from_status: POStatus | null;
  to_status: POStatus;
  actor_id: string;
  notes?: string | null;
  created_at: string;
}

export interface POMilestone {
  id: string;
  purchase_order_id: string;
  milestone_number: number;
  milestone_pct: number;
  amount_due: number;
  invoice_no?: string;
  invoice_date?: string;
  invoice_value?: number;
  paid_amount: number;
  planned_payment_date?: string;
  status: 'pending' | 'invoiced' | 'paid';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface POSimplePayment {
  id: string;
  purchase_order_id: string;
  payment_month: string;
  amount: number;
  created_at: string;
}

export interface VendorInvoice {
  id: string;
  po_id: string;
  po_milestone_id?: string;
  project_id: string;
  vendor_id: string;
  vendor_invoice_no?: string;
  invoice_date?: string;
  invoice_amount_incl_vat: number;
  received_amount: number;
  wht_3pct: number;
  net_payable: number;
  status: 'received' | 'approved_cm' | 'approved_evp' | 'released' | 'paid' | 'rejected';
  rejection_comment?: string;
  rejected_by?: string;
  original_due_date?: string;
  planned_payment_date?: string;
  planning_notes?: string;
  vendor_notified: boolean;
  created_at: string;
  vendor?: Entity;
  project?: Project;
  purchase_order?: PurchaseOrder;
}

export interface ProgressReport {
  id: string;
  po_id: string;
  vendor_invoice_id: string;
  project_id: string;
  prepared_by?: string;
  report_date?: string;
  description?: string;
  checklist_work_complete: boolean;
  checklist_materials_onsite: boolean;
  checklist_quality_passed: boolean;
  checklist_safety_compliant: boolean;
  checklist_docs_received: boolean;
  percentage_complete: number;
  notes?: string;
  status: 'draft' | 'submitted' | 'cm_approved' | 'cm_rejected' | 'evp_approved' | 'evp_rejected';
  cm_approved_by?: string;
  cm_approved_at?: string;
  cm_comments?: string;
  evp_approved_by?: string;
  evp_approved_at?: string;
  evp_comments?: string;
  created_at: string;
  purchase_order?: PurchaseOrder;
  project?: Project;
  vendor_invoice?: VendorInvoice;
}

export interface PaymentVoucher {
  id: string;
  voucher_no: string;
  vendor_invoice_id: string;
  project_id: string;
  amount: number;
  wht_amount: number;
  net_paid: number;
  voucher_date?: string;
  prepared_by?: string;
  requires_manager_approval: boolean;
  manager_approved_by?: string;
  manager_approved_at?: string;
  ceo_notified: boolean;
  ceo_notified_at?: string;
  status: 'draft' | 'pending_manager' | 'approved' | 'issued';
  created_at: string;
  vendor_invoice?: VendorInvoice;
  project?: Project;
}

export interface Check {
  id: string;
  voucher_id: string;
  bank_account?: string;
  check_no?: string;
  check_date?: string;
  payee?: string;
  amount: number;
  signed_by_supervisor?: string;
  signed_by_manager?: string;
  status: 'draft' | 'issued' | 'cleared' | 'bounced';
  cleared_at?: string;
  cleared_note?: string;
  created_at: string;
  // joined relations (populated by CheckManagement page queries)
  payment_voucher?: PaymentVoucher & {
    vendor_invoice?: VendorInvoice & {
      purchase_order?: PurchaseOrder & {
        vendor?: Entity;
      };
      project?: Project;
    };
  };
}

export interface CashReceipt {
  id: string;
  project_id: string;
  milestone_id?: string;
  company_id?: string;
  pss_invoice_no?: string;
  receipt_date?: string;
  amount_received: number;
  wht_deducted: number;
  net_received: number;
  bank_account?: string;
  reference?: string;
  notes?: string;
  created_at: string;
  project?: Project;
  company?: Entity;
  milestone?: Milestone;
}

export interface ProjectCashTransfer {
  id: string;
  from_project_id: string;
  to_project_id: string;
  amount: number;
  reason?: string;
  transfer_date?: string;
  status: 'proposed' | 'evp_recommended' | 'ceo_approved' | 'rejected';
  proposed_by?: string;
  proposed_at?: string;
  recommended_by?: string;
  recommended_at?: string;
  recommended_notes?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  created_at: string;
  from_project?: Project;
  to_project?: Project;
}

export interface Loan {
  id: string;
  facility_type?: FacilityType;
  name?: string;
  counterparty_id?: string;
  principal: number;
  currency: string;
  due_date?: string;
  notes?: string;
  created_at: string;
  counterparty?: Entity;
  loan_transactions?: LoanTransaction[];
}

// ---------------------------------------------------------------------------
// Treasury / Event-sourced loan ledger
// ---------------------------------------------------------------------------

export type FacilityType = 'borrowing' | 'lending';
export type LoanEventType = 'drawdown' | 'repayment' | 'interest' | 'fee';
export type CashFlowDirection = 'in' | 'out';

export interface LoanTransaction {
  id: string;
  loan_id: string;
  transaction_date: string;
  event_type: LoanEventType;
  cash_flow_direction: CashFlowDirection;
  amount: number;
  notes?: string;
  created_by?: string;
  created_at?: string;
}

export interface SgaActual {
  id: string;
  year: number;
  month: number;
  amount: number;
  entered_by?: string;
  entered_at?: string;
}

export interface TreasuryAdjustment {
  id: string;
  label: string;
  amount: number;
  fiscal_year: number;
  created_by?: string;
  created_at?: string;
}

export interface EntityComment {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: {
    full_name: string;
    avatar_initials: string;
  };
}

export interface Notification {
  id: string;
  user_id: string;
  title?: string;
  message?: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'alert';
  is_read: boolean;
  related_entity_type?: string;
  related_entity_id?: string;
  created_at: string;
}

export const COST_CATEGORY_LABELS: Record<string, string> = {
  '01_civil': '01 Civil Works',
  '02_pv_modules': '02 PV Modules',
  '03_mounting': '03 Mounting',
  '04_inverters_electrical': '04 Inverters & Electrical',
  '05_hv_switchgear': '05 HV Switchgear',
  '06_cabling': '06 Cabling',
  '07_installation': '07 Installation',
  '08_engineering': '08 Engineering',
  '09_logistics': '09 Logistics',
  '10_testing_warranty': '10 Testing & Warranty',
};

export const COSTING_CATEGORY_KEYS = [
  'cost_01_civil',
  'cost_02_pv_modules',
  'cost_03_mounting',
  'cost_04_inverters',
  'cost_05_hv_switchgear',
  'cost_06_cabling',
  'cost_07_installation',
  'cost_08_engineering',
  'cost_09_logistics',
  'cost_10_testing',
] as const;

export type CostingCategoryKey = typeof COSTING_CATEGORY_KEYS[number];

export const COSTING_CATEGORY_LABELS: Record<CostingCategoryKey, string> = {
  cost_01_civil: '01 Civil Works',
  cost_02_pv_modules: '02 PV Modules',
  cost_03_mounting: '03 Mounting',
  cost_04_inverters: '04 Inverters & Electrical',
  cost_05_hv_switchgear: '05 HV Switchgear',
  cost_06_cabling: '06 Cabling',
  cost_07_installation: '07 Installation',
  cost_08_engineering: '08 Engineering',
  cost_09_logistics: '09 Logistics',
  cost_10_testing: '10 Testing & Warranty',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  cost_controller: 'Cost Controller',
  construction_manager: 'Construction Manager',
  evp: 'EVP',
  accounts_supervisor: 'Accounts Supervisor',
  accounts_manager: 'Accounts Manager',
  ceo: 'CEO',
  procurement: 'Procurement',
  banking_finance_officer: 'Banking & Finance Officer',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  estimation_draft: 'Estimation Draft',
  estimation_submitted: 'Est. Submitted',
  estimation_cm_approved: 'Est. CM Approved',
  estimation_approved: 'Est. Approved',
  budget_draft: 'Budget Draft',
  budget_submitted: 'Budget Submitted',
  budget_cm_approved: 'Budget CM Approved',
  active: 'Active',
  completed: 'Completed',
};

export function projectStatusGroup(status: ProjectStatus): 'estimation' | 'budget' | 'active' | 'completed' {
  if (['estimation_draft', 'estimation_submitted', 'estimation_cm_approved', 'estimation_approved'].includes(status)) return 'estimation';
  if (['budget_draft', 'budget_submitted', 'budget_cm_approved'].includes(status)) return 'budget';
  if (status === 'active') return 'active';
  return 'completed';
}

export function fmtTHB(n: number | null | undefined): string {
  if (n == null) return '฿0';
  const abs = Math.abs(n);
  const formatted = '฿' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? '-' + formatted : formatted;
}

export function fmtTHBCompact(n: number | null | undefined): string {
  if (n == null) return '฿0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return sign + '฿' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return sign + '฿' + (abs / 1_000).toFixed(0) + 'K';
  return sign + '฿' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
