import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import {
  ShoppingCart, FileText, BarChart2, TrendingUp, CreditCard,
  ChevronRight, RefreshCw, CheckCircle, Filter,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  VendorInvoice, PurchaseOrder, Project, Entity,
} from '../types';
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

type CardType = 'po' | 'invoice' | 'costing' | 'progress_report' | 'voucher';

interface KanbanCard {
  id: string;
  type: CardType;
  label: string;
  projectName: string;
  projectId: string;
  amount: number;
  updatedAt: string;
  daysWaiting: number;
  aging: AgingLevel;
  // Raw objects needed for modals
  rawInvoice?: VendorInvoice;
  rawPO?: PurchaseOrder;
}

interface DeskColumn {
  key: string;
  title: string;
  roleOwner?: string; // matches UserRole
  borderColor: string;
  headerBg: string;
  headerText: string;
  cards: KanbanCard[];
}

interface Swimlane {
  title: string;
  subtitle: string;
  columns: DeskColumn[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agingLevel(days: number): AgingLevel {
  if (days > 7) return 'red';
  if (days > 3) return 'amber';
  return 'fresh';
}

function agingStyle(aging: AgingLevel) {
  if (aging === 'red') return { border: 'border-[#E24B4A]/25 bg-[#E24B4A]/[0.04]', strip: 'bg-[#E24B4A]', text: 'text-[#E24B4A]' };
  if (aging === 'amber') return { border: 'border-[#EF9F27]/25 bg-[#EF9F27]/[0.04]', strip: 'bg-[#EF9F27]', text: 'text-[#EF9F27]' };
  return { border: 'border-gray-100 bg-white', strip: 'bg-gray-200', text: 'text-gray-400' };
}

function typeIcon(type: CardType, size = 12) {
  switch (type) {
    case 'po': return <ShoppingCart size={size} />;
    case 'invoice': return <FileText size={size} />;
    case 'costing': return <BarChart2 size={size} />;
    case 'progress_report': return <TrendingUp size={size} />;
    case 'voucher': return <CreditCard size={size} />;
  }
}

function typeLabel(type: CardType) {
  switch (type) {
    case 'po': return 'Purchase Order';
    case 'invoice': return 'Vendor Invoice';
    case 'costing': return 'Project Costing';
    case 'progress_report': return 'Progress Report';
    case 'voucher': return 'Payment Voucher';
  }
}

// ---------------------------------------------------------------------------
// Card Component
// ---------------------------------------------------------------------------

function KanbanCardItem({
  card,
  isMyDesk,
  onClick,
}: {
  card: KanbanCard;
  isMyDesk: boolean;
  onClick: (card: KanbanCard) => void;
}) {
  const s = agingStyle(card.aging);
  return (
    <div
      onClick={() => onClick(card)}
      className={`relative rounded-lg border cursor-pointer group transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${s.border} ${isMyDesk ? 'ring-1 ring-[#1D9E75]/20' : ''}`}
    >
      {/* Aging strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${s.strip}`} />

      <div className="pl-3 pr-2.5 pt-2.5 pb-2 ml-1">
        {/* Type badge + icon */}
        <div className="flex items-center gap-1 mb-1.5">
          <span className={`${s.text} opacity-70`}>{typeIcon(card.type)}</span>
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{typeLabel(card.type)}</span>
        </div>

        {/* Identifier */}
        <p className="text-[12px] font-semibold text-gray-800 leading-tight truncate group-hover:text-[#1D9E75] transition-colors">
          {card.label}
        </p>

        {/* Project */}
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{card.projectName}</p>

        {/* Footer: amount + aging */}
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100">
          <span className="text-[11px] font-semibold text-gray-600">
            {card.amount > 0 ? formatTHBCompact(card.amount) : '—'}
          </span>
          <span className={`text-[10px] font-semibold ${s.text}`}>
            {card.daysWaiting === 0 ? 'Today' : `${card.daysWaiting}d waiting`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desk Column Component
// ---------------------------------------------------------------------------

function DeskColumnView({
  col,
  isMyDesk,
  showArrowAfter,
  onCardClick,
}: {
  col: DeskColumn;
  isMyDesk: boolean;
  showArrowAfter: boolean;
  onCardClick: (card: KanbanCard) => void;
}) {
  const totalValue = col.cards.reduce((s, c) => s + c.amount, 0);
  const redCount = col.cards.filter(c => c.aging === 'red').length;

  return (
    <div className="flex items-start gap-0 shrink-0">
      {/* Column */}
      <div className={`w-[240px] shrink-0 rounded-xl border ${isMyDesk ? 'border-[#1D9E75]/30 shadow-sm shadow-[#1D9E75]/10' : 'border-gray-200'} overflow-hidden`}>
        {/* Column header */}
        <div className={`${col.headerBg} px-3 py-2.5 border-b ${isMyDesk ? 'border-[#1D9E75]/20' : 'border-gray-200'}`}>
          {/* Top accent bar */}
          <div className={`-mx-3 -mt-2.5 mb-2 h-0.5 ${col.borderColor}`} />

          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={`text-[12px] font-bold truncate ${col.headerText}`}>{col.title}</p>
                {isMyDesk && (
                  <span className="text-[9px] font-bold bg-[#1D9E75] text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0">
                    Your Desk
                  </span>
                )}
              </div>
              {/* Financial gravity */}
              <p className="text-[13px] font-extrabold text-gray-800 mt-0.5">
                {totalValue > 0 ? formatTHBCompact(totalValue) : '—'}
              </p>
              {totalValue > 0 && (
                <p className="text-[10px] text-gray-400">blocked</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                col.cards.length > 0
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-[#1D9E75]/10 text-[#1D9E75]'
              }`}>
                {col.cards.length}
              </span>
              {redCount > 0 && (
                <span className="text-[9px] font-bold text-[#E24B4A] bg-[#E24B4A]/10 px-1 py-0.5 rounded">
                  {redCount} overdue
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Cards body */}
        <div className="bg-gray-50 p-2 min-h-[120px] space-y-2 max-h-[calc(100vh-340px)] overflow-y-auto">
          {col.cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-8 h-8 rounded-full bg-[#1D9E75]/10 flex items-center justify-center mb-2">
                <CheckCircle size={16} className="text-[#1D9E75]" />
              </div>
              <p className="text-[11px] font-semibold text-[#1D9E75]">Desk Clear</p>
              <p className="text-[10px] text-gray-400 mt-0.5">No items waiting</p>
            </div>
          ) : (
            col.cards.map(card => (
              <KanbanCardItem
                key={`${card.type}-${card.id}`}
                card={card}
                isMyDesk={isMyDesk}
                onClick={onCardClick}
              />
            ))
          )}
        </div>
      </div>

      {/* Arrow connector */}
      {showArrowAfter && (
        <div className="flex items-start pt-[38px] px-1 shrink-0">
          <ChevronRight size={16} className="text-gray-300" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swimlane Component
// ---------------------------------------------------------------------------

function SwimlaneView({
  lane,
  myRole,
  onCardClick,
}: {
  lane: Swimlane;
  myRole: string | undefined;
  onCardClick: (card: KanbanCard) => void;
}) {
  const totalItems = lane.columns.reduce((s, c) => s + c.cards.length, 0);
  const totalValue = lane.columns.reduce((s, c) => s + c.cards.reduce((cs, card) => cs + card.amount, 0), 0);

  return (
    <div>
      {/* Swimlane header */}
      <div className="flex items-center gap-3 mb-3">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">{lane.title}</h2>
          <p className="text-[12px] text-gray-400">{lane.subtitle}</p>
        </div>
        <div className="h-px flex-1 bg-gray-200" />
        <div className="text-right shrink-0">
          <p className="text-[13px] font-bold text-gray-700">{formatTHBCompact(totalValue)}</p>
          <p className="text-[10px] text-gray-400">{totalItems} items in motion</p>
        </div>
      </div>

      {/* Horizontally scrollable columns */}
      <div className="overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
        <div className="flex items-start gap-0 w-max">
          {lane.columns.map((col, idx) => (
            <div key={col.key} style={{ scrollSnapAlign: 'start' }}>
              <DeskColumnView
                col={col}
                isMyDesk={col.roleOwner === myRole}
                showArrowAfter={idx < lane.columns.length - 1}
                onCardClick={onCardClick}
              />
            </div>
          ))}
        </div>
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

  // Raw data
  const [allPos, setAllPos] = useState<any[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [allCostings, setAllCostings] = useState<any[]>([]);
  const [allReports, setAllReports] = useState<any[]>([]);
  const [allVouchers, setAllVouchers] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string }[]>([]);

  // Filter
  const [projectFilter, setProjectFilter] = useState<string>('');

  // Modal state
  const [invoiceModal, setInvoiceModal] = useState<VendorInvoice | null>(null);
  const [approvingInvoice, setApprovingInvoice] = useState(false);
  const [poModal, setPoModal] = useState<PurchaseOrder | null>(null);
  const [poProjects, setPoProjects] = useState<Project[]>([]);
  const [poVendors, setPoVendors] = useState<Entity[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const now = new Date();

    const [posRes, invRes, costingsRes, reportsRes, vouchersRes, projRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('id, pss_po_no, description, po_amount_incl_vat, status, updated_at, supplier_name_raw, project_id, vendor_id, vendor:entities!vendor_id(id,name), project:projects!project_id(id,name)')
        .in('status', ['draft', 'draft_revision', 'pending_cm', 'pending_evp', 'pending_revision_approval', 'pending_ceo']),
      supabase
        .from('vendor_invoices')
        .select('*, project:projects!project_id(id,name), purchase_order:purchase_orders!po_id(id,pss_po_no,description,supplier_name_raw,vendor:entities!vendor_id(id,name))')
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
        .select('id, voucher_no, net_paid, status, updated_at, project:projects!project_id(id,name)')
        .in('status', ['pending_manager', 'approved']),
      supabase
        .from('projects')
        .select('id, name')
        .order('name'),
    ]);

    setAllPos((posRes.data ?? []).map((r: any) => ({ ...r, _days: differenceInDays(now, new Date(r.updated_at)) })));
    setAllInvoices((invRes.data ?? []).map((r: any) => ({ ...r, _days: differenceInDays(now, new Date(r.updated_at)) })));
    setAllCostings((costingsRes.data ?? []).map((r: any) => ({ ...r, _days: differenceInDays(now, new Date(r.updated_at)) })));
    setAllReports((reportsRes.data ?? []).map((r: any) => ({ ...r, _days: differenceInDays(now, new Date(r.updated_at)) })));
    setAllVouchers((vouchersRes.data ?? []).map((r: any) => ({ ...r, _days: differenceInDays(now, new Date(r.updated_at)) })));
    setAllProjects(projRes.data ?? []);
    setLastRefresh(now);
    setLoading(false);
  }

  // ---------------------------------------------------------------------------
  // Card builders
  // ---------------------------------------------------------------------------

  function poCard(po: any): KanbanCard {
    const vendorName = po.vendor?.name ?? po.supplier_name_raw ?? '—';
    return {
      id: po.id,
      type: 'po',
      label: po.pss_po_no ?? po.description ?? 'Draft PO',
      projectName: po.project?.name ?? '—',
      projectId: po.project_id,
      amount: po.po_amount_incl_vat ?? 0,
      updatedAt: po.updated_at,
      daysWaiting: po._days,
      aging: agingLevel(po._days),
      rawPO: po as PurchaseOrder,
    };
  }

  function invoiceCard(inv: any): KanbanCard {
    const po = inv.purchase_order;
    const vendorName = po?.vendor?.name ?? po?.supplier_name_raw ?? '—';
    return {
      id: inv.id,
      type: 'invoice',
      label: inv.vendor_invoice_no ?? `Invoice (${po?.pss_po_no ?? '—'})`,
      projectName: inv.project?.name ?? '—',
      projectId: inv.project_id,
      amount: inv.invoice_amount_incl_vat ?? 0,
      updatedAt: inv.updated_at,
      daysWaiting: inv._days,
      aging: agingLevel(inv._days),
      rawInvoice: inv as VendorInvoice,
    };
  }

  function costingCard(c: any): KanbanCard {
    return {
      id: c.id,
      type: 'costing',
      label: `${c.stage === 'estimation' ? 'Estimation' : 'Budget'} Costing`,
      projectName: c.project?.name ?? '—',
      projectId: c.project?.id ?? '',
      amount: c.project?.contract_incl_vat ?? 0,
      updatedAt: c.updated_at,
      daysWaiting: c._days,
      aging: agingLevel(c._days),
    };
  }

  function reportCard(r: any): KanbanCard {
    return {
      id: r.id,
      type: 'progress_report',
      label: `Progress Report${r.vendor_invoice?.vendor_invoice_no ? ` · ${r.vendor_invoice.vendor_invoice_no}` : ''}`,
      projectName: r.project?.name ?? '—',
      projectId: r.project?.id ?? '',
      amount: r.vendor_invoice?.invoice_amount_incl_vat ?? 0,
      updatedAt: r.updated_at,
      daysWaiting: r._days,
      aging: agingLevel(r._days),
    };
  }

  function voucherCard(v: any): KanbanCard {
    return {
      id: v.id,
      type: 'voucher',
      label: v.voucher_no,
      projectName: v.project?.name ?? '—',
      projectId: v.project?.id ?? '',
      amount: v.net_paid ?? 0,
      updatedAt: v.updated_at,
      daysWaiting: v._days,
      aging: agingLevel(v._days),
    };
  }

  // ---------------------------------------------------------------------------
  // Build swimlanes (memoized, recalculated on filter change)
  // ---------------------------------------------------------------------------

  const swimlanes: Swimlane[] = useMemo(() => {
    const filterFn = (projectId: string) =>
      !projectFilter || projectId === projectFilter;

    const pos = allPos.filter(p => filterFn(p.project_id));
    const invs = allInvoices.filter(i => filterFn(i.project_id));
    const costings = allCostings.filter(c => filterFn(c.project?.id ?? ''));
    const reports = allReports.filter(r => filterFn(r.project?.id ?? ''));
    const vouchers = allVouchers.filter(v => filterFn(v.project?.id ?? ''));

    const sortByAge = (a: KanbanCard, b: KanbanCard) => b.daysWaiting - a.daysWaiting;

    // ── Swimlane 1: Project Budgeting Pipeline ──
    const budgetingCols: DeskColumn[] = [
      {
        key: 'cc_costing',
        title: 'Cost Controller',
        roleOwner: 'cost_controller',
        borderColor: 'bg-gray-400',
        headerBg: 'bg-white',
        headerText: 'text-gray-700',
        cards: costings
          .filter(c => ['draft', 'cm_rejected', 'evp_rejected'].includes(c.status))
          .map(costingCard)
          .sort(sortByAge),
      },
      {
        key: 'cm_costing',
        title: 'Construction Manager',
        roleOwner: 'construction_manager',
        borderColor: 'bg-blue-400',
        headerBg: 'bg-blue-50/50',
        headerText: 'text-blue-700',
        cards: costings
          .filter(c => c.status === 'submitted')
          .map(costingCard)
          .sort(sortByAge),
      },
      {
        key: 'evp_costing',
        title: 'EVP',
        roleOwner: 'evp',
        borderColor: 'bg-[#1D9E75]',
        headerBg: 'bg-[#1D9E75]/5',
        headerText: 'text-[#1D9E75]',
        cards: costings
          .filter(c => c.status === 'cm_approved')
          .map(costingCard)
          .sort(sortByAge),
      },
    ];

    // ── Swimlane 2: Execution & Payments Pipeline ──
    const executionCols: DeskColumn[] = [
      {
        key: 'cc_exec',
        title: 'Procurement / CC',
        roleOwner: 'cost_controller',
        borderColor: 'bg-gray-400',
        headerBg: 'bg-white',
        headerText: 'text-gray-700',
        cards: [
          ...pos.filter(p => ['draft', 'draft_revision'].includes(p.status)).map(poCard),
          ...invs.filter(i => i.status === 'rejected').map(invoiceCard),
        ].sort(sortByAge),
      },
      {
        key: 'cm_exec',
        title: 'Construction Manager',
        roleOwner: 'construction_manager',
        borderColor: 'bg-blue-400',
        headerBg: 'bg-blue-50/50',
        headerText: 'text-blue-700',
        cards: [
          ...pos.filter(p => p.status === 'pending_cm').map(poCard),
          ...invs.filter(i => i.status === 'received').map(invoiceCard),
          ...reports.filter(r => r.status === 'submitted').map(reportCard),
        ].sort(sortByAge),
      },
      {
        key: 'evp_exec',
        title: 'EVP',
        roleOwner: 'evp',
        borderColor: 'bg-[#1D9E75]',
        headerBg: 'bg-[#1D9E75]/5',
        headerText: 'text-[#1D9E75]',
        cards: [
          ...pos.filter(p => ['pending_evp', 'pending_revision_approval'].includes(p.status)).map(poCard),
          ...invs.filter(i => i.status === 'approved_cm').map(invoiceCard),
          ...reports.filter(r => r.status === 'cm_approved').map(reportCard),
        ].sort(sortByAge),
      },
      {
        key: 'ceo_exec',
        title: 'CEO',
        roleOwner: 'ceo',
        borderColor: 'bg-[#2563EB]',
        headerBg: 'bg-blue-50/70',
        headerText: 'text-blue-800',
        cards: [
          ...pos.filter(p => p.status === 'pending_ceo').map(poCard),
          ...invs.filter(i => i.status === 'approved_evp').map(invoiceCard),
        ].sort(sortByAge),
      },
      {
        key: 'finance_exec',
        title: 'Finance / Accounts',
        roleOwner: 'accounts_supervisor',
        borderColor: 'bg-[#EF9F27]',
        headerBg: 'bg-[#EF9F27]/5',
        headerText: 'text-[#EF9F27]',
        cards: [
          ...invs.filter(i => i.status === 'released').map(invoiceCard),
          ...vouchers.map(voucherCard),
        ].sort(sortByAge),
      },
    ];

    return [
      {
        title: 'Project Budgeting Pipeline',
        subtitle: 'Estimation & budget costings flowing from Cost Controller → CM → EVP',
        columns: budgetingCols,
      },
      {
        title: 'Execution & Payments Pipeline',
        subtitle: 'POs, vendor invoices, and payment vouchers from procurement to finance',
        columns: executionCols,
      },
    ];
  }, [allPos, allInvoices, allCostings, allReports, allVouchers, projectFilter]);

  // ---------------------------------------------------------------------------
  // Card click handler
  // ---------------------------------------------------------------------------

  async function handleCardClick(card: KanbanCard) {
    if (card.type === 'invoice' && card.rawInvoice) {
      setInvoiceModal(card.rawInvoice);
      return;
    }

    if (card.type === 'po') {
      // Fetch full PO + supporting data for modal
      const [poRes, projectsRes, vendorsRes] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('*, supplier_name_raw, vendor:entities!vendor_id(*), project:projects!project_id(*)')
          .eq('id', card.id)
          .maybeSingle(),
        supabase.from('projects').select('*'),
        supabase.from('entities').select('*').eq('type', 'vendor'),
      ]);
      if (poRes.data) setPoModal(poRes.data as PurchaseOrder);
      setPoProjects((projectsRes.data ?? []) as Project[]);
      setPoVendors((vendorsRes.data ?? []) as Entity[]);
      return;
    }

    if (card.type === 'costing' || card.type === 'progress_report') {
      navigate(`/projects/${card.projectId}`);
      return;
    }

    if (card.type === 'voucher') {
      navigate('/payment-queue');
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Invoice modal approve/reject
  // ---------------------------------------------------------------------------

  async function handleInvoiceApprove() {
    if (!invoiceModal || !user) return;
    setApprovingInvoice(true);
    const inv = invoiceModal;
    const projectName = (inv as any).project?.name ?? '';
    const invoiceNo = inv.vendor_invoice_no ?? '';
    const projectId = inv.project_id;

    let err: string | null = null;
    if (profile?.role === 'construction_manager') {
      const res = await approveInvoiceCM(inv.id, user.id, projectName, invoiceNo, projectId);
      err = res.error;
    } else if (profile?.role === 'evp') {
      const res = await approveInvoiceEVP(inv.id, user.id, inv.invoice_amount_incl_vat, projectName, invoiceNo, projectId);
      err = res.error;
    } else if (profile?.role === 'ceo') {
      const res = await approveInvoiceCEO(inv.id, user.id, projectName, invoiceNo, inv.invoice_amount_incl_vat, projectId);
      err = res.error;
    }

    setApprovingInvoice(false);
    if (!err) {
      setInvoiceModal(null);
      loadData();
    }
  }

  async function handleInvoiceReject(comment: string) {
    if (!invoiceModal || !user) return;
    setApprovingInvoice(true);
    const inv = invoiceModal;
    const projectName = (inv as any).project?.name ?? '';
    const invoiceNo = inv.vendor_invoice_no ?? '';
    const projectId = inv.project_id;

    if (profile?.role === 'construction_manager') {
      await rejectInvoiceCM(inv.id, user.id, comment, projectName, invoiceNo, projectId);
    } else {
      await rejectInvoice(inv.id, user.id, comment, projectName, invoiceNo, projectId);
    }

    setApprovingInvoice(false);
    setInvoiceModal(null);
    loadData();
  }

  // ---------------------------------------------------------------------------
  // Derived stats for top bar
  // ---------------------------------------------------------------------------

  const totalItems = swimlanes.reduce((s, l) => s + l.columns.reduce((cs, c) => cs + c.cards.length, 0), 0);
  const overdueItems = swimlanes.reduce(
    (s, l) => s + l.columns.reduce((cs, c) => cs + c.cards.filter(card => card.aging === 'red').length, 0),
    0,
  );

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
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Workflow Efficiency</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live value stream map · {totalItems} items in motion
            {overdueItems > 0 && (
              <span className="ml-2 text-[#E24B4A] font-semibold">· {overdueItems} overdue</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Project filter */}
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

          {/* Refresh */}
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw size={13} />
            {formatDate(lastRefresh.toISOString())}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200 border border-gray-300 inline-block" />
          0–3 days
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#EF9F27]/40 border border-[#EF9F27]/60 inline-block" />
          4–7 days
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E24B4A]/40 border border-[#E24B4A]/60 inline-block" />
          &gt;7 days overdue
        </span>
        {projectFilter && (
          <button
            onClick={() => setProjectFilter('')}
            className="ml-auto text-[#1D9E75] font-medium hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Swimlanes */}
      {swimlanes.map(lane => (
        <SwimlaneView
          key={lane.title}
          lane={lane}
          myRole={profile?.role}
          onCardClick={handleCardClick}
        />
      ))}

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
