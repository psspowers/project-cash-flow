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
import { supabase } from '../lib/supabase';
import { Milestone, VendorInvoice, Project, fmtTHB, fmtTHBCompact } from '../types';
import { useAuth } from '../context/AuthContext';

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
  rawMilestone?: Milestone & { project?: Project };
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

export default function CashFlowPlanner() {
  useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<(Milestone & { project?: Project })[]>([]);
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const weekStarts = Array.from({ length: 8 }, (_, i) =>
    startOfWeek(addWeeks(new Date(), i), { weekStartsOn: 1 })
  );

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [projectsRes, milestonesRes, invoicesRes, receiptsRes, vouchersRes] = await Promise.all([
      supabase.from('projects').select('*').order('name'),
      supabase.from('milestones').select('*, project:projects(*)').in('status', ['invoiced', 'planned']),
      supabase
        .from('vendor_invoices')
        .select('*, vendor:entities!vendor_id(name), project:projects(*), purchase_order:purchase_orders(*)')
        .in('status', ['released', 'approved_evp']),
      supabase.from('cash_receipts').select('net_received'),
      supabase.from('vendor_invoices').select('received_amount').gt('received_amount', 0),
    ]);

    setProjects(projectsRes.data ?? []);
    setMilestones(milestonesRes.data ?? []);
    setInvoices(invoicesRes.data ?? []);
    setTotalReceipts(
      (receiptsRes.data ?? []).reduce((s: number, r: { net_received: number }) => s + (r.net_received ?? 0), 0)
    );
    setTotalVouchersPaid(
      (vouchersRes.data ?? []).reduce((s: number, v: { received_amount: number }) => s + (v.received_amount ?? 0), 0)
    );
    setLoading(false);
  }

  const buildCards = useCallback((): DraggableCard[] => {
    const cards: DraggableCard[] = [];
    for (const m of milestones) {
      if (selectedProjectId !== 'all' && m.project_id !== selectedProjectId) continue;
      const d = m.planned_date_override ?? m.planned_date;
      cards.push({
        id: `m-${m.id}`,
        type: 'milestone',
        projectName: m.project?.name ?? 'Unknown Project',
        projectId: m.project_id,
        amount: m.planned_amount_incl_vat,
        weekDate: d ? parseISO(d) : null,
        milestoneNo: m.milestone_no,
        milestonePercent: m.percentage,
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
        .from('milestones')
        .update({ planned_date_override: isoDate })
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

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <style>{PULSE_STYLE}</style>

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
