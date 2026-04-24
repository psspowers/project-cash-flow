import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Clock,
  CheckSquare,
  AlertTriangle,
  ArrowRight,
  Landmark,
  ArrowUpRight,
} from 'lucide-react';
import { subMonths, format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Project,
  PaymentVoucher,
  Loan,
  ProgressReport,
  ProjectCosting,
  PROJECT_STATUS_LABELS,
  fmtTHB,
  fmtTHBCompact,
} from '../types';
import MetricCard from '../components/ui/MetricCard';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatDate } from '../utils/formatters';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface ProjectCashPosition {
  project: Project;
  totalReceived: number;
  totalCostPaid: number;
  margin: number;
}

interface MonthlyBar {
  month: string;
  inflow: number;
  outflow: number;
}

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function SkeletonLine({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} bg-gray-100 rounded animate-pulse`} />;
}

function MetricCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-black/[0.08] border-l-4 border-l-gray-200 p-5 space-y-2">
      <SkeletonLine w="w-1/2" h="h-2.5" />
      <SkeletonLine w="w-3/4" h="h-6" />
      <SkeletonLine w="w-1/3" h="h-2" />
    </div>
  );
}

function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-gray-50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonLine w="w-full" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Tooltip type helpers for Recharts
// ---------------------------------------------------------------------------

type RechartsTooltipFormatter = (
  value: number,
  name: string,
) => [string, string];

// ---------------------------------------------------------------------------
// Role-specific helpers
// ---------------------------------------------------------------------------

function roleSubtitle(role: string | undefined): string {
  switch (role) {
    case 'ceo':
      return 'Executive overview — all projects & financial positions';
    case 'evp':
      return 'EVP view — progress approvals & project cash flow';
    case 'construction_manager':
      return 'Construction Manager — progress reports awaiting review';
    case 'cost_controller':
      return 'Cost Controller — rejected items & budget tracking';
    case 'accounts_supervisor':
      return 'Accounts Supervisor — payment queue & receipts';
    case 'accounts_manager':
      return 'Accounts Manager — payment approvals';
    default:
      return 'Cash flow management dashboard';
  }
}

function getPendingApprovals(
  role: string | undefined,
  reports: ProgressReport[],
  vouchers: PaymentVoucher[],
  costings: ProjectCosting[],
): number {
  if (role === 'construction_manager')
    return (
      reports.filter((r) => r.status === 'submitted').length +
      costings.filter((c) => c.status === 'submitted').length
    );
  if (role === 'evp')
    return (
      reports.filter((r) => r.status === 'cm_approved').length +
      costings.filter((c) => c.status === 'cm_approved').length
    );
  if (role === 'cost_controller')
    return reports.filter(
      (r) => r.status === 'cm_rejected' || r.status === 'evp_rejected',
    ).length;
  if (role === 'accounts_supervisor')
    return vouchers.filter((v) => v.status === 'pending_manager').length;
  if (role === 'accounts_manager')
    return vouchers.filter((v) => v.status === 'pending_manager').length;
  if (role === 'ceo')
    return (
      vouchers.filter((v) => v.ceo_notified && v.status !== 'issued').length +
      costings.filter((c) => c.status === 'cm_approved').length
    );
  return 0;
}

function getPendingLabel(role: string | undefined): string {
  if (role === 'construction_manager') return 'Submitted reports';
  if (role === 'evp') return 'CM-approved reports';
  if (role === 'cost_controller') return 'Rejected reports';
  if (role === 'accounts_supervisor' || role === 'accounts_manager')
    return 'Vouchers pending approval';
  if (role === 'ceo') return 'CEO-notified vouchers';
  return 'Pending items';
}

interface QueueItem {
  id: string;
  label: string;
  sub: string;
  status: string;
  urgent: boolean;
  done: boolean;
  href: string;
}

function getApprovalQueueItems(
  role: string | undefined,
  reports: ProgressReport[],
  vouchers: PaymentVoucher[],
  costings: ProjectCosting[],
): QueueItem[] {
  const recentDone = costings
    .filter((c) => c.status === 'evp_approved')
    .map((c) => ({
      id: `done-${c.id}`,
      label: (c.project as unknown as Project)?.name ?? '—',
      sub: `${c.stage === 'estimation' ? 'Estimation' : 'Budget'} — approved`,
      status: c.status,
      urgent: false,
      done: true,
      href: `/projects/${c.project_id}?tab=costing`,
    }));

  if (role === 'construction_manager') {
    const pending = [
      ...costings
        .filter((c) => c.status === 'submitted')
        .map((c) => ({
          id: c.id,
          label: (c.project as unknown as Project)?.name ?? '—',
          sub: `${c.stage === 'estimation' ? 'Estimation' : 'Budget'} submitted`,
          status: c.status,
          urgent: true,
          done: false,
          href: `/projects/${c.project_id}?tab=costing`,
        })),
      ...reports
        .filter((r) => r.status === 'submitted')
        .map((r) => ({
          id: r.id,
          label: (r.project as unknown as Project)?.name ?? '—',
          sub: formatDate(r.report_date),
          status: r.status,
          urgent: false,
          done: false,
          href: '/approvals',
        })),
    ];
    return [...pending, ...recentDone].slice(0, 5);
  }
  if (role === 'evp') {
    const pending = [
      ...costings
        .filter((c) => c.status === 'cm_approved')
        .map((c) => ({
          id: c.id,
          label: (c.project as unknown as Project)?.name ?? '—',
          sub: `${c.stage === 'estimation' ? 'Estimation' : 'Budget'} — CM approved`,
          status: c.status,
          urgent: true,
          done: false,
          href: `/projects/${c.project_id}?tab=costing`,
        })),
      ...reports
        .filter((r) => r.status === 'cm_approved')
        .map((r) => ({
          id: r.id,
          label: (r.project as unknown as Project)?.name ?? '—',
          sub: formatDate(r.report_date),
          status: r.status,
          urgent: false,
          done: false,
          href: '/approvals',
        })),
    ];
    return [...pending, ...recentDone].slice(0, 5);
  }
  if (role === 'cost_controller') {
    return reports
      .filter((r) => r.status === 'cm_rejected' || r.status === 'evp_rejected')
      .slice(0, 4)
      .map((r) => ({
        id: r.id,
        label: (r.project as unknown as Project)?.name ?? '—',
        sub: formatDate(r.report_date),
        status: r.status,
        urgent: false,
        done: false,
        href: '/approvals',
      }));
  }
  if (role === 'accounts_supervisor' || role === 'accounts_manager') {
    return vouchers
      .filter((v) => v.status === 'pending_manager')
      .slice(0, 4)
      .map((v) => ({
        id: v.id,
        label: `Voucher ${v.voucher_no}`,
        sub: formatDate(v.voucher_date),
        status: v.status,
        urgent: false,
        done: false,
        href: '/approvals',
      }));
  }
  if (role === 'ceo') {
    const pending = [
      ...costings
        .filter((c) => c.status === 'cm_approved')
        .map((c) => ({
          id: c.id,
          label: (c.project as unknown as Project)?.name ?? '—',
          sub: `${c.stage === 'estimation' ? 'Estimation' : 'Budget'} awaiting sign-off`,
          status: c.status,
          urgent: true,
          done: false,
          href: `/projects/${c.project_id}?tab=costing`,
        })),
      ...vouchers
        .filter((v) => v.ceo_notified && v.status !== 'issued')
        .map((v) => ({
          id: v.id,
          label: `Voucher ${v.voucher_no}`,
          sub: fmtTHB(v.net_paid),
          status: v.status,
          urgent: v.net_paid >= 3_000_000,
          done: false,
          href: '/payment-queue',
        })),
    ];
    return [...pending, ...recentDone].slice(0, 5);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clientInvoiceReceipts, setClientInvoiceReceipts] = useState<
    { project_id: string; received_amount: number; receipt_date: string | null; client_milestone_id: string | null }[]
  >([]);
  const [vouchers, setVouchers] = useState<
    Pick<
      PaymentVoucher,
      | 'id'
      | 'project_id'
      | 'net_paid'
      | 'status'
      | 'ceo_notified'
      | 'voucher_no'
      | 'voucher_date'
    >[]
  >([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [pendingReports, setPendingReports] = useState<ProgressReport[]>([]);
  const [pendingCostings, setPendingCostings] = useState<ProjectCosting[]>([]);
  const [vendorInvoicePaid, setVendorInvoicePaid] = useState<
    { project_id: string; received_amount: number; invoice_date: string | null }[]
  >([]);
  const [pendingReceivablesSum, setPendingReceivablesSum] = useState(0);
  const [projectViewCounts, setProjectViewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'historical' | 'forecast' | 'combined'>('historical');
  const [clientMilestonesAll, setClientMilestonesAll] = useState<
    { id: string; project_id: string; payment_plan_amount: number; planned_receive_date: string | null; status: string }[]
  >([]);
  const [poMilestonesAll, setPoMilestonesAll] = useState<
    { project_id: string; purchase_order_id: string; amount_due: number; paid_amount: number; planned_payment_date: string | null; status: string; is_approved: boolean }[]
  >([]);
  const [vendorInvoicesUnpaid, setVendorInvoicesUnpaid] = useState<
    { project_id: string; balance: number; planned_payment_date: string | null; approved_by: string | null }[]
  >([]);
  const [poSimplePending, setPoSimplePending] = useState<
    { project_id: string; pending_remaining_amount: number; po_date: string | null; approved_by: string | null }[]
  >([]);

  useEffect(() => {
    loadData();
    const onVisible = () => { if (document.visibilityState === 'visible') loadData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [location.key]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const userId = user?.id;
      const [
        { data: proj, error: e1 },
        { data: ciReceipts, error: e2 },
        { data: voucs, error: e3 },
        { data: lns, error: e4 },
        { data: reports, error: e5 },
        { data: clientInvs, error: e6 },
        { data: costings, error: e7 },
        { data: viewRows },
        { data: viRaw, error: e8 },
        { data: cmAll, error: e9 },
        { data: pmAll, error: e10 },
        { data: viUnpaidRaw, error: e11 },
        { data: poSimpleRaw, error: e12 },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('*, client:entities!client_entity_id(*)')
          .order('created_at'),
        supabase
          .from('client_invoices')
          .select('project_id, received_amount, receipt_date, client_milestone_id')
          .gt('received_amount', 0),
        supabase
          .from('payment_vouchers')
          .select(
            'id, project_id, net_paid, status, ceo_notified, voucher_no, voucher_date',
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('loans')
          .select('*, counterparty:entities!counterparty_id(*)')
          .order('created_at'),
        supabase
          .from('progress_reports')
          .select(
            '*, project:projects(*), purchase_order:purchase_orders(pss_po_no, vendor:entities!vendor_id(name))',
          )
          .order('created_at', { ascending: false }),
        supabase
          .from('client_invoices')
          .select('pending_amount')
          .in('status', ['pending', 'partially_received']),
        supabase
          .from('project_costings')
          .select('*, project:projects(*)')
          .in('status', ['submitted', 'cm_approved', 'evp_approved'])
          .order('created_at', { ascending: false }),
        userId
          ? supabase
              .from('project_views')
              .select('project_id, view_count')
              .eq('user_id', userId)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('vendor_invoices')
          .select('project_id, received_amount, invoice_date, purchase_order:purchase_orders!po_id(project_id)')
          .gt('received_amount', 0),
        supabase
          .from('client_milestones')
          .select('id, project_id, payment_plan_amount, planned_receive_date, status')
          .neq('status', 'received'),
        supabase
          .from('po_milestones')
          .select('purchase_order_id, amount_due, paid_amount, planned_payment_date, status, purchase_order:purchase_orders!purchase_order_id(project_id, approved_by)')
          .neq('status', 'paid'),
        supabase
          .from('vendor_invoices')
          .select('planned_payment_date, invoice_amount_incl_vat, received_amount, purchase_order:purchase_orders!po_id(project_id, approved_by)')
          .gt('invoice_amount_incl_vat', 0),
        supabase
          .from('purchase_orders')
          .select('project_id, pending_remaining_amount, po_date, approved_by, has_supplier_milestones')
          .eq('has_supplier_milestones', false)
          .gt('pending_remaining_amount', 0),
      ]);

      const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8 || e9 || e10 || e11 || e12;
      if (firstError) throw firstError;

      const viewMap: Record<string, number> = {};
      (viewRows ?? []).forEach((r: { project_id: string; view_count: number }) => {
        viewMap[r.project_id] = r.view_count;
      });

      const normalizedViPaid = (viRaw ?? [])
        .map((vi: { project_id: string | null; received_amount: number; invoice_date: string | null; purchase_order: { project_id: string } | null }) => ({
          project_id: vi.project_id ?? vi.purchase_order?.project_id ?? '',
          received_amount: vi.received_amount,
          invoice_date: vi.invoice_date,
        }))
        .filter((vi: { project_id: string }) => vi.project_id !== '');

      setProjects(proj ?? []);
      setClientInvoiceReceipts(ciReceipts ?? []);
      setVouchers(voucs ?? []);
      setLoans(lns ?? []);
      setPendingReports(reports ?? []);
      setPendingCostings((costings as unknown as ProjectCosting[]) ?? []);
      setProjectViewCounts(viewMap);
      setVendorInvoicePaid(normalizedViPaid);
      setPendingReceivablesSum(
        (clientInvs ?? []).reduce((s, r) => s + (r.pending_amount ?? 0), 0),
      );
      setClientMilestonesAll((cmAll ?? []) as typeof clientMilestonesAll);

      const normalizedPmAll = (pmAll ?? [])
        .map((pm: { purchase_order_id: string; amount_due: number; paid_amount: number; planned_payment_date: string | null; status: string; purchase_order: { project_id: string; approved_by: string | null } | null }) => ({
          project_id: pm.purchase_order?.project_id ?? '',
          purchase_order_id: pm.purchase_order_id,
          amount_due: pm.amount_due,
          paid_amount: pm.paid_amount,
          planned_payment_date: pm.planned_payment_date,
          status: pm.status,
          is_approved: pm.purchase_order?.approved_by != null,
        }))
        .filter((pm: { project_id: string }) => pm.project_id !== '');
      setPoMilestonesAll(normalizedPmAll);

      const normalizedUnpaidInvoices = (viUnpaidRaw ?? [])
        .map((vi: { project_id?: string | null; planned_payment_date: string | null; invoice_amount_incl_vat: number; received_amount: number; purchase_order: { project_id: string; approved_by: string | null } | null }) => ({
          project_id: vi.project_id ?? vi.purchase_order?.project_id ?? '',
          balance: (vi.invoice_amount_incl_vat ?? 0) - (vi.received_amount ?? 0),
          planned_payment_date: vi.planned_payment_date ?? null,
          approved_by: vi.purchase_order?.approved_by ?? null,
        }))
        .filter((vi: { project_id: string; balance: number }) => vi.project_id !== '' && vi.balance > 0);
      setVendorInvoicesUnpaid(normalizedUnpaidInvoices);

      setPoSimplePending((poSimpleRaw ?? []) as typeof poSimplePending);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived metrics
  // ---------------------------------------------------------------------------

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const activeProjects = projects.filter((p) => p.status === 'active');
  const totalContractValue = activeProjects.reduce(
    (s, p) => s + p.contract_incl_vat,
    0,
  );

  const totalReceivedThisYear = clientInvoiceReceipts
    .filter((r) => r.receipt_date && r.receipt_date >= yearStart)
    .reduce((s, r) => s + r.received_amount, 0);

  const totalReceivedAllTime = clientInvoiceReceipts.reduce(
    (s, r) => s + r.received_amount,
    0,
  );

  const pendingReceivables = pendingReceivablesSum;

  // Column P — uninvoiced milestone amounts across all active projects
  const invoicedMilestoneIdsAll = new Set(
    clientInvoiceReceipts.map(r => r.client_milestone_id).filter(Boolean)
  );

  const notYetInvoicedTotal = clientMilestonesAll
    .filter(m =>
      activeProjects.some(p => p.id === m.project_id) &&
      m.status !== 'received' &&
      !invoicedMilestoneIdsAll.has(m.id)
    )
    .reduce((s, m) => s + m.payment_plan_amount, 0);

  // Column O + Column P = Total Outstanding Receivable
  const totalOutstandingReceivable = pendingReceivables + notYetInvoicedTotal;

  // ── Forecast months — next 9 ──────────────────────────────────────────
  const forecastMonths = Array.from({ length: 9 }, (_, i) =>
    format(subMonths(now, -1 - i), 'yyyy-MM'),
  );

  const forecastChartData = forecastMonths.map(key => {
    const inflow = clientMilestonesAll
      .filter(m => m.planned_receive_date?.startsWith(key))
      .reduce((s, m) => s + m.payment_plan_amount / 1_000_000, 0);
    // Source 3: PO milestones (existing)
    const outflowApproved = poMilestonesAll
      .filter(m => m.planned_payment_date?.startsWith(key) && m.is_approved)
      .reduce((s, m) => s + (m.amount_due - (m.paid_amount ?? 0)) / 1_000_000, 0);
    const outflowDraft = poMilestonesAll
      .filter(m => m.planned_payment_date?.startsWith(key) && !m.is_approved)
      .reduce((s, m) => s + (m.amount_due - (m.paid_amount ?? 0)) / 1_000_000, 0);
    // Source 1: Unpaid vendor invoices (col O) — invoiced by supplier, not yet paid
    const outflowColO = vendorInvoicesUnpaid
      .filter(vi => vi.planned_payment_date?.startsWith(key))
      .reduce((s, vi) => s + vi.balance / 1_000_000, 0);
    // Source 2: Simple POs with no invoice yet — use po_date as proxy
    const outflowSimplePO = poSimplePending
      .filter(po => po.po_date?.startsWith(key))
      .reduce((s, po) => s + (po.pending_remaining_amount ?? 0) / 1_000_000, 0);
    return {
      month: format(new Date(key + '-01'), 'MMM yy'),
      key,
      inflow: +inflow.toFixed(2),
      outflowColO: +outflowColO.toFixed(2),
      outflowApproved: +outflowApproved.toFixed(2),
      outflowDraft: +outflowDraft.toFixed(2),
      outflowSimplePO: +outflowSimplePO.toFixed(2),
    };
  });

  let cumNet = 0;
  const forecastChartDataWithCum = forecastChartData.map(d => {
    const totalOut = d.outflowColO + d.outflowApproved + d.outflowDraft + d.outflowSimplePO;
    cumNet += d.inflow - totalOut;
    return { ...d, cumNet: +cumNet.toFixed(2) };
  });

  // ── Combined mode — last 3 months actual + next 6 forecast ───────────
  const past3Months = Array.from({ length: 3 }, (_, i) => subMonths(now, 3 - i));
  const next6Months = Array.from({ length: 6 }, (_, i) => subMonths(now, -1 - i));

  const combinedChartData = [
    ...past3Months.map(month => {
      const key = format(month, 'yyyy-MM');
      const inflow = clientInvoiceReceipts
        .filter(r => r.receipt_date?.startsWith(key))
        .reduce((s, r) => s + r.received_amount / 1_000_000, 0);
      const outflowApproved = vendorInvoicePaid
        .filter(vi => vi.invoice_date?.startsWith(key))
        .reduce((s, vi) => s + vi.received_amount / 1_000_000, 0);
      return {
        month: format(month, 'MMM yy'),
        key,
        inflow: +inflow.toFixed(2),
        outflowApproved: +outflowApproved.toFixed(2),
        outflowDraft: 0,
        isForecast: false,
      };
    }),
    ...next6Months.map(month => {
      const key = format(month, 'yyyy-MM');
      const inflow = clientMilestonesAll
        .filter(m => m.planned_receive_date?.startsWith(key))
        .reduce((s, m) => s + m.payment_plan_amount / 1_000_000, 0);
      const outflowApproved = poMilestonesAll
        .filter(m => m.planned_payment_date?.startsWith(key) && m.is_approved)
        .reduce((s, m) => s + (m.amount_due - (m.paid_amount ?? 0)) / 1_000_000, 0);
      const outflowDraft = poMilestonesAll
        .filter(m => m.planned_payment_date?.startsWith(key) && !m.is_approved)
        .reduce((s, m) => s + (m.amount_due - (m.paid_amount ?? 0)) / 1_000_000, 0);
      return {
        month: format(month, 'MMM yy'),
        key,
        inflow: +inflow.toFixed(2),
        outflowApproved: +outflowApproved.toFixed(2),
        outflowDraft: +outflowDraft.toFixed(2),
        isForecast: true,
      };
    }),
  ];

  // ── 90-day net position ───────────────────────────────────────────────
  const ninetyDaysFromNow = new Date(now);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
  const ninetyDayKey = format(ninetyDaysFromNow, 'yyyy-MM-dd');

  const plannedInflow90 = clientMilestonesAll
    .filter(m => m.planned_receive_date && m.planned_receive_date <= ninetyDayKey)
    .reduce((s, m) => s + m.payment_plan_amount, 0);

  const plannedOutflow90 =
    poMilestonesAll
      .filter(m => m.planned_payment_date && m.planned_payment_date <= ninetyDayKey)
      .reduce((s, m) => s + (m.amount_due - (m.paid_amount ?? 0)), 0)
    + vendorInvoicesUnpaid
      .filter(vi => vi.planned_payment_date && vi.planned_payment_date <= ninetyDayKey)
      .reduce((s, vi) => s + vi.balance, 0)
    + poSimplePending
      .filter(po => po.po_date && po.po_date <= ninetyDayKey)
      .reduce((s, po) => s + (po.pending_remaining_amount ?? 0), 0);

  const netPosition90 = plannedInflow90 - plannedOutflow90;

  const thirtyDayKey = format(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const projectsAtRisk = projects.filter(p => {
    const nextIn = clientMilestonesAll
      .filter(m => m.project_id === p.id && m.planned_receive_date && m.planned_receive_date <= thirtyDayKey)
      .reduce((s, m) => s + m.payment_plan_amount, 0);
    const nextOut = poMilestonesAll
      .filter(m => m.project_id === p.id && m.planned_payment_date && m.planned_payment_date <= thirtyDayKey)
      .reduce((s, m) => s + (m.amount_due - (m.paid_amount ?? 0)), 0);
    return nextOut > nextIn;
  }).length;

  const pendingCount = getPendingApprovals(profile?.role, pendingReports, vouchers, pendingCostings);

  // ---------------------------------------------------------------------------
  // Project cash positions (active + any with activity)
  // ---------------------------------------------------------------------------

  const projectCashPositions: ProjectCashPosition[] = projects
    .map((project) => {
      const received = clientInvoiceReceipts
        .filter((r) => r.project_id === project.id)
        .reduce((s, r) => s + r.received_amount, 0);
      const paid = vendorInvoicePaid
        .filter((vi) => vi.project_id === project.id)
        .reduce((s, vi) => s + vi.received_amount, 0);
      return {
        project,
        totalReceived: received,
        totalCostPaid: paid,
        margin: received - paid,
      };
    })
    .filter(
      (pos) =>
        pos.project.status === 'active' || pos.totalReceived > 0,
    )
    .sort((a, b) => (projectViewCounts[b.project.id] ?? 0) - (projectViewCounts[a.project.id] ?? 0))
    .slice(0, 6);

  // ---------------------------------------------------------------------------
  // Monthly cash flow — last 13 months
  // ---------------------------------------------------------------------------

  const months = Array.from({ length: 13 }, (_, i) =>
    subMonths(now, 12 - i),
  );

  const chartData: MonthlyBar[] = months.map((month) => {
    const key = format(month, 'yyyy-MM');
    const inflow = clientInvoiceReceipts
      .filter((r) => r.receipt_date?.startsWith(key))
      .reduce((s, r) => s + r.received_amount / 1_000_000, 0);
    const outflow = vendorInvoicePaid
      .filter((vi) => vi.invoice_date?.startsWith(key))
      .reduce((s, vi) => s + vi.received_amount / 1_000_000, 0);
    return {
      month: format(month, 'MMM yy'),
      inflow: +inflow.toFixed(2),
      outflow: +outflow.toFixed(2),
    };
  });

  // ---------------------------------------------------------------------------
  // Loan positions
  // ---------------------------------------------------------------------------

  const loansReceived = loans.filter(
    (l) => l.loan_type === 'received' && l.outstanding_balance > 0,
  );
  const loansGiven = loans.filter((l) => l.loan_type === 'given');
  const overdueLoans = loansReceived.filter(
    (l) => l.due_date && new Date(l.due_date) < now,
  );
  const overdueLoanAmount = overdueLoans.reduce(
    (s, l) => s + l.outstanding_balance,
    0,
  );

  // ---------------------------------------------------------------------------
  // CEO: large payment alerts (≥ ฿3M)
  // ---------------------------------------------------------------------------

  const ceoAlerts = vouchers.filter(
    (v) =>
      v.ceo_notified &&
      v.status !== 'issued' &&
      v.net_paid >= 3_000_000,
  );

  // ---------------------------------------------------------------------------
  // Approval queue items
  // ---------------------------------------------------------------------------

  const queueItems = getApprovalQueueItems(
    profile?.role,
    pendingReports,
    vouchers,
    pendingCostings,
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertTriangle size={32} className="text-[#E24B4A]" />
        <p className="text-sm text-gray-600">{error}</p>
        <button
          onClick={loadData}
          className="text-sm px-4 py-2 bg-[#0f1923] text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">
          {profile ? roleSubtitle(profile.role) : ''}
        </p>
      </div>

      {/* CEO: large payment alert panel */}
      {profile?.role === 'ceo' && ceoAlerts.length > 0 && (
        <div className="bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-[#E24B4A] shrink-0" />
            <span className="text-[13px] font-semibold text-[#E24B4A]">
              Large Payment Alerts — {ceoAlerts.length} voucher
              {ceoAlerts.length !== 1 ? 's' : ''} ≥ ฿3M pending action
            </span>
          </div>
          <div className="space-y-2">
            {ceoAlerts.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between bg-white rounded-md px-3 py-2.5 border border-[#E24B4A]/10"
              >
                <div>
                  <span className="text-[13px] font-medium text-gray-800">
                    Voucher {v.voucher_no}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">
                    {formatDate(v.voucher_date)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold text-[#E24B4A]">
                    {fmtTHB(v.net_paid)}
                  </span>
                  <Badge
                    label={v.status.replace(/_/g, ' ')}
                    variant={statusVariant(v.status)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 1 — four primary KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <MetricCard
              title="Total Contract Value"
              value={fmtTHBCompact(totalContractValue)}
              sub={`${activeProjects.length} active project${activeProjects.length !== 1 ? 's' : ''}`}
              icon={<DollarSign size={18} />}
              accent="blue"
            />
            <MetricCard
              title="Received This Year"
              value={fmtTHBCompact(totalReceivedThisYear)}
              sub={`${new Date().getFullYear()} YTD, net of WHT`}
              icon={<TrendingUp size={18} />}
              accent="green"
            />
            <div
              onClick={() => pendingCount > 0 && navigate('/approvals')}
              className={pendingCount > 0 ? 'cursor-pointer' : ''}
            >
              <MetricCard
                title="Awaiting My Action"
                value={String(pendingCount)}
                sub={getPendingLabel(profile?.role)}
                icon={pendingCount > 0 ? <AlertTriangle size={18} /> : <CheckSquare size={18} />}
                accent={pendingCount > 0 ? 'amber' : 'default'}
              />
              {pendingCount > 0 && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 font-medium px-1">
                  <AlertTriangle size={11} />
                  Urgent — tap to review
                </div>
              )}
            </div>
            <div
              onClick={() => setChartMode('forecast')}
              className="cursor-pointer"
            >
              <MetricCard
                title="Net 90-Day Position"
                value={fmtTHBCompact(Math.abs(netPosition90))}
                sub={
                  netPosition90 >= 0
                    ? 'Inflows ahead of outflows'
                    : `Outflows exceed inflows — ${projectsAtRisk} project${projectsAtRisk !== 1 ? 's' : ''} at risk`
                }
                icon={<TrendingUp size={18} />}
                accent={netPosition90 >= 0 ? 'green' : 'red'}
              />
              {netPosition90 < 0 && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-[#E24B4A] font-medium px-1">
                  <AlertTriangle size={11} />
                  Tap to see forecast
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Row 2 — Receivables panel */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-black/[0.08] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-gray-400" />
            <h2 className="text-[13px] font-semibold text-gray-800">Receivables Pipeline</h2>
            <span className="text-xs text-gray-400 ml-1">— what we are still owed across active projects</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Col 1: Total outstanding */}
            <div className="md:pr-6 pb-4 md:pb-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Total Outstanding Receivable</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtTHBCompact(totalOutstandingReceivable)}</p>
              <p className="text-xs text-gray-400 mt-1">Column O + Column P combined</p>
              {/* Progress bar: invoiced vs uninvoiced */}
              {totalOutstandingReceivable > 0 && (
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
                    <div
                      className="h-full bg-amber-400 rounded-l-full transition-all"
                      style={{ width: `${Math.round((pendingReceivables / totalOutstandingReceivable) * 100)}%` }}
                    />
                    <div
                      className="h-full bg-[#1D9E75]/30 rounded-r-full transition-all"
                      style={{ width: `${Math.round((notYetInvoicedTotal / totalOutstandingReceivable) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />
                      Invoiced {Math.round((pendingReceivables / totalOutstandingReceivable) * 100)}%
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-sm bg-[#1D9E75]/40" />
                      Pipeline {Math.round((notYetInvoicedTotal / totalOutstandingReceivable) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* Col 2: Invoiced awaiting payment (Column O) */}
            <div className="md:px-6 py-4 md:py-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 mb-1">Invoiced — Awaiting Payment</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtTHBCompact(pendingReceivables)}</p>
              <p className="text-xs text-gray-400 mt-1">Column O — billed, payment not yet received</p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
                <Clock size={11} />
                Awaiting client payment
              </div>
            </div>
            {/* Col 3: Not yet invoiced (Column P) */}
            <div className="md:pl-6 pt-4 md:pt-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1D9E75] mb-1">Uninvoiced Pipeline</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtTHBCompact(notYetInvoicedTotal)}</p>
              <p className="text-xs text-gray-400 mt-1">Column P — milestones not yet billed</p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#1D9E75] font-medium">
                <TrendingUp size={11} />
                Future revenue to invoice
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly cash flow chart */}
      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-gray-800">
            {chartMode === 'historical' && 'Monthly Cash Flow — last 13 months (฿M)'}
            {chartMode === 'forecast' && 'Cash Flow Forecast — next 9 months (฿M)'}
            {chartMode === 'combined' && 'Cash Flow — last 3 months + next 6 months (฿M)'}
          </h2>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['historical', 'forecast', 'combined'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setChartMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  chartMode === mode
                    ? 'bg-white text-[#0f1923] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-[220px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* HISTORICAL MODE */}
            {chartMode === 'historical' && (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} barGap={2} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `฿${v}M`} />
                  <Tooltip
                    formatter={((value: number, name: string): [string, string] => [`฿${value.toFixed(2)}M`, name === 'inflow' ? 'Cash In' : 'Cash Out']) as RechartsTooltipFormatter}
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: 'none' }}
                  />
                  <Legend formatter={(value: string) => value === 'inflow' ? 'Cash In' : 'Cash Out'} iconType="square" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="inflow" fill="#1D9E75" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="outflow" fill="#E24B4A" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* FORECAST MODE */}
            {chartMode === 'forecast' && (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={forecastChartDataWithCum} barGap={2} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `฿${v}M`} />
                  <Tooltip
                    formatter={((value: number, name: string): [string, string] => [
                      `฿${value.toFixed(2)}M`,
                      name === 'inflow' ? 'Planned In'
                      : name === 'outflowColO' ? 'Invoiced — Awaiting Payment'
                      : name === 'outflowApproved' ? 'Committed (Approved POs)'
                      : name === 'outflowDraft' ? 'Committed (Draft POs)'
                      : name === 'outflowSimplePO' ? 'PO Outstanding Balance'
                      : 'Cumulative Net',
                    ]) as RechartsTooltipFormatter}
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: 'none' }}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === 'inflow' ? 'Planned In'
                      : value === 'outflowColO' ? 'Invoiced — Awaiting Payment'
                      : value === 'outflowApproved' ? 'Committed (Approved POs)'
                      : value === 'outflowDraft' ? 'Draft POs'
                      : value === 'outflowSimplePO' ? 'PO Outstanding Balance'
                      : 'Cumulative Net'
                    }
                    iconType="square"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="inflow" fill="#1D9E75" radius={[2, 2, 0, 0]} opacity={0.85} />
                  <Bar dataKey="outflowColO" stackId="out" fill="#E24B4A" opacity={0.85} radius={[0, 0, 0, 0]} name="outflowColO" />
                  <Bar dataKey="outflowApproved" stackId="out" fill="#E24B4A" opacity={0.65} radius={[0, 0, 0, 0]} name="outflowApproved" />
                  <Bar dataKey="outflowDraft" stackId="out" fill="#E24B4A" opacity={0.4} radius={[0, 0, 0, 0]} name="outflowDraft" />
                  <Bar dataKey="outflowSimplePO" stackId="out" fill="#E24B4A" opacity={0.25} radius={[2, 2, 0, 0]} name="outflowSimplePO" />
                  <Line type="monotone" dataKey="cumNet" stroke="#3B82F6" strokeWidth={2} dot={false} name="cumNet" />
                  <ReferenceLine y={0} stroke="#E24B4A" strokeDasharray="4 2" strokeWidth={1} />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            {/* COMBINED MODE */}
            {chartMode === 'combined' && (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={combinedChartData} barGap={2} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `฿${v}M`} />
                    <Tooltip
                      formatter={((value: number, name: string): [string, string] => [
                        `฿${value.toFixed(2)}M`,
                        name === 'inflow' ? 'Cash In / Planned In'
                        : name === 'outflowApproved' ? 'Committed Out (Approved)'
                        : 'Draft POs (unconfirmed)',
                      ]) as RechartsTooltipFormatter}
                      contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: 'none' }}
                    />
                    <Legend
                      formatter={(value: string) =>
                        value === 'inflow' ? 'Cash In / Planned In'
                        : value === 'outflowApproved' ? 'Committed Out'
                        : 'Draft POs (unconfirmed)'
                      }
                      iconType="square"
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine
                      x={format(now, 'MMM yy')}
                      stroke="#9ca3af"
                      strokeDasharray="4 2"
                      label={{ value: 'Today', position: 'top', fontSize: 10, fill: '#9ca3af' }}
                    />
                    <Bar
                      dataKey="inflow"
                      radius={[2, 2, 0, 0]}
                      shape={(props: { x?: number; y?: number; width?: number; height?: number; isForecast?: boolean }) => {
                        const { x = 0, y = 0, width = 0, height = 0, isForecast } = props;
                        return <rect x={x} y={y} width={width} height={height} fill="#1D9E75" opacity={isForecast ? 0.5 : 1} rx={2} />;
                      }}
                    />
                    <Bar
                      dataKey="outflowApproved"
                      stackId="out"
                      shape={(props: { x?: number; y?: number; width?: number; height?: number; isForecast?: boolean }) => {
                        const { x = 0, y = 0, width = 0, height = 0, isForecast } = props;
                        return <rect x={x} y={y} width={width} height={height} fill="#E24B4A" opacity={isForecast ? 0.5 : 1} />;
                      }}
                    />
                    <Bar
                      dataKey="outflowDraft"
                      stackId="out"
                      radius={[2, 2, 0, 0]}
                      shape={(props: { x?: number; y?: number; width?: number; height?: number; isForecast?: boolean }) => {
                        const { x = 0, y = 0, width = 0, height = 0, isForecast } = props;
                        return <rect x={x} y={y} width={width} height={height} fill="#E24B4A" opacity={isForecast ? 0.18 : 0.35} rx={2} />;
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-[11px] text-gray-400 mt-2 px-1">
                  Solid bars = actual · Faded bars = forecast based on planned milestone dates
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* Project cash positions + Approval queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Project cash positions table */}
        <div className="bg-white rounded-lg border border-black/[0.08] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold text-gray-800">
              Project Cash Positions
            </h2>
            <button
              onClick={() => navigate('/projects')}
              className="text-xs text-[#378ADD] hover:underline flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>

          {loading ? (
            <table className="w-full">
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={6} />
                ))}
              </tbody>
            </table>
          ) : projectCashPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <ArrowUpRight size={28} className="text-gray-300" />
              <p className="text-[13px] text-gray-400">No project cash activity yet</p>
              <button
                onClick={() => navigate('/projects')}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors"
              >
                Go to Projects
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 font-medium">Project</th>
                  <th className="text-right pb-2 font-medium">Received</th>
                  <th className="text-right pb-2 font-medium">Cost Paid</th>
                  <th className="text-right pb-2 font-medium">Next In</th>
                  <th className="text-right pb-2 font-medium">Next Out</th>
                  <th className="text-right pb-2 font-medium">30-Day Net</th>
                </tr>
              </thead>
              <tbody>
                {projectCashPositions.map(({ project, totalReceived, totalCostPaid }) => {
                  const nextIn = clientMilestonesAll
                    .filter(m => m.project_id === project.id && m.planned_receive_date)
                    .sort((a, b) => (a.planned_receive_date ?? '').localeCompare(b.planned_receive_date ?? ''))
                    [0];
                  const nextOut = poMilestonesAll
                    .filter(m => m.project_id === project.id && m.planned_payment_date)
                    .sort((a, b) => (a.planned_payment_date ?? '').localeCompare(b.planned_payment_date ?? ''))
                    [0];
                  const net30In = clientMilestonesAll
                    .filter(m => m.project_id === project.id && m.planned_receive_date && m.planned_receive_date <= thirtyDayKey)
                    .reduce((s, m) => s + m.payment_plan_amount, 0);
                  const net30Out = poMilestonesAll
                    .filter(m => m.project_id === project.id && m.planned_payment_date && m.planned_payment_date <= thirtyDayKey)
                    .reduce((s, m) => s + (m.amount_due - (m.paid_amount ?? 0)), 0);
                  const net30 = net30In - net30Out;
                  const isAtRisk = net30 < 0;

                  return (
                    <tr
                      key={project.id}
                      className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${isAtRisk ? 'bg-[#E24B4A]/5 hover:bg-[#E24B4A]/10' : 'hover:bg-[#F8F8F7]'}`}
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <td className="py-2.5 pr-3">
                        <p className="text-[13px] font-medium text-gray-800 truncate max-w-[120px]">
                          {project.name.split('–')[0].trim()}
                        </p>
                        <div className="mt-0.5">
                          <Badge label={PROJECT_STATUS_LABELS[project.status]} variant={statusVariant(project.status)} />
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-[13px] text-[#1D9E75] font-medium">
                        {fmtTHBCompact(totalReceived)}
                      </td>
                      <td className="py-2.5 text-right text-[13px] text-gray-500">
                        {fmtTHBCompact(totalCostPaid)}
                      </td>
                      <td className="py-2.5 text-right">
                        {nextIn ? (
                          <div>
                            <p className="text-[13px] font-medium text-[#1D9E75]">{fmtTHBCompact(nextIn.payment_plan_amount)}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(nextIn.planned_receive_date)}</p>
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        {nextOut ? (
                          <div>
                            <p className="text-[13px] font-medium text-[#E24B4A]">{fmtTHBCompact(nextOut.amount_due - (nextOut.paid_amount ?? 0))}</p>
                            <p className="text-[10px] text-gray-400">{formatDate(nextOut.planned_payment_date)}</p>
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isAtRisk && <AlertTriangle size={11} className="text-[#E24B4A]" />}
                          <span className={`text-[13px] font-semibold ${net30 >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                            {net30 >= 0 ? '+' : ''}{fmtTHBCompact(net30)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Approval queue preview */}
        <div className="bg-white rounded-lg border border-black/[0.08] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold text-gray-800">
              Approval Queue
            </h2>
            {[
              'construction_manager',
              'evp',
              'cost_controller',
              'accounts_supervisor',
              'accounts_manager',
            ].includes(profile?.role ?? '') && (
              <button
                onClick={() => navigate('/approvals')}
                className="text-xs text-[#378ADD] hover:underline flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg gap-2"
                >
                  <div className="flex-1 space-y-1.5">
                    <SkeletonLine w="w-2/3" />
                    <SkeletonLine w="w-1/3" h="h-2" />
                  </div>
                  <SkeletonLine w="w-16" h="h-5" />
                </div>
              ))}
            </div>
          ) : queueItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <CheckSquare size={28} className="text-gray-300" />
              <p className="text-[13px] text-gray-400">All clear — no pending items</p>
            </div>
          ) : (
            <div className="space-y-2">
              {queueItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate(item.href)}
                  className={`relative flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors overflow-hidden ${
                    item.done
                      ? 'bg-[#1D9E75]/5 border border-[#1D9E75]/20 hover:bg-[#1D9E75]/10'
                      : item.urgent
                      ? 'bg-amber-50 border border-amber-200 hover:bg-amber-100'
                      : 'bg-[#F8F8F7] hover:bg-gray-100'
                  }`}
                >
                  {/* Done diagonal stamp */}
                  {item.done && (
                    <div className="absolute -right-3 top-2 rotate-[32deg] bg-[#1D9E75] text-white text-[9px] font-bold px-5 py-0.5 tracking-widest shadow-sm">
                      DONE
                    </div>
                  )}
                  <div className="min-w-0 flex items-start gap-2">
                    {item.done ? (
                      <CheckSquare size={13} className="text-[#1D9E75] shrink-0 mt-0.5" />
                    ) : item.urgent ? (
                      <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    ) : null}
                    <div className="min-w-0">
                      <p className={`text-[13px] font-medium truncate max-w-[160px] ${item.done ? 'text-gray-500 line-through decoration-[#1D9E75]/50' : 'text-gray-800'}`}>
                        {item.label.split('–')[0].trim()}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 mr-6">
                    <Badge
                      label={item.done ? 'approved' : item.status.replace(/_/g, ' ')}
                      variant={item.done ? 'green' : item.urgent ? 'amber' : statusVariant(item.status)}
                    />
                  </div>
                </div>
              ))}
              {pendingCount > 4 && (
                <button
                  onClick={() => navigate('/approvals')}
                  className="w-full text-xs text-[#378ADD] hover:underline text-center pt-1"
                >
                  + {pendingCount - 4} more item{pendingCount - 4 !== 1 ? 's' : ''} — view all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loan summary */}
      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Landmark size={15} className="text-gray-400" />
            <h2 className="text-[13px] font-semibold text-gray-800">
              Loan Positions
            </h2>
          </div>
          {overdueLoanAmount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[#E24B4A] font-medium">
              <AlertTriangle size={12} />
              {fmtTHB(overdueLoanAmount)} overdue
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <SkeletonLine w="w-1/2" h="h-2.5" />
                {Array.from({ length: 2 }).map((_, j) => (
                  <div
                    key={j}
                    className="flex items-center justify-between p-2.5 border border-gray-100 rounded gap-2"
                  >
                    <SkeletonLine w="w-1/2" />
                    <SkeletonLine w="w-1/4" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : loansReceived.length === 0 && loansGiven.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <Landmark size={28} className="text-gray-200" />
            <p className="text-[13px] text-gray-400">No active loan positions</p>
            <button
              onClick={() => navigate('/loans')}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Go to Loan Ledger
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Loans received */}
            <div>
              <p className="text-xs text-gray-400 mb-2.5 font-medium uppercase tracking-wide">
                Loans Received
              </p>
              {loansReceived.length === 0 ? (
                <p className="text-xs text-gray-300 py-4 text-center">None</p>
              ) : (
                <div className="space-y-2">
                  {loansReceived.map((loan) => {
                    const isOverdue =
                      !!loan.due_date && new Date(loan.due_date) < now;
                    return (
                      <div
                        key={loan.id}
                        className={`flex items-center justify-between p-2.5 rounded-lg border ${
                          isOverdue
                            ? 'border-[#E24B4A]/30 bg-[#E24B4A]/5'
                            : 'border-gray-100'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-gray-700 truncate max-w-[140px]">
                            {(loan as Loan & { counterparty?: { name: string } })
                              .counterparty?.name ?? '—'}
                          </p>
                          <p
                            className={`text-xs mt-0.5 ${
                              isOverdue ? 'text-[#E24B4A]' : 'text-gray-400'
                            }`}
                          >
                            {loan.due_date ? formatDate(loan.due_date) : 'No due date'}
                            {isOverdue && ' · Overdue'}
                          </p>
                        </div>
                        <span
                          className={`text-[13px] font-semibold ${
                            isOverdue ? 'text-[#E24B4A]' : 'text-gray-700'
                          }`}
                        >
                          {fmtTHBCompact(loan.outstanding_balance)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Loans given */}
            <div>
              <p className="text-xs text-gray-400 mb-2.5 font-medium uppercase tracking-wide">
                Loans Given
              </p>
              {loansGiven.length === 0 ? (
                <p className="text-xs text-gray-300 py-4 text-center">None</p>
              ) : (
                <div className="space-y-2">
                  {loansGiven.map((loan) => (
                    <div
                      key={loan.id}
                      className="flex items-center justify-between p-2.5 border border-gray-100 rounded-lg"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-700 truncate max-w-[140px]">
                          {(loan as Loan & { counterparty?: { name: string } })
                            .counterparty?.name ?? '—'}
                        </p>
                        {loan.due_date && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Due {formatDate(loan.due_date)}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-[13px] font-semibold ${
                          loan.outstanding_balance > 0
                            ? 'text-[#1D9E75]'
                            : 'text-gray-400'
                        }`}
                      >
                        {fmtTHBCompact(loan.outstanding_balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
