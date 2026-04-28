import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  GripVertical,
  X,
  Check,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  addWeeks,
  addDays,
  parseISO,
  isSameWeek,
} from 'date-fns';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { VendorInvoice, Project, fmtTHB, fmtTHBCompact } from '../types';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Existing kanban types (unchanged)
// ---------------------------------------------------------------------------

interface ClientMilestoneRow {
  id: string;
  project_id: string;
  milestone_number: number;
  milestone_pct: number;
  payment_plan_amount: number;
  planned_receive_date: string | null;
  status: string;
  project?: Project;
}

type CardType = 'milestone' | 'invoice';

interface DraggableCard {
  id: string;
  type: CardType;
  projectName: string;
  projectId: string;
  amount: number;
  weekDate: Date | null;
  milestoneNo?: number;
  milestonePercent?: number;
  vendorName?: string;
  rawMilestone?: ClientMilestoneRow;
  rawInvoice?: VendorInvoice & { vendor?: { name: string }; project?: Project };
}

interface WeekColumn {
  weekStart: Date;
  weekEnd: Date;
  weekIndex: number;
  label: string;
  incomeCards: DraggableCard[];
  paymentCards: DraggableCard[];
  openingBalance: number;
  incomeTotal: number;
  paymentTotal: number;
  closingBalance: number;
}

interface WarningModal {
  open: boolean;
  weekLabel: string;
  weekIndex: number;
  pendingCard: DraggableCard | null;
  pendingTargetWeekStart: Date | null;
}

interface MessageOverride {
  text: string;
  color: 'green' | 'red';
}

// ---------------------------------------------------------------------------
// Chart types
// ---------------------------------------------------------------------------

interface ChartPaidInvoice {
  po_id: string | null;
  invoice_date: string | null;
  invoice_amount_incl_vat: number;
  milestones: { amount_due: number; planned_payment_date: string | null }[];
}

interface ChartReceivedInvoice {
  po_id: string | null;
  invoice_amount_incl_vat: number;
  received_amount: number;
  milestones: { amount_due: number; planned_payment_date: string | null }[];
}

interface ChartUninvoicedMs {
  purchase_order_id: string;
  amount_due: number;
  planned_payment_date: string | null;
}

interface ChartClientMs {
  payment_plan_amount: number;
  planned_receive_date: string | null;
}

interface ChartBar {
  month: string; // MMM-yy label
  key: string;   // yyyy-MM
  cashIn: number;
  outflowBalance: number;
  outflowUninvoiced: number;
  cumNet: number;
}

type ChartMode = 'historical' | 'forecast' | 'combined';

// ---------------------------------------------------------------------------
// Tooltip formatter type
// ---------------------------------------------------------------------------

type RechartsTooltipFormatter = (value: number, name: string) => [string, string];

// ---------------------------------------------------------------------------
// Pulse animation style
// ---------------------------------------------------------------------------

const PULSE_STYLE = `
@keyframes pulseBorder {
  0%   { border-left-color: rgba(226, 75, 74, 1); }
  50%  { border-left-color: rgba(226, 75, 74, 0.2); }
  100% { border-left-color: rgba(226, 75, 74, 1); }
}
.pulse-border {
  border-left: 3px solid rgba(226, 75, 74, 1) !important;
  animation: pulseBorder 1.5s ease-in-out infinite;
}
`;

// ---------------------------------------------------------------------------
// Chart helper: 1:1 milestone matching pool builder
// Returns Map<po_id, Map<amount_key, milestone[]>>
// ---------------------------------------------------------------------------

function buildMilestonePool(
  invoices: { po_id: string | null; milestones: { amount_due: number; planned_payment_date: string | null }[] }[]
): Map<string, Map<string, { planned_payment_date: string | null }[]>> {
  const pool = new Map<string, Map<string, { planned_payment_date: string | null }[]>>();
  for (const inv of invoices) {
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
  return pool;
}

// ---------------------------------------------------------------------------
// Kanban sub-components (unchanged from original)
// ---------------------------------------------------------------------------

function DraggableCardComponent({
  card,
  isDragOverlay,
}: {
  card: DraggableCard;
  isDragOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  });

  const isIncome = card.type === 'milestone';

  return (
    <div
      ref={setNodeRef}
      className={`
        relative flex items-start gap-2 rounded-md p-2.5 mb-1.5 bg-white shadow-sm
        ${isIncome
          ? 'border-l-4 border-l-[#1D9E75] border border-gray-100'
          : 'border-l-4 border-l-[#EF9F27] border border-gray-100'
        }
        ${isDragOverlay ? 'shadow-xl ring-2 ring-[#378ADD]/30 rotate-1 opacity-95' : ''}
        ${isDragging ? 'opacity-30' : ''}
        cursor-grab active:cursor-grabbing select-none
      `}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={14} className="mt-0.5 flex-shrink-0 text-gray-300" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#0f1923] truncate leading-tight">
          {card.projectName}
        </p>
        {isIncome ? (
          <p className="text-xs text-gray-500 leading-tight mt-0.5">
            Milestone {card.milestoneNo} · {card.milestonePercent}%
          </p>
        ) : (
          <p className="text-xs text-gray-500 leading-tight mt-0.5 truncate">
            {card.vendorName}
          </p>
        )}
        <p className={`text-xs font-bold mt-1 ${isIncome ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
          {isIncome ? '+' : '-'}{fmtTHBCompact(card.amount)}
        </p>
      </div>
    </div>
  );
}

function WeekColumnDropZone({
  col,
  weekKey,
  isOver,
  showBanner,
  onDismissBanner,
}: {
  col: WeekColumn;
  weekKey: string;
  isOver: boolean;
  showBanner: boolean;
  onDismissBanner: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `week-drop-${col.weekIndex}`,
    data: { weekIndex: col.weekIndex },
  });

  const isNegative = col.closingBalance < 0;
  const isLow = !isNegative && col.closingBalance <= 5_000_000;
  const balStyle = getClosingBalanceStyle(col.closingBalance);

  return (
    <div className="w-56 flex-shrink-0">
      <div
        className={`rounded-t-lg px-3 py-2.5 ${
          isNegative ? 'bg-[#E24B4A] text-white' : 'bg-[#0f1923] text-white'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {isNegative && (
            <div className="relative group">
              <AlertTriangle size={13} className="flex-shrink-0 cursor-default" />
              <div className="absolute left-0 top-5 z-20 hidden group-hover:block w-48 bg-[#0f1923] text-white text-xs rounded-lg p-2 shadow-lg border border-white/10">
                This week has a projected cash deficit of -฿{Math.abs(col.closingBalance).toLocaleString('en-US', { maximumFractionDigits: 0 })}. Drag payments to other weeks to resolve.
              </div>
            </div>
          )}
          <p className="text-xs font-semibold leading-tight flex-1">{col.label}</p>
          {isNegative && (
            <div className="relative group ml-1">
              <span
                className="text-xs font-bold cursor-default px-0.5 rounded-sm"
                style={{ color: '#E24B4A', background: 'rgba(255,255,255,0.9)' }}
              >
                ⚠
              </span>
              <div className="absolute right-0 top-5 z-20 hidden group-hover:block w-48 bg-[#0f1923] text-white text-xs rounded-lg p-2 shadow-lg border border-white/10">
                This week has a projected cash deficit of -฿{Math.abs(col.closingBalance).toLocaleString('en-US', { maximumFractionDigits: 0 })}. Drag payments to other weeks to resolve.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg px-3 py-2 mb-2">
        <div className="flex justify-between items-center py-0.5">
          <span className="text-xs text-gray-500">Opening</span>
          <span className="text-xs font-semibold text-[#0f1923]">{fmtTHBCompact(col.openingBalance)}</span>
        </div>
        <div className="flex justify-between items-center py-0.5">
          <span className="text-xs text-gray-500">Income</span>
          <span className="text-xs font-semibold text-[#1D9E75]">{fmtTHBCompact(col.incomeTotal)}</span>
        </div>
        <div className="flex justify-between items-center py-0.5">
          <span className="text-xs text-gray-500">Payments</span>
          <span className="text-xs font-semibold text-[#E24B4A]">{fmtTHBCompact(col.paymentTotal)}</span>
        </div>
        <div className="border-t border-gray-100 mt-1 pt-1">
          <div
            className={`flex justify-between items-center py-1 px-2 rounded ${balStyle.pulse ? 'pulse-border' : ''}`}
            style={{
              background: balStyle.bg,
              borderLeft: balStyle.pulse ? undefined : `3px solid ${isLow ? '#EF9F27' : isNegative ? '#E24B4A' : '#1D9E75'}`,
            }}
            title={balStyle.tooltip}
          >
            <span className="text-xs text-gray-500">Closing</span>
            <span
              className="text-xs"
              style={{ color: balStyle.text, fontWeight: balStyle.bold ? 700 : 600 }}
            >
              {balStyle.label}
            </span>
          </div>
        </div>
      </div>

      {showBanner && (
        <div className="mx-1 mb-2 rounded-md border border-[#E24B4A] p-2" style={{ background: '#FFEBEE' }}>
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs font-bold text-[#E24B4A]">Cash deficit this week</p>
            <button onClick={onDismissBanner} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
              <X size={12} />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            ฿{Math.abs(col.closingBalance).toLocaleString('en-US', { maximumFractionDigits: 0 })} shortfall
          </p>
          <p className="text-xs text-gray-400 mt-1 leading-snug">
            Move a payment to a later week or bring forward a client receipt to resolve.
          </p>
        </div>
      )}

      <div
        ref={setNodeRef}
        className={`min-h-[120px] rounded-lg transition-colors ${
          isOver ? 'bg-[#1D9E75]/8 ring-2 ring-[#1D9E75]/40 ring-inset' : ''
        }`}
      >
        {col.incomeCards.length > 0 && (
          <div className="mb-1">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1 flex items-center gap-1">
              <TrendingUp size={10} className="text-[#1D9E75]" />
              Income
            </p>
            {col.incomeCards.map((card) => (
              <DraggableCardComponent key={card.id} card={card} />
            ))}
          </div>
        )}

        {col.paymentCards.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1 flex items-center gap-1">
              <TrendingDown size={10} className="text-[#EF9F27]" />
              Payments
            </p>
            {col.paymentCards.map((card) => (
              <DraggableCardComponent key={card.id} card={card} />
            ))}
          </div>
        )}

        {col.incomeCards.length === 0 && col.paymentCards.length === 0 && (
          <div className={`border-2 border-dashed rounded-lg h-20 flex items-center justify-center transition-colors ${isOver ? 'border-[#1D9E75]/50' : 'border-gray-200'}`}>
            <p className={`text-xs ${isOver ? 'text-[#1D9E75]' : 'text-gray-300'}`}>
              {isOver ? 'Release to schedule here' : 'Drop here'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function UnscheduledDropZone({ cards }: { cards: DraggableCard[] }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled-drop',
    data: { weekIndex: -1 },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-wrap gap-2 min-h-[80px] rounded-lg transition-colors p-2 -m-2 ${
        isOver ? 'bg-[#EF9F27]/8 ring-2 ring-[#EF9F27]/40 ring-inset' : ''
      }`}
    >
      {cards.map((card) => (
        <div key={card.id} className="w-52">
          <DraggableCardComponent card={card} />
        </div>
      ))}
      {cards.length === 0 && (
        <div className={`border-2 border-dashed rounded-lg w-full h-16 flex items-center justify-center transition-colors ${isOver ? 'border-[#EF9F27]/50' : 'border-gray-200'}`}>
          <p className={`text-xs ${isOver ? 'text-[#EF9F27]' : 'text-gray-300'}`}>
            {isOver ? 'Drop to unschedule' : 'No unscheduled items'}
          </p>
        </div>
      )}
    </div>
  );
}

function getClosingBalanceStyle(balance: number): {
  bg: string;
  text: string;
  label: string;
  bold: boolean;
  pulse: boolean;
  tooltip?: string;
} {
  if (balance > 5_000_000) {
    return { bg: '#E8F5E9', text: '#1D9E75', label: fmtTHBCompact(balance), bold: false, pulse: false };
  } else if (balance >= 0) {
    return {
      bg: '#FFF8E1',
      text: '#EF9F27',
      label: `${fmtTHBCompact(balance)} — low`,
      bold: false,
      pulse: false,
      tooltip: 'Cash position is below ฿5M this week. Consider moving a payment or bringing forward income.',
    };
  } else {
    return {
      bg: '#FFEBEE',
      text: '#E24B4A',
      label: `-฿${Math.abs(balance).toLocaleString('en-US', { maximumFractionDigits: 0 })} DEFICIT`,
      bold: true,
      pulse: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CashFlowPlanner() {
  useAuth();

  // ── Kanban state (unchanged) ─────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<ClientMilestoneRow[]>([]);
  const [invoices, setInvoices] = useState<(VendorInvoice & { vendor?: { name: string }; project?: Project })[]>([]);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [totalVouchersPaid, setTotalVouchersPaid] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [activeCard, setActiveCard] = useState<DraggableCard | null>(null);
  const [overWeekIndex, setOverWeekIndex] = useState<number | null>(null);
  const [warningModal, setWarningModal] = useState<WarningModal>({
    open: false,
    weekLabel: '',
    weekIndex: -1,
    pendingCard: null,
    pendingTargetWeekStart: null,
  });
  const [dismissedWeeks, setDismissedWeeks] = useState<Set<string>>(new Set());
  const [messageOverride, setMessageOverride] = useState<MessageOverride | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Chart state ──────────────────────────────────────────────────────────
  const [chartMode, setChartMode] = useState<ChartMode>('forecast');
  const [chartLoading, setChartLoading] = useState(true);
  const [paidInvoices, setPaidInvoices] = useState<ChartPaidInvoice[]>([]);
  const [receivedInvoices, setReceivedInvoices] = useState<ChartReceivedInvoice[]>([]);
  const [uninvoicedMs, setUninvoicedMs] = useState<ChartUninvoicedMs[]>([]);
  const [clientMs, setClientMs] = useState<ChartClientMs[]>([]);
  const [clientReceipts, setClientReceipts] = useState<{ received_amount: number; receipt_date: string | null }[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const weekStarts = Array.from({ length: 8 }, (_, i) =>
    startOfWeek(addWeeks(new Date(), i), { weekStartsOn: 1 })
  );

  useEffect(() => {
    loadData();
    loadChartData();
  }, []);

  // ── Kanban data load (unchanged) ─────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    const [projectsRes, milestonesRes, invoicesRes, receiptsRes, vouchersRes] = await Promise.all([
      supabase.from('projects').select('*').order('name'),
      supabase
        .from('client_milestones')
        .select('id, project_id, milestone_number, milestone_pct, payment_plan_amount, planned_receive_date, status, project:projects(*)')
        .neq('status', 'received'),
      supabase
        .from('vendor_invoices')
        .select('*, vendor:entities!vendor_id(name), project:projects(*), purchase_order:purchase_orders(*)')
        .in('status', ['released', 'approved_evp']),
      supabase
        .from('client_invoices')
        .select('received_amount')
        .gt('received_amount', 0),
      supabase
        .from('payment_vouchers')
        .select('net_paid')
        .eq('status', 'issued'),
    ]);

    setProjects(projectsRes.data ?? []);
    setMilestones((milestonesRes.data ?? []) as ClientMilestoneRow[]);
    setInvoices(invoicesRes.data ?? []);
    setTotalReceipts(
      (receiptsRes.data ?? []).reduce((s: number, r: { received_amount: number }) => s + (r.received_amount ?? 0), 0)
    );
    setTotalVouchersPaid(
      (vouchersRes.data ?? []).reduce((s: number, v: { net_paid: number }) => s + (v.net_paid ?? 0), 0)
    );
    setLoading(false);
  }

  // ── Chart data load ───────────────────────────────────────────────────────
  // Mirrors the exact same query shape used by MonthlyAnalysis / MonthlyAnalysisBalance
  // / MonthlyAnalysisUninvoiced pivot tables.

  async function loadChartData() {
    setChartLoading(true);

    const [paidRes, receivedRes, allMsRes, allInvRes, clientMsRes, clientReceiptsRes] = await Promise.all([
      // Historical: paid invoices with their PO milestone relations for 1:1 matching
      supabase
        .from('vendor_invoices')
        .select('po_id, invoice_date, invoice_amount_incl_vat, purchase_order:purchase_orders(milestones:po_milestones(amount_due, planned_payment_date))')
        .eq('status', 'paid'),
      // Forecast Balance: received-but-unpaid invoices with milestone relations
      supabase
        .from('vendor_invoices')
        .select('po_id, invoice_amount_incl_vat, received_amount, purchase_order:purchase_orders(milestones:po_milestones(amount_due, planned_payment_date))')
        .eq('status', 'received'),
      // For uninvoiced matching: all milestones
      supabase
        .from('po_milestones')
        .select('purchase_order_id, amount_due, planned_payment_date')
        .order('planned_payment_date', { ascending: true, nullsFirst: false }),
      // For uninvoiced matching: all invoices (to consume milestones)
      supabase
        .from('vendor_invoices')
        .select('po_id, invoice_amount_incl_vat'),
      // Cash In: client milestones (forecast inflow)
      supabase
        .from('client_milestones')
        .select('payment_plan_amount, planned_receive_date')
        .neq('status', 'received'),
      // Cash In: client invoice receipts (historical inflow)
      supabase
        .from('client_invoices')
        .select('received_amount, receipt_date')
        .gt('received_amount', 0),
    ]);

    // Normalize paid invoices
    setPaidInvoices(
      (paidRes.data ?? []).map((vi: any) => ({
        po_id: vi.po_id,
        invoice_date: vi.invoice_date,
        invoice_amount_incl_vat: vi.invoice_amount_incl_vat,
        milestones: vi.purchase_order?.milestones ?? [],
      }))
    );

    // Normalize received invoices
    setReceivedInvoices(
      (receivedRes.data ?? []).map((vi: any) => ({
        po_id: vi.po_id,
        invoice_amount_incl_vat: vi.invoice_amount_incl_vat,
        received_amount: vi.received_amount ?? 0,
        milestones: vi.purchase_order?.milestones ?? [],
      }))
    );

    // Compute uninvoiced milestones via 1:1 subtraction (mirrors MonthlyAnalysisUninvoiced)
    const allMs = (allMsRes.data ?? []) as { purchase_order_id: string; amount_due: number; planned_payment_date: string | null }[];
    const allInvs = (allInvRes.data ?? []) as { po_id: string | null; invoice_amount_incl_vat: number }[];
    const availByKey = new Map<string, number[]>();
    allMs.forEach((m, idx) => {
      const k = `${m.purchase_order_id}::${Number(m.amount_due).toFixed(2)}`;
      if (!availByKey.has(k)) availByKey.set(k, []);
      availByKey.get(k)!.push(idx);
    });
    const consumed = new Set<number>();
    for (const inv of allInvs) {
      if (!inv.po_id) continue;
      const k = `${inv.po_id}::${Number(inv.invoice_amount_incl_vat).toFixed(2)}`;
      const avail = availByKey.get(k);
      if (avail && avail.length > 0) consumed.add(avail.shift()!);
    }
    setUninvoicedMs(
      allMs
        .filter((_, idx) => !consumed.has(idx))
        .filter(m => Number(m.amount_due) > 0)
    );

    setClientMs((clientMsRes.data ?? []) as ChartClientMs[]);
    setClientReceipts((clientReceiptsRes.data ?? []) as { received_amount: number; receipt_date: string | null }[]);
    setChartLoading(false);
  }

  // ── Chart aggregation ─────────────────────────────────────────────────────

  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  // 15th of prior month — same anchor used in all pivot tables
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const prevMonthKey = format(prevMonthDate, 'yyyy-MM');

  function rollForward(dateStr: string | null): string {
    const d = dateStr ? new Date(dateStr) : today;
    const effective = d < currentMonthStart ? prevMonthDate : d;
    return format(effective, 'yyyy-MM');
  }

  // Historical Cash Out: paid invoices, 1:1 matched to milestone planned_payment_date
  const historicalOutByMonth = (() => {
    const pool = buildMilestonePool(paidInvoices);
    const map = new Map<string, number>();
    for (const inv of paidInvoices) {
      let assignedDate: string | null = inv.invoice_date;
      if (inv.po_id) {
        const poPool = pool.get(inv.po_id);
        if (poPool) {
          const k = Number(inv.invoice_amount_incl_vat).toFixed(2);
          const cands = poPool.get(k);
          if (cands && cands.length > 0) {
            const matched = cands.shift()!;
            // Cap future-dated milestones to invoice_date for historical paid rows
            const isFuture = matched.planned_payment_date && new Date(matched.planned_payment_date) > today;
            assignedDate = isFuture ? inv.invoice_date : (matched.planned_payment_date ?? inv.invoice_date);
          }
        }
      }
      if (!assignedDate) continue;
      const mk = assignedDate.slice(0, 7);
      map.set(mk, (map.get(mk) ?? 0) + Number(inv.invoice_amount_incl_vat));
    }
    return map;
  })();

  // Historical Cash In: actual client invoice receipts
  const historicalInByMonth = (() => {
    const map = new Map<string, number>();
    for (const r of clientReceipts) {
      if (!r.receipt_date) continue;
      const mk = r.receipt_date.slice(0, 7);
      map.set(mk, (map.get(mk) ?? 0) + Number(r.received_amount));
    }
    return map;
  })();

  // Forecast Cash Out Col O: invoice balances (received, not yet paid) with overdue sweep
  const forecastBalanceByMonth = (() => {
    const map = new Map<string, number>();
    const pool = buildMilestonePool(receivedInvoices);
    for (const inv of receivedInvoices) {
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
      const mk = rollForward(assignedDate);
      map.set(mk, (map.get(mk) ?? 0) + balance);
    }
    return map;
  })();

  // Forecast Cash Out Col P: uninvoiced milestones with overdue sweep
  const forecastUninvoicedByMonth = (() => {
    const map = new Map<string, number>();
    for (const m of uninvoicedMs) {
      const mk = rollForward(m.planned_payment_date);
      map.set(mk, (map.get(mk) ?? 0) + Number(m.amount_due));
    }
    return map;
  })();

  // Forecast Cash In: client milestones (planned inflow) — apply same overdue sweep
  const forecastInByMonth = (() => {
    const map = new Map<string, number>();
    for (const m of clientMs) {
      if (!m.planned_receive_date) continue;
      const mk = rollForward(m.planned_receive_date);
      map.set(mk, (map.get(mk) ?? 0) + Number(m.payment_plan_amount));
    }
    return map;
  })();

  // Build unified sorted month keys across all datasets
  const allKeys = new Set([
    ...historicalOutByMonth.keys(),
    ...historicalInByMonth.keys(),
    ...forecastBalanceByMonth.keys(),
    ...forecastUninvoicedByMonth.keys(),
    ...forecastInByMonth.keys(),
  ]);
  const sortedKeys = [...allKeys].sort();

  // Opening balance = net of all historical settled cash (paid invoices vs actual receipts).
  // Used to seed the Forecast cumulative line so it continues from where history ended.
  const historicalOpeningBalance = (() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const v of historicalInByMonth.values()) totalIn += v;
    for (const v of historicalOutByMonth.values()) totalOut += v;
    return (totalIn - totalOut) / 1_000_000;
  })();

  function buildChartData(mode: ChartMode): ChartBar[] {
    const hasForecast = (k: string) =>
      forecastBalanceByMonth.has(k) || forecastUninvoicedByMonth.has(k) || forecastInByMonth.has(k);
    const hasHistorical = (k: string) =>
      historicalOutByMonth.has(k) || historicalInByMonth.has(k);

    const keys = mode === 'historical'
      ? sortedKeys.filter(k => hasHistorical(k))
      : mode === 'forecast'
      ? [...new Set([prevMonthKey, ...sortedKeys])].sort().filter(k => hasForecast(k))
      : [...new Set([prevMonthKey, ...sortedKeys])].sort().filter(k => hasHistorical(k) || hasForecast(k));

    // Forecast seeds from historical net; combined naturally accumulates from first historical month
    let cumNet = mode === 'forecast' ? historicalOpeningBalance : 0;
    return keys.map(key => {
      let cashIn = 0;
      let outflowBalance = 0;
      let outflowUninvoiced = 0;

      if (mode === 'historical') {
        cashIn = (historicalInByMonth.get(key) ?? 0) / 1_000_000;
        // Historical has no split — show all paid as outflowBalance
        outflowBalance = (historicalOutByMonth.get(key) ?? 0) / 1_000_000;
        outflowUninvoiced = 0;
      } else if (mode === 'forecast') {
        cashIn = (forecastInByMonth.get(key) ?? 0) / 1_000_000;
        outflowBalance = (forecastBalanceByMonth.get(key) ?? 0) / 1_000_000;
        outflowUninvoiced = (forecastUninvoicedByMonth.get(key) ?? 0) / 1_000_000;
      } else {
        // Combined: historical months get historical data, current+ get forecast
        const isForecastMonth = key >= format(today, 'yyyy-MM');
        cashIn = isForecastMonth
          ? (forecastInByMonth.get(key) ?? 0) / 1_000_000
          : (historicalInByMonth.get(key) ?? 0) / 1_000_000;
        outflowBalance = isForecastMonth
          ? (forecastBalanceByMonth.get(key) ?? 0) / 1_000_000
          : (historicalOutByMonth.get(key) ?? 0) / 1_000_000;
        outflowUninvoiced = isForecastMonth
          ? (forecastUninvoicedByMonth.get(key) ?? 0) / 1_000_000
          : 0;
      }

      cumNet += cashIn - outflowBalance - outflowUninvoiced;
      return {
        month: format(new Date(key + '-15'), 'MMM-yy'),
        key,
        cashIn: +cashIn.toFixed(2),
        outflowBalance: +outflowBalance.toFixed(2),
        outflowUninvoiced: +outflowUninvoiced.toFixed(2),
        cumNet: +cumNet.toFixed(2),
      };
    });
  }

  const chartData = buildChartData(chartMode);
  const todayMonthLabel = format(today, 'MMM-yy');

  // ── Kanban derived values (unchanged) ────────────────────────────────────

  const buildCards = useCallback((): DraggableCard[] => {
    const cards: DraggableCard[] = [];
    for (const m of milestones) {
      if (selectedProjectId !== 'all' && m.project_id !== selectedProjectId) continue;
      const d = m.planned_receive_date;
      cards.push({
        id: `m-${m.id}`,
        type: 'milestone',
        projectName: m.project?.name ?? 'Unknown Project',
        projectId: m.project_id,
        amount: m.payment_plan_amount,
        weekDate: d ? parseISO(d) : null,
        milestoneNo: m.milestone_number,
        milestonePercent: m.milestone_pct != null ? m.milestone_pct * 100 : undefined,
        rawMilestone: m,
      });
    }
    for (const inv of invoices) {
      if (selectedProjectId !== 'all' && inv.project_id !== selectedProjectId) continue;
      const d = inv.planned_payment_date ?? inv.original_due_date;
      cards.push({
        id: `i-${inv.id}`,
        type: 'invoice',
        projectName: inv.project?.name ?? 'Unknown Project',
        projectId: inv.project_id,
        amount: inv.net_payable,
        weekDate: d ? parseISO(d) : null,
        vendorName: inv.vendor?.name ?? 'Unknown Vendor',
        rawInvoice: inv,
      });
    }
    return cards;
  }, [milestones, invoices, selectedProjectId]);

  const allCards = buildCards();
  const scheduledCards = allCards.filter((c) => c.weekDate !== null);
  const unscheduledCards = allCards.filter((c) => c.weekDate === null);

  function buildWeekColumns(cards: DraggableCard[]): WeekColumn[] {
    const columns: WeekColumn[] = weekStarts.map((ws, i) => ({
      weekStart: ws,
      weekEnd: addDays(ws, 6),
      weekIndex: i,
      label: `Week ${i + 1} · ${format(ws, 'EEE dd MMM')} – ${format(addDays(ws, 6), 'EEE dd MMM')}`,
      incomeCards: [],
      paymentCards: [],
      openingBalance: 0,
      incomeTotal: 0,
      paymentTotal: 0,
      closingBalance: 0,
    }));

    for (const card of cards) {
      if (!card.weekDate) continue;
      for (const col of columns) {
        if (isSameWeek(card.weekDate, col.weekStart, { weekStartsOn: 1 })) {
          if (card.type === 'milestone') col.incomeCards.push(card);
          else col.paymentCards.push(card);
          break;
        }
      }
    }

    let running = totalReceipts - totalVouchersPaid;
    for (const col of columns) {
      col.openingBalance = running;
      col.incomeTotal = col.incomeCards.reduce((s, c) => s + c.amount, 0);
      col.paymentTotal = col.paymentCards.reduce((s, c) => s + c.amount, 0);
      col.closingBalance = running + col.incomeTotal - col.paymentTotal;
      running = col.closingBalance;
    }
    return columns;
  }

  const weekColumns = buildWeekColumns(scheduledCards);
  const negativeWeekCount = weekColumns.filter((c) => c.closingBalance < 0).length;

  function wouldCauseNegative(card: DraggableCard, targetWeekStart: Date | null) {
    const modifiedCards = allCards.map((c) =>
      c.id === card.id ? { ...c, weekDate: targetWeekStart } : c
    );
    const scheduled = modifiedCards.filter((c) => c.weekDate !== null);
    const cols = buildWeekColumns(scheduled);
    const negCol = cols.find((c) => c.closingBalance < 0);
    return negCol
      ? { negative: true, weekLabel: negCol.label, weekIndex: negCol.weekIndex }
      : { negative: false, weekLabel: '', weekIndex: -1 };
  }

  function showMessage(text: string, color: 'green' | 'red', durationMs: number) {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setMessageOverride({ text, color });
    msgTimerRef.current = setTimeout(() => setMessageOverride(null), durationMs);
  }

  async function applyMove(card: DraggableCard, targetWeekStart: Date | null) {
    const isoDate = targetWeekStart ? format(targetWeekStart, 'yyyy-MM-dd') : null;

    if (card.type === 'milestone' && card.rawMilestone) {
      await supabase
        .from('client_milestones')
        .update({ planned_receive_date: isoDate })
        .eq('id', card.rawMilestone.id);
    } else if (card.type === 'invoice' && card.rawInvoice) {
      await supabase
        .from('vendor_invoices')
        .update({ planned_payment_date: isoDate })
        .eq('id', card.rawInvoice.id);
    }

    const modifiedCards = allCards.map((c) =>
      c.id === card.id ? { ...c, weekDate: targetWeekStart } : c
    );
    const scheduled = modifiedCards.filter((c) => c.weekDate !== null);
    const cols = buildWeekColumns(scheduled);

    if (targetWeekStart) {
      const destWeekKey = format(targetWeekStart, 'yyyy-MM-dd');
      const destCol = cols.find((c) => format(c.weekStart, 'yyyy-MM-dd') === destWeekKey);
      const destBalance = destCol?.closingBalance ?? 0;
      const cardLabel = card.type === 'invoice' ? (card.vendorName ?? card.projectName) : card.projectName;
      const weekLabel = format(targetWeekStart, 'd MMM yyyy');

      if (destBalance < 0) {
        setDismissedWeeks((prev) => {
          const next = new Set(prev);
          next.delete(destWeekKey);
          return next;
        });
        showMessage(
          `${cardLabel} moved to ${weekLabel} — that week is now cash negative (-฿${Math.abs(destBalance).toLocaleString('en-US', { maximumFractionDigits: 0 })}). See highlighted column.`,
          'red',
          4000
        );
      } else {
        showMessage(`${cardLabel} moved to ${weekLabel}.`, 'green', 2000);
      }
    }

    await loadData();
  }

  function handleDragStart(event: DragStartEvent) {
    const card = event.active.data.current?.card as DraggableCard | undefined;
    if (card) setActiveCard(card);
  }

  function handleDragOver(event: { over: { id: string; data: { current?: { weekIndex?: number } } } | null }) {
    if (!event.over) {
      setOverWeekIndex(null);
      return;
    }
    const weekIndex = event.over.data.current?.weekIndex;
    setOverWeekIndex(weekIndex ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    setOverWeekIndex(null);

    const { active, over } = event;
    if (!over) return;

    const card = active.data.current?.card as DraggableCard | undefined;
    if (!card) return;

    const overId = String(over.id);
    let targetWeekStart: Date | null = null;

    if (overId === 'unscheduled-drop') {
      if (card.weekDate === null) return;
      applyMove(card, null);
      return;
    }

    if (overId.startsWith('week-drop-')) {
      const idx = parseInt(overId.replace('week-drop-', ''), 10);
      if (!isNaN(idx) && idx >= 0 && idx < weekStarts.length) {
        targetWeekStart = weekStarts[idx];
      }
    }

    if (!targetWeekStart) return;

    const currentWeekStart = card.weekDate
      ? weekStarts.find((ws) => isSameWeek(card.weekDate!, ws, { weekStartsOn: 1 })) ?? null
      : null;

    if (
      currentWeekStart &&
      format(currentWeekStart, 'yyyy-MM-dd') === format(targetWeekStart, 'yyyy-MM-dd')
    )
      return;

    const check = wouldCauseNegative(card, targetWeekStart);
    if (check.negative) {
      setWarningModal({
        open: true,
        weekLabel: check.weekLabel,
        weekIndex: check.weekIndex,
        pendingCard: card,
        pendingTargetWeekStart: targetWeekStart,
      });
      return;
    }

    applyMove(card, targetWeekStart);
  }

  function confirmMove() {
    if (warningModal.pendingCard && warningModal.pendingTargetWeekStart) {
      applyMove(warningModal.pendingCard, warningModal.pendingTargetWeekStart);
    }
    setWarningModal({ open: false, weekLabel: '', weekIndex: -1, pendingCard: null, pendingTargetWeekStart: null });
  }

  function cancelMove() {
    setWarningModal({ open: false, weekLabel: '', weekIndex: -1, pendingCard: null, pendingTargetWeekStart: null });
  }

  const totalIncome = weekColumns.slice(0, 4).reduce((s, c) => s + c.incomeTotal, 0);
  const totalPayments = weekColumns.slice(0, 4).reduce((s, c) => s + c.paymentTotal, 0);
  const net = totalIncome - totalPayments;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const chartSubtitle: Record<ChartMode, string> = {
    historical: 'Settled cash — paid invoices by expected payment month',
    forecast: 'Future liabilities — invoice balances + uninvoiced pipeline with overdue sweep',
    combined: 'Complete timeline — historical actual + forecast pipeline',
  };

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <style>{PULSE_STYLE}</style>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0f1923]">Cash Flow Planner</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Drag income and payment cards to reschedule across weeks
            </p>
          </div>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white text-[#0f1923] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75]"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {messageOverride ? (
          <div
            className="mt-4 px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{
              background: messageOverride.color === 'red' ? '#FFEBEE' : '#E8F5E9',
              color: messageOverride.color === 'red' ? '#E24B4A' : '#1D9E75',
              border: `1px solid ${messageOverride.color === 'red' ? '#E24B4A' : '#1D9E75'}33`,
            }}
          >
            {messageOverride.text}
          </div>
        ) : (
          <div className="flex flex-wrap gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#1D9E75]" />
              <span className="text-xs text-gray-600">Income (Milestones)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm bg-[#EF9F27]" />
              <span className="text-xs text-gray-600">Payments (Vendor Invoices)</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp size={12} className="text-[#1D9E75]" />
              <span className="text-xs text-gray-600">
                Opening Balance: <strong className="text-[#0f1923]">{fmtTHB(totalReceipts - totalVouchersPaid)}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
              <span className="text-xs text-gray-500">Next 4 weeks:</span>
              <span className="text-xs text-gray-600">Income <strong className="text-[#1D9E75]">{fmtTHBCompact(totalIncome)}</strong></span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-600">Payments <strong className="text-[#E24B4A]">{fmtTHBCompact(totalPayments)}</strong></span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-600">Net <strong className={net >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>{fmtTHBCompact(net)}</strong></span>
              <span className="text-xs text-gray-400">·</span>
              {negativeWeekCount === 0 ? (
                <span className="text-xs font-semibold text-[#1D9E75]">0 deficit weeks</span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-semibold text-[#E24B4A]">
                  <AlertTriangle size={11} />
                  {negativeWeekCount} deficit week{negativeWeekCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Cash Flow Chart ───────────────────────────────────────────────── */}
      <div className="px-6 pt-6">
        <div className="bg-white rounded-xl border border-black/[0.08] p-5 shadow-sm">

          {/* Chart header */}
          <div className="flex items-start justify-between mb-4 gap-4">
            <div>
              <h2 className="text-[13px] font-semibold text-gray-900">Cash Flow Overview — Expected Payment Month (฿M)</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">{chartSubtitle[chartMode]}</p>
            </div>
            {/* Tab switcher */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
              {(['historical', 'forecast', 'combined'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setChartMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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

          {/* Legend */}
          <div className="flex items-center gap-5 mb-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="inline-block w-3 h-3 rounded-sm bg-[#1D9E75]" />
              Cash In
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="inline-block w-3 h-3 rounded-sm bg-[#E24B4A]" />
              Invoice Balance (Col O)
            </span>
            {chartMode !== 'historical' && (
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="inline-block w-3 h-3 rounded-sm opacity-50" style={{ background: '#E24B4A' }} />
                Yet to Invoice (Col P)
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="inline-block w-8 h-0.5 bg-[#3B82F6]" />
              Cumulative Net
            </span>
            {chartMode !== 'historical' && (
              <span className="ml-auto text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                Overdue items swept into {format(prevMonthDate, 'MMM-yy')}
              </span>
            )}
          </div>

          {/* Chart */}
          {chartLoading ? (
            <div className="h-[260px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[260px] flex flex-col items-center justify-center gap-2">
              <p className="text-[13px] text-gray-400">No data for this view</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} barGap={2} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="bars"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `฿${v}M`}
                />
                <YAxis
                  yAxisId="line"
                  orientation="right"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `฿${v}M`}
                />
                <Tooltip
                  formatter={((value: number, name: string): [string, string] => [
                    `฿${value.toFixed(2)}M`,
                    name === 'cashIn' ? 'Cash In'
                    : name === 'outflowBalance' ? 'Invoice Balance (Col O)'
                    : name === 'outflowUninvoiced' ? 'Yet to Invoice (Col P)'
                    : 'Cumulative Net',
                  ]) as RechartsTooltipFormatter}
                  contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />
                <Legend
                  formatter={(value: string) =>
                    value === 'cashIn' ? 'Cash In'
                    : value === 'outflowBalance' ? 'Invoice Balance (Col O)'
                    : value === 'outflowUninvoiced' ? 'Yet to Invoice (Col P)'
                    : 'Cumulative Net'
                  }
                  iconType="square"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                {/* Today reference line — only visible in combined mode */}
                {chartMode === 'combined' && (
                  <ReferenceLine
                    yAxisId="bars"
                    x={todayMonthLabel}
                    stroke="#9ca3af"
                    strokeDasharray="4 2"
                    label={{ value: 'Today', position: 'top', fontSize: 10, fill: '#9ca3af' }}
                  />
                )}
                <ReferenceLine yAxisId="line" y={0} stroke="#E24B4A" strokeDasharray="3 2" strokeWidth={1} />
                <Bar yAxisId="bars" dataKey="cashIn" fill="#1D9E75" radius={[3, 3, 0, 0]} opacity={0.9} name="cashIn" />
                <Bar yAxisId="bars" dataKey="outflowBalance" stackId="outflow" fill="#C0392B" radius={[0, 0, 0, 0]} opacity={0.95} name="outflowBalance" />
                <Bar yAxisId="bars" dataKey="outflowUninvoiced" stackId="outflow" fill="#E24B4A" radius={[3, 3, 0, 0]} opacity={0.5} name="outflowUninvoiced" />
                <Line
                  yAxisId="line"
                  type="monotone"
                  dataKey="cumNet"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: '#3B82F6', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  name="cumNet"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Footer note */}
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            {chartMode === 'historical'
              ? 'Cash Out grouped by milestone expected payment month — ties out to the Paid Invoices pivot table.'
              : chartMode === 'forecast'
              ? `Cumulative Net seeded from historical opening balance of ฿${historicalOpeningBalance.toFixed(2)}M (total settled receipts minus paid invoices). Dark red = Invoice Balance (Col O). Faded red = Yet to Invoice (Col P).`
              : 'Past months show actual settled cash. Current month onwards shows forecast split into Invoice Balance (dark) + Yet to Invoice (faded). Cumulative Net runs continuously across both periods.'}
          </p>
        </div>
      </div>

      {/* ── Kanban planner ───────────────────────────────────────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver as never}
        onDragEnd={handleDragEnd}
      >
        <div className="p-6 overflow-x-auto">
          <div className="flex gap-3 min-w-max pb-4">
            {weekColumns.map((col) => {
              const weekKey = format(col.weekStart, 'yyyy-MM-dd');
              const isNegative = col.closingBalance < 0;
              const showBanner = isNegative && !dismissedWeeks.has(weekKey);

              return (
                <WeekColumnDropZone
                  key={col.weekIndex}
                  col={col}
                  weekKey={weekKey}
                  isOver={overWeekIndex === col.weekIndex}
                  showBanner={showBanner}
                  onDismissBanner={() => {
                    setDismissedWeeks((prev) => {
                      const next = new Set(prev);
                      next.add(weekKey);
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-8">
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold text-[#0f1923] mb-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-[#EF9F27]" />
              Unscheduled ({unscheduledCards.length})
            </h2>
            <UnscheduledDropZone cards={unscheduledCards} />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? <DraggableCardComponent card={activeCard} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* ── Warning modal (unchanged) ─────────────────────────────────────── */}
      {warningModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#E24B4A]/10 flex items-center justify-center">
                <AlertTriangle size={18} className="text-[#E24B4A]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0f1923]">Negative Balance Warning</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This move would cause a negative balance in{' '}
                  <strong className="text-[#E24B4A]">Week {warningModal.weekIndex + 1}</strong>. Do you want to proceed?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelMove}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X size={13} />
                Cancel
              </button>
              <button
                onClick={confirmMove}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-[#E24B4A] hover:bg-[#c93b3a] rounded-lg transition-colors"
              >
                <Check size={13} />
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
