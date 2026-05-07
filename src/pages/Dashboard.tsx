import { useEffect, useMemo, useState } from 'react';
import { VENDOR_INVOICE_UNPAID_STATUSES, VENDOR_INVOICE_PAID_STATUSES } from '../config/statusConstants';
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
  Building2,
  Plus,
  X,
  ChevronDown,
  Save,
} from 'lucide-react';
import { format } from 'date-fns';
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
import { FINANCE_ROLES, hasRole } from '../config/roles';
import { UninvoicedPipelineModal } from '../components/dashboard/UninvoicedPipelineModal';

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

interface SgaActual {
  id: string;
  year: number;
  month: number;
  amount: number;
  entered_by: string | null;
  entered_at: string | null;
}

interface TreasuryAdjustment {
  id: string;
  label: string;
  amount: number;
  fiscal_year: number;
  created_by: string | null;
  created_at: string | null;
}

interface ChartPaidInvoice {
  po_id: string | null;
  invoice_date: string | null;
  invoice_amount_incl_vat: number;
  milestones: { amount_due: number; planned_payment_date: string | null }[];
}

interface ChartReceivedInvoice {
  po_id: string | null;
  project_id: string | null;
  invoice_amount_incl_vat: number;
  received_amount: number;
  milestones: { amount_due: number; planned_payment_date: string | null }[];
}

interface ChartUninvoicedMilestone {
  purchase_order_id: string;
  project_id: string | null;
  amount_due: number;
  planned_payment_date: string | null;
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
    { project_id: string; net_paid: number; voucher_date: string | null }[]
  >([]);
  const [pendingClientInvoices, setPendingClientInvoices] = useState<
    { project_id: string; pending_amount: number; invoice_date: string | null }[]
  >([]);
  const [pendingReceivablesSum, setPendingReceivablesSum] = useState(0);
  const [projectViewCounts, setProjectViewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<'historical' | 'forecast' | 'combined'>('historical');
  const [clientMilestonesAll, setClientMilestonesAll] = useState<
    { id: string; project_id: string; payment_plan_amount: number; planned_receive_date: string | null; status: string }[]
  >([]);
  const [activePOsTotal, setActivePOsTotal] = useState(0);

  // Treasury Waterfall state
  const [sgaActuals, setSgaActuals] = useState<SgaActual[]>([]);
  const [treasuryAdjustments, setTreasuryAdjustments] = useState<TreasuryAdjustment[]>([]);
  const [sgaMonthly, setSgaMonthly] = useState(3_500_000);
  const [sgaMonths, setSgaMonths] = useState(24);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(new Date().getFullYear());
  const [adjLabel, setAdjLabel] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [sgaSaving, setSgaSaving] = useState<Record<string, boolean>>({});
  const [sgaEditValues, setSgaEditValues] = useState<Record<string, string>>({});

  // Chart-specific state — uses the same pivot-table data model
  const [chartPaidInvoices, setChartPaidInvoices] = useState<ChartPaidInvoice[]>([]);
  const [chartReceivedInvoices, setChartReceivedInvoices] = useState<ChartReceivedInvoice[]>([]);
  const [chartUninvoicedMilestones, setChartUninvoicedMilestones] = useState<ChartUninvoicedMilestone[]>([]);

  // Pipeline modal state
  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);

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
        { data: ciAll, error: e2 },
        { data: voucs, error: e3 },
        { data: lns, error: e4 },
        { data: reports, error: e5 },
        { data: costings, error: e6 },
        { data: viewRows },
        { data: cmAll, error: e7 },
        { data: chartPaidRaw },
        { data: chartReceivedRaw },
        { data: chartMilestonesRaw },
        { data: chartAllInvoicesRaw },
        { data: activePORaw },
        { data: sgaActualsRaw },
        { data: treasuryAdjustmentsRaw },
        { data: loanTxRaw },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('*, client:entities!client_entity_id(*)')
          .order('created_at'),
        // Single query covers both receipt history and pending receivables
        supabase
          .from('client_invoices')
          .select('project_id, received_amount, pending_amount, receipt_date, invoice_date, client_milestone_id'),
        // Single query — issued-voucher subset derived in JS from this result
        supabase
          .from('payment_vouchers')
          .select('id, project_id, net_paid, status, ceo_notified, voucher_no, voucher_date')
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
          .from('client_milestones')
          .select('id, project_id, payment_plan_amount, planned_receive_date, status')
          .neq('status', 'received'),
        // Chart-specific: paid invoices with milestone relations (mirrors MonthlyAnalysis pivot)
        supabase
          .from('vendor_invoices')
          .select('po_id, invoice_date, invoice_amount_incl_vat, purchase_order:purchase_orders(milestones:po_milestones(amount_due, planned_payment_date))')
          .in('status', VENDOR_INVOICE_PAID_STATUSES),
        // Chart-specific: unpaid invoices (full pipeline) with milestone relations (mirrors MonthlyAnalysisBalance pivot)
        supabase
          .from('vendor_invoices')
          .select('po_id, invoice_amount_incl_vat, received_amount, purchase_order:purchase_orders(project_id, milestones:po_milestones(amount_due, planned_payment_date))')
          .in('status', VENDOR_INVOICE_UNPAID_STATUSES),
        // Chart-specific: all po_milestones for uninvoiced matching (mirrors MonthlyAnalysisUninvoiced)
        supabase
          .from('po_milestones')
          .select('purchase_order_id, amount_due, planned_payment_date, purchase_order:purchase_orders!purchase_order_id(project_id)')
          .order('planned_payment_date', { ascending: true, nullsFirst: false }),
        // Chart-specific: all vendor_invoices amounts for uninvoiced subtraction
        supabase
          .from('vendor_invoices')
          .select('po_id, invoice_amount_incl_vat'),
        // CEO Metric: active purchase orders for lifetime commitment total
        supabase
          .from('purchase_orders')
          .select('id, po_amount_incl_vat, status')
          .not('status', 'in', '(cancelled,voided)'),
        // Treasury: SG&A actuals entered by finance team
        supabase
          .from('sga_actuals')
          .select('id, year, month, amount, entered_by, entered_at')
          .order('year', { ascending: true })
          .order('month', { ascending: true }),
        // Treasury: one-time corporate adjustments
        supabase
          .from('treasury_adjustments')
          .select('id, label, amount, fiscal_year, created_by, created_at')
          .order('created_at', { ascending: false }),
        // Flat fetch bypasses nested-join RLS; stitched into loans in JS below
        supabase
          .from('loan_transactions')
          .select('loan_id, cash_flow_direction, amount'),
      ]);

      const firstError = e1 || e2 || e3 || e4 || e5 || e6 || e7;
      if (firstError) throw firstError;

      const viewMap: Record<string, number> = {};
      (viewRows ?? []).forEach((r: { project_id: string; view_count: number }) => {
        viewMap[r.project_id] = r.view_count;
      });

      // Split the consolidated client_invoices result into the two logical sets
      type CiRow = { project_id: string; received_amount: number; pending_amount: number; receipt_date: string | null; invoice_date: string | null; client_milestone_id: string | null };
      const ciRows = (ciAll ?? []) as CiRow[];
      const ciReceiptRows = ciRows.filter(r => r.received_amount > 0);
      const ciPendingRows = ciRows.filter(r => r.pending_amount > 0);

      // Derive issued vouchers from the single payment_vouchers result
      const voucherRows = voucs ?? [];
      const issuedVouchers = voucherRows
        .filter(v => v.status === 'issued' && v.net_paid > 0)
        .map(v => ({ project_id: v.project_id ?? '', net_paid: v.net_paid, voucher_date: v.voucher_date }))
        .filter(v => v.project_id !== '');

      // Stitch flat loan_transactions into their parent loans by loan_id
      type LoanTxRow = { loan_id: string; cash_flow_direction: string; amount: number };
      const txByLoanId = new Map<string, LoanTxRow[]>();
      (loanTxRaw ?? []).forEach((tx: LoanTxRow) => {
        const bucket = txByLoanId.get(tx.loan_id) ?? [];
        bucket.push(tx);
        txByLoanId.set(tx.loan_id, bucket);
      });
      const loansWithTx = (lns ?? []).map((l: Loan) => ({
        ...l,
        loan_transactions: txByLoanId.get(l.id) ?? [],
      }));

      setProjects(proj ?? []);
      setClientInvoiceReceipts(ciReceiptRows);
      setVouchers(voucherRows);
      setLoans(loansWithTx);
      setPendingReports(reports ?? []);
      setPendingCostings((costings as unknown as ProjectCosting[]) ?? []);
      setProjectViewCounts(viewMap);
      setVendorInvoicePaid(issuedVouchers);
      setPendingClientInvoices(ciPendingRows);
      setPendingReceivablesSum(ciPendingRows.reduce((s, r) => s + (r.pending_amount ?? 0), 0));
      setClientMilestonesAll((cmAll ?? []) as typeof clientMilestonesAll);
      setActivePOsTotal(
        ((activePORaw ?? []) as { po_amount_incl_vat: number }[])
          .reduce((s, po) => s + Number(po.po_amount_incl_vat || 0), 0)
      );

      // Chart data — normalize nested milestone arrays
      setChartPaidInvoices(
        (chartPaidRaw ?? []).map((vi: any) => ({
          po_id: vi.po_id,
          invoice_date: vi.invoice_date,
          invoice_amount_incl_vat: vi.invoice_amount_incl_vat,
          milestones: vi.purchase_order?.milestones ?? [],
        }))
      );
      setChartReceivedInvoices(
        (chartReceivedRaw ?? []).map((vi: any) => ({
          po_id: vi.po_id,
          project_id: vi.purchase_order?.project_id ?? null,
          invoice_amount_incl_vat: vi.invoice_amount_incl_vat,
          received_amount: vi.received_amount ?? 0,
          milestones: vi.purchase_order?.milestones ?? [],
        }))
      );
      // Compute uninvoiced milestones using 1:1 matching (same as MonthlyAnalysisUninvoiced)
      const allInvoicesForChart = (chartAllInvoicesRaw ?? []) as { po_id: string | null; invoice_amount_incl_vat: number }[];
      const allMsForChart = (chartMilestonesRaw ?? []) as { purchase_order_id: string; amount_due: number; planned_payment_date: string | null; purchase_order: { project_id: string } | null }[];
      const availableByKey2 = new Map<string, number[]>();
      allMsForChart.forEach((m, idx) => {
        const key = `${m.purchase_order_id}::${Number(m.amount_due).toFixed(2)}`;
        if (!availableByKey2.has(key)) availableByKey2.set(key, []);
        availableByKey2.get(key)!.push(idx);
      });
      const consumed2 = new Set<number>();
      for (const inv of allInvoicesForChart) {
        if (!inv.po_id) continue;
        const key = `${inv.po_id}::${Number(inv.invoice_amount_incl_vat).toFixed(2)}`;
        const avail = availableByKey2.get(key);
        if (avail && avail.length > 0) consumed2.add(avail.shift()!);
      }
      setChartUninvoicedMilestones(
        allMsForChart
          .filter((_, idx) => !consumed2.has(idx))
          .filter(m => Number(m.amount_due) > 0)
          .map(m => ({
            purchase_order_id: m.purchase_order_id,
            project_id: m.purchase_order?.project_id ?? null,
            amount_due: m.amount_due,
            planned_payment_date: m.planned_payment_date,
          }))
      );

      setSgaActuals((sgaActualsRaw ?? []) as SgaActual[]);
      setTreasuryAdjustments((treasuryAdjustmentsRaw ?? []) as TreasuryAdjustment[]);

      // Seed edit values with existing actuals (only if not already edited by user)
      const editSeed: Record<string, string> = {};
      ((sgaActualsRaw ?? []) as SgaActual[]).forEach(a => {
        editSeed[`${a.year}-${a.month}`] = String(a.amount);
      });
      setSgaEditValues(prev => {
        const merged = { ...editSeed };
        Object.keys(prev).forEach(k => { if (prev[k] !== '') merged[k] = prev[k]; });
        return merged;
      });
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

  // ── CEO Metric: Lifetime Project Margin ──────────────────────────────────
  const totalCommitments = activePOsTotal;
  const lifetimeMargin = totalContractValue - totalCommitments;

  const totalReceivedThisYear = clientInvoiceReceipts
    .filter((r) => r.receipt_date && r.receipt_date >= yearStart)
    .reduce((s, r) => s + r.received_amount, 0);

  // ── Outstanding Receivable ────────────────────────────────────────────────
  // Col O (receivable): client invoices pending payment — same as pending_amount sum
  const pendingReceivables = pendingReceivablesSum;

  // Col P (receivable): client milestones not yet invoiced (status = 'pending')
  const notYetInvoicedTotal = clientMilestonesAll
    .filter(m => m.status === 'pending')
    .reduce((s, m) => s + m.payment_plan_amount, 0);

  // Total Outstanding Receivable = Col O + Col P
  const totalOutstandingReceivable = pendingReceivables + notYetInvoicedTotal;

  // ── Outstanding Payable ───────────────────────────────────────────────────
  // Col O (payable): vendor invoices received but not yet paid — exact balance
  // Uses the same chartReceivedInvoices array that drives the Invoice Balance pivot table.
  const colO_Cost = chartReceivedInvoices.reduce(
    (s, inv) => s + Math.max(0, Number(inv.invoice_amount_incl_vat) - Number(inv.received_amount ?? 0)),
    0,
  );

  // Col P (payable): uninvoiced PO milestones that survived the 1:1 matching algorithm
  // Uses the same chartUninvoicedMilestones array that drives the Yet-to-Invoice pivot table.
  const colP1_Cost = chartUninvoicedMilestones.reduce((s, m) => s + Number(m.amount_due), 0);

  // Total Outstanding Payable = Col O + Col P (pivot-table exact match, no estimation gap)
  const totalOutstandingPayable = colO_Cost + colP1_Cost;

  // Net Exposure: positive = receivables exceed payables (good), negative = payables exceed receivables (risk)
  const trueExposure = totalOutstandingReceivable - totalOutstandingPayable;

  // ── Shared chart helpers — mirrors pivot table roll-forward logic ─────────
  const chartCurrentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const chartPrevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);

  function chartRollForwardKey(dateStr: string | null): string {
    const fallback = dateStr ?? now.toISOString().slice(0, 10);
    const d = new Date(fallback);
    const effective = d < chartCurrentMonthStart ? chartPrevMonthDate : d;
    return format(effective, 'yyyy-MM');
  }

  // ── 1:1 milestone matching for paid invoices (Historical Cash Out) ────────
  // Mirrors MonthlyAnalysis.tsx exactly.
  const chartHistoricalByMonth = useMemo(() => {
    const pool = new Map<string, Map<string, { planned_payment_date: string | null }[]>>();
    for (const inv of chartPaidInvoices) {
      if (!inv.po_id) continue;
      if (!pool.has(inv.po_id)) pool.set(inv.po_id, new Map());
      const poPool = pool.get(inv.po_id)!;
      const sorted = [...inv.milestones].sort((a, b) => {
        if (!a.planned_payment_date) return 1;
        if (!b.planned_payment_date) return -1;
        return a.planned_payment_date.localeCompare(b.planned_payment_date);
      });
      for (const m of sorted) {
        const k = Number(m.amount_due).toFixed(2);
        if (!poPool.has(k)) poPool.set(k, []);
        poPool.get(k)!.push({ planned_payment_date: m.planned_payment_date });
      }
    }
    const byMonth = new Map<string, number>();
    for (const inv of chartPaidInvoices) {
      let assignedDate: string | null = inv.invoice_date;
      if (inv.po_id) {
        const poPool = pool.get(inv.po_id);
        if (poPool) {
          const k = Number(inv.invoice_amount_incl_vat).toFixed(2);
          const cands = poPool.get(k);
          if (cands && cands.length > 0) {
            const matched = cands.shift()!;
            // Cap future-dated milestones to invoice_date for historical paid
            const isFuture = matched.planned_payment_date && new Date(matched.planned_payment_date) > now;
            assignedDate = isFuture ? inv.invoice_date : (matched.planned_payment_date ?? inv.invoice_date);
          }
        }
      }
      if (!assignedDate) continue;
      const mk = assignedDate.slice(0, 7);
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + Number(inv.invoice_amount_incl_vat));
    }
    return byMonth;
  }, [chartPaidInvoices, now]);

  // ── 1:1 milestone matching for received invoices (Forecast Balance / Col O) ─
  // Mirrors MonthlyAnalysisBalance.tsx with roll-forward.
  const chartBalanceByMonth = useMemo(() => {
    const pool = new Map<string, Map<string, { planned_payment_date: string | null }[]>>();
    for (const inv of chartReceivedInvoices) {
      if (!inv.po_id) continue;
      if (!pool.has(inv.po_id)) pool.set(inv.po_id, new Map());
      const poPool = pool.get(inv.po_id)!;
      const sorted = [...inv.milestones].sort((a, b) => {
        if (!a.planned_payment_date) return 1;
        if (!b.planned_payment_date) return -1;
        return a.planned_payment_date.localeCompare(b.planned_payment_date);
      });
      for (const m of sorted) {
        const k = Number(m.amount_due).toFixed(2);
        if (!poPool.has(k)) poPool.set(k, []);
        poPool.get(k)!.push({ planned_payment_date: m.planned_payment_date });
      }
    }
    const byMonth = new Map<string, number>();
    for (const inv of chartReceivedInvoices) {
      const balance = Number(inv.invoice_amount_incl_vat) - Number(inv.received_amount ?? 0);
      if (balance <= 0) continue;
      let assignedDate: string | null = null;
      if (inv.po_id) {
        const poPool = pool.get(inv.po_id);
        if (poPool) {
          const k = Number(inv.invoice_amount_incl_vat).toFixed(2);
          const cands = poPool.get(k);
          if (cands && cands.length > 0) assignedDate = cands.shift()!.planned_payment_date;
        }
      }
      const mk = chartRollForwardKey(assignedDate);
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + balance);
    }
    return byMonth;
  }, [chartReceivedInvoices, now]);

  // ── Uninvoiced milestones (Forecast Yet-to-Invoice) with roll-forward ─────
  // Mirrors MonthlyAnalysisUninvoiced.tsx.
  const chartUninvoicedByMonth = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const m of chartUninvoicedMilestones) {
      const mk = chartRollForwardKey(m.planned_payment_date);
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + Number(m.amount_due));
    }
    return byMonth;
  }, [chartUninvoicedMilestones, now]);

  // ── Build unified month key list (all months that appear in any dataset) ──
  const allChartKeys = new Set<string>([
    ...chartHistoricalByMonth.keys(),
    ...chartBalanceByMonth.keys(),
    ...chartUninvoicedByMonth.keys(),
    ...clientMilestonesAll
      .filter(m => m.planned_receive_date)
      .map(m => m.planned_receive_date!.slice(0, 7)),
  ]);
  const sortedChartKeys = [...allChartKeys].sort();

  // ── Historical chart: all months that have paid invoice data ─────────────
  const historicalKeys = [...chartHistoricalByMonth.keys()].sort();
  const chartData: MonthlyBar[] = historicalKeys.map(key => {
    const inflow = clientInvoiceReceipts
      .filter(r => r.receipt_date?.startsWith(key))
      .reduce((s, r) => s + r.received_amount / 1_000_000, 0);
    const outflow = (chartHistoricalByMonth.get(key) ?? 0) / 1_000_000;
    return {
      month: format(new Date(key + '-15'), 'MMM yy'),
      inflow: +inflow.toFixed(2),
      outflow: +outflow.toFixed(2),
    };
  });

  // ── Forecast Cash In by month — apply same overdue sweep as Cash Out ─────
  const forecastCashInByMonth = (() => {
    const map = new Map<string, number>();
    for (const m of clientMilestonesAll) {
      if (!m.planned_receive_date) continue;
      const mk = chartRollForwardKey(m.planned_receive_date);
      map.set(mk, (map.get(mk) ?? 0) + m.payment_plan_amount);
    }
    return map;
  })();

  // ── Forecast chart: previous month (backlog bucket) through end of all forecast data ─
  const prevMonthKey = format(chartPrevMonthDate, 'yyyy-MM');
  // Include all keys from Cash In + Cash Out maps
  const allForecastKeys = new Set([
    ...forecastCashInByMonth.keys(),
    ...chartBalanceByMonth.keys(),
    ...chartUninvoicedByMonth.keys(),
  ]);
  const forecastRangeKeys = [...new Set([prevMonthKey, ...sortedChartKeys, ...allForecastKeys])].sort();

  const forecastChartDataWithCum = (() => {
    let cumNet = 0;
    return forecastRangeKeys.map(key => {
      const inflow = (forecastCashInByMonth.get(key) ?? 0) / 1_000_000;
      const outflowBalance = (chartBalanceByMonth.get(key) ?? 0) / 1_000_000;
      const outflowUninvoiced = (chartUninvoicedByMonth.get(key) ?? 0) / 1_000_000;
      const totalOut = outflowBalance + outflowUninvoiced;
      cumNet += inflow - totalOut;
      return {
        month: format(new Date(key + '-15'), 'MMM yy'),
        key,
        inflow: +inflow.toFixed(2),
        outflowBalance: +outflowBalance.toFixed(2),
        outflowUninvoiced: +outflowUninvoiced.toFixed(2),
        cumNet: +cumNet.toFixed(2),
      };
    }).filter(d => d.inflow > 0 || d.outflowBalance > 0 || d.outflowUninvoiced > 0);
  })();

  // ── Combined chart: historical months + forecast months ──────────────────
  const combinedHistoricalKeys = historicalKeys.filter(k => k < format(now, 'yyyy-MM'));
  const combinedForecastKeys = forecastRangeKeys;

  // Historical Cash In by month (actual receipts)
  const historicalCashInByMonth = (() => {
    const map = new Map<string, number>();
    for (const r of clientInvoiceReceipts) {
      if (!r.receipt_date) continue;
      const mk = r.receipt_date.slice(0, 7);
      map.set(mk, (map.get(mk) ?? 0) + r.received_amount);
    }
    return map;
  })();

  const combinedChartData = [
    ...combinedHistoricalKeys.map(key => ({
      month: format(new Date(key + '-15'), 'MMM yy'),
      key,
      inflow: +((historicalCashInByMonth.get(key) ?? 0) / 1_000_000).toFixed(2),
      outflowBalance: +((chartHistoricalByMonth.get(key) ?? 0) / 1_000_000).toFixed(2),
      outflowUninvoiced: 0,
      isForecast: false,
    })),
    ...combinedForecastKeys.map(key => {
      const inflow = (forecastCashInByMonth.get(key) ?? 0) / 1_000_000;
      const outflowBalance = (chartBalanceByMonth.get(key) ?? 0) / 1_000_000;
      const outflowUninvoiced = (chartUninvoicedByMonth.get(key) ?? 0) / 1_000_000;
      return {
        month: format(new Date(key + '-15'), 'MMM yy'),
        key,
        inflow: +inflow.toFixed(2),
        outflowBalance: +outflowBalance.toFixed(2),
        outflowUninvoiced: +outflowUninvoiced.toFixed(2),
        isForecast: true,
      };
    }),
  ].filter(d => d.inflow > 0 || d.outflowBalance > 0 || d.outflowUninvoiced > 0);

  // ── 90-day net position ───────────────────────────────────────────────
  const ninetyDaysFromNow = new Date(now);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
  const ninetyDayKey = format(ninetyDaysFromNow, 'yyyy-MM-dd');

  // Pending client invoices are outstanding receivables due now — always counted in 90-day window
  const pendingClientInvoicesTotal = pendingClientInvoices.reduce((s, i) => s + i.pending_amount, 0);

  const plannedInflow90 =
    [...forecastCashInByMonth.entries()]
      .filter(([k]) => k <= ninetyDayKey.slice(0, 7))
      .reduce((s, [, v]) => s + v, 0)
    + pendingClientInvoicesTotal;

  // Col O (balance) items due within 90 days — from chartBalanceByMonth (received invoices)
  const balanceOutflow90 = [...chartBalanceByMonth.entries()]
    .filter(([k]) => k <= ninetyDayKey.slice(0, 7))
    .reduce((s, [, v]) => s + v, 0);

  // Col P (uninvoiced) items due within 90 days — from chartUninvoicedMilestones
  const uninvoicedOutflow90 = chartUninvoicedMilestones
    .filter(m => m.planned_payment_date && m.planned_payment_date <= ninetyDayKey)
    .reduce((s, m) => s + Number(m.amount_due), 0);

  const plannedOutflow90 = balanceOutflow90 + uninvoicedOutflow90;

  const netPosition90 = plannedInflow90 - plannedOutflow90;

  const thirtyDayKey = format(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  const projectsAtRisk = projects.filter(p => {
    const nextIn = clientMilestonesAll
      .filter(m => m.project_id === p.id && m.planned_receive_date && m.planned_receive_date <= thirtyDayKey)
      .reduce((s, m) => s + m.payment_plan_amount, 0);
    // Use chartRawMilestones scoped to project POs for outflow estimate
    const nextOut = chartUninvoicedMilestones
      .filter(m => m.project_id === p.id && m.planned_payment_date && m.planned_payment_date <= thirtyDayKey)
      .reduce((s, m) => s + Number(m.amount_due), 0);
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
        .reduce((s, r) => s + Number(r.received_amount), 0);
      const paid = vendorInvoicePaid
        .filter((vi) => vi.project_id === project.id)
        .reduce((s, vi) => s + Number(vi.net_paid), 0);
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
  // Loan positions — event-sourced via loan_transactions.cash_flow_direction
  // ---------------------------------------------------------------------------

  // Net Liability for a borrowing facility:
  //   cash IN (drawdowns received) minus cash OUT (repayments made)
  function calcNetLiability(loan: Loan): number {
    return (loan.loan_transactions ?? []).reduce((acc, tx) => {
      if (tx.cash_flow_direction === 'in') return acc + Number(tx.amount);
      if (tx.cash_flow_direction === 'out') return acc - Number(tx.amount);
      return acc;
    }, 0);
  }

  // Net Asset for a lending facility:
  //   cash OUT (loans disbursed) minus cash IN (repayments received back)
  function calcNetAsset(loan: Loan): number {
    return (loan.loan_transactions ?? []).reduce((acc, tx) => {
      if (tx.cash_flow_direction === 'out') return acc + Number(tx.amount);
      if (tx.cash_flow_direction === 'in') return acc - Number(tx.amount);
      return acc;
    }, 0);
  }

  const borrowingFacilities = loans.filter(l => l.facility_type === 'borrowing');
  const lendingFacilities = loans.filter(l => l.facility_type === 'lending');

  const loansReceived = borrowingFacilities.filter(l => calcNetLiability(l) > 0);
  const loansGiven = lendingFacilities;

  const overdueLoans = loansReceived.filter(
    (l) => l.due_date && new Date(l.due_date) < now,
  );
  const overdueLoanAmount = overdueLoans.reduce(
    (s, l) => s + calcNetLiability(l),
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
  // Treasury Waterfall calculations
  // ---------------------------------------------------------------------------

  // Historical cash from Jan 2025 — total actually received from clients
  const TREASURY_START = '2025-01-01';
  const historicalCashIn = clientInvoiceReceipts
    .filter(r => r.receipt_date && r.receipt_date >= TREASURY_START)
    .reduce((s, r) => s + Number(r.received_amount), 0);

  // Historical cash out — issued payment vouchers from Jan 2025
  const historicalCashOut = vendorInvoicePaid
    .filter(v => v.voucher_date && v.voucher_date >= TREASURY_START)
    .reduce((s, v) => s + Number(v.net_paid), 0);

  const historicalProjectNet = historicalCashIn - historicalCashOut;

  // Future net = outstanding receivable minus outstanding payable
  const futureProjectNet = totalOutstandingReceivable - totalOutstandingPayable;

  // Net Liability = total outstanding debt across all borrowing facilities
  const totalNetLiability = borrowingFacilities.reduce((s, l) => s + calcNetLiability(l), 0);
  // Net Asset = total outstanding receivable across all lending facilities
  const totalNetAsset = lendingFacilities.reduce((s, l) => s + calcNetAsset(l), 0);
  // Net financing cash = liabilities minus assets (positive = net cash received from borrowing, negative = net cash deployed as lender)
  const netFinancingCash = totalNetLiability - totalNetAsset;

  // SG&A hybrid: use actuals where entered, projection for the rest
  // Build a map of year-month -> actual for fast lookup
  const sgaActualMap = new Map(sgaActuals.map(a => [`${a.year}-${a.month}`, a.amount]));
  const sgaWindowStart = new Date(2025, 0, 1);
  const sgaWindowEnd = new Date(now.getFullYear(), now.getMonth() + sgaMonths, 1);
  let sgaActualTotal = 0;
  let sgaProjectedTotal = 0;
  let sgaActualMonthCount = 0;
  let sgaProjectedMonthCount = 0;
  const cur = new Date(sgaWindowStart);
  while (cur < sgaWindowEnd) {
    const key = `${cur.getFullYear()}-${cur.getMonth() + 1}`;
    const actual = sgaActualMap.get(key);
    if (actual != null) {
      sgaActualTotal += Number(actual);
      sgaActualMonthCount++;
    } else {
      sgaProjectedTotal += sgaMonthly;
      sgaProjectedMonthCount++;
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  const totalSgaBurn = sgaActualTotal + sgaProjectedTotal;

  // Adjustments total (all years)
  const adjustmentsTotal = treasuryAdjustments.reduce((s, a) => s + Number(a.amount), 0);
  const selectedYearAdjustments = treasuryAdjustments.filter(a => a.fiscal_year === selectedFiscalYear);

  // Bottom line
  const projectedEndingCash = netFinancingCash + adjustmentsTotal + historicalProjectNet + futureProjectNet - totalSgaBurn;

  // Treasury mutation helpers
  async function addAdjustment() {
    const amt = parseFloat(adjAmount);
    if (!adjLabel.trim() || isNaN(amt)) return;
    setAdjSaving(true);
    await supabase.from('treasury_adjustments').insert({
      label: adjLabel.trim(),
      amount: amt,
      fiscal_year: selectedFiscalYear,
      created_by: user?.id ?? null,
    });
    setAdjLabel('');
    setAdjAmount('');
    setAdjSaving(false);
    loadData();
  }

  async function deleteAdjustment(id: string) {
    await supabase.from('treasury_adjustments').delete().eq('id', id);
    loadData();
  }

  async function saveSgaActual(year: number, month: number) {
    const key = `${year}-${month}`;
    const val = parseFloat(sgaEditValues[key] ?? '');
    if (isNaN(val)) return;
    setSgaSaving(prev => ({ ...prev, [key]: true }));
    await supabase.from('sga_actuals').upsert(
      { year, month, amount: val, entered_by: user?.id ?? null },
      { onConflict: 'year,month' }
    );
    setSgaSaving(prev => ({ ...prev, [key]: false }));
    loadData();
  }

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

      {/* Row 3 — Payables Pipeline */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <MetricCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-black/[0.08] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-gray-400" />
            <h2 className="text-[13px] font-semibold text-gray-800">Payables Pipeline</h2>
            <span className="text-xs text-gray-400 ml-1">— what we still owe across active projects</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Col 1: Total outstanding payable */}
            <div className="md:pr-6 pb-4 md:pb-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Total Outstanding Payable</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtTHBCompact(totalOutstandingPayable)}</p>
              <p className="text-xs text-gray-400 mt-1">Col O + Col P — ties to Monthly Analyzer pivot tables</p>
              {totalOutstandingPayable > 0 && (
                <div className="mt-3">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
                    <div
                      className="h-full bg-[#E24B4A] rounded-l-full transition-all"
                      style={{ width: `${Math.round((colO_Cost / totalOutstandingPayable) * 100)}%` }}
                    />
                    <div
                      className="h-full bg-amber-400 rounded-r-full transition-all"
                      style={{ width: `${Math.round((colP1_Cost / totalOutstandingPayable) * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-sm bg-[#E24B4A]" />
                      Invoice Balance {Math.round((colO_Cost / totalOutstandingPayable) * 100)}%
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />
                      Yet to Invoice {Math.round((colP1_Cost / totalOutstandingPayable) * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
            {/* Col 2: Invoiced — awaiting payment (Column O) */}
            <div className="md:px-6 py-4 md:py-0">
              {colO_Cost > 0 ? (
                <div className="relative p-4 -mx-4 rounded-xl overflow-hidden shadow-sm">
                  {/* Spinning comet-tail border */}
                  <div
                    className="absolute -inset-[150%] bg-[conic-gradient(from_0deg,transparent_0_340deg,#E24B4A_360deg)]"
                    style={{ animation: 'spin 1.5s linear 3 forwards' }}
                  />
                  {/* Inner white mask */}
                  <div className="absolute inset-[2px] bg-white rounded-xl border border-[#E24B4A]/20" />
                  {/* Content */}
                  <div className="relative z-10">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#E24B4A] mb-1">
                      Supplier Invoiced — Unpaid
                    </p>
                    <p className="text-2xl font-bold text-gray-900 tabular-nums">
                      {fmtTHBCompact(colO_Cost)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Column O — invoiced by supplier, unpaid
                    </p>
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#E24B4A] font-medium">
                      <Clock size={11} className="animate-pulse" />
                      Awaiting payment processing
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 -mx-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                    Supplier Invoiced — Unpaid
                  </p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">฿0</p>
                  <p className="text-xs text-gray-400 mt-1">Column O — invoiced by supplier, unpaid</p>
                </div>
              )}
            </div>
            {/* Col 3: Yet to Invoice (Column P) — clickable to open pipeline modal */}
            <div
              className="md:pl-6 pt-4 md:pt-0 cursor-pointer rounded-lg p-3 -m-3 hover:bg-amber-50 transition-colors group"
              onClick={() => setIsPipelineModalOpen(true)}
              title="Click to view Yet to Invoice pipeline breakdown"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 mb-1">Yet to Invoice (Col P)</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums group-hover:text-amber-700 transition-colors">{fmtTHBCompact(colP1_Cost)}</p>
              <p className="text-xs text-gray-400 mt-1">PO milestones not yet invoiced — 1:1 matched</p>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
                <Clock size={11} />
                Click to view full pipeline
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CEO Metric: Lifetime Project Margin */}
      {!loading && profile?.role === 'ceo' && (
        <div className={`rounded-lg border p-5 ${lifetimeMargin >= 0 ? 'bg-[#1D9E75]/5 border-[#1D9E75]/25' : 'bg-[#E24B4A]/5 border-[#E24B4A]/25'}`}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className={lifetimeMargin >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'} />
            <h2 className="text-[13px] font-semibold text-gray-800">CEO Metric — Lifetime Project Margin</h2>
            <span className="text-xs text-gray-400 ml-1">Absolute contract economics — total signed revenue minus total committed costs</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-black/[0.06] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1D9E75] mb-1">Total Contract Value</p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{fmtTHBCompact(totalContractValue)}</p>
              <p className="text-xs text-gray-400 mt-1">Total expected cash in (all signed client contracts)</p>
              <div className="mt-2 space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Collected to date</span>
                  <span className="font-medium text-gray-700">{fmtTHBCompact(clientInvoiceReceipts.reduce((s, r) => s + r.received_amount, 0))}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Remaining to collect</span>
                  <span className="font-medium text-gray-700">{fmtTHBCompact(totalOutstandingReceivable)}</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-black/[0.06] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#E24B4A] mb-1">Total PO Commitments</p>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{fmtTHBCompact(totalCommitments)}</p>
              <p className="text-xs text-gray-400 mt-1">Total expected cash out (all approved supplier POs)</p>
              <div className="mt-2 space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Paid to suppliers</span>
                  <span className="font-medium text-gray-700">{fmtTHBCompact(vendorInvoicePaid.reduce((s, v) => s + v.net_paid, 0))}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400">Remaining to pay</span>
                  <span className="font-medium text-gray-700">{fmtTHBCompact(totalOutstandingPayable)}</span>
                </div>
              </div>
            </div>
            <div className={`rounded-lg border p-4 ${lifetimeMargin >= 0 ? 'bg-[#1D9E75]/8 border-[#1D9E75]/30' : 'bg-[#E24B4A]/8 border-[#E24B4A]/30'}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Lifetime Net Margin</p>
              <p className={`text-xl font-bold tabular-nums ${lifetimeMargin >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                {lifetimeMargin >= 0 ? '+' : ''}{fmtTHBCompact(lifetimeMargin)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {lifetimeMargin >= 0
                  ? 'Contracts exceed commitments — project portfolio is profitable'
                  : 'Commitments exceed contracts — portfolio margin is negative'}
              </p>
              {totalContractValue > 0 && (
                <p className="text-[11px] font-semibold mt-2" style={{ color: lifetimeMargin >= 0 ? '#1D9E75' : '#E24B4A' }}>
                  {((lifetimeMargin / totalContractValue) * 100).toFixed(1)}% margin
                </p>
              )}
            </div>
          </div>

          {/* Forward Margin banner — remaining cash flow from today onwards */}
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Label */}
              <div className="flex items-center gap-2 min-w-0">
                <ArrowRight size={13} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Forward Margin — Remaining Cash Flow</p>
                  <p className="text-xs text-gray-400 mt-0.5">All uninvoiced receivables and unpaid payables still ahead of today</p>
                </div>
              </div>

              {/* Equation row */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Remaining In */}
                <div className="bg-white rounded border border-black/[0.06] px-3 py-2 text-center min-w-[130px]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#1D9E75] mb-0.5">Remaining to Collect</p>
                  <p className="text-[15px] font-bold text-gray-900 tabular-nums">{fmtTHBCompact(totalOutstandingReceivable)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Client invoices + milestones</p>
                </div>

                <span className="text-lg font-light text-gray-300">−</span>

                {/* Remaining Out */}
                <div className="bg-white rounded border border-black/[0.06] px-3 py-2 text-center min-w-[130px]">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#E24B4A] mb-0.5">Remaining to Pay</p>
                  <p className="text-[15px] font-bold text-gray-900 tabular-nums">{fmtTHBCompact(totalOutstandingPayable)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Vendor invoices + PO milestones</p>
                </div>

                <span className="text-lg font-light text-gray-300">=</span>

                {/* Forward Margin result */}
                <div className={`rounded border px-3 py-2 text-center min-w-[130px] ${trueExposure >= 0 ? 'bg-[#1D9E75]/8 border-[#1D9E75]/30' : 'bg-[#E24B4A]/8 border-[#E24B4A]/30'}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Forward Margin</p>
                  <p className={`text-[15px] font-bold tabular-nums ${trueExposure >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {trueExposure >= 0 ? '+' : ''}{fmtTHBCompact(trueExposure)}
                  </p>
                  {totalOutstandingReceivable > 0 && (
                    <p className={`text-[10px] font-semibold mt-0.5 ${trueExposure >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                      {((trueExposure / totalOutstandingReceivable) * 100).toFixed(1)}% of remaining revenue
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Treasury Cash Waterfall — CEO and Accounts Manager */}
      {!loading && (profile?.role === 'ceo' || profile?.role === 'accounts_manager') && (
        <div className="bg-white rounded-lg border border-black/[0.08] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#0f1923]">
            <div className="flex items-center gap-2.5">
              <Building2 size={15} className="text-white/60" />
              <h2 className="text-[13px] font-semibold text-white">Treasury Cash Waterfall</h2>
              <span className="text-xs text-white/40 ml-1">— projected bank balance when all active projects complete</span>
            </div>
            {/* Fiscal year selector for adjustments */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/50">Adjustments Year:</span>
              <div className="relative">
                <select
                  value={selectedFiscalYear}
                  onChange={e => setSelectedFiscalYear(Number(e.target.value))}
                  className="appearance-none text-xs bg-white/10 text-white border border-white/20 rounded-md px-2.5 py-1 pr-6 cursor-pointer focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027, 2028].map(y => (
                    <option key={y} value={y} className="text-gray-900 bg-white">{y}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Four-column grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

            {/* Column 1 — Financing */}
            <div className="p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Financing Position</p>
              {/* Net position headline */}
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Net financing cash</p>
                <p className={`text-xl font-bold tabular-nums ${netFinancingCash >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {netFinancingCash >= 0 ? '+' : ''}{fmtTHBCompact(netFinancingCash)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Lending assets minus borrowing liabilities</p>
              </div>
              {/* Net Liability — borrowings */}
              {totalNetLiability > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-md p-2.5">
                  <p className="text-[11px] text-amber-700 font-medium">Net Liability (Borrowings)</p>
                  <p className="text-sm font-bold text-amber-800 tabular-nums">{fmtTHBCompact(totalNetLiability)}</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">Outstanding debt — must be repaid</p>
                </div>
              )}
              {/* Net Asset — lending */}
              {totalNetAsset > 0 && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-md p-2.5">
                  <p className="text-[11px] text-emerald-700 font-medium">Net Asset (Lending)</p>
                  <p className="text-sm font-bold text-emerald-800 tabular-nums">{fmtTHBCompact(totalNetAsset)}</p>
                  <p className="text-[10px] text-emerald-600 mt-0.5">Outstanding receivable from borrowers</p>
                </div>
              )}
              {borrowingFacilities.length === 0 && lendingFacilities.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-3">No facilities recorded</p>
              )}
            </div>

            {/* Column 2 — One-Time Adjustments */}
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">One-Time Adjustments</p>
                <span className="text-[10px] text-gray-400">{selectedFiscalYear}</span>
              </div>

              {/* List of adjustments for selected year */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedYearAdjustments.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center py-3">No adjustments for {selectedFiscalYear}</p>
                ) : (
                  selectedYearAdjustments.map(adj => (
                    <div key={adj.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-gray-50 group">
                      <span className="text-xs text-gray-700 truncate flex-1">{adj.label}</span>
                      <span className={`text-xs font-semibold tabular-nums shrink-0 ${Number(adj.amount) >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                        {Number(adj.amount) >= 0 ? '+' : ''}{fmtTHBCompact(Number(adj.amount))}
                      </span>
                      <button
                        onClick={() => deleteAdjustment(adj.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-[#E24B4A] shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Subtotal for selected year */}
              {selectedYearAdjustments.length > 0 && (
                <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                  <span className="text-[10px] text-gray-400">{selectedFiscalYear} subtotal</span>
                  <span className={`text-xs font-bold tabular-nums ${selectedYearAdjustments.reduce((s, a) => s + Number(a.amount), 0) >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {selectedYearAdjustments.reduce((s, a) => s + Number(a.amount), 0) >= 0 ? '+' : ''}
                    {fmtTHBCompact(selectedYearAdjustments.reduce((s, a) => s + Number(a.amount), 0))}
                  </span>
                </div>
              )}

              {/* Add adjustment form */}
              <div className="space-y-1.5 pt-1 border-t border-gray-100">
                <input
                  type="text"
                  placeholder="Label (e.g. Old Project Debt)"
                  value={adjLabel}
                  onChange={e => setAdjLabel(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder-gray-300"
                />
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    placeholder="Amount (negative = deduction)"
                    value={adjAmount}
                    onChange={e => setAdjAmount(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder-gray-300"
                  />
                  <button
                    onClick={addAdjustment}
                    disabled={adjSaving || !adjLabel.trim() || !adjAmount}
                    className="shrink-0 flex items-center gap-1 text-xs bg-[#0f1923] text-white px-2.5 py-1.5 rounded-md hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={11} />
                    Add
                  </button>
                </div>
              </div>

              {/* All-years total note */}
              {treasuryAdjustments.length > 0 && (
                <p className="text-[10px] text-gray-400">
                  All-years net: <span className={`font-semibold ${adjustmentsTotal >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {adjustmentsTotal >= 0 ? '+' : ''}{fmtTHBCompact(adjustmentsTotal)}
                  </span>
                </p>
              )}
            </div>

            {/* Column 3 — Project Operations */}
            <div className="p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Project Operations</p>

              <div className="space-y-2">
                {/* Historical */}
                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Historical (Jan 2025 – Today)</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Cash in from clients</span>
                      <span className="font-medium text-[#1D9E75] tabular-nums">{fmtTHBCompact(historicalCashIn)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Cash out to suppliers</span>
                      <span className="font-medium text-[#E24B4A] tabular-nums">({fmtTHBCompact(historicalCashOut)})</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-gray-200 pt-1 mt-1">
                      <span className="font-semibold text-gray-700">Historical Net</span>
                      <span className={`font-bold tabular-nums ${historicalProjectNet >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                        {historicalProjectNet >= 0 ? '+' : ''}{fmtTHBCompact(historicalProjectNet)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Future */}
                <div className="bg-gray-50 rounded-md p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Projected (Remaining Work)</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Outstanding receivable</span>
                      <span className="font-medium text-[#1D9E75] tabular-nums">{fmtTHBCompact(totalOutstandingReceivable)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Outstanding payable</span>
                      <span className="font-medium text-[#E24B4A] tabular-nums">({fmtTHBCompact(totalOutstandingPayable)})</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-gray-200 pt-1 mt-1">
                      <span className="font-semibold text-gray-700">Future Net</span>
                      <span className={`font-bold tabular-nums ${futureProjectNet >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                        {futureProjectNet >= 0 ? '+' : ''}{fmtTHBCompact(futureProjectNet)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-1 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-700">Total Project Contribution</span>
                <span className={`text-sm font-bold tabular-nums ${(historicalProjectNet + futureProjectNet) >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {(historicalProjectNet + futureProjectNet) >= 0 ? '+' : ''}{fmtTHBCompact(historicalProjectNet + futureProjectNet)}
                </span>
              </div>
            </div>

            {/* Column 4 — SG&A Overhead */}
            <div className="p-5 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Corporate SG&A</p>

              {/* CEO projection inputs */}
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wide">Monthly Estimate (฿)</label>
                  <input
                    type="number"
                    value={sgaMonthly}
                    onChange={e => setSgaMonthly(Number(e.target.value))}
                    className="mt-1 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300 tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 uppercase tracking-wide">Estimated Months Remaining</label>
                  <input
                    type="number"
                    value={sgaMonths}
                    onChange={e => setSgaMonths(Number(e.target.value))}
                    className="mt-1 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300 tabular-nums"
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-md p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">{sgaActualMonthCount} actual months</span>
                  <span className="font-medium text-gray-700 tabular-nums">{fmtTHBCompact(sgaActualTotal)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">{sgaProjectedMonthCount} estimated months</span>
                  <span className="font-medium text-gray-500 tabular-nums">{fmtTHBCompact(sgaProjectedTotal)}</span>
                </div>
                <div className="flex justify-between text-xs border-t border-gray-200 pt-1">
                  <span className="font-semibold text-gray-700">Total SG&A Burn</span>
                  <span className="font-bold text-[#E24B4A] tabular-nums">({fmtTHBCompact(totalSgaBurn)})</span>
                </div>
              </div>

              {/* Monthly actuals entry — Finance roles only */}
              {hasRole(profile?.role, FINANCE_ROLES) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Enter Monthly Actuals</p>
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                    {(() => {
                      const rows = [];
                      const d = new Date(2025, 0, 1);
                      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                      while (d < end) {
                        const y = d.getFullYear();
                        const m = d.getMonth() + 1;
                        const key = `${y}-${m}`;
                        const hasActual = sgaActualMap.has(key);
                        const monthLabel = format(new Date(y, m - 1, 1), 'MMM yyyy');
                        rows.push(
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400 w-16 shrink-0">{monthLabel}</span>
                            <input
                              type="number"
                              value={sgaEditValues[key] ?? ''}
                              onChange={e => setSgaEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                              placeholder={hasActual ? String(sgaActualMap.get(key)) : 'Estimate'}
                              className={`flex-1 text-[11px] border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-300 tabular-nums ${hasActual ? 'border-[#1D9E75]/40 bg-[#1D9E75]/5' : 'border-gray-200'}`}
                            />
                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${hasActual ? 'bg-[#1D9E75]/10 text-[#1D9E75]' : 'bg-gray-100 text-gray-400'}`}>
                              {hasActual ? 'ACT' : 'EST'}
                            </span>
                            <button
                              onClick={() => saveSgaActual(y, m)}
                              disabled={!!sgaSaving[key]}
                              className="shrink-0 text-gray-300 hover:text-[#1D9E75] disabled:opacity-40 transition-colors"
                            >
                              <Save size={11} />
                            </button>
                          </div>
                        );
                        d.setMonth(d.getMonth() + 1);
                      }
                      return rows;
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Full-width bottom line */}
          <div className={`px-6 py-5 border-t-2 ${projectedEndingCash >= 0 ? 'border-[#1D9E75]/30 bg-[#1D9E75]/5' : 'border-[#E24B4A]/30 bg-[#E24B4A]/5'}`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Projected Ending Cash Position</p>
                <p className="text-[10px] text-gray-400">Net Financing + Adjustments + Project Cash − SG&A</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold tabular-nums ${projectedEndingCash >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {projectedEndingCash >= 0 ? '+' : ''}{fmtTHB(projectedEndingCash)}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {projectedEndingCash >= 0 ? 'Positive balance when all active projects complete' : 'Cash shortfall — review SG&A or adjust timeline'}
                </p>
              </div>
            </div>
            {/* Breakdown pills */}
            <div className="flex flex-wrap gap-2 mt-4">
              {[
                { label: 'Financing', value: netFinancingCash },
                { label: 'Adjustments', value: adjustmentsTotal },
                { label: 'Historical Project', value: historicalProjectNet },
                { label: 'Future Project', value: futureProjectNet },
                { label: 'SG&A Burn', value: -totalSgaBurn },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5 bg-white/70 border border-gray-100 rounded-full px-3 py-1">
                  <span className="text-[10px] text-gray-500">{item.label}:</span>
                  <span className={`text-[10px] font-semibold tabular-nums ${item.value >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                    {item.value >= 0 ? '+' : ''}{fmtTHBCompact(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Monthly cash flow chart */}
      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-gray-800">
            {chartMode === 'historical' && 'Monthly Cash Flow — by Expected Payment Month (฿M)'}
            {chartMode === 'forecast' && 'Cash Flow Forecast — Balances + Yet-to-Invoice by Expected Month (฿M)'}
            {chartMode === 'combined' && 'Cash Flow — Historical + Forecast (฿M)'}
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
                    formatter={((value: number, name: string): [string, string] => [`฿${value.toFixed(1)}M`, name === 'inflow' ? 'Cash In' : 'Cash Out (Expected Month)']) as RechartsTooltipFormatter}
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: 'none' }}
                  />
                  <Legend formatter={(value: string) => value === 'inflow' ? 'Cash In' : 'Cash Out (Expected Month)'} iconType="square" wrapperStyle={{ fontSize: 12 }} />
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
                      `฿${value.toFixed(1)}M`,
                      name === 'inflow' ? 'Planned Cash In'
                      : name === 'outflowBalance' ? 'Invoice Balance (Col O)'
                      : name === 'outflowUninvoiced' ? 'Yet to Invoice (Col P)'
                      : 'Cumulative Net',
                    ]) as RechartsTooltipFormatter}
                    contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: 'none' }}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === 'inflow' ? 'Planned Cash In'
                      : value === 'outflowBalance' ? 'Invoice Balance (Col O)'
                      : value === 'outflowUninvoiced' ? 'Yet to Invoice (Col P)'
                      : 'Cumulative Net'
                    }
                    iconType="square"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="inflow" fill="#1D9E75" radius={[2, 2, 0, 0]} opacity={0.9} />
                  <Bar dataKey="outflowBalance" stackId="out" fill="#E24B4A" opacity={0.9} radius={[0, 0, 0, 0]} name="outflowBalance" />
                  <Bar dataKey="outflowUninvoiced" stackId="out" fill="#E24B4A" opacity={0.45} radius={[2, 2, 0, 0]} name="outflowUninvoiced" />
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
                        `฿${value.toFixed(1)}M`,
                        name === 'inflow' ? 'Cash In / Planned In'
                        : name === 'outflowBalance' ? 'Invoice Balance (Col O)'
                        : 'Yet to Invoice (Col P)',
                      ]) as RechartsTooltipFormatter}
                      contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: 'none' }}
                    />
                    <Legend
                      formatter={(value: string) =>
                        value === 'inflow' ? 'Cash In / Planned In'
                        : value === 'outflowBalance' ? 'Invoice Balance (Col O)'
                        : 'Yet to Invoice (Col P)'
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
                      dataKey="outflowBalance"
                      stackId="out"
                      shape={(props: { x?: number; y?: number; width?: number; height?: number; isForecast?: boolean }) => {
                        const { x = 0, y = 0, width = 0, height = 0, isForecast } = props;
                        return <rect x={x} y={y} width={width} height={height} fill="#E24B4A" opacity={isForecast ? 0.9 : 1} />;
                      }}
                    />
                    <Bar
                      dataKey="outflowUninvoiced"
                      stackId="out"
                      radius={[2, 2, 0, 0]}
                      shape={(props: { x?: number; y?: number; width?: number; height?: number; isForecast?: boolean }) => {
                        const { x = 0, y = 0, width = 0, height = 0, isForecast } = props;
                        return <rect x={x} y={y} width={width} height={height} fill="#E24B4A" opacity={isForecast ? 0.45 : 0.35} rx={2} />;
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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Project cash positions table */}
        <div className="xl:col-span-2 bg-white rounded-lg border border-black/[0.08] p-5">
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
                  <th className="text-right pb-2 font-medium">30-Day In</th>
                  <th className="text-right pb-2 font-medium">30-Day Out</th>
                  <th className="text-right pb-2 font-medium">30-Day Net</th>
                </tr>
              </thead>
              <tbody>
                {projectCashPositions.map(({ project, totalReceived, totalCostPaid }) => {
                  const projPendingInvsTotal = pendingClientInvoices
                    .filter(i => i.project_id === project.id)
                    .reduce((s, i) => s + i.pending_amount, 0);
                  // Col O balance: received-but-unpaid invoices for this project
                  const projReceivedInvoices = chartReceivedInvoices.filter(inv => inv.project_id === project.id);
                  const projBalanceInvoicesTotal = projReceivedInvoices
                    .reduce((s, inv) => s + Math.max(0, Number(inv.invoice_amount_incl_vat) - Number(inv.received_amount ?? 0)), 0);
                  // Uninvoiced milestones for this project
                  const projUninvoiced = chartUninvoicedMilestones.filter(m => m.project_id === project.id);
                  const net30In =
                    clientMilestonesAll
                      .filter(m => m.project_id === project.id && m.planned_receive_date && m.planned_receive_date <= thirtyDayKey)
                      .reduce((s, m) => s + m.payment_plan_amount, 0)
                    + projPendingInvsTotal;
                  const net30Out =
                    projUninvoiced
                      .filter(m => m.planned_payment_date && m.planned_payment_date <= thirtyDayKey)
                      .reduce((s, m) => s + Number(m.amount_due), 0)
                    + projBalanceInvoicesTotal;
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
                        {net30In > 0 ? (
                          <div>
                            <p className="text-[13px] font-medium text-[#1D9E75]">{fmtTHBCompact(net30In)}</p>
                            {projPendingInvsTotal > 0 && (
                              <p className="text-[10px] text-amber-600/70">incl. awaiting pmt</p>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        {net30Out > 0 ? (
                          <div>
                            <p className="text-[13px] font-medium text-[#E24B4A]">{fmtTHBCompact(net30Out)}</p>
                            {projBalanceInvoicesTotal > 0 && (
                              <p className="text-[10px] text-[#E24B4A]/70">incl. supplier inv.</p>
                            )}
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
        <div className="xl:col-span-1 bg-white rounded-lg border border-black/[0.08] p-5">
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
                  <div className="min-w-0 flex items-start gap-2 flex-1">
                    {item.done ? (
                      <CheckSquare size={13} className="text-[#1D9E75] shrink-0 mt-0.5" />
                    ) : item.urgent ? (
                      <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-medium truncate ${item.done ? 'text-gray-500 line-through decoration-[#1D9E75]/50' : 'text-gray-800'}`}>
                        {item.label.split('–')[0].trim()}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{item.sub}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mr-5">
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

      {/* Yet to Invoice pipeline modal */}
      <UninvoicedPipelineModal
        isOpen={isPipelineModalOpen}
        onClose={() => setIsPipelineModalOpen(false)}
        projectId="ALL"
      />

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
              onClick={() => navigate('/treasury')}
              className="text-xs px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Go to Treasury
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
                    const balance = calcNetLiability(loan);
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
                            {loan.name ?? loan.counterparty?.name ?? '—'}
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
                          {fmtTHBCompact(balance)}
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
                  {loansGiven.map((loan) => {
                    const balance = calcNetAsset(loan);
                    return (
                      <div
                        key={loan.id}
                        className="flex items-center justify-between p-2.5 border border-gray-100 rounded-lg"
                      >
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-gray-700 truncate max-w-[140px]">
                            {loan.name ?? loan.counterparty?.name ?? '—'}
                          </p>
                          {loan.due_date && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              Due {formatDate(loan.due_date)}
                            </p>
                          )}
                        </div>
                        <span
                          className={`text-[13px] font-semibold ${
                            balance > 0 ? 'text-[#1D9E75]' : 'text-gray-400'
                          }`}
                        >
                          {fmtTHBCompact(balance)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
