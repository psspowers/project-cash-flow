import { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useProjectDetail } from '../../../context/ProjectDetailContext';
import { fmtTHB } from '../../../types';
import type { Entity } from '../../../types';
import Badge from '../../ui/Badge';
import { formatDate } from '../../../utils/formatters';
import { CAT_LABELS } from '../projectDetailConstants';

export default function CashflowTab() {
  const {
    project, clientMilestones, clientInvoices, orders, poMilestones,
    orphanVendorInvoices, canReschedule, reload,
  } = useProjectDetail();

  const [rescheduleModal, setRescheduleModal] = useState<{
    open: boolean;
    rowType: 'client_milestone' | 'po_milestone' | 'vendor_invoice';
    rowId: string;
    currentDate: string;
    label: string;
  }>({ open: false, rowType: 'client_milestone', rowId: '', currentDate: '', label: '' });
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  function openReschedule(
    rowType: 'client_milestone' | 'po_milestone' | 'vendor_invoice',
    rowId: string,
    currentDate: string | undefined,
    label: string,
  ) {
    const month = currentDate ? currentDate.substring(0, 7) : '';
    setRescheduleDate(month);
    setRescheduleError('');
    setRescheduleModal({ open: true, rowType, rowId, currentDate: currentDate ?? '', label });
  }

  async function handleRescheduleSave() {
    if (!rescheduleDate) { setRescheduleError('Please select a month.'); return; }
    setRescheduleSaving(true);
    setRescheduleError('');
    const isoDate = `${rescheduleDate}-01`;
    let err: { message: string } | null = null;
    if (rescheduleModal.rowType === 'client_milestone') {
      const { error } = await supabase.from('client_milestones').update({ planned_receive_date: isoDate }).eq('id', rescheduleModal.rowId);
      err = error;
    } else if (rescheduleModal.rowType === 'po_milestone') {
      const { error } = await supabase.from('po_milestones').update({ planned_payment_date: isoDate }).eq('id', rescheduleModal.rowId);
      err = error;
    } else {
      const { error } = await supabase.from('vendor_invoices').update({ planned_payment_date: isoDate }).eq('id', rescheduleModal.rowId);
      err = error;
    }
    setRescheduleSaving(false);
    if (err) { setRescheduleError(err.message); return; }
    setRescheduleModal(m => ({ ...m, open: false }));
    await reload();
  }

  const contract = project?.contract_incl_vat ?? 0;

  const invoicesByMilestone: Record<string, typeof clientInvoices> = {};
  clientInvoices.forEach(inv => {
    if (!invoicesByMilestone[inv.client_milestone_id]) invoicesByMilestone[inv.client_milestone_id] = [];
    invoicesByMilestone[inv.client_milestone_id].push(inv);
  });

  const totalCIReceived = clientInvoices.reduce((s, i) => s + (i.received_amount ?? 0), 0);
  const totalCIInvoicedPending = clientInvoices
    .filter(i => i.status === 'pending')
    .reduce((s, i) => s + Math.max(0, i.invoice_amount - (i.received_amount ?? 0)), 0);
  const invoicedMilestoneIds = new Set(clientInvoices.map(i => i.client_milestone_id));
  const totalCIPlanned = clientMilestones
    .filter(m => m.status === 'pending' && !invoicedMilestoneIds.has(m.id))
    .reduce((s, m) => s + m.payment_plan_amount, 0);

  interface CashOutRow {
    key: string; poNo: string; vendorName: string; category: string; msLabel: string;
    plannedDate: string | undefined; amount: number; paid: number; balance: number;
    status: string; rowType: 'po_milestone' | 'vendor_invoice' | 'draft_po'; rowId: string;
  }

  const cashOutRows: CashOutRow[] = [];
  orders.forEach(o => {
    const vendorName = (o.vendor as Entity | undefined)?.name ?? (o as typeof o & { supplier_name_raw?: string }).supplier_name_raw ?? '—';
    const cat = CAT_LABELS[o.cost_category] ?? o.cost_category;
    if (o.has_supplier_milestones) {
      poMilestones
        .filter(pm => pm.purchase_order_id === o.id)
        .sort((a, b) => a.milestone_number - b.milestone_number)
        .forEach(pm => {
          cashOutRows.push({
            key: `pm-${pm.id}`, poNo: o.pss_po_no ?? '—', vendorName, category: cat,
            msLabel: `MS${pm.milestone_number} ${pm.milestone_pct != null ? `${(pm.milestone_pct * 100).toFixed(0)}%` : ''}`,
            plannedDate: pm.planned_payment_date, amount: pm.amount_due,
            paid: pm.paid_amount ?? 0, balance: pm.amount_due - (pm.paid_amount ?? 0),
            status: pm.status, rowType: 'po_milestone', rowId: pm.id,
          });
        });
    } else if (o.invoices.length > 0) {
      o.invoices.forEach(inv => {
        cashOutRows.push({
          key: `vi-${inv.id}`, poNo: o.pss_po_no ?? '—', vendorName, category: cat,
          msLabel: inv.vendor_invoice_no ? `Inv ${inv.vendor_invoice_no}` : '—',
          plannedDate: inv.planned_payment_date,
          amount: inv.invoice_amount_incl_vat, paid: inv.received_amount ?? 0,
          balance: inv.invoice_amount_incl_vat - (inv.received_amount ?? 0),
          status: inv.status, rowType: 'vendor_invoice', rowId: inv.id,
        });
      });
    } else if ((o.pending_remaining_amount ?? 0) > 0) {
      cashOutRows.push({
        key: `draft-${o.id}`, poNo: o.pss_po_no ?? '—', vendorName, category: cat,
        msLabel: '—', plannedDate: undefined,
        amount: o.pending_remaining_amount ?? 0, paid: 0, balance: o.pending_remaining_amount ?? 0,
        status: 'draft', rowType: 'draft_po', rowId: o.id,
      });
    }
  });

  const totalCOPaid = cashOutRows.reduce((s, r) => s + r.paid, 0);
  const totalCOBalance = cashOutRows.reduce((s, r) => s + r.balance, 0);

  const monthMap: Record<string, { cashIn: number; cashOut: number }> = {};
  const ensureM = (m: string) => { if (!monthMap[m]) monthMap[m] = { cashIn: 0, cashOut: 0 }; };
  clientMilestones.forEach(ms => {
    const invs = invoicesByMilestone[ms.id] ?? [];
    if (invs.length > 0) {
      invs.forEach(inv => {
        if ((inv.received_amount ?? 0) > 0 && inv.receipt_date) {
          const m = inv.receipt_date.substring(0, 7);
          ensureM(m); monthMap[m].cashIn += inv.received_amount;
        }
        const outstanding = inv.invoice_amount - (inv.received_amount ?? 0);
        if (outstanding > 0 && ms.planned_receive_date) {
          const m = ms.planned_receive_date.substring(0, 7);
          ensureM(m); monthMap[m].cashIn += outstanding;
        }
      });
    } else if (ms.status === 'pending' && ms.planned_receive_date) {
      const m = ms.planned_receive_date.substring(0, 7);
      ensureM(m); monthMap[m].cashIn += ms.payment_plan_amount;
    }
  });
  cashOutRows.forEach(row => {
    if (row.plannedDate) {
      const m = row.plannedDate.substring(0, 7);
      ensureM(m);
      monthMap[m].cashOut += row.paid + row.balance;
    }
  });
  const sortedMonths = Object.keys(monthMap).sort();
  let cumulative = 0;
  const monthlyRows = sortedMonths.map(m => {
    const net = monthMap[m].cashIn - monthMap[m].cashOut;
    cumulative += net;
    const [y, mo] = m.split('-');
    const label = new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
    return { m, label, cashIn: monthMap[m].cashIn, cashOut: monthMap[m].cashOut, net, cumulative };
  });

  const statusBadgeVariant = (s: string) => {
    if (s === 'paid' || s === 'received') return 'green' as const;
    if (s === 'partially_received' || s === 'partially_paid') return 'amber' as const;
    return 'gray' as const;
  };

  return (
    <div className="space-y-5">
      {/* Reschedule modal */}
      {rescheduleModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setRescheduleModal(m => ({ ...m, open: false }))} />
          <div className="relative bg-white rounded-xl shadow-2xl border border-[rgba(0,0,0,0.08)] w-80 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar size={15} className="text-[#1D9E75]" />
                <h3 className="text-sm font-semibold text-[#0f1923]">Reschedule</h3>
              </div>
              <button onClick={() => setRescheduleModal(m => ({ ...m, open: false }))} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">{rescheduleModal.label}</p>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">New planned month</label>
            <input
              type="month"
              value={rescheduleDate}
              onChange={e => setRescheduleDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75]"
            />
            {rescheduleError && <p className="text-xs text-[#E24B4A] mt-2">{rescheduleError}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setRescheduleModal(m => ({ ...m, open: false }))} className="flex-1 px-3 py-2 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleRescheduleSave} disabled={rescheduleSaving} className="flex-1 px-3 py-2 text-xs font-medium text-white bg-[#1D9E75] rounded-lg hover:bg-[#178a64] disabled:opacity-50 transition-colors">
                {rescheduleSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash In */}
      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#0f1923]">Cash In — Client Revenue Plan</h2>
            <p className="text-xs text-gray-400 mt-0.5">Client milestone invoicing schedule</p>
          </div>
          {canReschedule && <span className="text-xs text-[#1D9E75] bg-[#1D9E75]/8 px-2.5 py-1 rounded-full font-medium">Edit enabled</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
                {['#', 'Description', '%', 'Planned Date', 'Invoice No.', 'Amount', 'Received', 'Status', ...(canReschedule ? [''] : [])].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientMilestones.map(ms => {
                const invs = invoicesByMilestone[ms.id] ?? [];
                const totalReceived = invs.reduce((s, i) => s + (i.received_amount ?? 0), 0);
                const invoiceLabel = invs.length === 0
                  ? '—'
                  : invs.length === 1
                  ? (invs[0].invoice_no ?? '—')
                  : invs.map((inv, idx) => `T${idx + 1}: ${inv.invoice_no ?? '—'}`).join(' · ');
                return (
                  <tr key={ms.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7]">
                    <td className="px-4 py-2.5 font-medium text-[#0f1923]">{ms.milestone_number}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[240px]">{ms.milestone_description ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{ms.milestone_pct != null ? `${(ms.milestone_pct * 100).toFixed(0)}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap font-medium">{formatDate(ms.planned_receive_date)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-600 text-[10px] leading-snug">{invoiceLabel}</td>
                    <td className="px-4 py-2.5 font-medium text-[#0f1923] whitespace-nowrap">{fmtTHB(ms.payment_plan_amount)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {totalReceived > 0
                        ? <span className="text-[#1D9E75] font-medium">{fmtTHB(totalReceived)}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge label={ms.status} variant={ms.status === 'received' ? 'green' : ms.status === 'invoiced' ? 'amber' : 'gray'} />
                    </td>
                    {canReschedule && (
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => openReschedule('client_milestone', ms.id, ms.planned_receive_date, `MS${ms.milestone_number} — ${ms.milestone_description ?? ''}`)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#1D9E75] border border-[#1D9E75]/30 rounded hover:bg-[#1D9E75]/8 transition-colors whitespace-nowrap"
                        >
                          <Calendar size={10} />Reschedule
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {clientMilestones.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">No milestones defined</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[rgba(0,0,0,0.08)] bg-[#F8F8F7]">
                <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Totals</td>
                <td className="px-4 py-2.5 font-bold text-[#0f1923] whitespace-nowrap">{fmtTHB(contract)}</td>
                <td className="px-4 py-2.5 font-semibold text-[#1D9E75] whitespace-nowrap">{fmtTHB(totalCIReceived)}</td>
                <td colSpan={canReschedule ? 2 : 1} />
              </tr>
              {[
                { label: 'Already received', value: totalCIReceived, color: 'text-[#1D9E75]' },
                { label: 'Invoiced — awaiting', value: totalCIInvoicedPending, color: 'text-[#EF9F27]' },
                { label: 'Not yet invoiced', value: totalCIPlanned, color: 'text-gray-500' },
              ].map(({ label, value, color }) => (
                <tr key={label} className="bg-[#F8F8F7]">
                  <td colSpan={4} className="px-4 pb-3" />
                  <td className="px-4 pb-3 text-xs text-gray-400">{label}</td>
                  <td className={`px-4 pb-3 font-medium ${color} text-xs whitespace-nowrap`}>{fmtTHB(value)}</td>
                  <td colSpan={canReschedule ? 3 : 2} />
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </div>

      {/* Cash Out */}
      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#0f1923]">Cash Out — Supplier Payment Schedule</h2>
            <p className="text-xs text-gray-400 mt-0.5">Planned payments to vendors and subcontractors</p>
          </div>
          {canReschedule && <span className="text-xs text-[#1D9E75] bg-[#1D9E75]/8 px-2.5 py-1 rounded-full font-medium">Edit enabled</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
                {['PO No.', 'Supplier', 'Category', 'Line', 'Planned Date', 'Amount', 'Paid', 'Balance', 'Status', ...(canReschedule ? [''] : [])].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cashOutRows.map(row => (
                <tr key={row.key} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7]">
                  <td className="px-4 py-2.5 font-mono font-medium text-[#0f1923]">{row.poNo}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate">{row.vendorName}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.category}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.msLabel}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-700 whitespace-nowrap">
                    {row.plannedDate ? formatDate(row.plannedDate) : <span className="text-gray-400 italic">Unscheduled</span>}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[#0f1923] whitespace-nowrap">{fmtTHB(row.amount)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.paid > 0 ? <span className="text-[#1D9E75] font-medium">{fmtTHB(row.paid)}</span> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {row.balance > 0 ? <span className="font-semibold text-[#E24B4A]">{fmtTHB(row.balance)}</span> : <span className="text-[#1D9E75] font-medium">Paid</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge label={row.status.replace(/_/g, ' ')} variant={statusBadgeVariant(row.status)} />
                  </td>
                  {canReschedule && (
                    <td className="px-4 py-2.5">
                      {row.rowType !== 'draft_po' && (
                        <button
                          onClick={() => openReschedule(
                            row.rowType === 'po_milestone' ? 'po_milestone' : 'vendor_invoice',
                            row.rowId, row.plannedDate, `${row.poNo} · ${row.msLabel}`,
                          )}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#1D9E75] border border-[#1D9E75]/30 rounded hover:bg-[#1D9E75]/8 transition-colors whitespace-nowrap"
                        >
                          <Calendar size={10} />Reschedule
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {cashOutRows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">No purchase orders</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[rgba(0,0,0,0.08)] bg-[#F8F8F7]">
                <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Totals</td>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 font-semibold text-[#1D9E75] whitespace-nowrap">{fmtTHB(totalCOPaid)}</td>
                <td className="px-4 py-2.5 font-bold text-[#E24B4A] whitespace-nowrap">{fmtTHB(totalCOBalance)}</td>
                <td colSpan={canReschedule ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Monthly Balance */}
      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
          <h2 className="text-sm font-semibold text-[#0f1923]">Monthly Cash Flow Balance</h2>
          <p className="text-xs text-gray-400 mt-0.5">Net cash in / out by month — calculated from planned dates above</p>
        </div>
        {monthlyRows.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
                {['Month', 'Cash In', 'Cash Out', 'Net', 'Cumulative'].map(h => (
                  <th key={h} className={`px-5 py-2.5 font-medium text-gray-500 ${h === 'Month' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map(row => {
                const isNegativeNet = row.net < 0;
                return (
                  <tr key={row.m} className={`border-b border-[rgba(0,0,0,0.04)] ${isNegativeNet ? 'bg-[#E24B4A]/5' : 'hover:bg-[#F8F8F7]'}`}>
                    <td className="px-5 py-2.5 font-medium text-[#0f1923]">{row.label}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-[#1D9E75]">
                      {row.cashIn > 0 ? fmtTHB(row.cashIn) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium text-[#E24B4A]">
                      {row.cashOut > 0 ? fmtTHB(row.cashOut) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${isNegativeNet ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
                      {isNegativeNet ? '' : '+'}{fmtTHB(row.net)}
                    </td>
                    <td className={`px-5 py-2.5 text-right font-bold ${row.cumulative < 0 ? 'text-[#E24B4A]' : 'text-[#0f1923]'}`}>
                      {row.cumulative < 0 ? '' : '+'}{fmtTHB(row.cumulative)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No planned dates set — add planned dates to milestones and purchase orders to see the monthly balance.
          </div>
        )}
      </div>
    </div>
  );
}
