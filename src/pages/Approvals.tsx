import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle, XCircle, Clock, Plus, X, FileText, DollarSign,
  ArrowRightLeft, ShoppingCart, Receipt, AlertTriangle,
} from 'lucide-react';
import {
  approveInvoiceCM, approveInvoiceEVP, approveInvoiceCEO, rejectInvoice,
  approvePO_CC, approvePO_CM, approvePO_EVP, approvePO_CEO, rejectPO,
  grantPOChange, rejectPOChangeRequest, GrantPOChangeParams,
  approveCostingCM, approveCostingEVP, rejectCostingCM, rejectCostingEVP,
  recommendTransferEVP, approveTransferCEO, rejectTransferCEO,
  POActionParams, CostingActionParams, TransferActionParams,
} from '../services/workflow';
import InvoiceDetailModal from '../components/approvals/InvoiceDetailModal';
import { useForm } from 'react-hook-form';
import { supabase } from '../lib/supabase';
import {
  ProgressReport, PurchaseOrder, VendorInvoice, Project,
  ProjectCosting, COSTING_CATEGORY_KEYS, fmtTHB, UserProfile,
  ProjectCashTransfer, POStatus,
} from '../types';
import { useAuth } from '../context/AuthContext';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHB, formatDate } from '../utils/formatters';
import { computeMarginTransferPosition, MarginTransferPosition } from '../utils/marginTransfer';
import { PO_THRESHOLD_CM, PO_THRESHOLD_EVP, INVOICE_CEO_THRESHOLD } from '../config/thresholds';

// ─── Constants ────────────────────────────────────────────────────────────────

const PO_PENDING_STATUSES = ['pending_cc', 'pending_cm', 'pending_evp', 'pending_ceo', 'pending_revision_approval'];

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalTab = 'pending' | 'with_others' | 'completed';

interface ProgressReportForm {
  po_id: string;
  vendor_invoice_id: string;
  project_id: string;
  report_date: string;
  description: string;
  percentage_complete: number;
  notes: string;
  work_complete: boolean;
  materials_on_site: boolean;
  quality_check: boolean;
  safety_compliance: boolean;
  documentation: boolean;
}

interface CostingWithProject extends ProjectCosting {
  project: Project;
  submitterProfile?: UserProfile;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stageLabel(projectStatus: string): string {
  if (['estimation_submitted', 'estimation_cm_approved'].includes(projectStatus)) return 'Estimation';
  if (['budget_submitted', 'budget_cm_approved'].includes(projectStatus)) return 'Budget';
  return 'Costing';
}

function poStageLabel(status: string): string {
  switch (status) {
    case 'pending_cc':  return 'Awaiting Cost Controller';
    case 'pending_cm':  return 'Awaiting Construction Manager';
    case 'pending_evp': return 'Awaiting EVP';
    case 'pending_ceo': return 'Awaiting CEO';
    case 'pending_revision_approval': return 'Revision Request — EVP Decision';
    default: return status.replace(/_/g, ' ');
  }
}

function poRequiredApprover(po: PurchaseOrder): string {
  if (po.status === 'pending_cc')  return 'Cost Controller';
  if (po.status === 'pending_cm')  return 'Construction Manager';
  if (po.status === 'pending_evp') return 'EVP';
  if (po.status === 'pending_ceo') return 'CEO';
  if (po.status === 'pending_revision_approval') return 'EVP';
  const amt = po.po_amount_incl_vat;
  if (amt < PO_THRESHOLD_CM)  return 'Construction Manager';
  if (amt < PO_THRESHOLD_EVP) return 'EVP';
  return 'CEO';
}

const CATEGORY_KEY_LABELS: Record<string, string> = {
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function Approvals() {
  const { profile, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<ApprovalTab>('pending');

  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [allPOs, setAllPOs] = useState<PurchaseOrder[]>([]);
  const [completedPOs, setCompletedPOs] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costings, setCostings] = useState<CostingWithProject[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [transfers, setTransfers] = useState<ProjectCashTransfer[]>([]);
  const [transferPositions, setTransferPositions] = useState<Map<string, MarginTransferPosition>>(new Map());
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [reviewModal, setReviewModal] = useState<ProgressReport | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [costingReviewModal, setCostingReviewModal] = useState<CostingWithProject | null>(null);
  const [costingComment, setCostingComment] = useState('');
  const [costingAction, setCostingAction] = useState(false);
  const [transferModal, setTransferModal] = useState<ProjectCashTransfer | null>(null);
  const [transferModalMode, setTransferModalMode] = useState<'recommend' | 'approve' | 'reject'>('recommend');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferRejectReason, setTransferRejectReason] = useState('');
  const [transferAction, setTransferAction] = useState(false);
  const [transferApprovalError, setTransferApprovalError] = useState<string | null>(null);
  const [poReviewModal, setPoReviewModal] = useState<PurchaseOrder | null>(null);
  const [poRejectReason, setPoRejectReason] = useState('');
  const [poAction, setPoAction] = useState(false);
  const [invoiceRejectModal, setInvoiceRejectModal] = useState<VendorInvoice | null>(null);
  const [invoiceRejectComment, setInvoiceRejectComment] = useState('');
  const [invoiceAction, setInvoiceAction] = useState(false);
  const [invoiceDetailModal, setInvoiceDetailModal] = useState<VendorInvoice | null>(null);

  const transfersRef  = useRef<HTMLDivElement>(null);
  const poRef         = useRef<HTMLDivElement>(null);
  const invoicesRef   = useRef<HTMLDivElement>(null);
  const costingsRef   = useRef<HTMLDivElement>(null);
  const reportsRef    = useRef<HTMLDivElement>(null);

  const { register, handleSubmit, watch, reset } = useForm<ProgressReportForm>();
  const pctValue = watch('percentage_complete', 0);

  // Scroll to section when navigating from a notification bell click (?section=...)
  useEffect(() => {
    const section = searchParams.get('section');
    if (!section || loading) return;
    const map: Record<string, React.RefObject<HTMLDivElement>> = {
      purchase_orders: poRef,
      invoices: invoicesRef,
      transfers: transfersRef,
      costings: costingsRef,
      progress_reports: reportsRef,
    };
    const ref = map[section];
    if (ref?.current) {
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, searchParams]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [
      { data: reps },
      { data: pendingPOData },
      { data: completedPOData },
      { data: invs },
      { data: proj },
      { data: costingData },
      { data: profileData },
    ] = await Promise.all([
      supabase.from('progress_reports')
        .select('*, project:projects(*), purchase_order:purchase_orders(*, vendor:entities!vendor_id(*))')
        .order('created_at', { ascending: false }),
      supabase.from('purchase_orders')
        .select('*, project:projects(*), vendor:entities!vendor_id(*)')
        .in('status', PO_PENDING_STATUSES)
        .order('created_at', { ascending: false }),
      supabase.from('purchase_orders')
        .select('*, project:projects(name), vendor:entities!vendor_id(name)')
        .in('status', ['approved', 'partially_paid', 'fully_paid'])
        .order('approved_at', { ascending: false })
        .limit(100),
      supabase.from('vendor_invoices')
        .select('*, vendor:entities!vendor_id(*), project:projects(name), purchase_order:purchase_orders(pss_po_no, description, vendor:entities!vendor_id(name), project:projects(name))')
        .in('status', ['received', 'approved_cm', 'approved_evp', 'rejected']),
      supabase.from('projects').select('id, name, status, last_rejected_stage').order('name'),
      supabase.from('project_costings')
        .select('*')
        .in('status', ['submitted', 'cm_approved', 'evp_approved', 'cm_rejected', 'evp_rejected']),
      supabase.from('user_profiles').select('*'),
    ]);

    setReports(reps || []);
    setAllPOs((pendingPOData as PurchaseOrder[]) || []);
    setCompletedPOs((completedPOData as PurchaseOrder[]) || []);
    setInvoices(invs || []);
    setProjects(proj || []);
    setProfiles(profileData || []);

    if (costingData && proj) {
      const projectMap = new Map<string, Project>((proj as Project[]).map(p => [p.id, p]));
      const enriched: CostingWithProject[] = (costingData as ProjectCosting[])
        .map(c => {
          const project = projectMap.get(c.project_id);
          if (!project) return null;
          const submitter = (profileData as UserProfile[]).find(p => p.id === c.submitted_by);
          return { ...c, project, submitterProfile: submitter };
        })
        .filter((x): x is CostingWithProject => x !== null);
      setCostings(enriched);
    }

    const { data: transferData } = await supabase
      .from('project_cash_transfers')
      .select('*, from_project:projects!from_project_id(id,name,contract_incl_vat,status), to_project:projects!to_project_id(id,name,contract_incl_vat,status)')
      .in('status', ['proposed', 'evp_recommended', 'ceo_approved', 'rejected'])
      .order('created_at', { ascending: false });
    setTransfers((transferData ?? []) as ProjectCashTransfer[]);

    if (transferData) {
      const fromIds = [...new Set((transferData as ProjectCashTransfer[]).map(t => t.from_project_id))];
      const posEntries = await Promise.all(
        fromIds.map(async pid => [pid, await computeMarginTransferPosition(supabase, pid)] as [string, MarginTransferPosition])
      );
      setTransferPositions(new Map(posEntries));
    }

    setLoading(false);
  }

  function profileName(uid?: string | null): string {
    if (!uid) return '—';
    return profiles.find(p => p.id === uid)?.full_name ?? '—';
  }

  const role = profile?.role ?? '';

  // ─── PO Filtering ───────────────────────────────────────────────────────────

  function filterPendingPOs(): PurchaseOrder[] {
    if (!profile || tab !== 'pending') return [];
    switch (role) {
      case 'cost_controller':      return allPOs.filter(po => po.status === 'pending_cc');
      case 'construction_manager': return allPOs.filter(po => po.status === 'pending_cm');
      case 'evp':                  return allPOs.filter(po => po.status === 'pending_evp' || po.status === 'pending_revision_approval');
      case 'ceo':                  return allPOs.filter(po => po.status === 'pending_ceo');
      case 'accounts_manager':     return allPOs;
      default: return [];
    }
  }

  function filterWithOthersPOs(): PurchaseOrder[] {
    if (!profile || tab !== 'with_others') return [];
    switch (role) {
      case 'cost_controller':      return allPOs.filter(po => ['pending_cm', 'pending_evp', 'pending_ceo'].includes(po.status));
      case 'construction_manager': return allPOs.filter(po => ['pending_evp', 'pending_ceo'].includes(po.status));
      case 'evp':                  return allPOs.filter(po => ['pending_cc', 'pending_cm'].includes(po.status));
      case 'procurement':          return allPOs;
      default: return [];
    }
  }

  function filterCompletedPOs(): PurchaseOrder[] {
    if (!profile || tab !== 'completed') return [];
    switch (role) {
      case 'construction_manager': return completedPOs.filter(po => po.po_amount_incl_vat < PO_THRESHOLD_CM);
      case 'evp':                  return completedPOs.filter(po => po.po_amount_incl_vat >= PO_THRESHOLD_CM && po.po_amount_incl_vat < PO_THRESHOLD_EVP);
      case 'ceo':                  return completedPOs.filter(po => po.po_amount_incl_vat >= PO_THRESHOLD_EVP);
      case 'cost_controller':
      case 'accounts_manager':     return completedPOs;
      default: return [];
    }
  }

  function canApprovePO(po: PurchaseOrder): boolean {
    switch (role) {
      case 'cost_controller':      return po.status === 'pending_cc';
      case 'construction_manager': return po.status === 'pending_cm';
      case 'evp':                  return po.status === 'pending_evp';
      case 'ceo':                  return po.status === 'pending_ceo';
      default: return false;
    }
  }

  // ─── PO Actions ─────────────────────────────────────────────────────────────

  async function approvePO(po: PurchaseOrder) {
    if (!user || poAction) return;
    setPoAction(true);
    try {
      let result: { error: string | null };
      if (role === 'evp' && po.status === 'pending_revision_approval') {
        const grantParams: GrantPOChangeParams = {
          poId: po.id,
          evpId: user.id,
          decision: 'revise',
          projectName: (po.project as Project)?.name ?? '',
          projectId: po.project_id,
          poDescription: po.description ?? '',
          pssPoNo: po.pss_po_no,
          currentVersion: po.version ?? 1,
          decisionNotes: poRejectReason.trim() || undefined,
        };
        result = await grantPOChange(grantParams);
      } else {
        const params: POActionParams = {
          poId: po.id,
          actorId: user.id,
          projectName: (po.project as Project)?.name ?? '',
          projectId: po.project_id,
          poDescription: po.description ?? '',
          poAmountInclVat: po.po_amount_incl_vat,
          currentStatus: po.status as never,
        };
        if (role === 'cost_controller')           result = await approvePO_CC(params);
        else if (role === 'construction_manager') result = await approvePO_CM(params);
        else if (role === 'evp')                  result = await approvePO_EVP(params);
        else if (role === 'ceo')                  result = await approvePO_CEO(params);
        else return;
      }
      if (result.error) alert('Failed to process PO: ' + result.error);
      setPoReviewModal(null);
      setPoRejectReason('');
      loadData();
    } catch (err) {
      console.error('approvePO threw:', err);
      alert('An unexpected error occurred while approving. Please try again.');
    } finally {
      setPoAction(false);
    }
  }

  async function handleRejectPO(po: PurchaseOrder) {
    if (!user || !poRejectReason.trim() || poAction) return;
    setPoAction(true);
    try {
      let result: { error: string | null };
      if (po.status === 'pending_revision_approval') {
        const { data: logEntry } = await supabase
          .from('po_action_log')
          .select('from_status')
          .eq('po_id', po.id)
          .eq('action', 'revision_requested')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const priorStatus = (logEntry?.from_status as POStatus) ?? 'approved_evp';
        result = await rejectPOChangeRequest(
          po.id,
          user.id,
          (po.project as Project)?.name ?? '',
          po.project_id,
          po.description ?? '',
          po.pss_po_no,
          poRejectReason.trim(),
          priorStatus,
        );
      } else {
        const params: POActionParams = {
          poId: po.id,
          actorId: user.id,
          projectName: (po.project as Project)?.name ?? '',
          projectId: po.project_id,
          poDescription: po.description ?? '',
          poAmountInclVat: po.po_amount_incl_vat,
          currentStatus: po.status as never,
        };
        result = await rejectPO(params, user.id, poRejectReason.trim());
      }
      if (result.error) alert('Failed to process PO: ' + result.error);
      setPoReviewModal(null);
      setPoRejectReason('');
      loadData();
    } catch (err) {
      console.error('handleRejectPO threw:', err);
      alert('An unexpected error occurred while rejecting. Please try again.');
    } finally {
      setPoAction(false);
    }
  }

  async function handleVoidPO(po: PurchaseOrder) {
    if (!user || poAction) return;
    if (!window.confirm(`Permanently void "${po.description ?? 'this PO'}"? This cannot be undone.`)) return;
    setPoAction(true);
    try {
      const result = await grantPOChange({
        poId: po.id,
        evpId: user.id,
        decision: 'void',
        projectName: (po.project as Project)?.name ?? '',
        projectId: po.project_id,
        poDescription: po.description ?? '',
        pssPoNo: po.pss_po_no,
        currentVersion: po.version ?? 1,
        decisionNotes: poRejectReason.trim() || undefined,
      });
      if (result.error) alert('Failed to void PO: ' + result.error);
      setPoReviewModal(null);
      setPoRejectReason('');
      loadData();
    } catch (err) {
      console.error('handleVoidPO threw:', err);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setPoAction(false);
    }
  }

  // ─── Invoice Filtering & Actions ────────────────────────────────────────────

  function filterInvoices(): VendorInvoice[] {
    if (role === 'accounts_manager') return invoices;
    if (tab === 'pending') {
      if (role === 'construction_manager') return invoices.filter(i => i.status === 'received');
      if (role === 'evp')                  return invoices.filter(i => i.status === 'approved_cm');
      if (role === 'ceo')                  return invoices.filter(i => i.status === 'approved_evp');
      if (role === 'cost_controller')      return invoices.filter(i => i.status === 'rejected');
    }
    if (tab === 'with_others') {
      if (role === 'cost_controller')      return invoices.filter(i => i.status === 'received' || i.status === 'approved_cm');
      if (role === 'construction_manager') return invoices.filter(i => i.status === 'approved_cm' || i.status === 'approved_evp');
      if (role === 'evp')                  return invoices.filter(i => i.status === 'approved_evp');
    }
    if (tab === 'completed') {
      if (role === 'construction_manager') return invoices.filter(i => i.status === 'approved_cm' || i.status === 'rejected');
      if (role === 'evp')                  return invoices.filter(i => i.status === 'approved_evp' || i.status === 'rejected');
      if (role === 'ceo')                  return invoices.filter(i => i.status === 'approved_evp');
      if (role === 'cost_controller')      return invoices.filter(i => i.status === 'approved_cm' || i.status === 'approved_evp');
    }
    return [];
  }

  function canApproveInvoice(invoice: VendorInvoice): boolean {
    if (role === 'construction_manager') return invoice.status === 'received';
    if (role === 'evp')                  return invoice.status === 'approved_cm';
    if (role === 'ceo')                  return invoice.status === 'approved_evp';
    return false;
  }

  function canRejectInvoice(invoice: VendorInvoice): boolean {
    if (role === 'construction_manager') return invoice.status === 'received';
    if (role === 'evp')                  return invoice.status === 'approved_cm';
    if (role === 'ceo')                  return invoice.status === 'approved_evp';
    return false;
  }

  function invoiceApproveLabel(invoice: VendorInvoice): string {
    if (role === 'construction_manager') return 'Approve — Send to EVP';
    if (role === 'evp') return invoice.invoice_amount_incl_vat >= INVOICE_CEO_THRESHOLD ? 'Approve — Escalate to CEO' : 'Approve — Release for Payment';
    if (role === 'ceo') return 'Approve — Release for Payment';
    return 'Approve';
  }

  async function handleApproveInvoice(invoice: VendorInvoice) {
    if (!user || invoiceAction) return;
    setInvoiceAction(true);
    const po = invoice.purchase_order as { project?: { name: string } } | undefined;
    const projectName = po?.project?.name ?? '';
    const invoiceNo = invoice.vendor_invoice_no ?? invoice.id.slice(0, 8);
    let result: { error: string | null };
    if (role === 'construction_manager') result = await approveInvoiceCM(invoice.id, user.id, projectName, invoiceNo, invoice.project_id);
    else if (role === 'evp')             result = await approveInvoiceEVP(invoice.id, user.id, invoice.invoice_amount_incl_vat, projectName, invoiceNo, invoice.project_id);
    else if (role === 'ceo')             result = await approveInvoiceCEO(invoice.id, user.id, projectName, invoiceNo, invoice.invoice_amount_incl_vat, invoice.project_id);
    else { setInvoiceAction(false); return; }
    if (result.error) alert('Failed to approve invoice: ' + result.error);
    setInvoiceAction(false);
    loadData();
  }

  async function handleRejectInvoice() {
    if (!invoiceRejectModal || !user || !invoiceRejectComment.trim() || invoiceAction) return;
    setInvoiceAction(true);
    const po = invoiceRejectModal.purchase_order as { project?: { name: string } } | undefined;
    const projectName = po?.project?.name ?? '';
    const invoiceNo = invoiceRejectModal.vendor_invoice_no ?? invoiceRejectModal.id.slice(0, 8);
    const result = await rejectInvoice(invoiceRejectModal.id, user.id, invoiceRejectComment.trim(), projectName, invoiceNo, invoiceRejectModal.project_id);
    if (result.error) alert('Failed to reject invoice: ' + result.error);
    setInvoiceRejectModal(null);
    setInvoiceRejectComment('');
    setInvoiceAction(false);
    loadData();
  }

  async function handleRejectInvoiceFromModal(inv: VendorInvoice, comment: string) {
    if (!user) return;
    const po = inv.purchase_order as { project?: { name: string } } | undefined;
    const projectName = po?.project?.name ?? '';
    const invoiceNo = inv.vendor_invoice_no ?? inv.id.slice(0, 8);
    const result = await rejectInvoice(inv.id, user.id, comment, projectName, invoiceNo, inv.project_id);
    if (result.error) alert('Failed to reject invoice: ' + result.error);
    setInvoiceDetailModal(null);
    loadData();
  }

  // ─── Costing Actions ────────────────────────────────────────────────────────

  function filterCostings(): CostingWithProject[] {
    if (!profile) return [];
    if (role === 'ceo' || role === 'accounts_manager') return costings;
    if (tab === 'pending') {
      if (role === 'construction_manager') return costings.filter(c => c.status === 'submitted' && ['estimation_submitted', 'budget_submitted'].includes(c.project.status));
      if (role === 'evp') return costings.filter(c => c.status === 'cm_approved' && ['estimation_cm_approved', 'budget_cm_approved'].includes(c.project.status));
    }
    if (tab === 'with_others') {
      if (role === 'cost_controller') return costings.filter(c => c.status === 'submitted' || c.status === 'cm_approved');
      if (role === 'construction_manager') return costings.filter(c => c.status === 'cm_approved');
    }
    if (tab === 'completed') {
      if (role === 'evp') return costings.filter(c => c.status === 'evp_approved' || c.status === 'evp_rejected');
      if (role === 'construction_manager') return costings.filter(c => ['evp_approved', 'evp_rejected', 'cm_rejected'].includes(c.status));
      if (role === 'cost_controller') return costings.filter(c => ['evp_approved', 'cm_rejected', 'evp_rejected'].includes(c.status));
    }
    return [];
  }

  function canReviewCosting(costing: CostingWithProject): boolean {
    if (role === 'construction_manager') return costing.status === 'submitted' && ['estimation_submitted', 'budget_submitted'].includes(costing.project.status);
    if (role === 'evp') return costing.status === 'cm_approved' && ['estimation_cm_approved', 'budget_cm_approved'].includes(costing.project.status);
    return false;
  }

  async function approveCostingItem(costing: CostingWithProject) {
    if (!user) return;
    setCostingAction(true);
    const projectStatus = costing.project.status;
    const stage: CostingActionParams['stage'] = projectStatus.startsWith('budget') ? 'budget' : 'estimation';
    const params: CostingActionParams = {
      costingId: costing.id,
      projectId: costing.project_id,
      projectName: costing.project.name,
      actorId: user.id,
      stage,
      comment: costingComment || null,
    };
    let result: { error: string | null };
    if (role === 'construction_manager') result = await approveCostingCM(params);
    else if (role === 'evp') result = await approveCostingEVP(params);
    else { setCostingAction(false); return; }
    if (result.error) alert('Failed to approve costing: ' + result.error);
    setCostingReviewModal(null);
    setCostingComment('');
    setCostingAction(false);
    loadData();
  }

  async function rejectCostingItem(costing: CostingWithProject) {
    if (!user || !costingComment.trim()) return;
    setCostingAction(true);
    const projectStatus = costing.project.status;
    const stageStr = stageLabel(projectStatus);
    const stage: CostingActionParams['stage'] = projectStatus.startsWith('budget') ? 'budget' : 'estimation';
    const stageFullLabel = `${stageStr} — ${role === 'construction_manager' ? 'CM Review' : 'EVP Approval'}`;
    let result: { error: string | null };
    if (role === 'construction_manager') {
      result = await rejectCostingCM(costing.id, costing.project_id, costing.project.name, user.id, stage, costingComment, stageFullLabel);
    } else if (role === 'evp') {
      result = await rejectCostingEVP(costing.id, costing.project_id, costing.project.name, user.id, stage, costingComment, stageFullLabel);
    } else { setCostingAction(false); return; }
    if (result.error) alert('Failed to reject costing: ' + result.error);
    setCostingReviewModal(null);
    setCostingComment('');
    setCostingAction(false);
    loadData();
  }

  // ─── Report Filtering & Actions ─────────────────────────────────────────────

  function filterReports(): ProgressReport[] {
    if (!profile) return [];
    if (role === 'ceo' || role === 'accounts_manager') return reports;
    if (tab === 'pending') {
      if (role === 'cost_controller')      return reports.filter(r => r.status === 'draft' || r.status === 'cm_rejected' || r.status === 'evp_rejected');
      if (role === 'construction_manager') return reports.filter(r => r.status === 'submitted');
      if (role === 'evp')                  return reports.filter(r => r.status === 'cm_approved');
      return [];
    }
    if (tab === 'with_others') {
      if (role === 'cost_controller')      return reports.filter(r => r.status === 'submitted' || r.status === 'cm_approved');
      if (role === 'construction_manager') return reports.filter(r => r.status === 'cm_approved');
      return [];
    }
    if (tab === 'completed') return reports.filter(r => r.status === 'evp_approved' || r.status === 'cm_rejected' || r.status === 'evp_rejected');
    return [];
  }

  function canReviewReport(report: ProgressReport): boolean {
    if (role === 'construction_manager') return report.status === 'submitted';
    if (role === 'evp') return report.status === 'cm_approved';
    return false;
  }

  async function approveReport(report: ProgressReport) {
    if (!user) return;
    let update: Record<string, unknown> = {};
    let invoiceUpdate: Record<string, unknown> | null = null;
    if (role === 'construction_manager') update = { status: 'cm_approved', cm_approved_by: user.id, cm_approved_at: new Date().toISOString(), cm_comments: reviewComment };
    else if (role === 'evp') { update = { status: 'evp_approved', evp_approved_by: user.id, evp_approved_at: new Date().toISOString(), evp_comments: reviewComment }; if (report.vendor_invoice_id) invoiceUpdate = { status: 'released' }; }
    await supabase.from('progress_reports').update(update).eq('id', report.id);
    if (invoiceUpdate && report.vendor_invoice_id) await supabase.from('vendor_invoices').update(invoiceUpdate).eq('id', report.vendor_invoice_id);
    setReviewModal(null);
    setReviewComment('');
    loadData();
  }

  async function rejectReport(report: ProgressReport) {
    if (!user) return;
    let update: Record<string, unknown> = {};
    if (role === 'construction_manager') update = { status: 'cm_rejected', cm_approved_by: user.id, cm_approved_at: new Date().toISOString(), cm_comments: reviewComment };
    else if (role === 'evp') update = { status: 'evp_rejected', evp_approved_by: user.id, evp_approved_at: new Date().toISOString(), evp_comments: reviewComment };
    await supabase.from('progress_reports').update(update).eq('id', report.id);
    setReviewModal(null);
    setReviewComment('');
    loadData();
  }

  async function submitReport(data: ProgressReportForm) {
    if (!user) return;
    setSubmitting(true);
    await supabase.from('progress_reports').insert({ po_id: data.po_id, vendor_invoice_id: data.vendor_invoice_id || null, project_id: data.project_id, prepared_by: user.id, report_date: data.report_date, description: data.description, percentage_complete: Number(data.percentage_complete), notes: data.notes, site_checklist: { work_complete: data.work_complete, materials_on_site: data.materials_on_site, quality_check: data.quality_check, safety_compliance: data.safety_compliance, documentation: data.documentation }, status: 'submitted' });
    reset();
    setShowForm(false);
    setSubmitting(false);
    loadData();
  }

  // ─── Transfer Filtering & Actions ───────────────────────────────────────────

  function filterTransfers(): ProjectCashTransfer[] {
    if (role === 'evp') {
      if (tab === 'pending') return transfers.filter(t => t.status === 'proposed');
      if (tab === 'completed') return transfers.filter(t => ['evp_recommended', 'ceo_approved', 'rejected'].includes(t.status));
    }
    if (role === 'ceo') {
      if (tab === 'pending') return transfers.filter(t => t.status === 'evp_recommended');
      if (tab === 'completed') return transfers.filter(t => ['ceo_approved', 'rejected'].includes(t.status));
    }
    if (role === 'cost_controller') {
      if (tab === 'with_others') return transfers.filter(t => t.status === 'proposed' || t.status === 'evp_recommended');
      if (tab === 'completed') return transfers.filter(t => ['ceo_approved', 'rejected'].includes(t.status));
    }
    if (role === 'accounts_supervisor' && tab === 'completed') return transfers.filter(t => t.status === 'ceo_approved');
    if (role === 'accounts_manager') return transfers;
    return [];
  }

  async function handleTransferRecommend(t: ProjectCashTransfer) {
    if (!user) return;
    setTransferAction(true);
    const { data: actor } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const actorName = (actor as { full_name: string } | null)?.full_name ?? 'EVP';
    const params: TransferActionParams = {
      transferId: t.id,
      actorId: user.id,
      actorName,
      amount: t.amount,
      fromProjectName: (t.from_project as Project)?.name ?? '',
      toProjectName: (t.to_project as Project)?.name ?? '',
      notes: transferNotes || null,
    };
    const result = await recommendTransferEVP(params);
    if (result.error) alert('Failed to recommend transfer: ' + result.error);
    setTransferModal(null);
    setTransferNotes('');
    setTransferAction(false);
    loadData();
  }

  async function handleTransferApprove(t: ProjectCashTransfer) {
    if (!user) return;
    setTransferAction(true);
    setTransferApprovalError(null);
    const { data: actor } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const actorName = (actor as { full_name: string } | null)?.full_name ?? 'CEO';
    const params: TransferActionParams = {
      transferId: t.id,
      actorId: user.id,
      actorName,
      amount: t.amount,
      fromProjectName: (t.from_project as Project)?.name ?? '',
      toProjectName: (t.to_project as Project)?.name ?? '',
    };
    const result = await approveTransferCEO(params);
    if (result.error) { setTransferApprovalError(result.error); setTransferAction(false); return; }
    setTransferModal(null);
    setTransferNotes('');
    setTransferAction(false);
    loadData();
  }

  async function handleTransferReject(t: ProjectCashTransfer) {
    if (!user || !transferRejectReason.trim()) return;
    setTransferAction(true);
    const { data: actor } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const actorName = (actor as { full_name: string } | null)?.full_name ?? profileName(user.id);
    const result = await rejectTransferCEO(
      t.id, user.id, actorName, t.amount,
      (t.from_project as Project)?.name ?? '',
      (t.to_project as Project)?.name ?? '',
      transferRejectReason.trim(),
    );
    if (result.error) alert('Failed to reject transfer: ' + result.error);
    setTransferModal(null);
    setTransferRejectReason('');
    setTransferAction(false);
    loadData();
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const isReadOnly = role === 'accounts_manager';
  const canCreate  = role === 'cost_controller';

  const filteredPendingPOs  = filterPendingPOs();
  const filteredWithOthersPOs = filterWithOthersPOs();
  const filteredCompletedPOs = filterCompletedPOs();
  const filteredInvoices    = filterInvoices();
  const filteredCostings    = filterCostings();
  const filteredReports     = filterReports();
  const filteredTransfers   = filterTransfers();

  const showPOPendingSection   = tab === 'pending'     && filteredPendingPOs.length > 0;
  const showPOPipelineSection  = tab === 'with_others' && filteredWithOthersPOs.length > 0;
  const showPOCompletedSection = tab === 'completed'   && filteredCompletedPOs.length > 0;
  const showTransfersSection   = filteredTransfers.length > 0;
  const showInvoicesSection    = filteredInvoices.length > 0;
  const showCostingSection     = role === 'construction_manager' || role === 'evp' || role === 'ceo' || role === 'accounts_manager' || (role === 'cost_controller' && tab === 'with_others');
  const showReportsSection     = ['construction_manager', 'evp', 'cost_controller', 'ceo', 'accounts_manager'].includes(role);

  const actionableReports = filteredReports.filter(r => canReviewReport(r)).length;
  const totalPending = tab === 'pending'
    ? filteredPendingPOs.length + filteredInvoices.length + filteredTransfers.length + filteredCostings.length + actionableReports
    : 0;

  const pendingSummaryParts = tab === 'pending' ? [
    filteredPendingPOs.length > 0    && `${filteredPendingPOs.length} PO${filteredPendingPOs.length !== 1 ? 's' : ''}`,
    filteredInvoices.length > 0      && `${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? 's' : ''}`,
    filteredTransfers.length > 0     && `${filteredTransfers.length} transfer${filteredTransfers.length !== 1 ? 's' : ''}`,
    filteredCostings.length > 0      && `${filteredCostings.length} costing${filteredCostings.length !== 1 ? 's' : ''}`,
    actionableReports > 0            && `${actionableReports} progress report${actionableReports !== 1 ? 's' : ''}`,
  ].filter(Boolean) as string[] : [];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">Purchase orders · Supplier invoices · Margin transfers · Costings · Progress reports</p>
        </div>
        <div className="flex items-center gap-3">
          {isReadOnly && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-[#EF9F27] bg-[#EF9F27]/10 border border-[#EF9F27]/20 px-3 py-1.5 rounded-lg">
              <FileText size={13} />Read-only view
            </span>
          )}
          {canCreate && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors">
              <Plus size={16} />New Progress Report
            </button>
          )}
        </div>
      </div>

      {/* Pending action banner */}
      {tab === 'pending' && totalPending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle size={15} className="text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{totalPending} item{totalPending !== 1 ? 's' : ''} require your attention:</span>{' '}
            {pendingSummaryParts.join(', ')}.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        {(['pending', 'with_others', 'completed'] as ApprovalTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? 'bg-[#0f1923] text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'with_others' ? 'With Others' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Margin Transfers ─────────────────────────────────────────────────── */}
      {showTransfersSection && (
        <div className="space-y-3" ref={transfersRef}>
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-[#1D9E75]" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Margin Transfers</h2>
            <span className="bg-[#1D9E75]/10 text-[#1D9E75] text-xs font-semibold px-2 py-0.5 rounded-full">{filteredTransfers.length}</span>
          </div>
          {filteredTransfers.map(t => {
            const fromProj = t.from_project as Project;
            const toProj   = t.to_project   as Project;
            const pos = transferPositions.get(t.from_project_id);
            const statusMap: Record<string, { label: string; cls: string }> = {
              proposed:        { label: 'Proposed',         cls: 'bg-gray-100 text-gray-600' },
              evp_recommended: { label: 'EVP Recommended',  cls: 'bg-blue-50 text-blue-600' },
              ceo_approved:    { label: 'CEO Approved',     cls: 'bg-[#1D9E75]/10 text-[#1D9E75]' },
              rejected:        { label: 'Rejected',         cls: 'bg-[#E24B4A]/10 text-[#E24B4A]' },
            };
            const s = statusMap[t.status] ?? { label: t.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <div key={t.id} className="bg-white rounded-lg border-l-4 border-l-[#1D9E75] border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{fromProj?.name ?? '—'} → {toProj?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Proposed by {profileName(t.proposed_by)} · {formatDate(t.proposed_at)}</p>
                    {t.reason && <p className="text-xs text-gray-600 mt-2 italic">"{t.reason}"</p>}
                    {t.recommended_notes && <p className="text-xs text-gray-500 mt-1"><span className="font-medium">EVP notes:</span> {t.recommended_notes}</p>}
                    {t.rejection_reason && <p className="text-xs text-[#E24B4A] mt-1"><span className="font-medium">Rejection:</span> {t.rejection_reason}</p>}
                  </div>
                  <div className="shrink-0 text-right space-y-0.5">
                    <p className="text-lg font-bold text-[#0f1923]">{fmtTHB(t.amount)}</p>
                    {pos && (
                      <div className="text-xs text-gray-400 space-y-0.5">
                        <p>Collection: {pos.collectionRatePct}</p>
                        <p>Earned: {fmtTHB(pos.releasableMargin)}</p>
                        <p>Available: {fmtTHB(pos.availableToTransfer)}</p>
                      </div>
                    )}
                  </div>
                </div>
                {tab === 'pending' && role === 'evp' && t.status === 'proposed' && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                    <button onClick={() => { setTransferModal(t); setTransferModalMode('reject'); setTransferRejectReason(''); }} className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#E24B4A]/5"><XCircle size={13} /> Reject</button>
                    <button onClick={() => { setTransferModal(t); setTransferModalMode('recommend'); setTransferNotes(''); }} className="flex items-center gap-1.5 bg-[#378ADD] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2a6fb5]"><CheckCircle size={13} /> Recommend Approval</button>
                  </div>
                )}
                {tab === 'pending' && role === 'ceo' && t.status === 'evp_recommended' && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                    <button onClick={() => { setTransferModal(t); setTransferModalMode('reject'); setTransferRejectReason(''); }} className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#E24B4A]/5"><XCircle size={13} /> Reject</button>
                    <button onClick={() => { setTransferModal(t); setTransferModalMode('approve'); setTransferNotes(''); setTransferApprovalError(null); }} className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#178a64]"><CheckCircle size={13} /> Approve Transfer</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pending POs ──────────────────────────────────────────────────────── */}
      {showPOPendingSection && (
        <div className="space-y-3" ref={poRef}>
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-[#EF9F27]" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Purchase Orders — Pending Your Approval</h2>
            <span className="bg-[#EF9F27]/10 text-[#EF9F27] text-xs font-semibold px-2 py-0.5 rounded-full">{filteredPendingPOs.length}</span>
          </div>
          {filteredPendingPOs.map(po => renderPOCard(po, 'pending'))}
        </div>
      )}

      {/* ── POs in Pipeline ──────────────────────────────────────────────────── */}
      {showPOPipelineSection && (
        <div className="space-y-3" ref={poRef}>
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Purchase Orders — In Pipeline</h2>
            <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-2 py-0.5 rounded-full">{filteredWithOthersPOs.length}</span>
          </div>
          {filteredWithOthersPOs.map(po => renderPOCard(po, 'with_others'))}
        </div>
      )}

      {/* ── Completed POs ─────────────────────────────────────────────────────── */}
      {showPOCompletedSection && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-[#1D9E75]" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Approved Purchase Orders</h2>
            <span className="bg-[#1D9E75]/10 text-[#1D9E75] text-xs font-semibold px-2 py-0.5 rounded-full">{filteredCompletedPOs.length}</span>
          </div>
          {filteredCompletedPOs.map(po => {
            const vendor  = po.vendor  as { name: string } | undefined;
            const project = po.project as { name: string } | undefined;
            const statusColors: Record<string, string> = { approved: 'bg-[#1D9E75]/10 text-[#1D9E75]', partially_paid: 'bg-[#EF9F27]/10 text-[#EF9F27]', fully_paid: 'bg-[#378ADD]/10 text-[#378ADD]' };
            return (
              <div key={po.id} className="bg-white rounded-lg border-l-4 border-l-[#1D9E75] border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[po.status] ?? 'bg-gray-100 text-gray-600'}`}>{po.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                      {po.pss_po_no && <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{po.pss_po_no}</span>}
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{project?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{vendor?.name ?? 'No supplier'} · {po.description ?? '—'}</p>
                    {po.approved_at && <p className="text-xs text-gray-400 mt-0.5">Approved {formatDate(po.approved_at)}{po.approved_by ? ` by ${profileName(po.approved_by)}` : ''}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold text-[#0f1923]">{fmtTHB(po.po_amount_incl_vat)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">incl VAT</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Supplier Invoices ─────────────────────────────────────────────────── */}
      {showInvoicesSection && (
        <div className="space-y-3" ref={invoicesRef}>
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-[#2563eb]" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Supplier Invoices</h2>
            <span className="bg-[#2563eb]/10 text-[#2563eb] text-xs font-semibold px-2 py-0.5 rounded-full">{filteredInvoices.length}</span>
          </div>
          {filteredInvoices.map(invoice => {
            const po        = invoice.purchase_order as { pss_po_no?: string; description?: string; project?: { name: string } } | undefined;
            const vendor    = invoice.vendor as { name: string } | undefined;
            const projectName = po?.project?.name ?? (invoice as any).project?.name ?? '—';
            const descriptionLine = po?.description ?? (invoice as any).description ?? '—';
            const invoiceStatusMap: Record<string, { label: string; cls: string; border: string }> = {
              received:     { label: 'Awaiting CM Review',         cls: 'bg-amber-50 text-amber-700',         border: 'border-l-amber-400' },
              approved_cm:  { label: 'CM Approved — Awaiting EVP', cls: 'bg-blue-50 text-blue-700',           border: 'border-l-blue-400' },
              approved_evp: { label: 'EVP Approved — Awaiting CEO',cls: 'bg-[#1D9E75]/10 text-[#1D9E75]',    border: 'border-l-[#1D9E75]' },
              rejected:     { label: 'Rejected',                   cls: 'bg-[#E24B4A]/10 text-[#E24B4A]',    border: 'border-l-[#E24B4A]' },
            };
            const s = invoiceStatusMap[invoice.status] ?? { label: invoice.status, cls: 'bg-gray-100 text-gray-600', border: 'border-l-gray-300' };
            return (
              <div key={invoice.id} className={`bg-white rounded-lg border-l-4 ${s.border} border border-gray-200 p-5`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                      {po?.pss_po_no ? (
                        <button onClick={() => setInvoiceDetailModal(invoice)} className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors">{po.pss_po_no}</button>
                      ) : (
                        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Direct Bill</span>
                      )}
                    </div>
                    <button onClick={() => setInvoiceDetailModal(invoice)} className="text-sm font-semibold text-gray-800 hover:text-[#1D9E75] transition-colors text-left">{projectName}</button>
                    <p className="text-xs text-gray-500 mt-0.5">{vendor?.name ?? '—'} · {descriptionLine}</p>
                    {invoice.vendor_invoice_no && <p className="text-xs text-gray-400 mt-0.5">Invoice No: <span className="font-medium text-gray-600">{invoice.vendor_invoice_no}</span></p>}
                    {invoice.status === 'rejected' && invoice.rejection_comment && (
                      <div className="mt-2 bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg px-3 py-2">
                        <p className="text-xs font-medium text-[#E24B4A] mb-0.5">Rejection reason:</p>
                        <p className="text-xs text-gray-700 italic">"{invoice.rejection_comment}"</p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right space-y-0.5">
                    <p className="text-xs text-gray-400">Amount (incl VAT)</p>
                    <p className="text-base font-bold text-[#0f1923]">{fmtTHB(invoice.invoice_amount_incl_vat)}</p>
                    {invoice.wht_3pct > 0 && (<><p className="text-xs text-gray-400">WHT 3%</p><p className="text-xs text-[#EF9F27]">−{fmtTHB(invoice.wht_3pct)}</p><p className="text-xs text-gray-400">Net Payable</p><p className="text-sm font-semibold text-[#1D9E75]">{fmtTHB(invoice.net_payable)}</p></>)}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
                  <button onClick={() => setInvoiceDetailModal(invoice)} className="flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"><FileText size={12} /> View Details</button>
                  {tab === 'pending' && canRejectInvoice(invoice) && (
                    <button onClick={() => { setInvoiceRejectModal(invoice); setInvoiceRejectComment(''); }} className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#E24B4A]/5 transition-colors"><XCircle size={13} /> Reject</button>
                  )}
                  {tab === 'pending' && canApproveInvoice(invoice) && (
                    <button onClick={() => handleApproveInvoice(invoice)} disabled={invoiceAction} className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-[#178a64] transition-colors disabled:opacity-60">
                      <CheckCircle size={13} />{invoiceAction ? 'Processing...' : invoiceApproveLabel(invoice)}
                    </button>
                  )}
                  {tab === 'with_others' && (
                    <p className="text-xs text-gray-500 ml-1">
                      {invoice.status === 'received' && 'Awaiting Construction Manager review'}
                      {invoice.status === 'approved_cm' && 'CM approved — awaiting EVP sign-off'}
                      {invoice.status === 'approved_evp' && 'EVP approved — awaiting CEO final approval'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Project Costings ──────────────────────────────────────────────────── */}
      {showCostingSection && (
        <div className="space-y-3" ref={costingsRef}>
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-[#378ADD]" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Project Costings</h2>
            {filteredCostings.length > 0 && <span className="bg-[#378ADD]/10 text-[#378ADD] text-xs font-semibold px-2 py-0.5 rounded-full">{filteredCostings.length}</span>}
          </div>
          {filteredCostings.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <CheckCircle className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-gray-400 text-sm">No costing submissions in this queue</p>
            </div>
          ) : filteredCostings.map(costing => {
            const stage = stageLabel(costing.project.status);
            const marginPct = costing.gross_margin_pct ?? 0;
            return (
              <div key={costing.id} className="bg-white rounded-lg border-l-4 border-l-[#378ADD] border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-[#378ADD] bg-[#378ADD]/10 px-2 py-0.5 rounded-full">{stage}</span>
                      <Badge label={costing.status.replace(/_/g, ' ')} variant={statusVariant(costing.status)} />
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{costing.project.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Submitted by {costing.submitterProfile?.full_name ?? '—'} on {formatDate(costing.submitted_at)}</p>
                  </div>
                  <div className="shrink-0 text-right space-y-0.5">
                    <p className="text-xs text-gray-400">Sales Price</p>
                    <p className="text-sm font-semibold text-[#0f1923]">{fmtTHB(costing.sales_price_excl_vat)}</p>
                    <p className="text-xs text-gray-400">Gross Margin</p>
                    <p className={`text-sm font-bold ${marginPct > 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>{marginPct.toFixed(1)}%</p>
                  </div>
                </div>
                {tab === 'pending' && canReviewCosting(costing) && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <button onClick={() => { setCostingReviewModal(costing); setCostingComment(''); }} className="flex items-center gap-2 bg-[#378ADD] text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2a6fb5] transition-colors"><FileText size={13} />Review & Decide</button>
                  </div>
                )}
                {tab === 'completed' && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                    {costing.cm_approved_by && <p className="text-xs text-[#1D9E75] flex items-center gap-1"><CheckCircle size={11} />CM approved by {profileName(costing.cm_approved_by)}</p>}
                    {costing.status === 'evp_approved' && costing.evp_approved_by && <p className="text-xs text-[#1D9E75] flex items-center gap-1"><CheckCircle size={11} />EVP approved by {profileName(costing.evp_approved_by)}</p>}
                    {(costing.status === 'cm_rejected' || costing.status === 'evp_rejected') && <p className="text-xs text-[#E24B4A] flex items-center gap-1"><XCircle size={11} />Rejected — sent back for revision</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Progress Reports ──────────────────────────────────────────────────── */}
      {showReportsSection && (
        <div className="space-y-3" ref={reportsRef}>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-[#EF9F27]" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Progress Reports</h2>
            {filteredReports.length > 0 && <span className="bg-[#EF9F27]/10 text-[#EF9F27] text-xs font-semibold px-2 py-0.5 rounded-full">{filteredReports.length}</span>}
          </div>
          {filteredReports.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-gray-400 text-sm">No progress reports in this queue</p>
            </div>
          ) : filteredReports.map(report => {
            const po      = (report as Record<string, unknown>).purchase_order as PurchaseOrder & { vendor?: { name: string } };
            const project = (report as Record<string, unknown>).project as Project;
            return (
              <div key={report.id} className="bg-white rounded-lg border-l-4 border-l-[#EF9F27] border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge label={report.status.replace(/_/g, ' ')} variant={statusVariant(report.status)} />
                      <span className="text-xs text-gray-400">{formatDate(report.report_date)}</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{project?.name || '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">PO: {po?.pss_po_no || '—'} · {po?.vendor?.name || '—'}</p>
                    {report.description && <p className="text-xs text-gray-600 mt-2 italic">"{report.description}"</p>}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-2xl font-bold text-gray-900">{report.percentage_complete}%</p>
                    <p className="text-xs text-gray-400">complete</p>
                  </div>
                </div>
                {report.site_checklist && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(report.site_checklist as Record<string, boolean>).map(([key, val]) => (
                      <div key={key} className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${val ? 'bg-[#1D9E75]/10 text-[#1D9E75]' : 'bg-gray-100 text-gray-400'}`}>
                        {val ? <CheckCircle size={11} /> : <XCircle size={11} />}
                        {key.replace(/_/g, ' ')}
                      </div>
                    ))}
                  </div>
                )}
                {report.cm_comments && <p className="mt-2 text-xs text-gray-500"><span className="font-medium">CM comments:</span> {report.cm_comments}</p>}
                {tab === 'pending' && canReviewReport(report) && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <button onClick={() => { setReviewModal(report); setReviewComment(''); }} className="flex items-center gap-2 bg-[#1D9E75] text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-[#178a64] transition-colors"><CheckCircle size={13} />Review & Decide</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* All-clear empty state */}
      {tab === 'pending' && totalPending === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <CheckCircle className="w-12 h-12 text-[#1D9E75]/30 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">All caught up</p>
          <p className="text-gray-400 text-sm mt-1">No items require your approval right now.</p>
        </div>
      )}

      {/* ═══════════════ MODALS ═══════════════ */}

      {/* PO Review Modal */}
      {poReviewModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-800">
                  {poReviewModal.status === 'pending_revision_approval' ? 'Review Revision Request' : 'Review Purchase Order'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{(poReviewModal.project as Project)?.name ?? '—'}</p>
              </div>
              <button onClick={() => setPoReviewModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Supplier</span><span className="font-medium">{(poReviewModal.vendor as { name: string })?.name ?? 'Not assigned'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Description</span><span className="font-medium text-right max-w-[60%]">{poReviewModal.description ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Pipeline Stage</span><span className="font-medium">{poStageLabel(poReviewModal.status)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Your Mandate</span><span className="font-medium">{poRequiredApprover(poReviewModal)} approval</span></div>
                <div className="border-t border-gray-200 pt-2 mt-1 space-y-1.5">
                  <div className="flex justify-between"><span className="text-gray-500">Contract excl VAT</span><span>{fmtTHB(poReviewModal.po_amount_excl_vat)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">VAT 7%</span><span>{fmtTHB(poReviewModal.vat_7pct)}</span></div>
                  {poReviewModal.wht_applies && <div className="flex justify-between text-[#EF9F27]"><span>WHT 3%</span><span>{fmtTHB(poReviewModal.wht_3pct)}</span></div>}
                  <div className="flex justify-between font-semibold text-[#0f1923] border-t border-gray-200 pt-1.5"><span>Total incl VAT</span><span className="text-base">{fmtTHB(poReviewModal.po_amount_incl_vat)}</span></div>
                </div>
              </div>
              {poReviewModal.notes && <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 italic">"{poReviewModal.notes}"</div>}

              {poReviewModal.status === 'pending_revision_approval' && poReviewModal.revision_reason && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                  <p className="text-amber-700 font-medium mb-0.5">Reason for revision request</p>
                  <p className="text-amber-800">"{poReviewModal.revision_reason}"</p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  {poReviewModal.status === 'pending_revision_approval'
                    ? 'Decision notes (required to decline)'
                    : 'Rejection Reason (required to reject)'}
                </label>
                <textarea value={poRejectReason} onChange={e => setPoRejectReason(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#EF9F27]/30 resize-none" placeholder={poReviewModal.status === 'pending_revision_approval' ? 'Add notes for your decision...' : 'Explain why this PO is being rejected...'} />
              </div>

              {poReviewModal.status === 'pending_revision_approval' ? (
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <button onClick={() => handleRejectPO(poReviewModal)} disabled={!poRejectReason.trim() || poAction} className="flex-1 flex items-center justify-center gap-2 border border-[#E24B4A] text-[#E24B4A] py-2 rounded-lg text-sm font-medium hover:bg-[#E24B4A]/5 disabled:opacity-60">
                      <XCircle size={15} />Decline Request
                    </button>
                    <button onClick={() => approvePO(poReviewModal)} disabled={poAction} className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60">
                      <CheckCircle size={15} />
                      {poAction ? 'Processing...' : 'Grant Revision'}
                    </button>
                  </div>
                  <button onClick={() => handleVoidPO(poReviewModal)} disabled={poAction} className="w-full text-xs text-gray-400 border border-gray-200 rounded-lg py-2 hover:bg-gray-50 hover:text-gray-600 transition-colors disabled:opacity-40">
                    Void this PO permanently
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button onClick={() => handleRejectPO(poReviewModal)} disabled={!poRejectReason.trim() || poAction} className="flex-1 flex items-center justify-center gap-2 border border-[#E24B4A] text-[#E24B4A] py-2 rounded-lg text-sm font-medium hover:bg-[#E24B4A]/5 disabled:opacity-60">
                    <XCircle size={15} />Reject — Send Back
                  </button>
                  <button onClick={() => approvePO(poReviewModal)} disabled={poAction} className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60">
                    <CheckCircle size={15} />
                    {poAction ? 'Processing...' : role === 'evp' && poReviewModal.po_amount_incl_vat >= PO_THRESHOLD_EVP ? 'Approve — Escalate to CEO' : role === 'construction_manager' ? 'Approve — Forward to EVP' : role === 'cost_controller' ? 'Approve — Forward to CM' : 'Approve & Assign PSS No.'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Costing Review Modal */}
      {costingReviewModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg border border-gray-200 my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Review {stageLabel(costingReviewModal.project.status)}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{costingReviewModal.project.name}</p>
              </div>
              <button onClick={() => setCostingReviewModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Sales Price (excl VAT)</span><span className="font-medium">{fmtTHB(costingReviewModal.sales_price_excl_vat)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Sales Price (incl VAT)</span><span className="font-medium">{fmtTHB(costingReviewModal.sales_price_incl_vat)}</span></div>
              </div>
              <div className="space-y-1 text-xs">
                {COSTING_CATEGORY_KEYS.map(k => (
                  <div key={k} className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">{CATEGORY_KEY_LABELS[k]}</span>
                    <span>{fmtTHB((costingReviewModal[k as keyof ProjectCosting] as number) ?? 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 border-t border-gray-200 font-semibold"><span>Total Cost</span><span>{fmtTHB(costingReviewModal.total_cost_excl_vat)}</span></div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Gross Margin</span>
                  <span className={`font-medium ${costingReviewModal.gross_margin_amount > 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {fmtTHB(costingReviewModal.gross_margin_amount)} ({costingReviewModal.gross_margin_pct.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Comments {canReviewCosting(costingReviewModal) ? '(required to reject)' : '(read-only)'}</label>
                <textarea value={costingComment} onChange={e => setCostingComment(e.target.value)} rows={3} disabled={!canReviewCosting(costingReviewModal)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none disabled:bg-gray-50 disabled:text-gray-400" placeholder="Add review comments..." />
              </div>
              {canReviewCosting(costingReviewModal) ? (
                <div className="flex gap-3">
                  <button onClick={() => rejectCostingItem(costingReviewModal)} disabled={!costingComment.trim() || costingAction} className="flex-1 flex items-center justify-center gap-2 border border-[#E24B4A] text-[#E24B4A] py-2 rounded-lg text-sm font-medium hover:bg-[#E24B4A]/5 disabled:opacity-60"><XCircle size={15} />Reject — Send Back</button>
                  <button onClick={() => approveCostingItem(costingReviewModal)} disabled={costingAction} className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60"><CheckCircle size={15} />Approve</button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic text-center">Read-only view — no action available for your role</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Progress Report Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Review Progress Report</h2>
              <button onClick={() => setReviewModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Project</span><span className="font-medium">{((reviewModal as Record<string, unknown>).project as Project)?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Report Date</span><span>{formatDate(reviewModal.report_date)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Progress</span><span className="font-bold text-[#1D9E75]">{reviewModal.percentage_complete}%</span></div>
              </div>
              {reviewModal.description && <p className="text-sm text-gray-700 italic">"{reviewModal.description}"</p>}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Comments</label>
                <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" placeholder="Add review comments..." />
              </div>
              {canReviewReport(reviewModal) ? (
                <div className="flex gap-3">
                  <button onClick={() => rejectReport(reviewModal)} className="flex-1 flex items-center justify-center gap-2 border border-[#E24B4A] text-[#E24B4A] py-2 rounded-lg text-sm font-medium hover:bg-[#E24B4A]/5"><XCircle size={15} />Reject</button>
                  <button onClick={() => approveReport(reviewModal)} className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64]"><CheckCircle size={15} />Approve</button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic text-center">Read-only view — no action available for your role</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transfer Confirm/Approve Modal */}
      {transferModal && transferModalMode !== 'reject' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">{transferModalMode === 'recommend' ? 'Confirm EVP Recommendation' : 'Approve Margin Transfer'}</h2>
              <button onClick={() => setTransferModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#F8F8F7] rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">From</span><span className="font-medium">{(transferModal.from_project as Project)?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">To</span><span className="font-medium">{(transferModal.to_project as Project)?.name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-bold text-[#1D9E75]">{fmtTHB(transferModal.amount)}</span></div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{transferModalMode === 'recommend' ? 'EVP Recommendation Notes (optional)' : 'Notes (optional)'}</label>
                <textarea value={transferNotes} onChange={e => setTransferNotes(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" placeholder="Add notes..." />
              </div>
              {transferApprovalError && transferModalMode === 'approve' && (
                <div className="rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/5 p-3">
                  <p className="text-xs font-semibold text-[#E24B4A] mb-1">Transfer blocked by system:</p>
                  <p className="text-xs text-[#c73d3c]">{transferApprovalError}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setTransferModal(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={() => transferModalMode === 'recommend' ? handleTransferRecommend(transferModal) : handleTransferApprove(transferModal)} disabled={transferAction} className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60">
                <CheckCircle size={14} />{transferAction ? 'Processing...' : transferModalMode === 'recommend' ? 'Confirm Recommendation' : 'Approve Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Reject Modal */}
      {transferModal && transferModalMode === 'reject' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Reject Transfer</h2>
              <button onClick={() => setTransferModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-600">Rejecting transfer of <span className="font-semibold">{fmtTHB(transferModal.amount)}</span> from <span className="font-semibold">{(transferModal.from_project as Project)?.name ?? '—'}</span></p>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Rejection Reason *</label>
                <textarea value={transferRejectReason} onChange={e => setTransferRejectReason(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 resize-none" placeholder="Explain the reason for rejection..." />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setTransferModal(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleTransferReject(transferModal)} disabled={!transferRejectReason.trim() || transferAction} className="flex-1 flex items-center justify-center gap-2 bg-[#E24B4A] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#c73d3c] disabled:opacity-60">
                <XCircle size={14} />{transferAction ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Reject Modal */}
      {invoiceRejectModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Reject Invoice</h2>
                <p className="text-xs text-gray-400 mt-0.5">{invoiceRejectModal.vendor_invoice_no} — {fmtTHB(invoiceRejectModal.invoice_amount_incl_vat)}</p>
              </div>
              <button onClick={() => setInvoiceRejectModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">The invoice will be returned to the Cost Controller with your comment. They will need to resolve the issue before resubmitting.</div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Reason for rejection <span className="text-[#E24B4A]">*</span></label>
                <textarea value={invoiceRejectComment} onChange={e => setInvoiceRejectComment(e.target.value)} rows={4} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 resize-none" placeholder="e.g. Work not yet completed on site..." autoFocus />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setInvoiceRejectModal(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={handleRejectInvoice} disabled={!invoiceRejectComment.trim() || invoiceAction} className="flex-1 flex items-center justify-center gap-2 bg-[#E24B4A] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#c73d3c] disabled:opacity-60">
                  <XCircle size={15} />{invoiceAction ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {invoiceDetailModal && (
        <InvoiceDetailModal
          invoice={invoiceDetailModal}
          role={role ?? ''}
          approving={invoiceAction}
          onApprove={() => { handleApproveInvoice(invoiceDetailModal); setInvoiceDetailModal(null); }}
          onReject={(comment) => handleRejectInvoiceFromModal(invoiceDetailModal, comment)}
          onClose={() => setInvoiceDetailModal(null)}
        />
      )}

      {/* New Progress Report Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg border border-gray-200 my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">New Progress Report</h2>
              <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit(submitReport)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Project</label>
                  <select {...register('project_id', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                    <option value="">Select...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name.split('–')[0].trim()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Report Date</label>
                  <input type="date" {...register('report_date', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Purchase Order</label>
                <select {...register('po_id', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                  <option value="">Select PO...</option>
                  {allPOs.map(p => <option key={p.id} value={p.id}>{p.pss_po_no} – {(p as Record<string, unknown> & { vendor?: { name: string } }).vendor?.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Vendor Invoice (optional)</label>
                <select {...register('vendor_invoice_id')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                  <option value="">None</option>
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.vendor_invoice_no} – {formatTHB(i.invoice_amount_incl_vat)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
                <input {...register('description')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" placeholder="Work completed..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Percentage Complete: <span className="text-[#1D9E75] font-bold">{pctValue}%</span></label>
                <input type="range" min="0" max="100" step="5" {...register('percentage_complete', { valueAsNumber: true })} className="w-full accent-[#1D9E75]" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">Site Checklist</label>
                <div className="space-y-2">
                  {[
                    { field: 'work_complete', label: 'Work physically complete' },
                    { field: 'materials_on_site', label: 'Materials on site confirmed' },
                    { field: 'quality_check', label: 'Quality check passed' },
                    { field: 'safety_compliance', label: 'Safety compliance verified' },
                    { field: 'documentation', label: 'Documentation received' },
                  ].map(({ field, label }) => (
                    <label key={field} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" {...register(field as keyof ProgressReportForm)} className="accent-[#1D9E75] w-4 h-4" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <textarea {...register('notes')} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" placeholder="Additional notes..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60">{submitting ? 'Submitting...' : 'Submit Report'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // ─── PO Card ────────────────────────────────────────────────────────────────

  function renderPOCard(po: PurchaseOrder, viewMode: 'pending' | 'with_others') {
    const vendor  = po.vendor  as { name: string } | undefined;
    const project = po.project as Project | undefined;
    const isActionable = viewMode === 'pending' && canApprovePO(po);
    return (
      <div key={po.id} className="bg-white rounded-lg border-l-4 border-l-[#EF9F27] border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-semibold bg-[#EF9F27]/10 text-[#EF9F27] px-2 py-0.5 rounded-full">{poStageLabel(po.status)}</span>
              <span className="text-xs text-gray-400">Requires {poRequiredApprover(po)}</span>
              {po.has_supplier_milestones && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Milestone PO</span>}
            </div>
            <p className="text-sm font-semibold text-gray-800">{project?.name ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{vendor?.name ?? 'No supplier assigned'} · {po.description ?? '—'}</p>
            {po.submitted_at && <p className="text-xs text-gray-400 mt-0.5">Submitted {formatDate(po.submitted_at)}</p>}
          </div>
          <div className="shrink-0 text-right space-y-0.5">
            <p className="text-xs text-gray-400">Contract excl VAT</p>
            <p className="text-sm font-semibold text-gray-800">{fmtTHB(po.po_amount_excl_vat)}</p>
            <p className="text-xs text-gray-400">Total incl VAT</p>
            <p className="text-base font-bold text-[#0f1923]">{fmtTHB(po.po_amount_incl_vat)}</p>
            {po.wht_applies && <p className="text-xs text-[#EF9F27]">WHT 3%: {fmtTHB(po.wht_3pct)}</p>}
          </div>
        </div>
        {isActionable && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <button onClick={() => { setPoReviewModal(po); setPoRejectReason(''); }} className="flex items-center gap-2 bg-[#EF9F27] text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-[#d48b1e] transition-colors">
              <FileText size={13} />Review & Decide
            </button>
          </div>
        )}
        {viewMode === 'with_others' && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">{poStageLabel(po.status)}</p>
          </div>
        )}
      </div>
    );
  }
}
