import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import {
  ShoppingCart, FileText, BarChart2, TrendingUp, CreditCard,
  RefreshCw, CheckCircle, Filter, ChevronRight, AlertTriangle,
  Landmark,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { VendorInvoice, PurchaseOrder, Project, Entity } from '../types';
import { formatTHBCompact, formatDate } from '../utils/formatters';
import InvoiceDetailModal from '../components/approvals/InvoiceDetailModal';
import PODetailModal from '../components/pos/PODetailModal';
import {
  approveInvoiceCM, approveInvoiceEVP, approveInvoiceCEO,
  rejectInvoice, rejectInvoiceCM,
} from '../services/workflow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgingLevel = 'fresh' | 'amber' | 'red';
type CardType = 'po' | 'invoice' | 'costing' | 'progress_report' | 'voucher' | 'check';

interface WorkItem {
  id: string;
  type: CardType;
  label: string;
  supplierName: string;
  projectName: string;
  projectId: string;
  amount: number;
  itemDate: string | null;
  daysWaiting: number;
  aging: AgingLevel;
  rawInvoice?: VendorInvoice;
  rawPO?: PurchaseOrder;
  // enriched accounts detail
  invoiceNo?: string;
  poRef?: string;
  bankAccount?: string;
  checkNo?: string;
  whtAmount?: number;
  netPayable?: number;
  requiresManagerApproval?: boolean;
}

interface DeskDef {
  role: string;
  label: string;
  accent: string;
  headerText: string;
  cardBg: string;
  items: WorkItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_DISPLAY: Record<string, string> = {
  procurement: 'Procurement',
  cost_controller: 'Cost Controller',
  construction_manager: 'Construction Mgr',
  evp: 'EVP',
  ceo: 'CEO',
  accounts_supervisor: 'Accounts Supervisor',
  accounts_manager: 'Accounts Manager',
  banking_finance_officer: 'Banking & Finance',
};

const ROLE_ORDER = [
  'procurement',
  'cost_controller',
  'construction_manager',
  'evp',
  'ceo',
  'accounts_supervisor',
  'accounts_manager',
  'banking_finance_officer',
];

const DESK_STYLE: Record<string, { accent: string; headerText: string; cardBg: string }> = {
  procurement:             { accent: 'bg-slate-500',   headerText: 'text-slate-700',   cardBg: 'bg-white' },
  cost_controller:         { accent: 'bg-gray-500',    headerText: 'text-gray-700',    cardBg: 'bg-white' },
  construction_manager:    { accent: 'bg-blue-500',    headerText: 'text-blue-700',    cardBg: 'bg-blue-50/30' },
  evp:                     { accent: 'bg-[#1D9E75]',   headerText: 'text-[#1D9E75]',   cardBg: 'bg-[#1D9E75]/[0.03]' },
  ceo:                     { accent: 'bg-blue-700',    headerText: 'text-blue-800',    cardBg: 'bg-blue-50/40' },
  accounts_supervisor:     { accent: 'bg-amber-500',   headerText: 'text-amber-700',   cardBg: 'bg-amber-50/30' },
  accounts_manager:        { accent: 'bg-orange-500',  headerText: 'text-orange-700',  cardBg: 'bg-orange-50/30' },
  banking_finance_officer: { accent: 'bg-teal-600',    headerText: 'text-teal-700',    cardBg: 'bg-teal-50/30' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agingLevel(days: number): AgingLevel {
  if (!isFinite(days) || days < 0) return 'fresh';
  if (days > 7) return 'red';
  if (days > 3) return 'amber';
  return 'fresh';
}

function safeDays(now: Date, dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.max(0, differenceInDays(now, d));
}

function typeIcon(type: CardType, size = 11) {
  switch (type) {
    case 'po':              return <ShoppingCart size={size} />;
    case 'invoice':         return <FileText size={size} />;
    case 'costing':         return <BarChart2 size={size} />;
    case 'progress_report': return <TrendingUp size={size} />;
    case 'voucher':         return <CreditCard size={size} />;
    case 'check':           return <Landmark size={size} />;
  }
}

function typeLabel(type: CardType) {
  switch (type) {
    case 'po':              return 'Purchase Order';
    case 'invoice':         return 'Vendor Invoice';
    case 'costing':         return 'Costing';
    case 'progress_report': return 'Progress Report';
    case 'voucher':         return 'Voucher';
    case 'check':           return 'Check — Awaiting Clearance';
  }
}

// ---------------------------------------------------------------------------
// Work Item Row
// ---------------------------------------------------------------------------

function WorkItemRow({
  item,
  isMyDesk,
  onClick,
}: {
  item: WorkItem;
  isMyDesk: boolean;
  onClick: (item: WorkItem) => void;
}) {
  const stripColor = item.aging === 'red' ? 'bg-[#E24B4A]' : item.aging === 'amber' ? 'bg-[#EF9F27]' : 'bg-gray-200';
  const borderColor = item.aging === 'red' ? 'border-[#E24B4A]/20 bg-[#E24B4A]/[0.03]' : item.aging === 'amber' ? 'border-[#EF9F27]/20 bg-[#EF9F27]/[0.03]' : 'border-gray-100 bg-white';
  const ageText = item.aging === 'red' ? 'text-[#E24B4A]' : item.aging === 'amber' ? 'text-[#EF9F27]' : 'text-gray-400';

  return (
    <div
      onClick={() => onClick(item)}
      className={`relative rounded-lg border cursor-pointer transition-all duration-150 hover:shadow-sm hover:-translate-y-px group ${borderColor} ${isMyDesk ? 'hover:ring-1 hover:ring-[#1D9E75]/30' : ''}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg ${stripColor}`} />
      <div className="pl-3 pr-2.5 py-2.5">
        {/* Row 1: type badge */}
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-gray-400">{typeIcon(item.type)}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{typeLabel(item.type)}</span>
        </div>

        {/* Row 2: Supplier | ref number */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <p className="text-[12px] font-semibold text-gray-700 truncate leading-tight flex-1 min-w-0">
            {item.supplierName}
          </p>
          <p className="text-[11px] font-semibold text-gray-800 shrink-0 group-hover:text-[#1D9E75] transition-colors leading-tight">
            {item.label}
          </p>
        </div>

        {/* Row 3: Project name */}
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.projectName}</p>

        {/* Enriched accounts detail: invoice + PO refs */}
        {(item.invoiceNo || item.poRef) && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {item.invoiceNo && (
              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                Inv: {item.invoiceNo}
              </span>
            )}
            {item.poRef && (
              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                PO: {item.poRef}
              </span>
            )}
          </div>
        )}

        {/* Enriched accounts detail: bank + check no for checks */}
        {item.bankAccount && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[10px] text-gray-400 bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded font-medium">
              {item.bankAccount}
            </span>
            {item.checkNo && (
              <span className="text-[10px] font-medium text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                #{item.checkNo}
              </span>
            )}
          </div>
        )}

        {/* WHT breakdown for vouchers */}
        {item.whtAmount != null && item.whtAmount > 0 && item.netPayable != null && (
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-400">
            <span>Net payable:</span>
            <span className="font-semibold text-gray-600">{formatTHBCompact(item.netPayable)}</span>
            <span className="text-gray-300">·</span>
            <span>WHT: {formatTHBCompact(item.whtAmount)}</span>
          </div>
        )}

        {/* Row 4: Amount | Date */}
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100/80">
          <span className="text-[12px] font-bold text-gray-700">
            {item.amount > 0 ? formatTHBCompact(item.amount) : '—'}
          </span>
          <div className="flex items-center gap-2">
            {item.itemDate && (
              <span className="text-[10px] text-gray-400">{formatDate(item.itemDate)}</span>
            )}
            <span className={`text-[10px] font-semibold ${ageText}`}>
              {item.daysWaiting === 0 ? 'Today' : `${item.daysWaiting}d`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desk Card
// ---------------------------------------------------------------------------

function DeskCard({
  desk,
  isMyDesk,
  onItemClick,
  cardRef,
}: {
  desk: DeskDef;
  isMyDesk: boolean;
  onItemClick: (item: WorkItem) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const totalValue = desk.items.reduce((s, i) => s + i.amount, 0);
  const overdueCount = desk.items.filter(i => i.aging === 'red').length;
  const amberCount = desk.items.filter(i => i.aging === 'amber').length;

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border overflow-hidden flex flex-col h-full transition-shadow duration-200 ${
        isMyDesk
          ? 'border-[#1D9E75]/30 shadow-md shadow-[#1D9E75]/10 ring-2 ring-[#1D9E75]/20'
          : 'border-gray-200 shadow-sm'
      } ${desk.cardBg}`}
    >
      {/* Accent bar */}
      <div className={`h-[3px] ${desk.accent}`} />

      {/* Header */}
      <div className={`px-3.5 py-3 border-b ${isMyDesk ? 'border-[#1D9E75]/15' : 'border-gray-100'}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <p className={`text-[12px] font-bold ${desk.headerText}`}>{desk.label}</p>
              {isMyDesk && (
                <span className="text-[9px] font-bold bg-[#1D9E75] text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                  Your Desk
                </span>
              )}
            </div>
            <p className={`text-[20px] font-extrabold leading-none ${totalValue > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
              {totalValue > 0 ? formatTHBCompact(totalValue) : '—'}
            </p>
            {totalValue > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5">total blocked</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
            <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center ${
              desk.items.length > 0 ? 'bg-gray-100 text-gray-700' : 'bg-[#1D9E75]/10 text-[#1D9E75]'
            }`}>
              {desk.items.length}
            </span>
            {overdueCount > 0 && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold text-[#E24B4A] bg-[#E24B4A]/10 px-1.5 py-0.5 rounded-full">
                <AlertTriangle size={8} />
                {overdueCount} late
              </span>
            )}
            {overdueCount === 0 && amberCount > 0 && (
              <span className="text-[9px] font-medium text-[#EF9F27] bg-[#EF9F27]/10 px-1.5 py-0.5 rounded-full">
                {amberCount} aging
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Items list */}
      <div
        className="flex-1 p-2.5 space-y-1.5 overflow-y-auto"
        style={{ maxHeight: 320, minHeight: 100 }}
      >
        {desk.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-7 text-center">
            <div className="w-9 h-9 rounded-full bg-[#1D9E75]/10 flex items-center justify-center mb-2">
              <CheckCircle size={17} className="text-[#1D9E75]" />
            </div>
            <p className="text-[11px] font-semibold text-[#1D9E75]">Desk Clear</p>
            <p className="text-[10px] text-gray-400 mt-0.5">No items waiting</p>
          </div>
        ) : (
          desk.items.map(item => (
            <WorkItemRow
              key={`${item.type}-${item.id}`}
              item={item}
              isMyDesk={isMyDesk}
              onClick={onItemClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow Strip
// ---------------------------------------------------------------------------

function FlowStrip({
  desksInOrder,
  myRole,
  onPillClick,
}: {
  desksInOrder: DeskDef[];
  myRole: string | undefined;
  onPillClick: (role: string) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest mb-2">Approval Flow — click to jump to desk</p>
      <div className="flex items-center gap-0 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {desksInOrder.map((desk, idx) => {
          const isMe = desk.role === myRole;
          const hasItems = desk.items.length > 0;
          const hasOverdue = desk.items.some(i => i.aging === 'red');
          const hasAmber = !hasOverdue && desk.items.some(i => i.aging === 'amber');

          return (
            <div key={desk.role} className="flex items-center gap-0 shrink-0">
              <button
                onClick={() => onPillClick(desk.role)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 whitespace-nowrap ${
                  isMe
                    ? 'bg-[#1D9E75] text-white shadow-sm'
                    : hasItems
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                }`}
              >
                <span>{desk.label}</span>
                {desk.items.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isMe
                      ? 'bg-white/30 text-white'
                      : hasOverdue
                        ? 'bg-[#E24B4A]/15 text-[#E24B4A]'
                        : hasAmber
                          ? 'bg-[#EF9F27]/15 text-[#EF9F27]'
                          : 'bg-white text-gray-600'
                  }`}>
                    {desk.items.length}
                  </span>
                )}
              </button>
              {idx < desksInOrder.length - 1 && (
                <ChevronRight size={13} className="text-gray-300 mx-0.5 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WorkflowEfficiency() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [allPos, setAllPos] = useState<any[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [allCostings, setAllCostings] = useState<any[]>([]);
  const [allReports, setAllReports] = useState<any[]>([]);
  const [allVouchers, setAllVouchers] = useState<any[]>([]);
  const [allChecks, setAllChecks] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);

  const [projectFilter, setProjectFilter] = useState<string>('');

  const [invoiceModal, setInvoiceModal] = useState<VendorInvoice | null>(null);
  const [approvingInvoice, setApprovingInvoice] = useState(false);
  const [poModal, setPoModal] = useState<PurchaseOrder | null>(null);
  const [poProjects, setPoProjects] = useState<Project[]>([]);
  const [poVendors, setPoVendors] = useState<Entity[]>([]);

  const deskRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const now = new Date();

    const [posRes, invRes, costingsRes, reportsRes, vouchersRes, checksRes, projRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('id, pss_po_no, description, po_amount_incl_vat, status, po_date, submitted_at, created_at, supplier_name_raw, project_id, vendor_id, version, vendor:entities!vendor_id(id,name), project:projects!project_id(id,name)')
        .in('status', ['draft', 'draft_revision', 'pending_cc', 'pending_cm', 'pending_evp', 'pending_revision_approval', 'pending_ceo']),
      supabase
        .from('vendor_invoices')
        .select('id, po_id, project_id, vendor_id, vendor_invoice_no, invoice_date, invoice_amount_incl_vat, received_amount, wht_3pct, net_payable, status, rejection_comment, rejected_by, planned_payment_date, vendor_notified, created_at, project:projects!project_id(id,name), purchase_order:purchase_orders!po_id(id,pss_po_no,description,supplier_name_raw,vendor:entities!vendor_id(id,name))')
        .in('status', ['rejected', 'received', 'approved_cm', 'approved_evp', 'released']),
      supabase
        .from('project_costings')
        .select('id, stage, status, updated_at, project:projects!project_id(id,name,contract_incl_vat)')
        .in('status', ['draft', 'cm_rejected', 'evp_rejected', 'submitted', 'cm_approved']),
      supabase
        .from('progress_reports')
        .select('id, status, updated_at, project:projects!project_id(id,name), vendor_invoice:vendor_invoices!vendor_invoice_id(id,invoice_amount_incl_vat,vendor_invoice_no)')
        .in('status', ['submitted', 'cm_approved']),
      supabase
        .from('payment_vouchers')
        .select('id, voucher_no, amount, wht_amount, net_paid, status, requires_manager_approval, updated_at, project:projects!project_id(id,name), vendor_invoice:vendor_invoices!vendor_invoice_id(id, vendor_invoice_no, net_payable, purchase_order:purchase_orders!po_id(id, pss_po_no, description, supplier_name_raw, vendor:entities!vendor_id(id,name)))')
        .in('status', ['pending_manager', 'approved']),
      supabase
        .from('checks')
        .select('id, voucher_id, bank_account, check_no, check_date, payee, amount, status, updated_at, payment_voucher:payment_vouchers!voucher_id(id, voucher_no, net_paid, project:projects!project_id(id,name), vendor_invoice:vendor_invoices!vendor_invoice_id(id, vendor_invoice_no, purchase_order:purchase_orders!po_id(id, pss_po_no, supplier_name_raw, vendor:entities!vendor_id(id,name))))')
        .eq('status', 'issued'),
      supabase.from('projects').select('id, name').order('name'),
    ]);

    // purchase_orders has no updated_at — use submitted_at, then po_date, then created_at
    const poAging = (r: any) => safeDays(now, r.submitted_at ?? r.po_date ?? r.created_at);
    // VendorInvoice has no updated_at — fall back to invoice_date then created_at
    const daysFor = (r: any) => safeDays(now, r.updated_at ?? r.invoice_date ?? r.created_at);
    setAllPos((posRes.data ?? []).map((r: any) => ({ ...r, _days: poAging(r) })));
    setAllInvoices((invRes.data ?? []).map((r: any) => ({ ...r, _days: daysFor(r) })));
    setAllCostings((costingsRes.data ?? []).map((r: any) => ({ ...r, _days: daysFor(r) })));
    setAllReports((reportsRes.data ?? []).map((r: any) => ({ ...r, _days: daysFor(r) })));
    setAllVouchers((vouchersRes.data ?? []).map((r: any) => ({ ...r, _days: daysFor(r) })));
    setAllChecks((checksRes.data ?? []).map((r: any) => ({ ...r, _days: daysFor(r) })));
    setAllProjects(projRes.data ?? []);
    setLastRefresh(now);
    setLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Item builders
  // ---------------------------------------------------------------------------

  function mkPO(po: any): WorkItem {
    const supplier = po.vendor?.name ?? po.supplier_name_raw ?? '—';
    return {
      id: po.id, type: 'po',
      label: po.pss_po_no ?? po.description ?? 'Draft PO',
      supplierName: supplier,
      projectName: po.project?.name ?? '—',
      projectId: po.project_id,
      amount: po.po_amount_incl_vat ?? 0,
      itemDate: po.submitted_at ?? po.po_date ?? null,
      daysWaiting: po._days, aging: agingLevel(po._days),
      rawPO: po as PurchaseOrder,
    };
  }

  function mkInv(inv: any): WorkItem {
    const po = inv.purchase_order;
    const supplier = po?.vendor?.name ?? po?.supplier_name_raw ?? '—';
    return {
      id: inv.id, type: 'invoice',
      label: inv.vendor_invoice_no ?? `Invoice (${po?.pss_po_no ?? '—'})`,
      supplierName: supplier,
      projectName: inv.project?.name ?? '—',
      projectId: inv.project_id,
      amount: inv.invoice_amount_incl_vat ?? 0,
      itemDate: inv.invoice_date ?? inv.created_at ?? null,
      daysWaiting: inv._days, aging: agingLevel(inv._days),
      rawInvoice: inv as VendorInvoice,
    };
  }

  function mkCosting(c: any): WorkItem {
    return {
      id: c.id, type: 'costing',
      label: `${c.stage === 'estimation' ? 'Estimation' : 'Budget'} Costing`,
      supplierName: c.project?.name ?? '—',
      projectName: c.project?.name ?? '—',
      projectId: c.project?.id ?? '',
      amount: c.project?.contract_incl_vat ?? 0,
      itemDate: c.updated_at ?? null,
      daysWaiting: c._days, aging: agingLevel(c._days),
    };
  }

  function mkReport(r: any): WorkItem {
    return {
      id: r.id, type: 'progress_report',
      label: `Progress Report${r.vendor_invoice?.vendor_invoice_no ? ` · ${r.vendor_invoice.vendor_invoice_no}` : ''}`,
      supplierName: '—',
      projectName: r.project?.name ?? '—',
      projectId: r.project?.id ?? '',
      amount: r.vendor_invoice?.invoice_amount_incl_vat ?? 0,
      itemDate: r.updated_at ?? null,
      daysWaiting: r._days, aging: agingLevel(r._days),
    };
  }

  function mkVoucher(v: any): WorkItem {
    const vi = v.vendor_invoice;
    const po = vi?.purchase_order;
    const vendor = po?.vendor;
    const supplierName = vendor?.name ?? po?.supplier_name_raw ?? '—';
    return {
      id: v.id, type: 'voucher',
      label: v.voucher_no,
      supplierName,
      projectName: v.project?.name ?? '—',
      projectId: v.project?.id ?? '',
      amount: v.net_paid ?? 0,
      itemDate: v.updated_at ?? null,
      daysWaiting: v._days, aging: agingLevel(v._days),
      invoiceNo: vi?.vendor_invoice_no ?? undefined,
      poRef: po?.pss_po_no ?? undefined,
      whtAmount: v.wht_amount > 0 ? v.wht_amount : undefined,
      netPayable: vi?.net_payable ?? undefined,
      requiresManagerApproval: v.requires_manager_approval ?? false,
    };
  }

  function mkCheck(c: any): WorkItem {
    const pv = c.payment_voucher;
    const vi = pv?.vendor_invoice;
    const po = vi?.purchase_order;
    const vendor = po?.vendor;
    const supplierName = c.payee ?? vendor?.name ?? po?.supplier_name_raw ?? '—';
    const projectId = pv?.project?.id ?? '';
    return {
      id: c.id, type: 'check',
      label: pv?.voucher_no ?? '—',
      supplierName,
      projectName: pv?.project?.name ?? '—',
      projectId,
      amount: c.amount ?? pv?.net_paid ?? 0,
      itemDate: c.check_date ?? c.updated_at ?? null,
      daysWaiting: c._days, aging: agingLevel(c._days),
      invoiceNo: vi?.vendor_invoice_no ?? undefined,
      poRef: po?.pss_po_no ?? undefined,
      bankAccount: c.bank_account ?? undefined,
      checkNo: c.check_no ?? undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Build desks
  // ---------------------------------------------------------------------------

  const desks: DeskDef[] = useMemo(() => {
    const f = (pid: string) => !projectFilter || pid === projectFilter;
    const byAge = (a: WorkItem, b: WorkItem) => b.daysWaiting - a.daysWaiting;

    const pos      = allPos.filter(p => f(p.project_id));
    const invs     = allInvoices.filter(i => f(i.project_id));
    const costs    = allCostings.filter(c => f(c.project?.id ?? ''));
    const reports  = allReports.filter(r => f(r.project?.id ?? ''));
    const vouchers = allVouchers.filter(v => f(v.project?.id ?? ''));
    const chks     = allChecks.filter(c => f(c.payment_voucher?.project?.id ?? ''));

    const deskMap: Record<string, WorkItem[]> = {
      procurement: [
        ...pos.filter(p => ['draft', 'draft_revision'].includes(p.status)).map(mkPO),
      ].sort(byAge),

      cost_controller: [
        ...pos.filter(p => p.status === 'pending_cc').map(mkPO),
        ...invs.filter(i => i.status === 'rejected').map(mkInv),
        ...costs.filter(c => ['draft', 'cm_rejected', 'evp_rejected'].includes(c.status)).map(mkCosting),
      ].sort(byAge),

      construction_manager: [
        ...pos.filter(p => p.status === 'pending_cm').map(mkPO),
        ...invs.filter(i => i.status === 'received').map(mkInv),
        ...reports.filter(r => r.status === 'submitted').map(mkReport),
        ...costs.filter(c => c.status === 'submitted').map(mkCosting),
      ].sort(byAge),

      evp: [
        ...pos.filter(p => ['pending_evp', 'pending_revision_approval'].includes(p.status)).map(mkPO),
        ...invs.filter(i => i.status === 'approved_cm').map(mkInv),
        ...reports.filter(r => r.status === 'cm_approved').map(mkReport),
        ...costs.filter(c => c.status === 'cm_approved').map(mkCosting),
      ].sort(byAge),

      ceo: [
        ...pos.filter(p => p.status === 'pending_ceo').map(mkPO),
        ...invs.filter(i => i.status === 'approved_evp').map(mkInv),
      ].sort(byAge),

      accounts_supervisor: [
        ...invs.filter(i => i.status === 'released').map(mkInv),
      ].sort(byAge),

      // Accounts Manager: vouchers submitted for co-sign, awaiting manager approval
      accounts_manager: [
        ...vouchers.filter(v => v.status === 'pending_manager').map(mkVoucher),
      ].sort(byAge),

      // Banking & Finance: co-signed vouchers ready for check writing + issued checks awaiting bank clearance
      banking_finance_officer: [
        ...vouchers.filter(v => v.status === 'approved').map(mkVoucher),
        ...chks.map(mkCheck),
      ].sort(byAge),
    };

    return ROLE_ORDER.map(role => {
      const s = DESK_STYLE[role] ?? DESK_STYLE['cost_controller'];
      return {
        role,
        label: ROLE_DISPLAY[role] ?? role,
        accent: s.accent,
        headerText: s.headerText,
        cardBg: s.cardBg,
        items: deskMap[role] ?? [],
      };
    });
  }, [allPos, allInvoices, allCostings, allReports, allVouchers, allChecks, projectFilter]);

  // ---------------------------------------------------------------------------
  // Scroll to desk from flow strip
  // ---------------------------------------------------------------------------

  function scrollToDesk(role: string) {
    deskRefs.current[role]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Click handlers
  // ---------------------------------------------------------------------------

  async function handleItemClick(item: WorkItem) {
    if (item.type === 'invoice' && item.rawInvoice) {
      setInvoiceModal(item.rawInvoice);
      return;
    }
    if (item.type === 'po') {
      const [poRes, projectsRes, vendorsRes] = await Promise.all([
        supabase.from('purchase_orders').select('*, supplier_name_raw, vendor:entities!vendor_id(*), project:projects!project_id(*)').eq('id', item.id).maybeSingle(),
        supabase.from('projects').select('*'),
        supabase.from('entities').select('*').eq('type', 'vendor'),
      ]);
      if (poRes.data) setPoModal(poRes.data as PurchaseOrder);
      setPoProjects((projectsRes.data ?? []) as Project[]);
      setPoVendors((vendorsRes.data ?? []) as Entity[]);
      return;
    }
    if (item.type === 'costing' || item.type === 'progress_report') {
      navigate(`/projects/${item.projectId}`);
      return;
    }
    if (item.type === 'voucher' || item.type === 'check') {
      navigate('/payment-queue');
    }
  }

  async function handleInvoiceApprove() {
    if (!invoiceModal || !user) return;
    setApprovingInvoice(true);
    const inv = invoiceModal;
    const pName = (inv as any).project?.name ?? '';
    const iNo = inv.vendor_invoice_no ?? '';
    const pid = inv.project_id;

    let err: string | null = null;
    if (profile?.role === 'construction_manager') {
      const res = await approveInvoiceCM(inv.id, user.id, pName, iNo, pid);
      err = res.error;
    } else if (profile?.role === 'evp') {
      const res = await approveInvoiceEVP(inv.id, user.id, inv.invoice_amount_incl_vat, pName, iNo, pid);
      err = res.error;
    } else if (profile?.role === 'ceo') {
      const res = await approveInvoiceCEO(inv.id, user.id, pName, iNo, inv.invoice_amount_incl_vat, pid);
      err = res.error;
    }
    setApprovingInvoice(false);
    if (!err) { setInvoiceModal(null); loadData(); }
  }

  async function handleInvoiceReject(comment: string) {
    if (!invoiceModal || !user) return;
    setApprovingInvoice(true);
    const inv = invoiceModal;
    const pName = (inv as any).project?.name ?? '';
    const iNo = inv.vendor_invoice_no ?? '';
    const pid = inv.project_id;
    if (profile?.role === 'construction_manager') {
      await rejectInvoiceCM(inv.id, user.id, comment, pName, iNo, pid);
    } else {
      await rejectInvoice(inv.id, user.id, comment, pName, iNo, pid);
    }
    setApprovingInvoice(false);
    setInvoiceModal(null);
    loadData();
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const totalItems   = desks.reduce((s, d) => s + d.items.length, 0);
  const overdueItems = desks.reduce((s, d) => s + d.items.filter(i => i.aging === 'red').length, 0);
  const totalBlocked = desks.reduce((s, d) => s + d.items.reduce((ds, i) => ds + i.amount, 0), 0);

  // Split desks: user's desk featured first, rest in canonical order
  const myDesk    = desks.find(d => d.role === profile?.role);
  const otherDesks = desks.filter(d => d.role !== profile?.role);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Workflow Efficiency</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalItems} items in motion
            {totalBlocked > 0 && (
              <span className="ml-2 text-gray-600 font-medium">· {formatTHBCompact(totalBlocked)} blocked</span>
            )}
            {overdueItems > 0 && (
              <span className="ml-2 text-[#E24B4A] font-semibold">· {overdueItems} overdue</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 cursor-pointer min-w-[160px]"
            >
              <option value="">All Projects</option>
              {allProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw size={13} />
            {formatDate(lastRefresh.toISOString())}
          </button>
        </div>
      </div>

      {/* Flow strip */}
      <FlowStrip desksInOrder={desks} myRole={profile?.role} onPillClick={scrollToDesk} />

      {/* Legend */}
      <div className="flex items-center gap-5 text-[11px] text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-200 border border-gray-300 inline-block" />
          0–3 days
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#EF9F27]/40 border border-[#EF9F27]/60 inline-block" />
          4–7 days
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#E24B4A]/40 border border-[#E24B4A]/60 inline-block" />
          &gt;7 days
        </span>
        {projectFilter && (
          <button onClick={() => setProjectFilter('')} className="ml-auto text-[#1D9E75] font-medium hover:underline">
            Clear filter
          </button>
        )}
      </div>

      {/* Desk grid */}
      <div className="space-y-4">
        {/* Current user's desk — featured row */}
        {myDesk && (
          <div
            ref={el => { deskRefs.current[myDesk.role] = el; }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            <DeskCard desk={myDesk} isMyDesk={true} onItemClick={handleItemClick} />
          </div>
        )}

        {/* All other desks — 4-col grid on large screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {otherDesks.map(desk => (
            <DeskCard
              key={desk.role}
              desk={desk}
              isMyDesk={false}
              onItemClick={handleItemClick}
              cardRef={el => { deskRefs.current[desk.role] = el; }}
            />
          ))}
        </div>
      </div>

      {/* Invoice Modal */}
      {invoiceModal && (
        <InvoiceDetailModal
          invoice={invoiceModal}
          role={profile?.role ?? ''}
          onApprove={handleInvoiceApprove}
          onReject={handleInvoiceReject}
          onClose={() => setInvoiceModal(null)}
          approving={approvingInvoice}
        />
      )}

      {/* PO Modal */}
      {poModal && (
        <PODetailModal
          key={poModal.id}
          po={poModal}
          projects={poProjects}
          vendors={poVendors}
          onClose={() => setPoModal(null)}
          onSuccess={() => { setPoModal(null); loadData(); }}
        />
      )}
    </div>
  );
}
