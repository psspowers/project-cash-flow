import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, ArrowRightLeft, CheckCircle, XCircle, X, FileCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PaymentVoucher, ProjectCashTransfer, Project, VendorInvoice, fmtTHB, UserProfile } from '../types';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHB, formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import { approveInvoiceCEO } from '../services/workflow';

export default function CEOAlerts() {
  const { user } = useAuth();
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<VendorInvoice[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<ProjectCashTransfer[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [transferModal, setTransferModal] = useState<ProjectCashTransfer | null>(null);
  const [transferModalMode, setTransferModalMode] = useState<'approve' | 'reject'>('approve');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferRejectReason, setTransferRejectReason] = useState('');
  const [transferAction, setTransferAction] = useState(false);
  const [transferApprovalError, setTransferApprovalError] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [{ data: vouData }, { data: invData }, { data: txData }, { data: profData }] = await Promise.all([
      supabase
        .from('payment_vouchers')
        .select('*, project:projects(*), vendor_invoice:vendor_invoices(*, vendor:entities!vendor_id(*))')
        .eq('ceo_notified', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('vendor_invoices')
        .select('*, purchase_order:purchase_orders(pss_po_no, project:projects(name), vendor:entities(name))')
        .eq('status', 'approved_evp')
        .order('created_at', { ascending: false }),
      supabase
        .from('project_cash_transfers')
        .select('*, from_project:projects!from_project_id(id,name), to_project:projects!to_project_id(id,name)')
        .eq('status', 'evp_recommended')
        .order('created_at', { ascending: false }),
      supabase.from('user_profiles').select('*'),
    ]);
    setVouchers(vouData || []);
    setPendingInvoices((invData ?? []) as VendorInvoice[]);
    setPendingTransfers((txData ?? []) as ProjectCashTransfer[]);
    setProfiles((profData ?? []) as UserProfile[]);
    setLoading(false);
  }

  async function handleApproveInvoice(invoice: VendorInvoice) {
    if (!user || approvingId) return;
    setApprovingId(invoice.id);
    const po = (invoice as any).purchase_order;
    const projectName = po?.project?.name ?? 'Unknown Project';
    const invoiceNo = invoice.vendor_invoice_no ?? invoice.id;
    const { error } = await approveInvoiceCEO(
      invoice.id,
      user.id,
      projectName,
      invoiceNo,
      invoice.invoice_amount_incl_vat,
      invoice.project_id,
    );
    setApprovingId(null);
    if (error) { alert(error); return; }
    await loadData();
  }

  function profileName(uid?: string | null): string {
    if (!uid) return '—';
    return profiles.find(p => p.id === uid)?.full_name ?? '—';
  }

  async function handleApprove(t: ProjectCashTransfer) {
    if (!user) return;
    setTransferAction(true);
    setTransferApprovalError(null);
    const { data: actorProfile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const actorName = (actorProfile as { full_name: string } | null)?.full_name ?? 'A team member';
    const { error } = await supabase.from('project_cash_transfers').update({
      status: 'ceo_approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      transfer_date: new Date().toISOString().slice(0, 10),
    }).eq('id', t.id);
    if (error) {
      setTransferApprovalError(error.message);
      setTransferAction(false);
      return;
    }
    const ccProf = profiles.find(p => p.role === 'cost_controller');
    const acctProf = profiles.find(p => p.role === 'accounts_supervisor');
    const fromName = (t.from_project as Project)?.name ?? '';
    const toName = (t.to_project as Project)?.name ?? '';
    const approvedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (ccProf) {
      await supabase.from('notifications').insert({
        user_id: ccProf.id,
        title: `Margin transfer approved — ${fmtTHB(t.amount)}`,
        message: `${actorName} has approved the transfer of ${fmtTHB(t.amount)} from ${fromName} to ${toName}.`,
        type: 'info', is_read: false, related_entity_type: 'project_cash_transfer', related_entity_id: t.id,
      });
    }
    if (acctProf) {
      await supabase.from('notifications').insert({
        user_id: acctProf.id,
        title: `Margin transfer approved for your records`,
        message: `${fmtTHB(t.amount)} transferred from ${fromName} to ${toName} approved by CEO on ${approvedDate}.`,
        type: 'info', is_read: false, related_entity_type: 'project_cash_transfer', related_entity_id: t.id,
      });
    }
    setTransferModal(null);
    setTransferNotes('');
    setTransferAction(false);
    loadData();
  }

  async function handleReject(t: ProjectCashTransfer) {
    if (!user || !transferRejectReason.trim()) return;
    setTransferAction(true);
    await supabase.from('project_cash_transfers').update({
      status: 'rejected',
      rejected_by: user.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: transferRejectReason.trim(),
    }).eq('id', t.id);
    const ccProf = profiles.find(p => p.role === 'cost_controller');
    if (ccProf) {
      await supabase.from('notifications').insert({
        user_id: ccProf.id,
        title: `Transfer proposal rejected`,
        message: `${profileName(user.id)} rejected the transfer of ${fmtTHB(t.amount)} from ${(t.from_project as Project)?.name ?? ''} to ${(t.to_project as Project)?.name ?? ''}. Reason: ${transferRejectReason.trim()}`,
        type: 'warning', is_read: false, related_entity_type: 'project_cash_transfer', related_entity_id: t.id,
      });
    }
    setTransferModal(null);
    setTransferRejectReason('');
    setTransferAction(false);
    loadData();
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CEO Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Payments ≥ ฿3,000,000 and margin transfers pending your approval</p>
        </div>
        {(vouchers.length + pendingInvoices.length + pendingTransfers.length) > 0 && (
          <span className="bg-[#E24B4A] text-white text-xs rounded-full px-2.5 py-1 font-medium">
            {vouchers.length + pendingInvoices.length + pendingTransfers.length} alerts
          </span>
        )}
      </div>

      {pendingTransfers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-[#1D9E75]" />
            <h2 className="text-sm font-semibold text-[#0f1923]">Pending My Approval — Margin Transfers</h2>
            <span className="bg-[#1D9E75]/10 text-[#1D9E75] text-xs font-semibold px-2 py-0.5 rounded-full">
              {pendingTransfers.length}
            </span>
          </div>
          {pendingTransfers.map(t => (
            <div key={t.id} className="bg-white rounded-lg border-l-4 border-l-[#1D9E75] border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">
                    {(t.from_project as Project)?.name ?? '—'} → {(t.to_project as Project)?.name ?? '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Proposed by {profileName(t.proposed_by)} · {formatDate(t.proposed_at)}
                  </p>
                  {t.reason && <p className="text-xs text-gray-600 mt-2 italic">"{t.reason}"</p>}
                  {t.recommended_notes && (
                    <p className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">EVP recommendation:</span> {t.recommended_notes}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-[#1D9E75]">{fmtTHB(t.amount)}</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">EVP Recommended</span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                <button
                  onClick={() => { setTransferModal(t); setTransferModalMode('reject'); setTransferRejectReason(''); }}
                  className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#E24B4A]/5"
                >
                  <XCircle size={13} /> Reject
                </button>
                <button
                  onClick={() => { setTransferModal(t); setTransferModalMode('approve'); setTransferNotes(''); setTransferApprovalError(null); }}
                  className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#178a64]"
                >
                  <CheckCircle size={13} /> Approve Transfer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* High-Value Supplier Invoices — Operational Approval */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileCheck size={16} className="text-[#E24B4A]" />
          <h2 className="text-sm font-semibold text-[#0f1923]">High-Value Supplier Invoices — Pending Your Approval</h2>
          {pendingInvoices.length > 0 && (
            <span className="bg-[#E24B4A]/10 text-[#E24B4A] text-xs font-semibold px-2 py-0.5 rounded-full">
              {pendingInvoices.length}
            </span>
          )}
        </div>

        {pendingInvoices.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 py-10 flex flex-col items-center gap-2">
            <Bell size={28} className="text-gray-200" />
            <p className="text-sm text-gray-400">No invoices awaiting your approval</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Invoice No.</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">PO No.</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pendingInvoices.map(inv => {
                  const po = (inv as any).purchase_order;
                  const vendorName = po?.vendor?.name ?? '—';
                  const projectName = po?.project?.name?.split('–')[0]?.trim() ?? '—';
                  const poNo = po?.pss_po_no ?? '—';
                  return (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-800">{vendorName}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{projectName}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-700">{inv.vendor_invoice_no || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{poNo}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-[#E24B4A]">{formatTHB(inv.invoice_amount_incl_vat)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge label="EVP Approved" variant="success" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleApproveInvoice(inv)}
                          disabled={approvingId === inv.id}
                          className="flex items-center gap-1.5 bg-[#0f1923] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#1a2b3c] disabled:opacity-60 transition-colors"
                        >
                          <CheckCircle size={12} />
                          {approvingId === inv.id ? 'Approving…' : 'Approve'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* High-Value Payment Vouchers — Finance Disbursement Alerts */}
      <div className="bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle size={16} className="text-[#E24B4A] shrink-0 mt-0.5" />
        <p className="text-sm text-[#E24B4A]">
          These payments exceeded the ฿3,000,000 threshold and triggered automatic CEO notification per company policy.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Voucher No.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Notified</th>
            </tr>
          </thead>
          <tbody>
            {vouchers.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <Bell size={32} className="text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">No large payment alerts</p>
                </td>
              </tr>
            ) : vouchers.map(v => (
              <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-700">{formatDate(v.voucher_date)}</td>
                <td className="px-4 py-3 text-sm font-mono text-gray-800">{v.voucher_no}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{(v as any).vendor_invoice?.vendor?.name || '—'}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{(v as any).project?.name?.split('–')[0] || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm font-bold text-[#E24B4A]">{formatTHB(v.net_paid)}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge label={v.status.replace(/_/g, ' ')} variant={statusVariant(v.status)} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{formatDate(v.ceo_notified_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {transferModal && transferModalMode === 'approve' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Approve Margin Transfer</h2>
              <button onClick={() => setTransferModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#F8F8F7] rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">From</span>
                  <span className="font-medium">{(transferModal.from_project as Project)?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">To</span>
                  <span className="font-medium">{(transferModal.to_project as Project)?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-bold text-[#1D9E75]">{fmtTHB(transferModal.amount)}</span>
                </div>
                {transferModal.recommended_notes && (
                  <div className="pt-1 border-t border-gray-100">
                    <span className="text-gray-500">EVP notes: </span>
                    <span>{transferModal.recommended_notes}</span>
                  </div>
                )}
              </div>
            </div>
            {transferApprovalError && (
              <div className="mx-6 mb-0 rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/5 p-3">
                <p className="text-xs font-semibold text-[#E24B4A] mb-1">Transfer blocked by system:</p>
                <p className="text-xs text-[#c73d3c]">{transferApprovalError}</p>
                <p className="text-xs text-[#E24B4A] mt-1">The transfer was not executed. Check the available margin and try a smaller amount.</p>
              </div>
            )}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setTransferModal(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => handleApprove(transferModal)}
                disabled={transferAction}
                className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60"
              >
                <CheckCircle size={14} />
                {transferAction ? 'Processing...' : 'Approve Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferModal && transferModalMode === 'reject' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Reject Transfer</h2>
              <button onClick={() => setTransferModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-xs text-gray-600">
                Rejecting transfer of <span className="font-semibold">{fmtTHB(transferModal.amount)}</span> from{' '}
                <span className="font-semibold">{(transferModal.from_project as Project)?.name ?? '—'}</span>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Rejection Reason *</label>
                <textarea
                  value={transferRejectReason}
                  onChange={e => setTransferRejectReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 resize-none"
                  placeholder="Explain the reason for rejection..."
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setTransferModal(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => handleReject(transferModal)}
                disabled={!transferRejectReason.trim() || transferAction}
                className="flex-1 flex items-center justify-center gap-2 bg-[#E24B4A] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#c73d3c] disabled:opacity-60"
              >
                <XCircle size={14} />
                {transferAction ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
