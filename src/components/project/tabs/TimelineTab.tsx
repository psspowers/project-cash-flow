import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ComposedChart, Line,
} from 'recharts';
import { useProjectDetail } from '../../../context/ProjectDetailContext';
import { fmtTHB } from '../../../types';
import { formatDate } from '../../../utils/formatters';
import Badge from '../../ui/Badge';

function buildCashFlowData(
  clientMilestones: ReturnType<typeof useProjectDetail>['clientMilestones'],
  clientInvoices: ReturnType<typeof useProjectDetail>['clientInvoices'],
  orphanVendorInvoices: ReturnType<typeof useProjectDetail>['orphanVendorInvoices'],
  orders: ReturnType<typeof useProjectDetail>['orders'],
  poMilestones: ReturnType<typeof useProjectDetail>['poMilestones'],
  paymentVouchers: ReturnType<typeof useProjectDetail>['paymentVouchers'],
) {
  const monthMap: Record<string, { income: number; cost: number; draftCost: number }> = {};
  const ensureMonth = (m: string) => { if (!monthMap[m]) monthMap[m] = { income: 0, cost: 0, draftCost: 0 }; };

  clientMilestones.forEach(ms => {
    if (ms.status !== 'received' && ms.planned_receive_date) {
      const month = ms.planned_receive_date.substring(0, 7);
      ensureMonth(month);
      monthMap[month].income += ms.payment_plan_amount;
    }
  });

  clientInvoices.forEach(inv => {
    if ((inv.received_amount ?? 0) > 0 && inv.receipt_date) {
      const month = inv.receipt_date.substring(0, 7);
      ensureMonth(month);
      monthMap[month].income += inv.received_amount;
    }
  });

  orphanVendorInvoices.filter(i => i.invoice_date).forEach(inv => {
    const month = inv.invoice_date!.substring(0, 7);
    ensureMonth(month);
    monthMap[month].cost += inv.received_amount;
  });

  // Actual payments made — use payment_vouchers.voucher_date + net_paid
  // This is the only correct source: actual bank payment date and amount
  paymentVouchers.forEach(pv => {
    if (!pv.voucher_date) return;
    const month = pv.voucher_date.substring(0, 7);
    ensureMonth(month);
    monthMap[month].cost += pv.net_paid;
  });

  // Forecast: unpaid vendor invoice balances bucketed by planned_payment_date
  orders.forEach(o => {
    const isDraftOrPending = o.status === 'draft' || o.status === 'pending_approval';
    if (o.has_supplier_milestones) {
      poMilestones
        .filter(pm => pm.purchase_order_id === o.id && pm.planned_payment_date && pm.status !== 'paid')
        .forEach(pm => {
          const month = pm.planned_payment_date!.substring(0, 7);
          ensureMonth(month);
          if (isDraftOrPending) {
            monthMap[month].draftCost += pm.amount_due;
          } else {
            monthMap[month].cost += pm.amount_due - (pm.paid_amount ?? 0);
          }
        });
    } else {
      o.invoices
        .filter(i => (i.invoice_amount_incl_vat - (i.received_amount ?? 0)) > 0 && i.planned_payment_date)
        .forEach(inv => {
          const month = inv.planned_payment_date!.substring(0, 7);
          ensureMonth(month);
          const balance = inv.invoice_amount_incl_vat - (inv.received_amount ?? 0);
          if (isDraftOrPending) {
            monthMap[month].draftCost += balance;
          } else {
            monthMap[month].cost += balance;
          }
        });
    }
  });

  const sorted = Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b));
  let cumIncome = 0, cumCost = 0, cumDraftCost = 0;
  return sorted.map(([month, v]) => {
    cumIncome += v.income;
    cumCost += v.cost;
    cumDraftCost += v.draftCost;
    return { month, cumIncome, cumCost, cumDraftCost };
  });
}

export default function TimelineTab() {
  const { clientMilestones, clientInvoices, orphanVendorInvoices, orders, poMilestones, paymentVouchers } = useProjectDetail();

  const cashFlowData = useMemo(
    () => buildCashFlowData(clientMilestones, clientInvoices, orphanVendorInvoices, orders, poMilestones, paymentVouchers),
    [clientMilestones, clientInvoices, orphanVendorInvoices, orders, poMilestones, paymentVouchers],
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg p-5">
        <h2 className="text-sm font-semibold text-[#0f1923] mb-4">S-Curve: Cumulative Cash Flow</h2>
        {cashFlowData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={cashFlowData} margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E24B4A" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#E24B4A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v: number) => fmtTHB(v)} width={90} />
                <Tooltip formatter={(v: number, name: string) => [fmtTHB(v), name]} />
                <ReferenceLine y={0} stroke="#ccc" />
                <Area type="monotone" dataKey="cumIncome" stroke="#1D9E75" strokeWidth={2} fill="url(#incomeGrad)" name="Cumulative Received" />
                <Area type="monotone" dataKey="cumCost" stroke="#E24B4A" strokeWidth={2} strokeDasharray="6 3" fill="url(#costGrad)" name="Confirmed Cost Forecast" />
                <Line type="monotone" dataKey="cumDraftCost" stroke="#E24B4A" strokeWidth={1.5} strokeDasharray="4 4" strokeOpacity={0.4} dot={false} name="Draft / Pending Cost" />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-5 mt-3 px-1 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-5 h-0.5 bg-[#1D9E75]" />
                <span>Cumulative Received</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-5 border-t-2 border-dashed border-[#E24B4A]" />
                <span>Confirmed Cost Forecast</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-5 border-t-2 border-dashed border-[#E24B4A] opacity-40" />
                <span>Draft / Pending Approval</span>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">No cash flow data yet.</p>
        )}
      </div>

      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[rgba(0,0,0,0.06)]">
          <h2 className="text-sm font-semibold text-[#0f1923]">Client Receipts — Invoice History</h2>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
              {['Invoice Date', 'Invoice No.', 'Invoice Amount', 'Received', 'Status'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientInvoices.filter(ci => (ci.received_amount ?? 0) > 0).map(ci => (
              <tr key={ci.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7]">
                <td className="px-4 py-2.5 text-gray-600">{formatDate(ci.invoice_date)}</td>
                <td className="px-4 py-2.5 text-gray-600 font-mono">{ci.invoice_no ?? '—'}</td>
                <td className="px-4 py-2.5 font-medium">{fmtTHB(ci.invoice_amount)}</td>
                <td className="px-4 py-2.5 font-medium text-[#1D9E75]">{fmtTHB(ci.received_amount)}</td>
                <td className="px-4 py-2.5">
                  <Badge label={ci.status} variant={ci.status === 'received' ? 'green' : 'gray'} />
                </td>
              </tr>
            ))}
            {clientInvoices.filter(ci => (ci.received_amount ?? 0) > 0).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No payments received yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[rgba(0,0,0,0.06)]">
          <h2 className="text-sm font-semibold text-[#0f1923]">Planned Future Milestones</h2>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
              {['#', 'Description', '%', 'Planned Date', 'Amount'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientMilestones.filter(m => m.status !== 'received' && m.planned_receive_date).map(m => (
              <tr key={m.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7]">
                <td className="px-4 py-2.5 font-medium">{m.milestone_number}</td>
                <td className="px-4 py-2.5 text-gray-600">{m.milestone_description ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{m.milestone_pct != null ? `${(m.milestone_pct * 100).toFixed(0)}%` : '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{formatDate(m.planned_receive_date)}</td>
                <td className="px-4 py-2.5 font-medium">{fmtTHB(m.payment_plan_amount)}</td>
              </tr>
            ))}
            {clientMilestones.filter(m => m.status !== 'received' && m.planned_receive_date).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No planned milestones</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
