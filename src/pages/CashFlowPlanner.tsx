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
  CalendarRange,
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
import { toMonthKey, toMonthLabel } from '../components/dashboard/AnalysisPivotTable';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Kanban types (preserved)
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

interface ChartBar {
  month: string;   // "MMM-yy" label
  key: string;     // "yyyy-MM" sort key
  cashIn: number;  // ฿M
  cashOut: number; // ฿M
  cumNet: number;  // ฿M running total
  isForecast?: boolean;
}

// Raw data shapes from Supabase
interface PaidInvoiceRaw {
  id: string;
  po_id: string | null;
  invoice_date: string | null;
  invoice_amount_incl_vat: number;
  vendor_invoice_no: string | null;
  purchase_order: {
    milestones: { amount_due: number; planned_payment_date: string | null }[];
  } | null;
}

interface ReceivedInvoiceRaw {
  id: string;
  po_id: string | null;
  invoice_amount_incl_vat: number;
  received_amount: number;
  planned_payment_date: string | null;
  purchase_order: {
    milestones: { amount_due: number; planned_payment_date: string | null }[];
  } | null;
}

interface AllMilestoneRaw {
  id: string;
  purchase_order_id: string;
  amount_due: number;
  planned_payment_date: string | null;
}

interface ClientMilestoneChartRaw {
  id: string;
  project_id: string;
  payment_plan_amount: number;
  planned_receive_date: string | null;
  status: string;
}

interface ClientReceiptRaw {
  received_amount: number;
  receipt_date: string | null;
}

// ---------------------------------------------------------------------------
// Overdue sweep helper
// ---------------------------------------------------------------------------

const today = new Date();
const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
const previousMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);

function rollForward(dateStr: string | null): string {
  const d = dateStr ? new Date(dateStr) : today;
  const effective = d < currentMonthStart ? previousMonthDate : d;
  return toMonthKey(effective.toISOString().slice(0, 10));
}

// ---------------------------------------------------------------------------
// 1:1 milestone pool builder (mirrors MonthlyAnalysisUninvoiced)
// ---------------------------------------------------------------------------

function buildMilestonePool(milestones: AllMilestoneRaw[]): Map<string, AllMilestoneRaw[]> {
  const pool = new Map<string, AllMilestoneRaw[]>();
  for (const ms of milestones) {
    const key = `${ms.purchase_order_id}::${Number(ms.amount_due).toFixed(2)}`;
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key)!.push(ms);
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Chart aggregation
// ---------------------------------------------------------------------------

function buildChartData(
  mode: 'historical' | 'forecast' | 'combined',
  paidInvoices: PaidInvoiceRaw[],
  receivedInvoices: ReceivedInvoiceRaw[],
  allMilestones: AllMilestoneRaw[],
  clientMilestones: ClientMilestoneChartRaw[],
  clientReceipts: ClientReceiptRaw[],
): ChartBar[] {
  // ── 1:1 matching to find uninvoiced milestones ──────────────────────────
  const pool = buildMilestonePool(allMilestones);
  const consumedIds = new Set<string>();

  // Consume milestones matched by paid invoices
  for (const inv of paidInvoices) {
    if (!inv.po_id) continue;
    const key = `${inv.po_id}::${Number(inv.invoice_amount_incl_vat).toFixed(2)}`;
    const avail = pool.get(key);
    if (avail && avail.length > 0) consumedIds.add(avail.shift()!.id);
  }
  // Consume milestones matched by received invoices
  for (const inv of receivedInvoices) {
    if (!inv.po_id) continue;
    const key = `${inv.po_id}::${Number(inv.invoice_amount_incl_vat).toFixed(2)}`;
    const avail = pool.get(key);
    if (avail && avail.length > 0) consumedIds.add(avail.shift()!.id);
  }
  const uninvoicedMilestones = allMilestones.filter(ms => !consumedIds.has(ms.id));

  // ── Aggregate into monthly maps ─────────────────────────────────────────

  // Historical Cash Out: paid invoices → use matched milestone's planned_payment_date
  // (mirrors MonthlyAnalysis.tsx: planned_payment_date drives the X-axis key)
  const historicalOutByMonth = new Map<string, number>();
  for (const inv of paidInvoices) {
    if (!inv.po_id) continue;
    // find matched milestone's planned_payment_date from the purchase_order join
    const msList = inv.purchase_order?.milestones ?? [];
    const matchedMs = msList.find(
      ms => Number(ms.amount_due).toFixed(2) === Number(inv.invoice_amount_incl_vat).toFixed(2)
    );
    // Use milestone date if found; cap future-dated milestones to invoice_date
    let dateStr: string | null = matchedMs?.planned_payment_date ?? inv.invoice_date;
    if (matchedMs?.planned_payment_date && inv.invoice_date) {
      // If milestone date is in the future relative to invoice_date, cap to invoice_date
      if (matchedMs.planned_payment_date > inv.invoice_date) {
        dateStr = inv.invoice_date;
      } else {
        dateStr = matchedMs.planned_payment_date;
      }
    }
    const mk = toMonthKey(dateStr ?? inv.invoice_date ?? today.toISOString().slice(0, 10));
    historicalOutByMonth.set(mk, (historicalOutByMonth.get(mk) ?? 0) + inv.invoice_amount_incl_vat / 1_000_000);
  }

  // Historical Cash In: actual client receipts by receipt_date
  const historicalInByMonth = new Map<string, number>();
  for (const r of clientReceipts) {
    if (!r.receipt_date) continue;
    const mk = toMonthKey(r.receipt_date);
    historicalInByMonth.set(mk, (historicalInByMonth.get(mk) ?? 0) + r.received_amount / 1_000_000);
  }

  // Forecast Cash Out = Invoice Balance (received invoices) + Yet to Invoice (uninvoiced milestones)
  // Both use overdue sweep
  const forecastOutByMonth = new Map<string, number>();
  for (const inv of receivedInvoices) {
    const balance = Math.max(0, inv.invoice_amount_incl_vat - (inv.received_amount ?? 0));
    if (balance <= 0) continue;
    const mk = rollForward(inv.planned_payment_date);
    forecastOutByMonth.set(mk, (forecastOutByMonth.get(mk) ?? 0) + balance / 1_000_000);
  }
  for (const ms of uninvoicedMilestones) {
    const mk = rollForward(ms.planned_payment_date);
    forecastOutByMonth.set(mk, (forecastOutByMonth.get(mk) ?? 0) + ms.amount_due / 1_000_000);
  }

  // Forecast Cash In: uninvoiced client milestones by planned_receive_date, with overdue sweep
  const forecastInByMonth = new Map<string, number>();
  for (const cm of clientMilestones) {
    if (cm.status === 'received') continue;
    const mk = rollForward(cm.planned_receive_date);
    forecastInByMonth.set(mk, (forecastInByMonth.get(mk) ?? 0) + cm.payment_plan_amount / 1_000_000);
  }

  // ── Union all month keys for the selected mode ──────────────────────────
  let allKeys: string[] = [];

  if (mode === 'historical') {
    allKeys = [...new Set([...historicalOutByMonth.keys(), ...historicalInByMonth.keys()])];
  } else if (mode === 'forecast') {
    allKeys = [...new Set([...forecastOutByMonth.keys(), ...forecastInByMonth.keys()])];
  } else {
    allKeys = [...new Set([
      ...historicalOutByMonth.keys(),
      ...historicalInByMonth.keys(),
      ...forecastOutByMonth.keys(),
      ...forecastInByMonth.keys(),
    ])];
  }

  allKeys.sort();

  // ── Build chart bars ─────────────────────────────────────────────────────
  const todayKey = toMonthKey(today.toISOString().slice(0, 10));

  let cumNet = 0;
  return allKeys.map(key => {
    let cashIn = 0;
    let cashOut = 0;
    const isForecast = key >= todayKey;

    if (mode === 'historical') {
      cashIn = historicalInByMonth.get(key) ?? 0;
      cashOut = historicalOutByMonth.get(key) ?? 0;
    } else if (mode === 'forecast') {
      cashIn = forecastInByMonth.get(key) ?? 0;
      cashOut = forecastOutByMonth.get(key) ?? 0;
    } else {
      // Combined: historical for past months, forecast for current+future
      if (!isForecast) {
        cashIn = historicalInByMonth.get(key) ?? 0;
        cashOut = historicalOutByMonth.get(key) ?? 0;
      } else {
        cashIn = forecastInByMonth.get(key) ?? 0;
        cashOut = forecastOutByMonth.get(key) ?? 0;
      }
    }

    cumNet += cashIn - cashOut;
    return {
      month: toMonthLabel(key),
      key,
      cashIn: +cashIn.toFixed(2),
      cashOut: +cashOut.toFixed(2),
      cumNet: +cumNet.toFixed(2),
      isForecast,
    };
  });
}

// ---------------------------------------------------------------------------
// Recharts tooltip formatter type shim
// ---------------------------------------------------------------------------
type RechartsTooltipFormatter = (value: number, name: string) => [string, string];

// ---------------------------------------------------------------------------
// Kanban sub-components (preserved exactly)
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

function DraggableCard({
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
            <p className="text-xs font-bold text-[#E24B4A]">⚠ Cash deficit this week</p>
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
              <DraggableCard key={card.id} card={card} />
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
              <DraggableCard key={card.id} card={card} />
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
          <DraggableCard card={card} />
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CashFlowPlanner() {
  useAuth();

  // ── Kanban state ──────────────────────────────────────────────────────────
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

  // ── Chart state ───────────────────────────────────────────────────────────
  const [chartMode, setChartMode] = useState<'historical' | 'forecast' | 'combined'>('forecast');
  const [chartLoading, setChartLoading] = useState(true);
  const [paidInvoices, setPaidInvoices] = useState<PaidInvoiceRaw[]>([]);
  const [receivedInvoices, setReceivedInvoices] = useState<ReceivedInvoiceRaw[]>([]);
  const [allMilestones, setAllMilestones] = useState<AllMilestoneRaw[]>([]);
  const [clientMilestonesChart, setClientMilestonesChart] = useState<ClientMilestoneChartRaw[]>([]);
  const [clientReceipts, setClientReceipts] = useState<ClientReceiptRaw[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const weekStarts = Array.from({ length: 8 }, (_, i) =>
    startOfWeek(addWeeks(new Date(), i), { weekStartsOn: 1 })
  );

  useEffect(() => {
    loadChartData();
    loadKanbanData();
  }, []);

  // ── Chart data fetch ──────────────────────────────────────────────────────

  async function loadChartData() {
    setChartLoading(true);
    const [paidRes, receivedRes, milestonesRes, cmRes, receiptsRes] = await Promise.all([
      // Paid invoices with their PO milestones for date lookup
      supabase
        .from('vendor_invoices')
        .select(`
          id, po_id, invoice_date, invoice_amount_incl_vat, vendor_invoice_no,
          purchase_order:purchase_orders!po_id(
            milestones:po_milestones(amount_due, planned_payment_date)
          )
        `)
        .eq('status', 'paid')
        .gt('invoice_amount_incl_vat', 0),

      // Received invoices (balance = invoice - received_amount) with planned_payment_date
      supabase
        .from('vendor_invoices')
        .select(`
          id, po_id, invoice_amount_incl_vat, received_amount, planned_payment_date,
          purchase_order:purchase_orders!po_id(
            milestones:po_milestones(amount_due, planned_payment_date)
          )
        `)
        .eq('status', 'received')
        .gt('invoice_amount_incl_vat', 0),

      // ALL po_milestones for 1:1 matching (to find uninvoiced)
      supabase
        .from('po_milestones')
        .select('id, purchase_order_id, amount_due, planned_payment_date'),

      // Uninvoiced client milestones for forecast cash in
      supabase
        .from('client_milestones')
        .select('id, project_id, payment_plan_amount, planned_receive_date, status')
        .neq('status', 'received'),

      // Actual client receipts for historical cash in
      supabase
        .from('client_invoices')
        .select('received_amount, receipt_date')
        .gt('received_amount', 0),
    ]);

    if (paidRes.data) setPaidInvoices(paidRes.data as unknown as PaidInvoiceRaw[]);
    if (receivedRes.data) setReceivedInvoices(receivedRes.data as unknown as ReceivedInvoiceRaw[]);
    if (milestonesRes.data) setAllMilestones(milestonesRes.data as AllMilestoneRaw[]);
    if (cmRes.data) setClientMilestonesChart(cmRes.data as ClientMilestoneChartRaw[]);
    if (receiptsRes.data) setClientReceipts(receiptsRes.data as ClientReceiptRaw[]);
    setChartLoading(false);
  }

  // ── Kanban data fetch ─────────────────────────────────────────────────────

  async function loadKanbanData() {
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

  // ── Kanban helpers ────────────────────────────────────────────────────────

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
          `⚠ ${cardLabel} moved to ${weekLabel} — that week is now cash negative (-฿${Math.abs(destBalance).toLocaleString('en-US', { maximumFractionDigits: 0 })}). See highlighted column.`,
          'red',
          4000
        );
      } else {
        showMessage(`✓ ${cardLabel} moved to ${weekLabel}.`, 'green', 2000);
      }
    }

    await loadKanbanData();
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

  // ── Chart data ────────────────────────────────────────────────────────────

  const chartData = buildChartData(
    chartMode,
    paidInvoices,
    receivedInvoices,
    allMilestones,
    clientMilestonesChart,
    clientReceipts,
  );

  const todayMonthLabel = toMonthLabel(toMonthKey(today.toISOString().slice(0, 10)));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <style>{PULSE_STYLE}</style>

      {/* ── Chart Section ──────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-2">
        <div className="bg-white rounded-xl border border-black/[0.08] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#1D9E75]/10 flex items-center justify-center">
                <CalendarRange size={14} className="text-[#1D9E75]" />
              </div>
              <div>
                <h2 className="text-[13px] font-semibold text-gray-800">
                  {chartMode === 'historical' && 'Cash Flow — Historical'}
                  {chartMode === 'forecast' && 'Cash Flow Forecast'}
                  {chartMode === 'combined' && 'Cash Flow — Actual + Forecast'}
                  <span className="text-gray-400 font-normal ml-1">(฿M)</span>
                </h2>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {chartMode === 'historical' && 'Actual cash in/out from paid invoices and received receipts'}
                  {chartMode === 'forecast' && 'Invoice balance + yet-to-invoice milestones vs client payment plan'}
                  {chartMode === 'combined' && 'Actual data for past months, forecast for current and future'}
                </p>
              </div>
            </div>
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

          {chartLoading ? (
            <div className="h-[240px] flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-sm text-gray-400">No data available for this view</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} barGap={2} barCategoryGap="32%">
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
                  tick={{ fontSize: 11, fill: '#3B82F6' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `฿${v}M`}
                />
                <Tooltip
                  formatter={((value: number, name: string): [string, string] => [
                    `฿${value.toFixed(2)}M`,
                    name === 'cashIn' ? 'Cash In'
                    : name === 'cashOut' ? 'Cash Out'
                    : 'Cumulative Net',
                  ]) as RechartsTooltipFormatter}
                  contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: 'none' }}
                />
                <Legend
                  formatter={(value: string) =>
                    value === 'cashIn' ? 'Cash In'
                    : value === 'cashOut' ? 'Cash Out'
                    : 'Cumulative Net'
                  }
                  iconType="square"
                  wrapperStyle={{ fontSize: 12 }}
                />
                {/* Today reference line for combined mode */}
                {chartMode === 'combined' && (
                  <ReferenceLine
                    x={todayMonthLabel}
                    yAxisId="bars"
                    stroke="#9ca3af"
                    strokeDasharray="4 2"
                    label={{ value: 'Today', position: 'top', fontSize: 10, fill: '#9ca3af' }}
                  />
                )}
                <ReferenceLine yAxisId="line" y={0} stroke="#E24B4A" strokeDasharray="4 2" strokeWidth={1} />
                <Bar
                  yAxisId="bars"
                  dataKey="cashIn"
                  fill="#1D9E75"
                  radius={[3, 3, 0, 0]}
                  name="cashIn"
                  opacity={0.9}
                  shape={(props: {
                    x?: number; y?: number; width?: number; height?: number; isForecast?: boolean;
                  }) => {
                    const { x = 0, y = 0, width = 0, height = 0, isForecast } = props;
                    return (
                      <rect
                        x={x} y={y} width={width} height={height}
                        fill="#1D9E75"
                        opacity={chartMode === 'combined' && isForecast ? 0.4 : 0.9}
                        rx={3}
                      />
                    );
                  }}
                />
                <Bar
                  yAxisId="bars"
                  dataKey="cashOut"
                  fill="#E24B4A"
                  radius={[3, 3, 0, 0]}
                  name="cashOut"
                  opacity={0.85}
                  shape={(props: {
                    x?: number; y?: number; width?: number; height?: number; isForecast?: boolean;
                  }) => {
                    const { x = 0, y = 0, width = 0, height = 0, isForecast } = props;
                    return (
                      <rect
                        x={x} y={y} width={width} height={height}
                        fill="#E24B4A"
                        opacity={chartMode === 'combined' && isForecast ? 0.35 : 0.85}
                        rx={3}
                      />
                    );
                  }}
                />
                <Line
                  yAxisId="line"
                  type="monotone"
                  dataKey="cumNet"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  name="cumNet"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {chartMode === 'combined' && !chartLoading && chartData.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-2 px-1">
              Solid bars = actual · Faded bars = forecast based on planned dates
            </p>
          )}
        </div>
      </div>

      {/* ── Kanban Section ─────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-gray-200 bg-white mt-4">
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
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
            {activeCard ? <DraggableCard card={activeCard} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

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
