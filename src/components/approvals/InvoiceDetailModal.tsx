import { useEffect, useState } from 'react';
import { X, XCircle, CheckCircle, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VendorInvoice } from '../../types';
import { formatTHB, formatDate } from '../../utils/formatters';

interface Milestone {
  id: string;
  milestone_number: number;
  amount_due: number;
  planned_payment_date: string | null;
  milestone_status: string;
  invoice_id: string | null;
  vendor_invoice_no: string | null;
  invoice_amount_incl_vat: number | null;
  invoice_status: string | null;
}

interface PODetail {
  po_amount_excl_vat: number;
  vat_7pct: number;
  po_amount_incl_vat: number;
  description: string | null;
  cost_category: string | null;
  pss_po_no: string | null;
}

interface Props {
  invoice: VendorInvoice;
  role: string;
  onApprove: () => void;
  onReject: (comment: string) => void;
  onClose: () => void;
  approving: boolean;
}

const COST_CATEGORY_LABELS: Record<string, string> = {
  '01_civil': '01 Civil Works',
  '02_pv_modules': '02 PV Modules',
  '03_mounting': '03 Mounting',
  '04_inverters': '04 Inverters & Electrical',
  '05_hv_switchgear': '05 HV Switchgear',
  '06_cabling': '06 Cabling',
  '07_installation': '07 Installation',
  '08_engineering': '08 Engineering',
  '09_logistics': '09 Logistics',
  '10_testing': '10 Testing & Warranty',
};

const MILESTONE_STATUS_STYLES: Record<string, string> = {
  paid: 'bg-[#1D9E75]/10 text-[#1D9E75]',
  invoiced: 'bg-blue-50 text-blue-700',
  pending: 'bg-gray-100 text-gray-500',
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  received: 'Received',
  approved_cm: 'CM Approved',
  approved_evp: 'EVP Approved',
  released: 'Released',
  paid: 'Paid',
  rejected: 'Rejected',
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  received: 'bg-amber-50 text-amber-700',
  approved_cm: 'bg-blue-50 text-blue-700',
  approved_evp: 'bg-[#1D9E75]/10 text-[#1D9E75]',
  released: 'bg-[#1D9E75]/20 text-[#178a64]',
  paid: 'bg-gray-100 text-gray-600',
  rejected: 'bg-[#E24B4A]/10 text-[#E24B4A]',
};

function approveLabel(role: string, amount: number): string {
  if (role === 'construction_manager') return 'Approve — Send to EVP';
  if (role === 'evp' && amount >= 3_000_000) return 'Approve — Escalate to CEO';
  if (role === 'evp') return 'Approve — Release for Payment';
  return 'Approve — Release for Payment';
}

export default function InvoiceDetailModal({ invoice, role, onApprove, onReject, onClose, approving }: Props) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [poDetail, setPoDetail] = useState<PODetail | null>(null);
  const [loadingMilestones, setLoadingMilestones] = useState(true);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const po = invoice.purchase_order as { pss_po_no?: string; description?: string; project?: { name: string } } | undefined;
  const vendor = invoice.vendor as { name: string } | undefined;
  const projectName = po?.project?.name ?? invoice.project?.name ?? '—';
  const poNo = po?.pss_po_no ?? '—';

  const canApprove =
    (role === 'construction_manager' && invoice.status === 'received') ||
    (role === 'evp' && invoice.status === 'approved_cm') ||
    (role === 'ceo' && invoice.status === 'approved_evp');

  const canReject = canApprove;

  useEffect(() => {
    async function fetchMilestones() {
      setLoadingMilestones(true);

      const { data: poData } = await supabase
        .from('purchase_orders')
        .select('po_amount_excl_vat, vat_7pct, po_amount_incl_vat, description, cost_category, pss_po_no')
        .eq('id', invoice.po_id)
        .maybeSingle();

      if (poData) setPoDetail(poData as PODetail);

      // Fetch milestones with their linked invoices via a join
      const { data: rows } = await supabase
        .from('po_milestones')
        .select(`
          id,
          milestone_number,
          amount_due,
          planned_payment_date,
          status,
          vendor_invoices!po_milestone_id(
            id,
            vendor_invoice_no,
            invoice_amount_incl_vat,
            status
          )
        `)
        .eq('purchase_order_id', invoice.po_id)
        .order('milestone_number', { ascending: true });

      if (rows) {
        const mapped: Milestone[] = (rows as any[]).map(r => {
          const inv = Array.isArray(r.vendor_invoices) ? r.vendor_invoices[0] : r.vendor_invoices;
          return {
            id: r.id,
            milestone_number: r.milestone_number,
            amount_due: Number(r.amount_due),
            planned_payment_date: r.planned_payment_date,
            milestone_status: r.status,
            invoice_id: inv?.id ?? null,
            vendor_invoice_no: inv?.vendor_invoice_no ?? null,
            invoice_amount_incl_vat: inv ? Number(inv.invoice_amount_incl_vat) : null,
            invoice_status: inv?.status ?? null,
          };
        });
        setMilestones(mapped);
      }

      setLoadingMilestones(false);
    }

    fetchMilestones();
  }, [invoice.po_id]);

  async function handleReject() {
    if (!rejectComment.trim() || rejecting) return;
    setRejecting(true);
    await onReject(rejectComment.trim());
    setRejecting(false);
  }

  const poTotal = poDetail?.po_amount_incl_vat ?? 0;
  const paidTotal = milestones
    .filter(m => m.milestone_status === 'paid')
    .reduce((sum, m) => sum + m.amount_due, 0);
  const remaining = poTotal - paidTotal;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-3xl border border-gray-200 my-4 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {poNo !== '—' ? (
                <a
                  href={`/projects/${invoice.project_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
                >
                  {poNo}
                  <ExternalLink size={10} className="opacity-50" />
                </a>
              ) : (
                <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">No PO No.</span>
              )}
              {poDetail?.cost_category && (
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                  {COST_CATEGORY_LABELS[poDetail.cost_category] ?? poDetail.cost_category}
                </span>
              )}
            </div>
            <a
              href={`/projects/${invoice.project_id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-base font-bold text-[#0f1923] hover:text-[#1D9E75] transition-colors group"
            >
              {projectName}
              <ExternalLink size={13} className="opacity-0 group-hover:opacity-50 transition-opacity" />
            </a>
            <p className="text-xs text-gray-500 mt-0.5">{vendor?.name ?? '—'} · {poDetail?.description ?? po?.description ?? '—'}</p>
          </div>
          <button onClick={onClose} className="ml-4 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* PO Financials Strip */}
        {poDetail && (
          <div className="grid grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
            {[
              { label: 'Contract (excl VAT)', value: formatTHB(poDetail.po_amount_excl_vat) },
              { label: 'VAT 7%', value: formatTHB(poDetail.vat_7pct) },
              { label: 'Total (incl VAT)', value: formatTHB(poDetail.po_amount_incl_vat), highlight: true },
              { label: 'Remaining Balance', value: formatTHB(remaining), warn: remaining < 0 },
            ].map(item => (
              <div key={item.label} className="px-4 py-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
                <p className={`text-sm font-bold ${item.highlight ? 'text-[#0f1923]' : item.warn ? 'text-[#E24B4A]' : 'text-gray-700'}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="p-6 space-y-5">

          {/* Milestone Schedule */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Payment Schedule</h3>
            {loadingMilestones ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="text-gray-300 animate-spin" />
              </div>
            ) : milestones.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-4 text-center">No milestone schedule on this PO</p>
            ) : (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-100">
                      <th className="text-left px-3 py-2.5 font-medium text-gray-500">#</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-500">%</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-500">Amount Due</th>
                      <th className="text-left px-3 py-2.5 font-medium text-gray-500">Planned Date</th>
                      <th className="text-left px-3 py-2.5 font-medium text-gray-500">Invoice No.</th>
                      <th className="text-right px-3 py-2.5 font-medium text-gray-500">Invoice Amt</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map(m => {
                      const isCurrentInvoiceMilestone = m.invoice_id === invoice.id || m.id === invoice.po_milestone_id;
                      const pct = poTotal > 0 ? ((m.amount_due / poTotal) * 100).toFixed(0) + '%' : '—';
                      return (
                        <tr
                          key={m.id}
                          className={`border-b border-gray-50 last:border-0 ${isCurrentInvoiceMilestone ? 'bg-amber-50/60' : 'hover:bg-gray-50/50'}`}
                        >
                          <td className="px-3 py-2.5">
                            <span className={`font-semibold ${isCurrentInvoiceMilestone ? 'text-amber-700' : 'text-gray-700'}`}>
                              {isCurrentInvoiceMilestone && <span className="mr-1 text-amber-500">▶</span>}
                              {m.milestone_number}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">{pct}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{formatTHB(m.amount_due)}</td>
                          <td className="px-3 py-2.5 text-gray-500">
                            {m.planned_payment_date ? formatDate(m.planned_payment_date) : '—'}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-gray-700">{m.vendor_invoice_no ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">
                            {m.invoice_amount_incl_vat != null ? formatTHB(m.invoice_amount_incl_vat) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {m.invoice_status ? (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_STYLES[m.invoice_status] ?? 'bg-gray-100 text-gray-500'}`}>
                                {INVOICE_STATUS_LABELS[m.invoice_status] ?? m.invoice_status}
                              </span>
                            ) : (
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${MILESTONE_STATUS_STYLES[m.milestone_status] ?? 'bg-gray-100 text-gray-500'}`}>
                                {m.milestone_status}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* This Invoice */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">This Invoice</h3>
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Invoice No.</span>
                <span className="font-mono font-medium text-gray-800">{invoice.vendor_invoice_no ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Invoice Date</span>
                <span className="text-gray-700">{invoice.invoice_date ? formatDate(invoice.invoice_date) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Gross (incl VAT)</span>
                <span className="font-semibold text-gray-800">{formatTHB(invoice.invoice_amount_incl_vat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Logged</span>
                <span className="text-gray-700">{formatDate(invoice.created_at)}</span>
              </div>
              {invoice.wht_3pct > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">WHT 3%</span>
                  <span className="text-[#E24B4A]">−{formatTHB(invoice.wht_3pct)}</span>
                </div>
              )}
              {invoice.wht_3pct > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Net Payable</span>
                  <span className="font-bold text-[#1D9E75] text-base">{formatTHB(invoice.net_payable)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Rejection comment (existing) */}
          {invoice.status === 'rejected' && invoice.rejection_comment && (
            <div className="flex items-start gap-2 p-3 bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg">
              <AlertTriangle size={14} className="text-[#E24B4A] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#E24B4A] mb-0.5">Previously rejected</p>
                <p className="text-xs text-gray-700 italic">"{invoice.rejection_comment}"</p>
              </div>
            </div>
          )}

          {/* Inline reject form */}
          {rejectOpen && (
            <div className="bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-[#E24B4A]">Invoice will be rejected and Cost Controller notified to resubmit.</p>
              <textarea
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                rows={3}
                autoFocus
                placeholder="State the reason clearly so the cost controller can act on it..."
                className="w-full border border-[#E24B4A]/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 resize-none bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setRejectOpen(false); setRejectComment(''); }}
                  className="flex-1 border border-gray-200 text-gray-700 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={!rejectComment.trim() || rejecting}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-[#E24B4A] text-white py-1.5 rounded-lg text-xs font-medium hover:bg-[#c73d3c] disabled:opacity-60"
                >
                  <XCircle size={12} />
                  {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {canApprove && !rejectOpen && (
          <div className="px-6 pb-6 flex gap-3">
            {canReject && (
              <button
                onClick={() => setRejectOpen(true)}
                className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#E24B4A]/5 transition-colors"
              >
                <XCircle size={14} />
                Reject
              </button>
            )}
            <button
              onClick={onApprove}
              disabled={approving}
              className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60 transition-colors"
            >
              {approving ? (
                <><Loader2 size={14} className="animate-spin" /> Processing...</>
              ) : (
                <><CheckCircle size={14} />{approveLabel(role, invoice.invoice_amount_incl_vat)}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
