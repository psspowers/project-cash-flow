import { useState, useEffect, useCallback, useRef } from 'react';
import { VENDOR_INVOICE_UNPAID_STATUSES, VENDOR_INVOICE_PAID_STATUSES } from '../config/statusConstants';
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
  Info,
  Calendar,
  SlidersHorizontal,
  ArrowDownUp,
  ChevronRight,
  ChevronUp,
  Clock,
} from 'lucide-react';
import {
  format,
  startOfWeek,
  addWeeks,
  addDays,
  parseISO,
  isSameWeek,
  isAfter,
} from 'date-fns';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { VendorInvoice, Project, fmtTHB, fmtTHBCompact } from '../types';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientMilestoneRow {
  id: string;
  project_id: string;
  milestone_number: number;
  milestone_description?: string;
  milestone_pct: number;
  payment_plan_amount: number;
  planned_receive_date: string | null;
  status: string;
  project?: Project;
}

type CardType = 'milestone' | 'invoice';

// 'beyond_horizon' = has a date but it's past week 8
type CardScheduleState = 'scheduled' | 'unscheduled' | 'beyond_horizon';

interface DraggableCard {
  id: string;
  type: CardType;
  projectName: string;
  projectId: string;
  amount: number;
  weekDate: Date | null;
  scheduleState: CardScheduleState;
  milestoneNo?: number;
  milestonePercent?: number;
  milestoneDescription?: string;
  vendorName?: string;
  poNumber?: string;
  invoiceNo?: string;
  invoiceStatus?: string;
  hasPlanningNotes?: boolean;
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

// Project breakdown row for the opening balance popover
interface ProjectBalanceRow {
  name: string;
  received: number;
  paid: number;
  net: number;
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
  id: string;
  payment_plan_amount: number;
  planned_receive_date: string | null;
}

interface ChartBar {
  month: string;
  key: string;
  cashIn: number;
  outflowBalance: number;
  outflowUninvoiced: number;
  cumNet: number;
  openingBal?: number;
}

type ChartMode = 'historical' | 'forecast' | 'combined';

type RechartsTooltipFormatter = (value: number, name: string) => [string, string];

type UnscheduledSortKey = 'amount_desc' | 'amount_asc' | 'project';

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
// Closing balance style
// ---------------------------------------------------------------------------

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
// Invoice status label
// ---------------------------------------------------------------------------

const INVOICE_STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  approved_cm: 'CM Approved',
  approved_evp: 'EVP Approved',
  released: 'Released',
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  received: 'bg-gray-100 text-gray-500',
  approved_cm: 'bg-blue-50 text-blue-600',
  approved_evp: 'bg-blue-50 text-blue-700',
  released: 'bg-green-50 text-green-700',
};

// ---------------------------------------------------------------------------
// DraggableCard component
// ---------------------------------------------------------------------------

function DraggableCardComponent({
  card,
  isDragOverlay,
  compact = false,
  onQuickAssign,
}: {
  card: DraggableCard;
  isDragOverlay?: boolean;
  compact?: boolean;
  onQuickAssign?: (card: DraggableCard) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { card },
  });

  const isIncome = card.type === 'milestone';
  const isBeyond = card.scheduleState === 'beyond_horizon';

  return (
    <div
      ref={setNodeRef}
      className={`
        relative flex items-start gap-2 rounded-md p-2.5 mb-1.5 bg-white shadow-sm group
        ${isIncome
          ? 'border-l-4 border-l-[#1D9E75] border border-gray-100'
          : isBeyond
          ? 'border-l-4 border-l-[#378ADD] border border-gray-100'
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
          <p className="text-xs text-gray-500 leading-tight mt-0.5 truncate">
            Milestone {card.milestoneNo}
            {card.milestonePercent != null ? ` · ${card.milestonePercent.toFixed(0)}%` : ''}
            {card.milestoneDescription ? ` · ${card.milestoneDescription}` : ''}
          </p>
        ) : (
          <div className="mt-0.5 space-y-0.5">
            <p className="text-xs text-gray-500 leading-tight truncate">
              {card.vendorName}
            </p>
            {card.poNumber && (
              <p className="text-[10px] text-gray-400 leading-tight truncate font-mono">
                {card.poNumber}
                {card.invoiceNo ? ` · ${card.invoiceNo}` : ''}
              </p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between mt-1 gap-1">
          <p className={`text-xs font-bold ${isIncome ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
            {isIncome ? '+' : '-'}{fmtTHBCompact(card.amount)}
          </p>
          <div className="flex items-center gap-1">
            {card.hasPlanningNotes && (
              <span title="Has planning notes" className="text-gray-400">
                <Info size={9} />
              </span>
            )}
            {!isIncome && card.invoiceStatus && !compact && (
              <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${INVOICE_STATUS_COLORS[card.invoiceStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                {INVOICE_STATUS_LABELS[card.invoiceStatus] ?? card.invoiceStatus}
              </span>
            )}
          </div>
        </div>
        {isBeyond && card.weekDate && !compact && (
          <p className="text-[9px] text-[#378ADD] mt-0.5 leading-tight">
            Scheduled {format(card.weekDate, 'd MMM yy')} — beyond 8-week view
          </p>
        )}
      </div>
      {onQuickAssign && !isDragOverlay && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onQuickAssign(card); }}
          className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#1D9E75] p-0.5 rounded"
          title="Quick assign to week"
        >
          <Calendar size={12} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekColumnDropZone
// ---------------------------------------------------------------------------

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
    <div className="w-64 shrink-0 flex flex-col">
      <div
        className={`rounded-t-lg px-3 py-2.5 ${
          isNegative ? 'bg-[#E24B4A] text-white' : 'bg-[#0f1923] text-white'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {isNegative && (
            <div className="relative group/tip">
              <AlertTriangle size={13} className="flex-shrink-0 cursor-default" />
              <div className="absolute left-0 top-5 z-20 hidden group-hover/tip:block w-48 bg-[#0f1923] text-white text-xs rounded-lg p-2 shadow-lg border border-white/10">
                This week has a projected cash deficit of -฿{Math.abs(col.closingBalance).toLocaleString('en-US', { maximumFractionDigits: 0 })}. Drag payments to other weeks to resolve.
              </div>
            </div>
          )}
          <p className="text-xs font-semibold leading-tight flex-1">{col.label}</p>
          {isNegative && (
            <div className="relative group/tip2 ml-1">
              <span
                className="text-xs font-bold cursor-default px-0.5 rounded-sm"
                style={{ color: '#E24B4A', background: 'rgba(255,255,255,0.9)' }}
              >
                ⚠
              </span>
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
        className={`flex-1 min-h-[150px] rounded-lg transition-colors ${
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
              <DraggableCardComponent key={card.id} card={card} compact />
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
              <DraggableCardComponent key={card.id} card={card} compact />
            ))}
          </div>
        )}

        {col.incomeCards.length === 0 && col.paymentCards.length === 0 && (
          <div className={`border-2 border-dashed rounded-lg h-full min-h-[150px] flex items-center justify-center transition-colors ${isOver ? 'border-[#1D9E75]/50' : 'border-gray-200'}`}>
            <p className={`text-xs ${isOver ? 'text-[#1D9E75]' : 'text-gray-300'}`}>
              {isOver ? 'Release to schedule here' : 'Drop here'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unscheduled Sidebar Panel
// ---------------------------------------------------------------------------

function UnscheduledPanel({
  cards,
  onQuickAssign,
}: {
  cards: DraggableCard[];
  onQuickAssign: (card: DraggableCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unscheduled-drop',
    data: { weekIndex: -1 },
  });

  const [sortKey, setSortKey] = useState<UnscheduledSortKey>('amount_desc');
  const [incomeCollapsed, setIncomeCollapsed] = useState(false);
  const [paymentsCollapsed, setPaymentsCollapsed] = useState(false);
  const [beyondCollapsed, setBeyondCollapsed] = useState(true);

  const undated = cards.filter(c => c.scheduleState === 'unscheduled');
  const beyond = cards.filter(c => c.scheduleState === 'beyond_horizon');

  const sortCards = (list: DraggableCard[]) => {
    if (sortKey === 'amount_desc') return [...list].sort((a, b) => b.amount - a.amount);
    if (sortKey === 'amount_asc') return [...list].sort((a, b) => a.amount - b.amount);
    return [...list].sort((a, b) => a.projectName.localeCompare(b.projectName));
  };

  const undatedIncome = sortCards(undated.filter(c => c.type === 'milestone'));
  const undatedPayments = sortCards(undated.filter(c => c.type === 'invoice'));

  const totalUnscheduledOut = undated.filter(c => c.type === 'invoice').reduce((s, c) => s + c.amount, 0);
  const totalUnscheduledIn = undated.filter(c => c.type === 'milestone').reduce((s, c) => s + c.amount, 0);
  const totalBeyondOut = beyond.filter(c => c.type === 'invoice').reduce((s, c) => s + c.amount, 0);

  return (
    <div
      ref={setNodeRef}
      className={`h-full flex flex-col transition-colors ${isOver ? 'bg-[#EF9F27]/5 ring-2 ring-[#EF9F27]/30 ring-inset rounded-xl' : ''}`}
    >
      {/* Panel header */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xs font-bold text-[#0f1923] flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-[#EF9F27]" />
            Unscheduled
            <span className="bg-[#EF9F27]/15 text-[#EF9F27] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {undated.length}
            </span>
          </h2>
          <div className="relative group/sort">
            <button className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100">
              <ArrowDownUp size={12} />
            </button>
            <div className="absolute right-0 top-6 z-30 hidden group-hover/sort:block bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36">
              {([['amount_desc', 'Largest first'], ['amount_asc', 'Smallest first'], ['project', 'By project']] as [UnscheduledSortKey, string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${sortKey === k ? 'bg-gray-50 text-[#0f1923] font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Financial summary */}
        {(totalUnscheduledOut > 0 || totalUnscheduledIn > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1">
            {totalUnscheduledOut > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-amber-700">Payments out</span>
                <span className="text-[10px] font-bold text-[#E24B4A]">-{fmtTHBCompact(totalUnscheduledOut)}</span>
              </div>
            )}
            {totalUnscheduledIn > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-amber-700">Income in</span>
                <span className="text-[10px] font-bold text-[#1D9E75]">+{fmtTHBCompact(totalUnscheduledIn)}</span>
              </div>
            )}
            <p className="text-[9px] text-amber-600 leading-snug pt-0.5 border-t border-amber-200">
              Not included in weekly balances above. Drag to schedule.
            </p>
          </div>
        )}
      </div>

      {/* Scrollable cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 min-h-0">

        {/* Income section */}
        {undatedIncome.length > 0 && (
          <div>
            <button
              onClick={() => setIncomeCollapsed(!incomeCollapsed)}
              className="w-full flex items-center justify-between mb-1.5 group/sec"
            >
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1">
                <TrendingUp size={9} className="text-[#1D9E75]" />
                Income ({undatedIncome.length})
              </span>
              {incomeCollapsed ? <ChevronRight size={10} className="text-gray-400" /> : <ChevronUp size={10} className="text-gray-400" />}
            </button>
            {!incomeCollapsed && undatedIncome.map(card => (
              <DraggableCardComponent key={card.id} card={card} onQuickAssign={onQuickAssign} />
            ))}
          </div>
        )}

        {undatedIncome.length === 0 && undatedPayments.length > 0 && (
          <p className="text-[10px] text-gray-400 italic flex items-center gap-1">
            <Check size={10} className="text-[#1D9E75]" />
            All milestones are scheduled
          </p>
        )}

        {/* Payments section */}
        {undatedPayments.length > 0 && (
          <div>
            <button
              onClick={() => setPaymentsCollapsed(!paymentsCollapsed)}
              className="w-full flex items-center justify-between mb-1.5"
            >
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1">
                <TrendingDown size={9} className="text-[#EF9F27]" />
                Payments ({undatedPayments.length})
              </span>
              {paymentsCollapsed ? <ChevronRight size={10} className="text-gray-400" /> : <ChevronUp size={10} className="text-gray-400" />}
            </button>
            {!paymentsCollapsed && undatedPayments.map(card => (
              <DraggableCardComponent key={card.id} card={card} onQuickAssign={onQuickAssign} />
            ))}
          </div>
        )}

        {undated.length === 0 && (
          <div className="border-2 border-dashed rounded-lg h-16 flex items-center justify-center">
            <p className="text-xs text-gray-300">
              {isOver ? 'Drop to unschedule' : 'All items scheduled'}
            </p>
          </div>
        )}

        {/* Beyond horizon section */}
        {beyond.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => setBeyondCollapsed(!beyondCollapsed)}
              className="w-full flex items-center justify-between mb-1.5"
            >
              <span className="text-[10px] uppercase tracking-wide text-[#378ADD] font-semibold flex items-center gap-1">
                <Clock size={9} className="text-[#378ADD]" />
                Beyond 8 weeks ({beyond.length})
              </span>
              {beyondCollapsed ? <ChevronRight size={10} className="text-gray-400" /> : <ChevronUp size={10} className="text-gray-400" />}
            </button>
            {!beyondCollapsed && (
              <>
                {totalBeyondOut > 0 && (
                  <p className="text-[10px] text-[#378ADD] mb-1.5 bg-blue-50 rounded px-2 py-1">
                    {fmtTHBCompact(totalBeyondOut)} scheduled beyond the 8-week view — not shown in columns
                  </p>
                )}
                {sortCards(beyond).map(card => (
                  <DraggableCardComponent key={card.id} card={card} onQuickAssign={onQuickAssign} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opening Balance Popover
// ---------------------------------------------------------------------------

function OpeningBalancePopover({
  totalReceipts,
  totalVouchersPaid,
  netFinancing,
  totalAdjustments,
  historicalSga,
  trueCashRaw,
  projectRows,
}: {
  totalReceipts: number;
  totalVouchersPaid: number;
  netFinancing: number;
  totalAdjustments: number;
  historicalSga: number;
  trueCashRaw: number;
  projectRows: ProjectBalanceRow[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const projectNet = totalReceipts - totalVouchersPaid;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
      >
        <TrendingUp size={12} className="text-[#1D9E75]" />
        <span className="text-xs text-gray-600">
          Corporate Bank Balance (Est.): <strong className={trueCashRaw >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}>{fmtTHB(trueCashRaw)}</strong>
        </span>
        <Info size={11} className="text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-[520px] p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-[#0f1923]">Corporate Bank Balance Breakdown</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Project cash + financing + adjustments − SG&A actuals to date
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 ml-2">
              <X size={14} />
            </button>
          </div>

          {/* Bridge calculation */}
          <div className="mb-4 border border-gray-100 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-100">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">How We Arrive at This Number</p>
            </div>
            <div className="divide-y divide-gray-50">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-600">Net Project Cash (Received − Paid to Vendors)</span>
                <span className={`text-xs font-semibold tabular-nums ${projectNet >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {projectNet >= 0 ? '+' : ''}{fmtTHBCompact(projectNet)}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-600">Net Financing (Loans Drawn − Repaid)</span>
                <span className={`text-xs font-semibold tabular-nums ${netFinancing >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {netFinancing >= 0 ? '+' : ''}{fmtTHBCompact(netFinancing)}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-600">Corporate Adjustments (All-Time)</span>
                <span className={`text-xs font-semibold tabular-nums ${totalAdjustments >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {totalAdjustments >= 0 ? '+' : ''}{fmtTHBCompact(totalAdjustments)}
                </span>
              </div>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs text-gray-600">SG&A Actuals (Historical — to this month)</span>
                <span className="text-xs font-semibold tabular-nums text-[#E24B4A]">
                  -{fmtTHBCompact(historicalSga)}
                </span>
              </div>
              <div className={`flex items-center justify-between px-3 py-2.5 font-bold ${trueCashRaw >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <span className="text-xs text-[#0f1923]">= Corporate Bank Balance (Est.)</span>
                <span className={`text-sm tabular-nums ${trueCashRaw >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {trueCashRaw >= 0 ? '+' : ''}{fmtTHBCompact(trueCashRaw)}
                </span>
              </div>
            </div>
          </div>

          {/* Project-level breakdown */}
          {projectRows.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-1.5">Project Cash By Project</p>
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-2.5 py-1.5 text-[10px] text-gray-500 font-semibold">Project</th>
                      <th className="text-right px-2.5 py-1.5 text-[10px] text-gray-500 font-semibold">Received</th>
                      <th className="text-right px-2.5 py-1.5 text-[10px] text-gray-500 font-semibold">Paid Out</th>
                      <th className="text-right px-2.5 py-1.5 text-[10px] text-gray-500 font-semibold">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectRows.map((row, i) => (
                      <tr key={row.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-2.5 py-1.5 text-[#0f1923] font-medium truncate max-w-[160px]" title={row.name}>
                          {row.name.length > 22 ? row.name.slice(0, 22) + '…' : row.name}
                        </td>
                        <td className="px-2.5 py-1.5 text-right text-[#1D9E75] font-medium">
                          {fmtTHBCompact(row.received)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right text-[#E24B4A] font-medium">
                          -{fmtTHBCompact(row.paid)}
                        </td>
                        <td className={`px-2.5 py-1.5 text-right font-bold ${row.net >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                          {row.net >= 0 ? '+' : ''}{fmtTHBCompact(row.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td className="px-2.5 py-1.5 text-[10px] text-gray-500 font-bold">TOTAL</td>
                      <td className="px-2.5 py-1.5 text-right text-[10px] font-bold text-[#1D9E75]">{fmtTHBCompact(totalReceipts)}</td>
                      <td className="px-2.5 py-1.5 text-right text-[10px] font-bold text-[#E24B4A]">-{fmtTHBCompact(totalVouchersPaid)}</td>
                      <td className={`px-2.5 py-1.5 text-right text-[10px] font-bold ${projectNet >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>{fmtTHBCompact(projectNet)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}

          <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
            Receipts: <code className="bg-gray-100 px-1 rounded">client_invoice_payments</code> · Paid: <code className="bg-gray-100 px-1 rounded">payment_vouchers</code> · Financing: <code className="bg-gray-100 px-1 rounded">loan_transactions</code> · Adj: <code className="bg-gray-100 px-1 rounded">treasury_adjustments</code> · SG&A: <code className="bg-gray-100 px-1 rounded">sga_actuals</code>
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick-assign week picker modal
// ---------------------------------------------------------------------------

function QuickAssignModal({
  card,
  weekStarts,
  onAssign,
  onClose,
}: {
  card: DraggableCard;
  weekStarts: Date[];
  onAssign: (card: DraggableCard, weekStart: Date) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-[#0f1923]">Assign to Week</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[240px]">
              {card.projectName}
              {card.type === 'invoice' && card.vendorName ? ` · ${card.vendorName}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-1.5">
          {weekStarts.map((ws, i) => (
            <button
              key={i}
              onClick={() => { onAssign(card, ws); onClose(); }}
              className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#1D9E75] hover:bg-green-50 transition-colors group"
            >
              <p className="text-xs font-semibold text-[#0f1923] group-hover:text-[#1D9E75]">
                Week {i + 1}
              </p>
              <p className="text-[10px] text-gray-400">
                {format(ws, 'EEE d MMM')} – {format(addDays(ws, 6), 'EEE d MMM')}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CashFlowPlanner() {
  useAuth();

  // ── Kanban state ─────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<ClientMilestoneRow[]>([]);
  const [invoices, setInvoices] = useState<(VendorInvoice & { vendor?: { name: string }; project?: Project })[]>([]);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [totalVouchersPaid, setTotalVouchersPaid] = useState(0);
  const [projectBalanceRows, setProjectBalanceRows] = useState<ProjectBalanceRow[]>([]);
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
  const [quickAssignCard, setQuickAssignCard] = useState<DraggableCard | null>(null);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Treasury seed state ───────────────────────────────────────────────────
  const [treasuryLoanTx, setTreasuryLoanTx] = useState<{ cash_flow_direction: string; amount: number }[]>([]);
  const [treasuryAdj, setTreasuryAdj] = useState<{ amount: number }[]>([]);
  const [treasurySgaActuals, setTreasurySgaActuals] = useState<{ year: number; month: number; amount: number }[]>([]);

  // ── Chart state ───────────────────────────────────────────────────────────
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
  const horizonEnd = addDays(weekStarts[7], 6);

  useEffect(() => {
    loadData();
    loadChartData();
  }, []);

  // ── Kanban data load ──────────────────────────────────────────────────────

  async function loadData() {
    setLoading(true);
    const [projectsRes, milestonesRes, invoicesRes, receiptsRes, vouchersRes, receiptsByProjectRes, vouchersByProjectRes, loanTxRes, adjRes, sgaRes] = await Promise.all([
      supabase.from('projects').select('*').order('name'),
      supabase
        .from('client_milestones')
        .select('id, project_id, milestone_number, milestone_description, milestone_pct, payment_plan_amount, planned_receive_date, status, project:projects(*)')
        .neq('status', 'received'),
      supabase
        .from('vendor_invoices')
        .select('*, vendor:entities!vendor_id(name), project:projects(*), purchase_order:purchase_orders(pss_po_no, supplier_name_raw)')
        .in('status', VENDOR_INVOICE_UNPAID_STATUSES),
      supabase
        .from('client_invoice_payments')
        .select('amount')
        .gt('amount', 0),
      supabase
        .from('payment_vouchers')
        .select('net_paid')
        .eq('status', 'issued'),
      // Per-project receipts for opening balance breakdown
      supabase
        .from('client_invoice_payments')
        .select('amount, client_invoice:client_invoices(client_milestone:client_milestones(project:projects(name)))')
        .gt('amount', 0),
      // Per-project payments for opening balance breakdown
      supabase
        .from('payment_vouchers')
        .select('net_paid, project:projects(name)')
        .eq('status', 'issued'),
      // Treasury seed data
      supabase.from('loan_transactions').select('cash_flow_direction, amount'),
      supabase.from('treasury_adjustments').select('amount'),
      supabase.from('sga_actuals').select('year, month, amount'),
    ]);

    setProjects(projectsRes.data ?? []);
    setMilestones((milestonesRes.data ?? []) as ClientMilestoneRow[]);
    setInvoices(invoicesRes.data ?? []);
    setTotalReceipts(
      (receiptsRes.data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0)
    );
    setTotalVouchersPaid(
      (vouchersRes.data ?? []).reduce((s: number, v: { net_paid: number }) => s + (v.net_paid ?? 0), 0)
    );

    // Build per-project balance rows
    const receiptMap = new Map<string, number>();
    for (const r of (receiptsByProjectRes.data ?? []) as any[]) {
      const name = r.client_invoice?.client_milestone?.project?.name;
      if (name) receiptMap.set(name, (receiptMap.get(name) ?? 0) + Number(r.amount));
    }
    const paidMap = new Map<string, number>();
    for (const v of (vouchersByProjectRes.data ?? []) as any[]) {
      const name = v.project?.name;
      if (name) paidMap.set(name, (paidMap.get(name) ?? 0) + Number(v.net_paid));
    }
    const allProjectNames = new Set([...receiptMap.keys(), ...paidMap.keys()]);
    const rows: ProjectBalanceRow[] = [...allProjectNames].map(name => {
      const received = receiptMap.get(name) ?? 0;
      const paid = paidMap.get(name) ?? 0;
      return { name, received, paid, net: received - paid };
    }).sort((a, b) => b.received - a.received);
    setProjectBalanceRows(rows);

    setTreasuryLoanTx((loanTxRes.data ?? []) as { cash_flow_direction: string; amount: number }[]);
    setTreasuryAdj((adjRes.data ?? []) as { amount: number }[]);
    setTreasurySgaActuals((sgaRes.data ?? []) as { year: number; month: number; amount: number }[]);

    setLoading(false);
  }

  // ── Chart data load ───────────────────────────────────────────────────────

  async function loadChartData() {
    setChartLoading(true);

    const [paidRes, receivedRes, allMsRes, allInvRes, clientMsRes, clientReceiptsRes] = await Promise.all([
      supabase
        .from('vendor_invoices')
        .select('po_id, invoice_date, invoice_amount_incl_vat, purchase_order:purchase_orders(milestones:po_milestones(amount_due, planned_payment_date))')
        .in('status', VENDOR_INVOICE_PAID_STATUSES),
      supabase
        .from('vendor_invoices')
        .select('po_id, invoice_amount_incl_vat, received_amount, purchase_order:purchase_orders(milestones:po_milestones(amount_due, planned_payment_date))')
        .in('status', VENDOR_INVOICE_UNPAID_STATUSES),
      supabase
        .from('po_milestones')
        .select('purchase_order_id, amount_due, planned_payment_date')
        .order('planned_payment_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('vendor_invoices')
        .select('po_id, invoice_amount_incl_vat'),
      supabase
        .from('client_milestones')
        .select('id, payment_plan_amount, planned_receive_date'),
      supabase
        .from('client_invoice_payments')
        .select('client_invoice:client_invoices(client_milestone_id), amount, payment_date')
        .gt('amount', 0),
    ]);

    setPaidInvoices(
      (paidRes.data ?? []).map((vi: any) => ({
        po_id: vi.po_id,
        invoice_date: vi.invoice_date,
        invoice_amount_incl_vat: vi.invoice_amount_incl_vat,
        milestones: vi.purchase_order?.milestones ?? [],
      }))
    );

    setReceivedInvoices(
      (receivedRes.data ?? []).map((vi: any) => ({
        po_id: vi.po_id,
        invoice_amount_incl_vat: vi.invoice_amount_incl_vat,
        received_amount: vi.received_amount ?? 0,
        milestones: vi.purchase_order?.milestones ?? [],
      }))
    );

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

    const rawClientMs = (clientMsRes.data ?? []);
    const rawClientReceipts = (clientReceiptsRes.data ?? []);

    setClientReceipts(
      rawClientReceipts.map((r: any) => ({
        received_amount: r.amount,
        receipt_date: r.payment_date ?? null,
      }))
    );

    const receivedByMilestone = new Map<string, number>();
    for (const r of rawClientReceipts) {
      const milestoneId = r.client_invoice?.client_milestone_id;
      if (milestoneId) {
        const current = receivedByMilestone.get(milestoneId) || 0;
        receivedByMilestone.set(milestoneId, current + Number(r.amount));
      }
    }

    const trueForecastMs: ChartClientMs[] = rawClientMs
      .map((m: any) => {
        const alreadyReceived = receivedByMilestone.get(m.id) || 0;
        const remaining = Number(m.payment_plan_amount) - alreadyReceived;
        return {
          id: m.id,
          payment_plan_amount: remaining,
          planned_receive_date: m.planned_receive_date,
        };
      })
      .filter((m: ChartClientMs) => m.payment_plan_amount > 0);

    setClientMs(trueForecastMs);
    setChartLoading(false);
  }

  // ── Chart aggregation ─────────────────────────────────────────────────────

  const today = new Date();
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const sweepDate = new Date(today.getFullYear(), today.getMonth(), 15);
  const sweepKey = format(sweepDate, 'yyyy-MM');

  function rollForward(dateStr: string | null): string {
    const d = dateStr ? new Date(dateStr) : today;
    const effective = d < currentMonthStart ? sweepDate : d;
    return format(effective, 'yyyy-MM');
  }

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

  const historicalInByMonth = (() => {
    const map = new Map<string, number>();
    for (const r of clientReceipts) {
      if (!r.receipt_date) continue;
      const mk = r.receipt_date.slice(0, 7);
      map.set(mk, (map.get(mk) ?? 0) + Number(r.received_amount));
    }
    return map;
  })();

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

  const forecastUninvoicedByMonth = (() => {
    const map = new Map<string, number>();
    for (const m of uninvoicedMs) {
      const mk = rollForward(m.planned_payment_date);
      map.set(mk, (map.get(mk) ?? 0) + Number(m.amount_due));
    }
    return map;
  })();

  const forecastInByMonth = (() => {
    const map = new Map<string, number>();
    for (const m of clientMs) {
      if (!m.planned_receive_date) continue;
      const mk = rollForward(m.planned_receive_date);
      map.set(mk, (map.get(mk) ?? 0) + Number(m.payment_plan_amount));
    }
    return map;
  })();

  const allKeys = new Set([
    ...historicalOutByMonth.keys(),
    ...historicalInByMonth.keys(),
    ...forecastBalanceByMonth.keys(),
    ...forecastUninvoicedByMonth.keys(),
    ...forecastInByMonth.keys(),
  ]);
  const sortedKeys = [...allKeys].sort();

  const historicalProjectNet = totalReceipts - totalVouchersPaid;

  const netFinancing = treasuryLoanTx.reduce((acc, tx) => {
    if (tx.cash_flow_direction === 'in') return acc + Number(tx.amount);
    if (tx.cash_flow_direction === 'out') return acc - Number(tx.amount);
    return acc;
  }, 0);

  const totalAdjustments = treasuryAdj.reduce((s, a) => s + Number(a.amount), 0);

  const _now = new Date();
  const _currentYear = _now.getFullYear();
  const _currentMonth = _now.getMonth() + 1;
  const historicalSga = treasurySgaActuals
    .filter(a => a.year < _currentYear || (a.year === _currentYear && a.month <= _currentMonth))
    .reduce((s, a) => s + Number(a.amount), 0);

  const trueOpeningBalance = (historicalProjectNet + netFinancing + totalAdjustments - historicalSga) / 1_000_000;

  function buildChartData(mode: ChartMode): ChartBar[] {
    const hasForecast = (k: string) =>
      forecastBalanceByMonth.has(k) || forecastUninvoicedByMonth.has(k) || forecastInByMonth.has(k);
    const hasHistorical = (k: string) =>
      historicalOutByMonth.has(k) || historicalInByMonth.has(k);

    const keys = mode === 'historical'
      ? sortedKeys.filter(k => hasHistorical(k))
      : mode === 'forecast'
      ? [...new Set([sweepKey, ...sortedKeys])].sort().filter(k => hasForecast(k))
      : [...new Set([sweepKey, ...sortedKeys])].sort().filter(k => hasHistorical(k) || hasForecast(k));

    let cumNet = mode === 'forecast' ? trueOpeningBalance : 0;

    const bars: ChartBar[] = keys.map(key => {
      let cashIn = 0;
      let outflowBalance = 0;
      let outflowUninvoiced = 0;

      if (mode === 'historical') {
        cashIn = (historicalInByMonth.get(key) ?? 0) / 1_000_000;
        outflowBalance = (historicalOutByMonth.get(key) ?? 0) / 1_000_000;
        outflowUninvoiced = 0;
      } else if (mode === 'forecast') {
        cashIn = (forecastInByMonth.get(key) ?? 0) / 1_000_000;
        outflowBalance = (forecastBalanceByMonth.get(key) ?? 0) / 1_000_000;
        outflowUninvoiced = (forecastUninvoicedByMonth.get(key) ?? 0) / 1_000_000;
      } else {
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

    if (mode === 'forecast' && trueOpeningBalance !== 0) {
      bars.unshift({
        month: 'Opening',
        key: '__opening__',
        cashIn: 0,
        outflowBalance: 0,
        outflowUninvoiced: 0,
        cumNet: +trueOpeningBalance.toFixed(2),
        openingBal: +Math.abs(trueOpeningBalance).toFixed(2),
      });
    }

    return bars;
  }

  const chartData = buildChartData(chartMode);
  const todayMonthLabel = format(today, 'MMM-yy');

  // ── Kanban derived values ─────────────────────────────────────────────────

  const buildCards = useCallback((): DraggableCard[] => {
    const cards: DraggableCard[] = [];
    for (const m of milestones) {
      if (selectedProjectId !== 'all' && m.project_id !== selectedProjectId) continue;
      const d = m.planned_receive_date;
      const weekDate = d ? parseISO(d) : null;
      let scheduleState: CardScheduleState = 'unscheduled';
      if (weekDate) {
        scheduleState = isAfter(weekDate, horizonEnd) ? 'beyond_horizon' : 'scheduled';
      }
      cards.push({
        id: `m-${m.id}`,
        type: 'milestone',
        projectName: m.project?.name ?? 'Unknown Project',
        projectId: m.project_id,
        amount: m.payment_plan_amount,
        weekDate,
        scheduleState,
        milestoneNo: m.milestone_number,
        milestonePercent: m.milestone_pct != null ? m.milestone_pct * 100 : undefined,
        milestoneDescription: m.milestone_description,
        rawMilestone: m,
      });
    }
    for (const inv of invoices) {
      if (selectedProjectId !== 'all' && inv.project_id !== selectedProjectId) continue;
      const d = inv.planned_payment_date ?? inv.original_due_date;
      const weekDate = d ? parseISO(d) : null;
      let scheduleState: CardScheduleState = 'unscheduled';
      if (weekDate) {
        scheduleState = isAfter(weekDate, horizonEnd) ? 'beyond_horizon' : 'scheduled';
      }

      // Vendor name: try entity join first, fall back to PO supplier_name_raw
      const po = (inv as any).purchase_order;
      const vendorName = inv.vendor?.name ?? po?.supplier_name_raw ?? 'Unassigned Vendor';

      cards.push({
        id: `i-${inv.id}`,
        type: 'invoice',
        projectName: inv.project?.name ?? 'Unknown Project',
        projectId: inv.project_id,
        amount: inv.net_payable,
        weekDate,
        scheduleState,
        vendorName,
        poNumber: po?.pss_po_no ?? undefined,
        invoiceNo: inv.vendor_invoice_no ?? undefined,
        invoiceStatus: inv.status,
        hasPlanningNotes: !!(inv.planning_notes),
        rawInvoice: inv,
      });
    }
    return cards;
  }, [milestones, invoices, selectedProjectId, horizonEnd]);

  const allCards = buildCards();
  const scheduledCards = allCards.filter((c) => c.scheduleState === 'scheduled');
  const unscheduledAndBeyond = allCards.filter((c) => c.scheduleState !== 'scheduled');
  const totalUnscheduledOut = allCards.filter(c => c.scheduleState === 'unscheduled' && c.type === 'invoice')
    .reduce((s, c) => s + c.amount, 0);

  function buildWeekColumns(cards: DraggableCard[]): WeekColumn[] {
    const columns: WeekColumn[] = weekStarts.map((ws, i) => ({
      weekStart: ws,
      weekEnd: addDays(ws, 6),
      weekIndex: i,
      label: `Wk ${i + 1} · ${format(ws, 'd')}–${format(addDays(ws, 6), 'd MMM')}`,
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

    let running = historicalProjectNet + netFinancing + totalAdjustments - historicalSga;
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
      c.id === card.id ? { ...c, weekDate: targetWeekStart, scheduleState: (targetWeekStart ? 'scheduled' : 'unscheduled') as CardScheduleState } : c
    );
    const scheduled = modifiedCards.filter((c) => c.scheduleState === 'scheduled');
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
      const milestoneId = card.rawMilestone.id;
      setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, planned_receive_date: isoDate } : m));
    } else if (card.type === 'invoice' && card.rawInvoice) {
      await supabase
        .from('vendor_invoices')
        .update({ planned_payment_date: isoDate })
        .eq('id', card.rawInvoice.id);
      const invoiceId = card.rawInvoice.id;
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, planned_payment_date: isoDate } : inv));
    }

    const modifiedCards = allCards.map((c) =>
      c.id === card.id ? { ...c, weekDate: targetWeekStart, scheduleState: (targetWeekStart ? 'scheduled' : 'unscheduled') as CardScheduleState } : c
    );
    const scheduled = modifiedCards.filter((c) => c.scheduleState === 'scheduled');
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
      if (card.scheduleState === 'unscheduled') return;
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
          <div className="flex flex-wrap gap-4 mt-4 items-center">
            <OpeningBalancePopover
              totalReceipts={totalReceipts}
              totalVouchersPaid={totalVouchersPaid}
              netFinancing={netFinancing}
              totalAdjustments={totalAdjustments}
              historicalSga={historicalSga}
              trueCashRaw={historicalProjectNet + netFinancing + totalAdjustments - historicalSga}
              projectRows={projectBalanceRows}
            />
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
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
          <div className="flex items-start justify-between mb-4 gap-4">
            <div>
              <h2 className="text-[13px] font-semibold text-gray-900">Cash Flow Overview — Expected Payment Month (฿M)</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">{chartSubtitle[chartMode]}</p>
            </div>
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
            {chartMode === 'forecast' && trueOpeningBalance !== 0 && (
              <span className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#EF9F27]" />
                Corporate Bank Balance (Est.) ({fmtTHBCompact(trueOpeningBalance * 1_000_000)})
              </span>
            )}
            {chartMode !== 'historical' && (
              <span className="ml-auto text-[11px] text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                Overdue items swept into {format(sweepDate, 'MMM-yy')}
              </span>
            )}
          </div>

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
                <RechartsTooltip
                  formatter={((value: number, name: string): [string, string] => {
                    if (name === 'openingBal') {
                      return [`฿${value.toFixed(1)}M (receipts - paid vouchers)`, 'Net Project Cash Position'];
                    }
                    return [
                      `฿${value.toFixed(1)}M`,
                      name === 'cashIn' ? 'Cash In'
                      : name === 'outflowBalance' ? 'Invoice Balance (Col O)'
                      : name === 'outflowUninvoiced' ? 'Yet to Invoice (Col P)'
                      : 'Cumulative Net',
                    ];
                  }) as RechartsTooltipFormatter}
                  contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                />

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
                {chartMode === 'forecast' && trueOpeningBalance !== 0 && (
                  <ReferenceLine
                    yAxisId="line"
                    y={trueOpeningBalance}
                    stroke="#EF9F27"
                    strokeDasharray="4 2"
                    strokeWidth={1.5}
                    label={{ value: `Starting: ฿${trueOpeningBalance.toFixed(1)}M`, position: 'insideTopRight', fontSize: 10, fill: '#EF9F27' }}
                  />
                )}
                {chartMode === 'forecast' && (
                  <Bar yAxisId="bars" dataKey="openingBal" fill="#EF9F27" radius={[3, 3, 0, 0]} opacity={0.9} name="openingBal" />
                )}
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

          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            {chartMode === 'historical'
              ? 'Cash Out grouped by milestone expected payment month — ties out to the Paid Invoices pivot table.'
              : chartMode === 'forecast'
              ? `Cumulative Net seeded from Corporate Bank Balance (Est.) of ฿${trueOpeningBalance.toFixed(1)}M. Dark red = Invoice Balance (Col O). Faded red = Yet to Invoice (Col P). Click the position chip in the header for a project-by-project breakdown.`
              : 'Past months show actual settled cash. Current month onwards shows forecast split into Invoice Balance (dark) + Yet to Invoice (faded). Cumulative Net runs continuously across both periods.'}
          </p>
        </div>
      </div>

      {/* ── Unscheduled impact warning ────────────────────────────────────── */}
      {totalUnscheduledOut > 0 && (
        <div className="mx-6 mt-4 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-200 bg-amber-50">
          <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
          <p className="text-xs text-amber-700 flex-1">
            <strong>{fmtTHBCompact(totalUnscheduledOut)}</strong> in vendor payments
            {unscheduledAndBeyond.filter(c => c.scheduleState === 'unscheduled' && c.type === 'invoice').length > 0
              ? ` (${unscheduledAndBeyond.filter(c => c.scheduleState === 'unscheduled' && c.type === 'invoice').length} invoice${unscheduledAndBeyond.filter(c => c.scheduleState === 'unscheduled' && c.type === 'invoice').length > 1 ? 's' : ''})`
              : ''
            } are unscheduled and excluded from the weekly balance above. Use the panel on the left to drag them into a week.
          </p>
          <SlidersHorizontal size={12} className="text-amber-500 flex-shrink-0" />
        </div>
      )}

      {/* ── Two-panel layout: Unscheduled sidebar + Kanban ───────────────── */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver as never}
        onDragEnd={handleDragEnd}
      >
        <div className="flex mt-4 mx-6 mb-8 gap-4 items-start">
          {/* Left panel — Unscheduled */}
          <div className="w-64 flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
            style={{ maxHeight: 'calc(100vh - 280px)', position: 'sticky', top: '80px', display: 'flex', flexDirection: 'column' }}>
            <UnscheduledPanel
              cards={unscheduledAndBeyond}
              onQuickAssign={(card) => setQuickAssignCard(card)}
            />
          </div>

          {/* Right panel — Kanban scrollable */}
          <div className="flex-1 overflow-x-auto pb-4 min-w-0">
            <div className="flex flex-nowrap gap-3">
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
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? <DraggableCardComponent card={activeCard} isDragOverlay /> : null}
        </DragOverlay>
      </DndContext>

      {/* ── Quick-assign modal ────────────────────────────────────────────── */}
      {quickAssignCard && (
        <QuickAssignModal
          card={quickAssignCard}
          weekStarts={weekStarts}
          onAssign={(card, weekStart) => {
            const check = wouldCauseNegative(card, weekStart);
            if (check.negative) {
              setWarningModal({
                open: true,
                weekLabel: check.weekLabel,
                weekIndex: check.weekIndex,
                pendingCard: card,
                pendingTargetWeekStart: weekStart,
              });
            } else {
              applyMove(card, weekStart);
            }
          }}
          onClose={() => setQuickAssignCard(null)}
        />
      )}

      {/* ── Warning modal ─────────────────────────────────────────────────── */}
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
