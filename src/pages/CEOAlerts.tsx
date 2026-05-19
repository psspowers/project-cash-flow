import { useEffect, useState } from 'react';
import {
  CheckCircle, ArrowRightLeft, XCircle, X, FileCheck,
  DollarSign, Clock, History, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  PaymentVoucher, ProjectCashTransfer, Project, VendorInvoice,
  PurchaseOrder, Entity, fmtTHB, UserProfile,
} from '../types';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHB, formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';
import {
  approveInvoiceCEO, rejectInvoice,
  approveVoucherCosign, rejectVoucherCosign,
  approveTransferCEO, rejectTransferCEO,
  TransferActionParams,
} from '../services/workflow';
import InvoiceDetailModal from '../components/approvals/InvoiceDetailModal';
import PODetailModal from '../components/pos/PODetailModal';

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  count,
  accent = 'gray',
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  accent?: 'green' | 'amber' | 'red' | 'gray' | 'blue';
}) {
  const colorMap = {
    green: 'text-[#1D9E75] border-[#1D9E75]/20 bg-[#1D9E75]/5',
    amber: 'text-[#EF9F27] border-[#EF9F27]/20 bg-[#EF9F27]/5',
    red:   'text-[#E24B4A] border-[#E24B4A]/20 bg-[#E24B4A]/5',
    blue:  'text-blue-600 border-blue-200 bg-blue-50',
    gray:  'text-gray-500 border-gray-200 bg-gray-50',
  };
  return (
    <div className={`flex items-center gap-2.5 px-4 py-3 rounded-t-lg border ${colorMap[accent]}`}>
      {icon}
      <span className="text-sm font-semibold">{title}</span>
      {count !== undefined && count > 0 && (
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
          accent === 'green' ? 'bg-[#1D9E75] text-white' :
          accent === 'amber' ? 'bg-[#EF9F27] text-white' :
          accent === 'red'   ? 'bg-[#E24B4A] text-white' :
          'bg-gray-400 text-white'
        }`}>{count}</span>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CEOAlerts() {
  const { user } = useAuth();

  // Pending — items requiring CEO action
  const [pendingVouchers, setPendingVouchers] = useState<PaymentVoucher[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<VendorInvoice[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<ProjectCashTransfer[]>([]);

  // FYI — large payment disbursement log
  const [disbursements, setDisbursements] = useState<PaymentVoucher[]>([]);

  // Completed — CEO's own approval history
  const [approvedInvoices, setApprovedInvoices] = useState<VendorInvoice[]>([]);
  const [approvedTransfers, setApprovedTransfers] = useState<ProjectCashTransfer[]>([]);
  const [approvedVouchers, setApprovedVouchers] = useState<PaymentVoucher[]>([]);

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  // Invoice detail modal
  const [invoiceDetailModal, setInvoiceDetailModal] = useState<VendorInvoice | null>(null);
  const [invoiceApproving, setInvoiceApproving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Transfer modal
  const [transferModal, setTransferModal] = useState<ProjectCashTransfer | null>(null);
  const [transferModalMode, setTransferModalMode] = useState<'approve' | 'reject'>('approve');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferRejectReason, setTransferRejectReason] = useState('');
  const [transferAction, setTransferAction] = useState(false);
  const [transferApprovalError, setTransferApprovalError] = useState<string | null>(null);

  // Voucher reject modal
  const [rejectingVoucher, setRejectingVoucher] = useState<PaymentVoucher | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [voucherAction, setVoucherAction] = useState(false);

  // PO drill-down
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poProjects, setPoProjects] = useState<Project[]>([]);
  const [poVendors, setPoVendors] = useState<Entity[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [
      { data: pendVouData },
      { data: invData },
      { data: txData },
      { data: disbData },
      { data: doneInvData },
      { data: doneTxData },
      { data: doneVouData },
      { data: profData },
      { data: proj },
      { data: vend },
    ] = await Promise.all([
      // Co-signature queue
      supabase
        .from('payment_vouchers')
        .select('*, project:projects(*), vendor_invoice:vendor_invoices(id, po_id, vendor_invoice_no, purchase_order:purchase_orders(id, pss_po_no, supplier_name_raw, vendor:entities(name)))')
        .eq('status', 'pending_manager')
        .order('created_at', { ascending: false }),
      // High-value invoices pending CEO approval
      supabase
        .from('vendor_invoices')
        .select('*, purchase_order:purchase_orders(pss_po_no, project:projects(name), vendor:entities(name))')
        .eq('status', 'approved_evp')
        .order('created_at', { ascending: false }),
      // Margin transfers pending CEO approval
      supabase
        .from('project_cash_transfers')
        .select('*, from_project:projects!from_project_id(id,name), to_project:projects!to_project_id(id,name)')
        .eq('status', 'evp_recommended')
        .order('created_at', { ascending: false }),
      // FYI — large payment disbursements
      supabase
        .from('payment_vouchers')
        .select('*, project:projects(*), vendor_invoice:vendor_invoices(po_id, purchase_order:purchase_orders(id, pss_po_no, supplier_name_raw, vendor:entities(name)))')
        .eq('ceo_notified', true)
        .order('created_at', { ascending: false }),
      // Completed — invoices CEO already approved
      supabase
        .from('vendor_invoices')
        .select('*, purchase_order:purchase_orders(pss_po_no, project:projects(name), vendor:entities(name))')
        .in('status', ['released', 'paid'])
        .not('ceo_approved_by', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      // Completed — transfers CEO already approved or rejected
      supabase
        .from('project_cash_transfers')
        .select('*, from_project:projects!from_project_id(id,name), to_project:projects!to_project_id(id,name)')
        .in('status', ['ceo_approved', 'rejected'])
        .not('approved_by', 'is', null)
        .order('approved_at', { ascending: false })
        .limit(20),
      // Completed — vouchers CEO already co-signed
      supabase
        .from('payment_vouchers')
        .select('*, project:projects(*), vendor_invoice:vendor_invoices(po_id, purchase_order:purchase_orders(id, pss_po_no, supplier_name_raw, vendor:entities(name)))')
        .in('status', ['approved', 'issued'])
        .not('manager_approved_by', 'is', null)
        .order('manager_approved_at', { ascending: false })
        .limit(20),
      supabase.from('user_profiles').select('*'),
      supabase.from('projects').select('id, name, status').order('name'),
      supabase.from('entities').select('id, name').eq('type', 'vendor').eq('is_active', true).order('name'),
    ]);

    setPendingVouchers((pendVouData ?? []) as PaymentVoucher[]);
    setPendingInvoices((invData ?? []) as VendorInvoice[]);
    setPendingTransfers((txData ?? []) as ProjectCashTransfer[]);
    setDisbursements(disbData || []);
    setApprovedInvoices((doneInvData ?? []) as VendorInvoice[]);
    setApprovedTransfers((doneTxData ?? []) as ProjectCashTransfer[]);
    setApprovedVouchers((doneVouData ?? []) as PaymentVoucher[]);
    setProfiles((profData ?? []) as UserProfile[]);
    setPoProjects((proj ?? []) as Project[]);
    setPoVendors((vend ?? []) as Entity[]);
    setLoading(false);
  }

  async function openPODrillDown(poId: string) {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, supplier_name_raw, vendor:entities!vendor_id(*), project:projects(*)')
      .eq('id', poId)
      .maybeSingle();
    if (data) setSelectedPO(data as PurchaseOrder);
  }

  // ── Voucher co-sign ────────────────────────────────────────────────────────

  async function approveVoucher(voucherId: string) {
    if (!user) return;
    setVoucherAction(true);
    const result = await approveVoucherCosign(voucherId, user.id);
    if (result.error) alert('Failed to approve voucher: ' + result.error);
    setVoucherAction(false);
    loadData();
  }

  async function rejectVoucher() {
    if (!rejectingVoucher || !user || !rejectComment.trim()) return;
    setVoucherAction(true);
    const result = await rejectVoucherCosign(
      rejectingVoucher.id, user.id, rejectComment.trim(), rejectingVoucher.vendor_invoice_id,
    );
    if (result.error) alert('Failed to reject voucher: ' + result.error);
    setRejectingVoucher(null);
    setRejectComment('');
    setVoucherAction(false);
    loadData();
  }

  // ── Invoice approval ───────────────────────────────────────────────────────

  async function handleApproveInvoice(invoice: VendorInvoice) {
    if (!user || approvingId) return;
    setApprovingId(invoice.id);
    setInvoiceApproving(true);
    const po = (invoice as any).purchase_order;
    const projectName = po?.project?.name ?? 'Unknown Project';
    const invoiceNo = invoice.vendor_invoice_no ?? invoice.id;
    const { error } = await approveInvoiceCEO(
      invoice.id, user.id, projectName, invoiceNo,
      invoice.invoice_amount_incl_vat, invoice.project_id,
    );
    setApprovingId(null);
    setInvoiceApproving(false);
    if (error) { alert(error); return; }
    setInvoiceDetailModal(null);
    await loadData();
  }

  async function handleRejectInvoiceFromModal(invoice: VendorInvoice, comment: string) {
    if (!user) return;
    const po = (invoice as any).purchase_order;
    const projectName = po?.project?.name ?? 'Unknown Project';
    const invoiceNo = invoice.vendor_invoice_no ?? invoice.id;
    const { error } = await rejectInvoice(invoice.id, user.id, comment, projectName, invoiceNo, invoice.project_id);
    if (error) { alert(error); return; }
    setInvoiceDetailModal(null);
    await loadData();
  }

  // ── Transfer approval ──────────────────────────────────────────────────────

  function profileName(uid?: string | null): string {
    if (!uid) return '—';
    return profiles.find(p => p.id === uid)?.full_name ?? '—';
  }

  async function handleApprove(t: ProjectCashTransfer) {
    if (!user) return;
    setTransferAction(true);
    setTransferApprovalError(null);
    const { data: actorProfile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const actorName = (actorProfile as { full_name: string } | null)?.full_name ?? 'CEO';
    const params: TransferActionParams = {
      transferId: t.id,
      actorId: user.id,
      actorName,
      amount: t.amount,
      fromProjectName: (t.from_project as Project)?.name ?? '',
      toProjectName: (t.to_project as Project)?.name ?? '',
    };
    const result = await approveTransferCEO(params);
    if (result.error) { setTransferApprovalError(result.error); setTransferAction(false); return; }
    setTransferModal(null);
    setTransferNotes('');
    setTransferAction(false);
    loadData();
  }

  async function handleReject(t: ProjectCashTransfer) {
    if (!user || !transferRejectReason.trim()) return;
    setTransferAction(true);
    const { data: actorProfile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const actorName = (actorProfile as { full_name: string } | null)?.full_name ?? profileName(user.id);
    const result = await rejectTransferCEO(
      t.id, user.id, actorName, t.amount,
      (t.from_project as Project)?.name ?? '',
      (t.to_project as Project)?.name ?? '',
      transferRejectReason.trim(),
    );
    if (result.error) alert('Failed to reject transfer: ' + result.error);
    setTransferModal(null);
    setTransferRejectReason('');
    setTransferAction(false);
    loadData();
  }

  // ── Derived counts ─────────────────────────────────────────────────────────

  const totalPending = pendingVouchers.length + pendingInvoices.length + pendingTransfers.length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 max-w-[960px]">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            High-value payments, margin transfers, and large invoices requiring your sign-off
          </p>
        </div>
        {totalPending > 0 && (
          <span className="shrink-0 bg-[#E24B4A] text-white text-xs font-bold rounded-full px-3 py-1">
            {totalPending} pending
          </span>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1: ACTION REQUIRED
      ══════════════════════════════════════════════════════════ */}

      {totalPending === 0 && (
        <div className="bg-[#1D9E75]/5 border border-[#1D9E75]/20 rounded-xl p-6 text-center">
          <CheckCircle size={28} className="text-[#1D9E75] mx-auto mb-2" />
          <p className="text-sm font-medium text-[#1D9E75]">All clear — nothing awaiting your approval</p>
        </div>
      )}

      {/* Margin Transfers */}
      {pendingTransfers.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <SectionHeader
            icon={<ArrowRightLeft size={14} />}
            title="Margin Transfers — Pending Your Approval"
            count={pendingTransfers.length}
            accent="green"
          />
          <div className="divide-y divide-gray-100">
            {pendingTransfers.map(t => (
              <div key={t.id} className="bg-white p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">
                      {(t.from_project as Project)?.name ?? '—'} &rarr; {(t.to_project as Project)?.name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Proposed by {profileName(t.proposed_by)} &middot; {formatDate(t.proposed_at)}
                    </p>
                    {t.reason && (
                      <p className="text-xs text-gray-600 mt-1.5 italic">"{t.reason}"</p>
                    )}
                    {t.recommended_notes && (
                      <p className="text-xs text-gray-500 mt-1">
                        <span className="font-medium text-gray-700">EVP recommendation:</span> {t.recommended_notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold text-[#1D9E75]">{fmtTHB(t.amount)}</p>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">EVP Recommended</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => { setTransferModal(t); setTransferModalMode('reject'); setTransferRejectReason(''); }}
                    className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#E24B4A]/5 transition-colors"
                  >
                    <XCircle size={13} /> Reject
                  </button>
                  <button
                    onClick={() => { setTransferModal(t); setTransferModalMode('approve'); setTransferNotes(''); setTransferApprovalError(null); }}
                    className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#178a64] transition-colors"
                  >
                    <CheckCircle size={13} /> Approve Transfer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Vouchers — Co-signature */}
      {pendingVouchers.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <SectionHeader
            icon={<FileCheck size={14} />}
            title="Payment Vouchers — Pending Your Co-signature"
            count={pendingVouchers.length}
            accent="amber"
          />
          <div className="bg-white">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Voucher No.</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {pendingVouchers.map(v => {
                  const vPo = (v as any).vendor_invoice?.purchase_order;
                  const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
                  const poId: string | undefined = vPo?.id;
                  return (
                    <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-700">{formatDate(v.voucher_date)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-800">
                        {poId ? (
                          <button onClick={() => openPODrillDown(poId)} className="hover:text-[#1D9E75] transition-colors text-left">
                            {v.voucher_no}
                          </button>
                        ) : v.voucher_no}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{vendorName}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">
                        {(v as any).project?.name?.split('–')[0] || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-[#E24B4A]">{formatTHB(v.net_paid)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => { setRejectingVoucher(v); setRejectComment(''); }}
                            className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-2.5 py-1.5 rounded text-xs font-medium hover:bg-[#E24B4A]/5 transition-colors"
                          >
                            <XCircle size={12} /> Reject
                          </button>
                          <button
                            onClick={() => approveVoucher(v.id)}
                            disabled={voucherAction}
                            className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-2.5 py-1.5 rounded text-xs font-medium hover:bg-[#178a64] disabled:opacity-60 transition-colors"
                          >
                            <CheckCircle size={12} /> Co-sign
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* High-Value Invoices */}
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <SectionHeader
          icon={<FileCheck size={14} />}
          title="High-Value Supplier Invoices — Pending Your Approval"
          count={pendingInvoices.length}
          accent={pendingInvoices.length > 0 ? 'red' : 'gray'}
        />
        {pendingInvoices.length === 0 ? (
          <div className="bg-white py-8 flex flex-col items-center gap-1.5">
            <CheckCircle size={22} className="text-gray-200" />
            <p className="text-sm text-gray-400">No invoices awaiting your approval</p>
          </div>
        ) : (
          <div className="bg-white">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/60 border-b border-gray-100">
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
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[130px] truncate">
                        <button onClick={() => setInvoiceDetailModal(inv)} className="hover:text-[#1D9E75] transition-colors text-left">
                          {projectName}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-700">{inv.vendor_invoice_no || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        <button onClick={() => setInvoiceDetailModal(inv)} className="hover:text-[#1D9E75] transition-colors font-mono">
                          {poNo}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-[#E24B4A]">{formatTHB(inv.invoice_amount_incl_vat)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge label="EVP Approved" variant="success" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setInvoiceDetailModal(inv)}
                          className="flex items-center gap-1.5 bg-[#0f1923] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#1a2b3c] transition-colors"
                        >
                          <CheckCircle size={12} />
                          View &amp; Approve
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

      {/* ══════════════════════════════════════════════════════════
          SECTION 2: LARGE PAYMENT DISBURSEMENTS (FYI)
      ══════════════════════════════════════════════════════════ */}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-50 border-b border-gray-200">
          <AlertTriangle size={14} className="text-[#EF9F27]" />
          <span className="text-sm font-semibold text-gray-700">Large Payment Disbursements</span>
          <span className="text-xs text-gray-400 ml-1">— FYI, no action required</span>
          {disbursements.length > 0 && (
            <span className="ml-auto text-xs font-bold bg-gray-300 text-white px-2 py-0.5 rounded-full">
              {disbursements.length}
            </span>
          )}
        </div>
        <div className="bg-[#EF9F27]/4 border-b border-[#EF9F27]/20 px-4 py-2.5">
          <p className="text-xs text-[#C47F00]">
            These payments exceeded the &#3647;3,000,000 threshold and triggered automatic CEO notification per company policy.
          </p>
        </div>
        <div className="bg-white">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/60 border-b border-gray-100">
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
              {disbursements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10">
                    <DollarSign size={28} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">No large payment alerts</p>
                  </td>
                </tr>
              ) : disbursements.map(v => {
                const vPo = (v as any).vendor_invoice?.purchase_order;
                const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
                const poId: string | undefined = vPo?.id;
                return (
                  <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700">{formatDate(v.voucher_date)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-800">
                      {poId ? (
                        <button onClick={() => openPODrillDown(poId)} className="hover:text-[#1D9E75] transition-colors text-left">
                          {v.voucher_no}
                        </button>
                      ) : v.voucher_no}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{vendorName}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">
                      {(v as any).project?.name?.split('–')[0] || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-bold text-[#E24B4A]">{formatTHB(v.net_paid)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge label={v.status.replace(/_/g, ' ')} variant={statusVariant(v.status)} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(v.ceo_notified_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3: COMPLETED — YOUR APPROVAL HISTORY
      ══════════════════════════════════════════════════════════ */}

      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowCompleted(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-gray-600">
            <History size={14} />
            <span className="text-sm font-semibold">Completed — Your Approval History</span>
            {!showCompleted && (approvedInvoices.length + approvedTransfers.length + approvedVouchers.length) > 0 && (
              <span className="text-xs font-medium text-gray-400">
                ({approvedInvoices.length + approvedTransfers.length + approvedVouchers.length} recent)
              </span>
            )}
          </div>
          <Clock size={14} className={`text-gray-400 transition-transform duration-200 ${showCompleted ? 'rotate-180' : ''}`} />
        </button>

        {showCompleted && (
          <div className="divide-y divide-gray-100">

            {/* Approved invoices */}
            {approvedInvoices.length > 0 && (
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Invoices Approved by You</p>
                <div className="space-y-2">
                  {approvedInvoices.map(inv => {
                    const po = (inv as any).purchase_order;
                    return (
                      <div key={inv.id} className="bg-gray-50 rounded-md border border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">{po?.vendor?.name ?? '—'}</p>
                          <p className="text-xs text-gray-400">{po?.pss_po_no ?? '—'} &middot; {po?.project?.name?.split('–')[0]?.trim() ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-bold text-gray-700">{formatTHB(inv.invoice_amount_incl_vat)}</span>
                          <Badge label={inv.status.replace(/_/g, ' ')} variant={statusVariant(inv.status)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Approved/rejected transfers */}
            {approvedTransfers.length > 0 && (
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Margin Transfers — Your Decisions</p>
                <div className="space-y-2">
                  {approvedTransfers.map(t => (
                    <div key={t.id} className="bg-gray-50 rounded-md border border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {(t.from_project as Project)?.name ?? '—'} &rarr; {(t.to_project as Project)?.name ?? '—'}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate((t as any).approved_at ?? (t as any).rejected_at)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-bold text-gray-700">{fmtTHB(t.amount)}</span>
                        <Badge label={t.status.replace(/_/g, ' ')} variant={t.status === 'ceo_approved' ? 'success' : 'danger'} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Co-signed vouchers */}
            {approvedVouchers.length > 0 && (
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Payment Vouchers — Co-signed by You</p>
                <div className="space-y-2">
                  {approvedVouchers.map(v => {
                    const vPo = (v as any).vendor_invoice?.purchase_order;
                    const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
                    return (
                      <div key={v.id} className="bg-gray-50 rounded-md border border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">{vendorName}</p>
                          <p className="text-xs text-gray-400">{v.voucher_no} &middot; {formatDate((v as any).manager_approved_at)}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-bold text-gray-700">{formatTHB(v.net_paid)}</span>
                          <Badge label={v.status.replace(/_/g, ' ')} variant={statusVariant(v.status)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(approvedInvoices.length + approvedTransfers.length + approvedVouchers.length) === 0 && (
              <div className="p-8 text-center">
                <History size={24} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No completed approvals yet</p>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODALS
      ══════════════════════════════════════════════════════════ */}

      {/* Approve transfer modal */}
      {transferModal && transferModalMode === 'approve' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
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
              <div className="mx-6 mb-4 rounded-lg border border-[#E24B4A]/30 bg-[#E24B4A]/5 p-3">
                <p className="text-xs font-semibold text-[#E24B4A] mb-1">Transfer blocked by system:</p>
                <p className="text-xs text-[#c73d3c]">{transferApprovalError}</p>
                <p className="text-xs text-[#E24B4A] mt-1">The transfer was not executed. Check the available margin and try a smaller amount.</p>
              </div>
            )}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setTransferModal(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={() => handleApprove(transferModal)}
                disabled={transferAction}
                className="flex-1 flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60 transition-colors"
              >
                <CheckCircle size={14} />
                {transferAction ? 'Processing...' : 'Approve Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject transfer modal */}
      {transferModal && transferModalMode === 'reject' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
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
              <button onClick={() => setTransferModal(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={() => handleReject(transferModal)}
                disabled={!transferRejectReason.trim() || transferAction}
                className="flex-1 flex items-center justify-center gap-2 bg-[#E24B4A] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#c73d3c] disabled:opacity-60 transition-colors"
              >
                <XCircle size={14} />
                {transferAction ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject voucher modal */}
      {rejectingVoucher && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Reject Payment Voucher</h2>
              <button onClick={() => setRejectingVoucher(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-[#F8F8F7] rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Voucher</span>
                  <span className="font-mono font-medium">{rejectingVoucher.voucher_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Amount</span>
                  <span className="font-bold text-[#E24B4A]">{formatTHB(rejectingVoucher.net_paid)}</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Rejection Reason *</label>
                <textarea
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 resize-none"
                  placeholder="Explain the reason for rejection..."
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setRejectingVoucher(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                onClick={rejectVoucher}
                disabled={!rejectComment.trim() || voucherAction}
                className="flex-1 flex items-center justify-center gap-2 bg-[#E24B4A] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#c73d3c] disabled:opacity-60 transition-colors"
              >
                <XCircle size={14} />
                {voucherAction ? 'Processing...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice detail modal */}
      {invoiceDetailModal && (
        <InvoiceDetailModal
          invoice={invoiceDetailModal}
          role="ceo"
          approving={invoiceApproving}
          onApprove={() => handleApproveInvoice(invoiceDetailModal)}
          onReject={(comment) => handleRejectInvoiceFromModal(invoiceDetailModal, comment)}
          onClose={() => setInvoiceDetailModal(null)}
        />
      )}

      {/* PO drill-down */}
      {selectedPO && (
        <PODetailModal
          key={selectedPO.id}
          po={selectedPO}
          projects={poProjects}
          vendors={poVendors}
          onClose={() => setSelectedPO(null)}
          onSuccess={() => { setSelectedPO(null); loadData(); }}
        />
      )}

    </div>
  );
}
