import { useMemo, useState } from 'react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
  ComposedChart, Line, Legend, Scatter,
} from 'recharts';
import { AlertTriangle, TrendingUp, ArrowRightLeft, CheckCircle, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useProjectDetail } from '../../../context/ProjectDetailContext';
import { fmtTHB } from '../../../types';
import { formatDate } from '../../../utils/formatters';
import { useAuth } from '../../../context/AuthContext';

export default function OverviewTab() {
  const {
    project, clientInvoices, clientMilestones, marginPosition, transfers,
    allActiveProjects, isCostController, totalReceived, totalPaid, budget,
    estimation, reload,
  } = useProjectDetail();
  const { user } = useAuth();

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ to_project_id: '', amount: '', reason: '' });
  const [transferError, setTransferError] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  const contractValue = project?.contract_incl_vat ?? 0;
  const grossMarginPct = budget?.gross_margin_pct ?? estimation?.gross_margin_pct ?? null;

  const revenueForecastData = useMemo(() => {
    const contract = contractValue;
    if (contract === 0) return {
      points: [],
      receivedScatter: [] as { month: string; y: number; label: string; invoiceNo: string }[],
      invoicedScatter: [] as { month: string; y: number; label: string; invoiceNo: string; amount: number }[],
      plannedScatter: [] as { month: string; y: number; label: string; amount: number }[],
      alreadyReceived: 0, invoicedAwaiting: 0, notYetInvoiced: 0,
    };

    const invoicedMilestoneIds = new Set(clientInvoices.map(i => i.client_milestone_id));
    const alreadyReceived = clientInvoices.reduce((s, i) => s + (i.received_amount ?? 0), 0);
    const invoicedAwaiting = clientInvoices
      .filter(i => i.status === 'pending')
      .reduce((s, i) => s + Math.max(0, i.invoice_amount - (i.received_amount ?? 0)), 0);
    const notYetInvoiced = clientMilestones
      .filter(m => m.status === 'pending' && !invoicedMilestoneIds.has(m.id))
      .reduce((s, m) => s + m.payment_plan_amount, 0);

    const allMonths = new Set<string>();
    clientInvoices.forEach(inv => { if (inv.receipt_date) allMonths.add((inv.receipt_date as string).substring(0, 7)); });
    clientMilestones.forEach(ms => { if (ms.planned_receive_date) allMonths.add(ms.planned_receive_date.substring(0, 7)); });

    const eventMonths = [...allMonths].sort();
    const firstEventMonth = eventMonths[0];
    const lastEventMonth = eventMonths[eventMonths.length - 1] ?? new Date().toISOString().substring(0, 7);

    const prevMonth = (ym: string) => {
      const [y, m] = ym.split('-').map(Number);
      const pm = m - 1 === 0 ? 12 : m - 1;
      const py = m - 1 === 0 ? y - 1 : y;
      return `${py}-${String(pm).padStart(2, '0')}`;
    };
    const chartStart = firstEventMonth ? prevMonth(firstEventMonth) : new Date().toISOString().substring(0, 7);

    const fillMonths = (start: string, end: string) => {
      const [sy, sm] = start.split('-').map(Number);
      const [ey, em] = end.split('-').map(Number);
      let y = sy, mo = sm;
      while (y < ey || (y === ey && mo <= em)) {
        allMonths.add(`${y}-${String(mo).padStart(2, '0')}`);
        mo++; if (mo > 12) { mo = 1; y++; }
      }
    };
    fillMonths(chartStart, lastEventMonth);
    const sorted = [...allMonths].sort();

    const receivedDeltaMap: Record<string, number> = {};
    clientInvoices.forEach(inv => {
      if (inv.status !== 'pending' && (inv.received_amount ?? 0) > 0 && inv.receipt_date) {
        const m = (inv.receipt_date as string).substring(0, 7);
        receivedDeltaMap[m] = (receivedDeltaMap[m] ?? 0) + Number(inv.received_amount);
      }
    });
    const invoicedDeltaMap: Record<string, number> = {};
    clientInvoices.forEach(inv => {
      if (inv.invoice_date) {
        const m = inv.invoice_date.substring(0, 7);
        const outstanding = inv.invoice_amount - (inv.received_amount ?? 0);
        if (outstanding > 0) invoicedDeltaMap[m] = (invoicedDeltaMap[m] ?? 0) + outstanding;
      }
    });
    const plannedDeltaMap: Record<string, number> = {};
    clientMilestones.forEach(ms => {
      if (ms.status === 'pending' && !invoicedMilestoneIds.has(ms.id) && ms.planned_receive_date) {
        const m = ms.planned_receive_date.substring(0, 7);
        plannedDeltaMap[m] = (plannedDeltaMap[m] ?? 0) + ms.payment_plan_amount;
      }
    });

    let cumReceived = 0, cumInvoiced = 0, cumPlanned = 0;
    const points = sorted.map(month => {
      const rd = receivedDeltaMap[month] ?? 0;
      const id = invoicedDeltaMap[month] ?? 0;
      const pd = plannedDeltaMap[month] ?? 0;
      cumReceived += rd;
      cumInvoiced = Math.max(0, cumInvoiced - rd + id);
      cumPlanned += pd;
      const invoicedTotal = cumReceived + cumInvoiced;
      const plannedTotal = cumReceived + cumInvoiced + cumPlanned;
      return {
        month,
        cumReceivedLine: cumReceived > 0 ? cumReceived : null,
        cumInvoicedLine: invoicedTotal > 0 ? invoicedTotal : null,
        cumPlannedLine: cumPlanned > 0 ? plannedTotal : null,
      };
    });

    const milestoneNumById: Record<string, number> = {};
    clientMilestones.forEach(ms => { milestoneNumById[ms.id] = ms.milestone_number; });

    const receivedScatter: { month: string; y: number; label: string; invoiceNo: string }[] = [];
    const invoicedScatter: { month: string; y: number; label: string; invoiceNo: string; amount: number }[] = [];
    const plannedScatter: { month: string; y: number; label: string; amount: number }[] = [];

    let runReceived = 0, runInvoicedOutstanding = 0, runPlanned = 0;
    const sortedInvoicesByDate = [...clientInvoices]
      .filter(inv => inv.status !== 'pending' && (inv.received_amount ?? 0) > 0 && inv.receipt_date)
      .sort((a, b) => (a.receipt_date as string).localeCompare(b.receipt_date as string) || (a.invoice_no ?? '').localeCompare(b.invoice_no ?? ''));
    const sortedMilestonesByDate = [...clientMilestones]
      .filter(ms => ms.status === 'pending' && !invoicedMilestoneIds.has(ms.id) && ms.planned_receive_date)
      .sort((a, b) => (a.planned_receive_date ?? '').localeCompare(b.planned_receive_date ?? '') || a.milestone_number - b.milestone_number);

    sorted.forEach(month => {
      const monthReceivedInvs = sortedInvoicesByDate.filter(inv => (inv.receipt_date as string)?.substring(0, 7) === month);
      monthReceivedInvs.forEach(inv => {
        runReceived += inv.received_amount;
        const msNum = milestoneNumById[inv.client_milestone_id];
        receivedScatter.push({ month, y: runReceived, label: msNum != null ? `M${msNum}` : (inv.invoice_no ?? '—'), invoiceNo: inv.invoice_no ?? '—' });
      });
      const receivedThisMonth = monthReceivedInvs.reduce((s, i) => s + i.received_amount, 0);
      runInvoicedOutstanding = Math.max(0, runInvoicedOutstanding - receivedThisMonth);
      const monthInvoicedInvs = clientInvoices.filter(inv => inv.invoice_date?.substring(0, 7) === month && (inv.invoice_amount - (inv.received_amount ?? 0)) > 0);
      monthInvoicedInvs.forEach(inv => {
        const outstanding = inv.invoice_amount - (inv.received_amount ?? 0);
        runInvoicedOutstanding += outstanding;
        const msNum = milestoneNumById[inv.client_milestone_id];
        invoicedScatter.push({ month, y: runReceived + runInvoicedOutstanding, label: msNum != null ? `M${msNum}` : (inv.invoice_no ?? '—'), invoiceNo: inv.invoice_no ?? '—', amount: outstanding });
      });
      sortedMilestonesByDate.filter(ms => ms.planned_receive_date?.substring(0, 7) === month).forEach(ms => {
        runPlanned += ms.payment_plan_amount;
        plannedScatter.push({ month, y: runReceived + runInvoicedOutstanding + runPlanned, label: `M${ms.milestone_number}`, amount: ms.payment_plan_amount });
      });
    });

    return { points, receivedScatter, invoicedScatter, plannedScatter, alreadyReceived, invoicedAwaiting, notYetInvoiced };
  }, [clientInvoices, clientMilestones, contractValue]);

  async function submitTransfer() {
    if (!project?.id || !user) return;
    setTransferError('');
    const amt = parseFloat(transferForm.amount) || 0;
    if (!transferForm.to_project_id) { setTransferError('Please select a destination project.'); return; }
    if (amt <= 0) { setTransferError('Amount must be greater than zero.'); return; }
    if (marginPosition && amt > marginPosition.availableToTransfer) {
      setTransferError(`Maximum transferable amount is ${fmtTHB(marginPosition.availableToTransfer)} based on current collection rate of ${marginPosition.collectionRatePct}.`);
      return;
    }
    if (!transferForm.reason || transferForm.reason.trim().length < 20) {
      setTransferError('Reason must be at least 20 characters.'); return;
    }
    setTransferSubmitting(true);
    const { data: actorProfile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const actorName = (actorProfile as { full_name: string } | null)?.full_name ?? 'A team member';
    const { data: inserted, error } = await supabase.from('project_cash_transfers').insert({
      from_project_id: project.id,
      to_project_id: transferForm.to_project_id,
      amount: amt,
      reason: transferForm.reason.trim(),
      status: 'proposed',
      proposed_by: user.id,
      proposed_at: new Date().toISOString(),
    }).select().maybeSingle();
    if (error) { setTransferError(error.message); setTransferSubmitting(false); return; }
    const toProj = allActiveProjects.find(p => p.id === transferForm.to_project_id);
    const { data: evpData } = await supabase.from('user_profiles').select('id').eq('role', 'evp').maybeSingle();
    if (evpData && inserted) {
      await supabase.from('notifications').insert({
        user_id: (evpData as { id: string }).id,
        title: 'Margin transfer proposed — review required',
        message: `${actorName} has proposed transferring ${fmtTHB(amt)} from ${project.name} to ${toProj?.name ?? ''}. Reason: ${transferForm.reason.trim()}. Awaiting your recommendation.`,
        type: 'info', is_read: false,
        related_entity_type: 'project_cash_transfer',
        related_entity_id: inserted.id,
      });
    }
    setShowTransferModal(false);
    setTransferForm({ to_project_id: '', amount: '', reason: '' });
    setTransferError('');
    setTransferSubmitting(false);
    reload();
  }

  const netCash = totalReceived - totalPaid;
  const gmPct = grossMarginPct != null ? Number(grossMarginPct) : null;
  const gmColor = gmPct == null ? 'text-gray-400' : gmPct >= 15 ? 'text-[#1D9E75]' : gmPct >= 10 ? 'text-[#EF9F27]' : 'text-[#E24B4A]';
  const receivedColor = totalReceived >= contractValue && contractValue > 0 ? 'text-[#1D9E75]' : 'text-[#0f1923]';
  const netColor = netCash >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]';
  const fmtCompact = (v: number) => {
    const abs = Math.abs(v);
    const sign = v < 0 ? '- ' : '';
    if (abs >= 1_000_000) return `${sign}฿${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}฿${Math.round(abs / 1_000)}K`;
    return `${sign}฿${abs.toLocaleString()}`;
  };
  const receivedPct = contractValue > 0 ? Math.min((totalReceived / contractValue) * 100, 100) : 0;
  const costPct = contractValue > 0 ? Math.min((totalPaid / contractValue) * 100, 100) : 0;
  const gmAmount = budget?.gross_margin_amount ?? estimation?.gross_margin_amount ?? null;
  const netCashLabel = totalReceived === 0 && totalPaid > 0
    ? 'Paid out, nothing in yet'
    : netCash >= 0 ? `฿${Math.round(netCash / 1000)}K ahead of costs` : `฿${Math.round(Math.abs(netCash) / 1000)}K more paid than received`;

  const { points, receivedScatter, invoicedScatter, plannedScatter, alreadyReceived, invoicedAwaiting, notYetInvoiced } = revenueForecastData;
  const sumCheck = alreadyReceived + invoicedAwaiting + notYetInvoiced;
  const hasGap = contractValue > 0 && Math.abs(sumCheck - contractValue) > 1;
  const today = new Date().toISOString().substring(0, 7);
  const fmtY = (v: number) => {
    if (v >= 1_000_000) return `฿${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `฿${(v / 1_000).toFixed(0)}K`;
    return `฿${v}`;
  };
  const fmtMonth = (ym: string) => {
    try { const [y, m] = ym.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' }); }
    catch { return ym; }
  };

  type ScatterEntry = { month: string; y: number; label: string; invoiceNo?: string; amount?: number };
  const ScatterTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: ScatterEntry; fill: string }[] }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const color = payload[0].fill;
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
        <p className="font-semibold text-[#0f1923] mb-1">{fmtMonth(d.month)}</p>
        <p style={{ color }} className="font-medium mb-1">{d.label}</p>
        {d.amount != null && <div className="flex justify-between gap-6 text-gray-600"><span>Amount</span><span className="font-medium tabular-nums">{fmtTHB(d.amount)}</span></div>}
        <div className="flex justify-between gap-6 text-gray-600 mt-0.5"><span>Cumulative</span><span className="font-medium tabular-nums">{fmtTHB(d.y)}</span></div>
        {contractValue > 0 && <div className="flex justify-between gap-6 text-gray-400 mt-1 pt-1 border-t border-gray-100"><span>of contract</span><span className="tabular-nums">{((d.y / contractValue) * 100).toFixed(0)}%</span></div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="px-5 pt-4 pb-4 border-r border-[rgba(0,0,0,0.07)] flex flex-col" title={fmtTHB(contractValue)}>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400 h-8 flex items-start">Contract Value</p>
            <p className="text-[22px] font-medium tabular-nums tracking-[-0.02em] text-[#0f1923] leading-none">{fmtCompact(contractValue)}</p>
            <p className="text-[12px] text-gray-400 mt-2 leading-tight">incl. VAT</p>
          </div>
          <div className="px-5 pt-4 pb-4 border-r border-[rgba(0,0,0,0.07)] flex flex-col" title={fmtTHB(totalReceived)}>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400 h-8 flex items-start">Received</p>
            <p className={`text-[22px] font-medium tabular-nums tracking-[-0.02em] leading-none ${receivedColor}`}>{fmtCompact(totalReceived)}</p>
            <div className="mt-2 h-5 flex items-center gap-2">
              <div className="flex-1 h-[3px] rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-[#1D9E75] rounded-full transition-all duration-500" style={{ width: `${receivedPct}%` }} />
              </div>
              <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{receivedPct.toFixed(0)}%</span>
            </div>
          </div>
          <div className="px-5 pt-4 pb-4 border-r border-[rgba(0,0,0,0.07)] flex flex-col" title={fmtTHB(totalPaid)}>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400 h-8 flex items-start">Cost Paid</p>
            <p className="text-[22px] font-medium tabular-nums tracking-[-0.02em] text-[#0f1923] leading-none">{fmtCompact(totalPaid)}</p>
            <div className="mt-2 h-5 flex items-center gap-2">
              <div className="flex-1 h-[3px] rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-[#E24B4A] rounded-full transition-all duration-500" style={{ width: `${costPct}%` }} />
              </div>
              <span className="text-[11px] text-gray-400 tabular-nums shrink-0">{costPct.toFixed(1)}%</span>
            </div>
          </div>
          <div className="relative px-5 pt-4 pb-4 border-r border-[rgba(0,0,0,0.07)] flex flex-col">
            <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-[#1D9E75]" />
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400 h-8 flex items-start">Gross Margin (Budget)</p>
            <p className={`text-[22px] font-medium tabular-nums tracking-[-0.02em] leading-none ${gmColor}`}>{gmPct != null ? `${gmPct.toFixed(1)}%` : '—'}</p>
            <p className="text-[12px] text-gray-400 mt-2 leading-tight">{gmAmount != null ? `${fmtTHB(gmAmount)} at completion` : 'No budget set'}</p>
          </div>
          <div className="relative px-5 pt-4 pb-4 flex flex-col">
            <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${netCash >= 0 ? 'bg-[#1D9E75]' : 'bg-[#E24B4A]'}`} />
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-400 h-8 flex items-start">Net Cash Position</p>
            <p className={`text-[22px] font-medium tabular-nums tracking-[-0.02em] leading-none ${netColor}`}>{fmtCompact(netCash)}</p>
            <p className="text-[12px] text-gray-400 mt-2 leading-tight">{netCashLabel}</p>
          </div>
        </div>
      </div>

      {/* Revenue Forecast */}
      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
          <h2 className="text-sm font-semibold text-[#0f1923]">Revenue Forecast — Client Payment S-Curve</h2>
          <p className="text-xs text-gray-400 mt-0.5">Cumulative cash-in from contract start to completion</p>
        </div>
        {hasGap && (
          <div className="mx-5 mt-4 flex items-center gap-2 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="text-[#EF9F27] shrink-0" />
            <p className="text-xs text-[#92650a]">Milestone amounts ({fmtTHB(sumCheck)}) do not equal contract value ({fmtTHB(contractValue)}). Check milestone data.</p>
          </div>
        )}
        <div className="px-5 pt-4 pb-2">
          {points.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart margin={{ top: 20, right: 24, left: 16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={fmtMonth} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={fmtY} width={70} />
                <Tooltip content={<ScatterTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <ReferenceLine x={today} stroke="#9ca3af" strokeDasharray="4 2" label={{ value: 'Today', position: 'top', fontSize: 10, fill: '#9ca3af' }} />
                <Line data={points} dataKey="cumReceivedLine" stroke="none" dot={false} activeDot={false} legendType="none" />
                {receivedScatter.length > 0 && <Line data={receivedScatter} dataKey="y" name="Received" type="stepAfter" stroke="#1D9E75" strokeWidth={2.5} dot={false} activeDot={false} connectNulls legendType="circle" />}
                {invoicedScatter.length > 0 && <Line data={invoicedScatter} dataKey="y" name="Invoiced (pending)" type="stepAfter" stroke="#EF9F27" strokeWidth={2.5} dot={false} activeDot={false} connectNulls legendType="circle" />}
                {plannedScatter.length > 0 && <Line data={plannedScatter} dataKey="y" name="Forecast" type="stepAfter" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="6 4" dot={false} activeDot={false} connectNulls legendType="circle" />}
                {receivedScatter.length > 0 && (
                  <Scatter name="Received dots" data={receivedScatter} dataKey="y" xAxisId={0} yAxisId={0} fill="#1D9E75" legendType="none"
                    shape={(props: { cx?: number; cy?: number; payload?: { label: string } }) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null) return <g />;
                      return <g><circle cx={cx} cy={cy} r={6} fill="#1D9E75" stroke="#fff" strokeWidth={2} /><text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill="#1D9E75">{payload?.label}</text></g>;
                    }}
                  />
                )}
                {invoicedScatter.length > 0 && (
                  <Scatter name="Invoiced dots" data={invoicedScatter} dataKey="y" xAxisId={0} yAxisId={0} fill="#EF9F27" legendType="none"
                    shape={(props: { cx?: number; cy?: number; payload?: { label: string } }) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null) return <g />;
                      return <g><circle cx={cx} cy={cy} r={5} fill="#EF9F27" stroke="#fff" strokeWidth={2} /><text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill="#EF9F27">{payload?.label}</text></g>;
                    }}
                  />
                )}
                {plannedScatter.length > 0 && (
                  <Scatter name="Forecast dots" data={plannedScatter} dataKey="y" xAxisId={0} yAxisId={0} fill="#3B82F6" legendType="none"
                    shape={(props: { cx?: number; cy?: number; payload?: { label: string } }) => {
                      const { cx, cy, payload } = props;
                      if (cx == null || cy == null) return <g />;
                      return <g><circle cx={cx} cy={cy} r={5} fill="#fff" stroke="#3B82F6" strokeWidth={2} /><text x={cx} y={cy - 10} textAnchor="middle" fontSize={10} fontWeight={600} fill="#3B82F6">{payload?.label}</text></g>;
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-gray-400">No revenue data yet — add client milestones to see the forecast.</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-4 border-t border-[rgba(0,0,0,0.06)]">
          {[
            { label: 'Already Received', value: alreadyReceived, color: 'text-[#1D9E75]', dot: 'bg-[#1D9E75]' },
            { label: 'Invoiced — Awaiting', value: invoicedAwaiting, color: 'text-[#EF9F27]', dot: 'bg-[#EF9F27]' },
            { label: 'Not Yet Invoiced', value: notYetInvoiced, color: 'text-[#3B82F6]', dot: 'bg-[#3B82F6]' },
            { label: 'Total Contract', value: contractValue, color: 'text-[#0f1923]', dot: 'bg-[#0f1923]' },
          ].map((item, i) => (
            <div key={item.label} className={`px-5 py-4 ${i < 3 ? 'border-r border-[rgba(0,0,0,0.06)]' : ''}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                <span className="text-xs text-gray-400">{item.label}</span>
              </div>
              <p className={`text-base font-bold ${item.color}`}>{fmtTHB(item.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Margin Transfer */}
      {project?.status === 'active' && marginPosition && (
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-[#1D9E75]" />
              <h2 className="text-sm font-semibold text-[#0f1923]">Margin Transfer</h2>
            </div>
            {isCostController && !marginPosition.isTransferBlocked && (
              <button onClick={() => { setTransferForm({ to_project_id: '', amount: '', reason: '' }); setTransferError(''); setShowTransferModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors">
                <ArrowRightLeft size={13} />Propose Transfer
              </button>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-500">Contract collected</span>
                <span className="font-medium text-gray-700">{fmtTHB(marginPosition.totalReceived)} of {fmtTHB(marginPosition.contractInclVat)}<span className="text-gray-400 ml-1">({marginPosition.collectionRatePct})</span></span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-[#1D9E75] rounded-full transition-all duration-500" style={{ width: `${Math.min(marginPosition.collectionRate * 100, 100)}%` }} />
              </div>
            </div>
            <div className="space-y-1.5 text-xs pt-1">
              {[
                { label: 'Forecast margin at completion', value: marginPosition.forecastMarginAtCompletion, color: marginPosition.forecastMarginAtCompletion > 0 ? 'text-[#0f1923]' : 'text-[#E24B4A]' },
                { label: `Earned to date (${marginPosition.collectionRatePct})`, value: marginPosition.releasableMargin, color: 'text-[#0f1923]' },
                { label: 'Already transferred out', value: marginPosition.alreadyTransferred, color: 'text-[#0f1923]' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-500">{label}</span>
                  <span className={`font-medium ${color}`}>{fmtTHB(value)}</span>
                </div>
              ))}
              <div className={`flex justify-between py-1.5 rounded-lg px-2 -mx-2 ${marginPosition.isTransferBlocked ? 'bg-gray-50' : 'bg-[#1D9E75]/5'}`}>
                <span className={`font-semibold ${marginPosition.isTransferBlocked ? 'text-gray-400' : 'text-[#0f1923]'}`}>Available to transfer</span>
                <span className={`font-bold text-sm ${marginPosition.isTransferBlocked ? 'text-gray-400' : 'text-[#1D9E75]'}`}>{fmtTHB(marginPosition.availableToTransfer)}</span>
              </div>
            </div>
            {marginPosition.isTransferBlocked && marginPosition.blockReason && (
              <div className="flex items-start gap-2 bg-[#EF9F27]/8 border border-[#EF9F27]/25 rounded-lg p-3 mt-1">
                <AlertTriangle size={13} className="text-[#EF9F27] shrink-0 mt-0.5" />
                <p className="text-xs text-[#92650a]">{marginPosition.blockReason}</p>
              </div>
            )}
            {transfers.length > 0 && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-gray-600 mb-2">Transfer History</p>
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['Date', 'Direction', 'Amount', 'Status'].map(h => (
                          <th key={h} className={`${h === 'Amount' ? 'text-right' : h === 'Status' ? 'text-center' : 'text-left'} px-3 py-2 font-medium text-gray-500`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {transfers.map(t => {
                        const isOut = t.from_project_id === project?.id;
                        const other = isOut ? t.to_project : t.from_project;
                        const statusMap: Record<string, { label: string; cls: string }> = {
                          proposed: { label: 'Proposed', cls: 'bg-gray-100 text-gray-600' },
                          evp_recommended: { label: 'EVP Recommended', cls: 'bg-blue-50 text-blue-600' },
                          ceo_approved: { label: 'Approved', cls: 'bg-[#1D9E75]/10 text-[#1D9E75]' },
                          rejected: { label: 'Rejected', cls: 'bg-[#E24B4A]/10 text-[#E24B4A]' },
                        };
                        const s = statusMap[t.status] ?? { label: t.status, cls: 'bg-gray-100 text-gray-600' };
                        return (
                          <tr key={t.id} className="border-b border-gray-50 last:border-0">
                            <td className="px-3 py-2 text-gray-500">{formatDate(t.proposed_at ?? t.created_at)}</td>
                            <td className="px-3 py-2 text-gray-700">
                              {isOut ? <span className="text-[#E24B4A]">→ Out</span> : <span className="text-[#1D9E75]">← In</span>}
                              <span className="text-gray-400 ml-1">{other ? (other as typeof project).name : '—'}</span>
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${isOut ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>{isOut ? '-' : '+'}{fmtTHB(t.amount)}</td>
                            <td className="px-3 py-2 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && marginPosition && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ArrowRightLeft size={16} className="text-[#1D9E75]" />
                <h2 className="text-base font-semibold text-gray-800">Propose Margin Transfer</h2>
              </div>
              <button onClick={() => setShowTransferModal(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#F8F8F7] rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">From project</span><span className="font-medium text-[#0f1923]">{project?.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Available to transfer</span><span className="font-semibold text-[#1D9E75]">{fmtTHB(marginPosition.availableToTransfer)}</span></div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">To Project *</label>
                <select value={transferForm.to_project_id} onChange={e => setTransferForm(prev => ({ ...prev, to_project_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30">
                  <option value="">Select destination project</option>
                  {allActiveProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Transfer Amount (฿) *</label>
                <input type="number" value={transferForm.amount} onChange={e => setTransferForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" placeholder="0" min="0" />
                {transferForm.amount && parseFloat(transferForm.amount) > marginPosition.availableToTransfer && (
                  <p className="text-xs text-[#E24B4A] mt-1">Maximum transferable amount is {fmtTHB(marginPosition.availableToTransfer)} based on current collection rate of {marginPosition.collectionRatePct}.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Reason * <span className="text-gray-400 font-normal">(min 20 characters)</span></label>
                <textarea value={transferForm.reason} onChange={e => setTransferForm(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
                  placeholder="Explain why this transfer is needed and how funds will be used in the destination project." />
                {transferForm.reason.length > 0 && transferForm.reason.length < 20 && (
                  <p className="text-xs text-gray-400 mt-0.5">{20 - transferForm.reason.length} more characters needed</p>
                )}
              </div>
              {transferError && (
                <div className="flex items-start gap-2 bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg p-3">
                  <AlertTriangle size={13} className="text-[#E24B4A] shrink-0 mt-0.5" />
                  <p className="text-xs text-[#E24B4A]">{transferError}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowTransferModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={submitTransfer} disabled={transferSubmitting}
                className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60">
                <CheckCircle size={14} />{transferSubmitting ? 'Submitting...' : 'Submit for EVP Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
