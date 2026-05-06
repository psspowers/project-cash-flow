import { useEffect, useState } from 'react';
import { differenceInDays } from 'date-fns';
import {
  AlertTriangle, Clock, CheckCircle, ShoppingCart, FileText,
  BarChart2, CreditCard, RefreshCw, User, TrendingUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatTHB, formatDate } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgingLevel = 'fresh' | 'amber' | 'red';

interface PipelineItem {
  id: string;
  label: string;           // document reference / title
  sublabel?: string;       // project name or supplier name
  amount?: number;
  updatedAt: string;
  daysWaiting: number;
  aging: AgingLevel;
  entityType: 'po' | 'invoice' | 'costing' | 'progress_report' | 'voucher';
  actionRequired: boolean; // true = current user's desk
}

interface DeskGroup {
  desk: string;
  ownerLabel: string;
  icon: React.ReactNode;
  color: string;           // tailwind color token base (border / text)
  bgColor: string;
  items: PipelineItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agingLevel(days: number): AgingLevel {
  if (days > 7) return 'red';
  if (days > 3) return 'amber';
  return 'fresh';
}

function agingBadge(item: PipelineItem) {
  const cls =
    item.aging === 'red'
      ? 'bg-[#E24B4A]/10 text-[#E24B4A] border border-[#E24B4A]/30'
      : item.aging === 'amber'
      ? 'bg-[#EF9F27]/10 text-[#EF9F27] border border-[#EF9F27]/30'
      : 'bg-gray-100 text-gray-500 border border-gray-200';
  const icon =
    item.aging === 'red' ? (
      <AlertTriangle size={10} />
    ) : item.aging === 'amber' ? (
      <Clock size={10} />
    ) : (
      <CheckCircle size={10} />
    );
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls}`}>
      {icon}
      {item.daysWaiting}d
    </span>
  );
}

function entityIcon(type: PipelineItem['entityType']) {
  switch (type) {
    case 'po': return <ShoppingCart size={13} className="shrink-0" />;
    case 'invoice': return <FileText size={13} className="shrink-0" />;
    case 'costing': return <BarChart2 size={13} className="shrink-0" />;
    case 'progress_report': return <TrendingUp size={13} className="shrink-0" />;
    case 'voucher': return <CreditCard size={13} className="shrink-0" />;
  }
}

function ItemCard({ item }: { item: PipelineItem }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 flex items-start justify-between gap-3 transition-colors ${
        item.aging === 'red'
          ? 'border-[#E24B4A]/25 bg-[#E24B4A]/5'
          : item.aging === 'amber'
          ? 'border-[#EF9F27]/25 bg-[#EF9F27]/5'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-2 min-w-0">
        <span className={`mt-0.5 ${item.aging === 'red' ? 'text-[#E24B4A]' : item.aging === 'amber' ? 'text-[#EF9F27]' : 'text-gray-400'}`}>
          {entityIcon(item.entityType)}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-800 truncate">{item.label}</p>
          {item.sublabel && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.sublabel}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {item.amount != null && (
          <span className="text-[12px] font-semibold text-gray-700">{formatTHB(item.amount)}</span>
        )}
        {agingBadge(item)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function WorkflowEfficiency() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [actionItems, setActionItems] = useState<PipelineItem[]>([]);
  const [monitorGroups, setMonitorGroups] = useState<DeskGroup[]>([]);

  const isEVP = profile?.role === 'evp';
  const isCEO = profile?.role === 'ceo';

  useEffect(() => {
    if (profile) loadData();
  }, [profile]);

  async function loadData() {
    setLoading(true);

    const now = new Date();

    // Fetch all pipeline data in parallel
    const [posRes, invRes, costingsRes, reportsRes, vouchersRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('id, pss_po_no, description, po_amount_incl_vat, status, updated_at, supplier_name_raw, vendor:vendor_id(name), project:project_id(name)')
        .in('status', ['pending_cm', 'pending_evp', 'pending_ceo', 'draft_revision', 'pending_revision_approval']),
      supabase
        .from('vendor_invoices')
        .select('id, vendor_invoice_no, invoice_amount_incl_vat, status, updated_at, project:project_id(name), purchase_order:po_id(pss_po_no, vendor:vendor_id(name), supplier_name_raw)')
        .in('status', ['received', 'approved_cm', 'approved_evp', 'rejected']),
      supabase
        .from('project_costings')
        .select('id, stage, status, updated_at, project:project_id(name, contract_incl_vat)')
        .in('status', ['submitted', 'cm_approved']),
      supabase
        .from('progress_reports')
        .select('id, status, updated_at, project:project_id(name), vendor_invoice:vendor_invoice_id(invoice_amount_incl_vat, vendor_invoice_no)')
        .in('status', ['submitted', 'cm_approved']),
      supabase
        .from('payment_vouchers')
        .select('id, voucher_no, net_paid, status, updated_at, project:project_id(name)')
        .in('status', ['pending_manager', 'approved']),
    ]);

    function makePOItem(po: any, desk: 'cm' | 'evp' | 'ceo' | 'cc'): PipelineItem {
      const days = differenceInDays(now, new Date(po.updated_at));
      const vendorName = po.vendor?.name ?? po.supplier_name_raw ?? '—';
      return {
        id: po.id,
        label: po.pss_po_no ?? po.description ?? 'Purchase Order',
        sublabel: `${vendorName} · ${(po.project as any)?.name ?? '—'}`,
        amount: po.po_amount_incl_vat,
        updatedAt: po.updated_at,
        daysWaiting: days,
        aging: agingLevel(days),
        entityType: 'po',
        actionRequired: (isEVP && desk === 'evp') || (isCEO && desk === 'ceo'),
      };
    }

    function makeInvoiceItem(inv: any, desk: 'cm' | 'evp' | 'ceo' | 'cc'): PipelineItem {
      const days = differenceInDays(now, new Date(inv.updated_at));
      const po = inv.purchase_order as any;
      const vendorName = po?.vendor?.name ?? po?.supplier_name_raw ?? '—';
      return {
        id: inv.id,
        label: inv.vendor_invoice_no ?? 'Vendor Invoice',
        sublabel: `${vendorName} · ${(inv.project as any)?.name ?? '—'}`,
        amount: inv.invoice_amount_incl_vat,
        updatedAt: inv.updated_at,
        daysWaiting: days,
        aging: agingLevel(days),
        entityType: 'invoice',
        actionRequired: (isEVP && desk === 'evp') || (isCEO && desk === 'ceo'),
      };
    }

    function makeCostingItem(c: any, desk: 'cm' | 'evp'): PipelineItem {
      const days = differenceInDays(now, new Date(c.updated_at));
      const project = c.project as any;
      return {
        id: c.id,
        label: `${c.stage === 'estimation' ? 'Estimation' : 'Budget'} Costing`,
        sublabel: project?.name ?? '—',
        amount: project?.contract_incl_vat,
        updatedAt: c.updated_at,
        daysWaiting: days,
        aging: agingLevel(days),
        entityType: 'costing',
        actionRequired: (isEVP && desk === 'evp'),
      };
    }

    function makeReportItem(r: any, desk: 'cm' | 'evp'): PipelineItem {
      const days = differenceInDays(now, new Date(r.updated_at));
      const inv = r.vendor_invoice as any;
      return {
        id: r.id,
        label: `Progress Report${inv?.vendor_invoice_no ? ` · ${inv.vendor_invoice_no}` : ''}`,
        sublabel: (r.project as any)?.name ?? '—',
        amount: inv?.invoice_amount_incl_vat,
        updatedAt: r.updated_at,
        daysWaiting: days,
        aging: agingLevel(days),
        entityType: 'progress_report',
        actionRequired: (isEVP && desk === 'evp'),
      };
    }

    function makeVoucherItem(v: any, desk: 'finance'): PipelineItem {
      const days = differenceInDays(now, new Date(v.updated_at));
      return {
        id: v.id,
        label: v.voucher_no,
        sublabel: (v.project as any)?.name ?? '—',
        amount: v.net_paid,
        updatedAt: v.updated_at,
        daysWaiting: days,
        aging: agingLevel(days),
        entityType: 'voucher',
        actionRequired: false,
      };
    }

    // Build item arrays by desk
    const pos = posRes.data ?? [];
    const invs = invRes.data ?? [];
    const costings = costingsRes.data ?? [];
    const reports = reportsRes.data ?? [];
    const vouchers = vouchersRes.data ?? [];

    // --- Procurement / Cost Controller desk ---
    const ccItems: PipelineItem[] = [
      ...pos.filter((p: any) => p.status === 'draft_revision').map((p: any) => makePOItem(p, 'cc')),
      ...invs.filter((i: any) => i.status === 'rejected').map((i: any) => makeInvoiceItem(i, 'cc')),
    ];

    // --- Construction Manager desk ---
    const cmItems: PipelineItem[] = [
      ...pos.filter((p: any) => p.status === 'pending_cm').map((p: any) => makePOItem(p, 'cm')),
      ...invs.filter((i: any) => i.status === 'received').map((i: any) => makeInvoiceItem(i, 'cm')),
      ...costings.filter((c: any) => c.status === 'submitted').map((c: any) => makeCostingItem(c, 'cm')),
      ...reports.filter((r: any) => r.status === 'submitted').map((r: any) => makeReportItem(r, 'cm')),
    ];

    // --- EVP desk ---
    const evpItems: PipelineItem[] = [
      ...pos.filter((p: any) => ['pending_evp', 'pending_revision_approval'].includes(p.status)).map((p: any) => makePOItem(p, 'evp')),
      ...invs.filter((i: any) => i.status === 'approved_cm').map((i: any) => makeInvoiceItem(i, 'evp')),
      ...costings.filter((c: any) => c.status === 'cm_approved').map((c: any) => makeCostingItem(c, 'evp')),
      ...reports.filter((r: any) => r.status === 'cm_approved').map((r: any) => makeReportItem(r, 'evp')),
    ];

    // --- CEO desk ---
    const ceoItems: PipelineItem[] = [
      ...pos.filter((p: any) => p.status === 'pending_ceo').map((p: any) => makePOItem(p, 'ceo')),
      ...invs.filter((i: any) => i.status === 'approved_evp').map((i: any) => makeInvoiceItem(i, 'ceo')),
    ];

    // --- Finance desk ---
    const financeItems: PipelineItem[] = [
      ...vouchers.map((v: any) => makeVoucherItem(v, 'finance')),
    ];

    // Sort each group by daysWaiting desc (oldest first = most urgent)
    const sortByAge = (a: PipelineItem, b: PipelineItem) => b.daysWaiting - a.daysWaiting;

    ccItems.sort(sortByAge);
    cmItems.sort(sortByAge);
    evpItems.sort(sortByAge);
    ceoItems.sort(sortByAge);
    financeItems.sort(sortByAge);

    // Action Required: the current user's own desk
    const myItems = isEVP ? evpItems : isCEO ? ceoItems : [];
    setActionItems(myItems);

    // Monitoring: all other desks (excluding own desk)
    const groups: DeskGroup[] = [];

    if (ccItems.length > 0) {
      groups.push({
        desk: 'cc',
        ownerLabel: 'Procurement / Cost Controller',
        icon: <ShoppingCart size={14} />,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50 border-gray-200',
        items: ccItems,
      });
    }

    if (cmItems.length > 0) {
      groups.push({
        desk: 'cm',
        ownerLabel: 'Construction Manager',
        icon: <User size={14} />,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50 border-blue-200',
        items: cmItems,
      });
    }

    if (isEVP && ceoItems.length > 0) {
      groups.push({
        desk: 'ceo',
        ownerLabel: "CEO's Desk",
        icon: <User size={14} />,
        color: 'text-[#1D9E75]',
        bgColor: 'bg-[#1D9E75]/5 border-[#1D9E75]/20',
        items: ceoItems,
      });
    }

    if (isCEO && evpItems.length > 0) {
      groups.push({
        desk: 'evp',
        ownerLabel: "EVP's Desk",
        icon: <User size={14} />,
        color: 'text-[#1D9E75]',
        bgColor: 'bg-[#1D9E75]/5 border-[#1D9E75]/20',
        items: evpItems,
      });
    }

    if (financeItems.length > 0) {
      groups.push({
        desk: 'finance',
        ownerLabel: 'Finance / Accounts',
        icon: <CreditCard size={14} />,
        color: 'text-[#EF9F27]',
        bgColor: 'bg-[#EF9F27]/5 border-[#EF9F27]/20',
        items: financeItems,
      });
    }

    setMonitorGroups(groups);
    setLastRefresh(new Date());
    setLoading(false);
  }

  // Summary counts
  const totalPipeline =
    actionItems.length + monitorGroups.reduce((s, g) => s + g.items.length, 0);
  const urgentCount = [
    ...actionItems,
    ...monitorGroups.flatMap(g => g.items),
  ].filter(i => i.aging === 'red').length;

  const actionValue = actionItems.reduce((s, i) => s + (i.amount ?? 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Workflow Efficiency</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live pipeline view — {totalPipeline} items in motion
            {urgentCount > 0 && (
              <span className="ml-2 text-[#E24B4A] font-medium">· {urgentCount} overdue (&gt;7 days)</span>
            )}
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw size={13} />
          Refreshed {formatDate(lastRefresh.toISOString())}
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-200 border border-gray-300 inline-block" />
          0–3 days — On track
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#EF9F27]/40 border border-[#EF9F27]/60 inline-block" />
          4–7 days — Follow up
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E24B4A]/40 border border-[#E24B4A]/60 inline-block" />
          &gt;7 days — Overdue
        </span>
      </div>

      {/* ── ACTION REQUIRED section ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-5 rounded-full bg-[#E24B4A]" />
          <h2 className="text-base font-bold text-gray-900">Action Required — Your Desk</h2>
          {actionItems.length > 0 && (
            <span className="bg-[#E24B4A] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {actionItems.length}
            </span>
          )}
          {actionValue > 0 && (
            <span className="ml-auto text-sm font-semibold text-gray-700">{formatTHB(actionValue)} total value</span>
          )}
        </div>

        {actionItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1D9E75]/40 bg-[#1D9E75]/5 p-6 text-center">
            <CheckCircle size={28} className="text-[#1D9E75] mx-auto mb-2" />
            <p className="text-sm font-medium text-[#1D9E75]">Your desk is clear</p>
            <p className="text-xs text-gray-400 mt-1">No items waiting for your approval or action.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {actionItems.map(item => (
              <div key={`${item.entityType}-${item.id}`} className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-[#E24B4A]" />
                <div className="ml-1">
                  <ItemCard item={item} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MONITORING section ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-5 rounded-full bg-gray-400" />
          <h2 className="text-base font-bold text-gray-900">Monitoring — Awaiting Others</h2>
        </div>

        {monitorGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <CheckCircle size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">Pipeline is clear</p>
            <p className="text-xs text-gray-400 mt-1">No items are currently blocked at other desks.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {monitorGroups.map(group => {
              const groupValue = group.items.reduce((s, i) => s + (i.amount ?? 0), 0);
              const redCount = group.items.filter(i => i.aging === 'red').length;
              const amberCount = group.items.filter(i => i.aging === 'amber').length;
              return (
                <div key={group.desk} className={`rounded-xl border p-4 ${group.bgColor}`}>
                  {/* Group header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={group.color}>{group.icon}</span>
                      <span className={`text-sm font-semibold ${group.color}`}>{group.ownerLabel}</span>
                      <span className="bg-white/70 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-gray-200">
                        {group.items.length}
                      </span>
                      {redCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#E24B4A]">
                          <AlertTriangle size={10} /> {redCount} overdue
                        </span>
                      )}
                      {amberCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#EF9F27]">
                          <Clock size={10} /> {amberCount} late
                        </span>
                      )}
                    </div>
                    {groupValue > 0 && (
                      <span className="text-xs font-semibold text-gray-600">{formatTHB(groupValue)}</span>
                    )}
                  </div>

                  {/* Item grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                    {group.items.map(item => (
                      <ItemCard key={`${item.entityType}-${item.id}`} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
