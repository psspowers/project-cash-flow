import { useEffect, useState, useRef } from 'react';
import {
  CreditCard, AlertTriangle, X, CheckCircle, ChevronDown, Info,
  Clock, CheckSquare, ChevronRight, Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { VendorInvoice, PaymentVoucher, Check, PurchaseOrder, Project, Entity } from '../types';
import { useAuth } from '../context/AuthContext';
import { formatTHB, formatDate } from '../utils/formatters';
import PODetailModal from '../components/pos/PODetailModal';

// ─── WHT constants ───────────────────────────────────────────────────────────

const SIMPLE_WHT_OPTIONS = [
  { rate: 0,    label: 'None' },
  { rate: 0.01, label: '1% — Transport / freight' },
  { rate: 0.03, label: '3% — Professional services' },
  { rate: 0.05, label: '5% — Rent / other' },
] as const;

const CUSTOM_TIERS = [
  { rate: 0.01, label: '1%' },
  { rate: 0.03, label: '3%' },
  { rate: 0.05, label: '5%' },
];

interface CustomLine {
  rate: number;
  label: string;
  baseAmount: string;
}
type WhtMode = 'simple' | 'custom';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function netPayable(inv: VendorInvoice): number {
  const po = (inv as any).purchase_order;
  const gross = inv.invoice_amount_incl_vat || 0;
  const whtRate = po?.wht_rate ?? 0;
  return +(gross - +((gross / 1.07) * whtRate).toFixed(2)).toFixed(2);
}

// ─── Section header ───────────────────────────────────────────────────────────

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
  const accentMap = {
    green: 'text-[#1D9E75] bg-[#1D9E75]/8 border-[#1D9E75]/20',
    amber: 'text-[#EF9F27] bg-[#EF9F27]/8 border-[#EF9F27]/20',
    red:   'text-[#E24B4A] bg-[#E24B4A]/8 border-[#E24B4A]/20',
    gray:  'text-gray-600 bg-gray-50 border-gray-200',
    blue:  'text-blue-600 bg-blue-50 border-blue-200',
  };
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-t-lg border ${accentMap[accent]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {count !== undefined && count > 0 && (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          accent === 'green' ? 'bg-[#1D9E75] text-white' :
          accent === 'amber' ? 'bg-[#EF9F27] text-white' :
          accent === 'red'   ? 'bg-[#E24B4A] text-white' :
          'bg-gray-400 text-white'
        }`}>{count}</span>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentQueue() {
  const { profile, user } = useAuth();
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // PO drill-down
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poProjects, setPoProjects] = useState<Project[]>([]);
  const [poVendors, setPoVendors] = useState<Entity[]>([]);

  // Manager reject voucher
  const [rejectingVoucher, setRejectingVoucher] = useState<PaymentVoucher | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Issue Voucher modal
  const [selectedInvoice, setSelectedInvoice] = useState<VendorInvoice | null>(null);
  const [bankAccount, setBankAccount] = useState('KBank PSS Main');
  const [whtMode, setWhtMode] = useState<WhtMode>('simple');
  const [selectedWhtRate, setSelectedWhtRate] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customLines, setCustomLines] = useState<CustomLine[]>(
    CUSTOM_TIERS.map(t => ({ ...t, baseAmount: '' }))
  );
  const [appliedCustomLines, setAppliedCustomLines] = useState<CustomLine[] | null>(null);

  // Issue Check modal (Banking Officer)
  const [checkModalVoucher, setCheckModalVoucher] = useState<PaymentVoucher | null>(null);
  const [checkNo, setCheckNo] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [issuingCheck, setIssuingCheck] = useState(false);

  // Reconciliation panel
  const [reconOpen, setReconOpen] = useState(false);
  const [markingCleared, setMarkingCleared] = useState<Check | null>(null);
  const [clearDate, setClearDate] = useState('');
  const [clearNote, setClearNote] = useState('');
  const [savingClear, setSavingClear] = useState(false);

  // ── Role flags ──────────────────────────────────────────────────────────────
  const isSupervisor = profile?.role === 'accounts_supervisor';
  const isManager    = profile?.role === 'accounts_manager';
  const isCEO        = profile?.role === 'ceo';
  const isBanking    = profile?.role === 'banking_finance_officer';

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  // ── Data ────────────────────────────────────────────────────────────────────

  async function loadData() {
    const [{ data: inv }, { data: vouc }, { data: chk }, { data: proj }, { data: vend }] = await Promise.all([
      supabase
        .from('vendor_invoices')
        .select('*, project:projects(name), purchase_order:purchase_orders(id, pss_po_no, supplier_name_raw, wht_rate, vendor:entities(name, bank_name, bank_account_no, bank_account_name))')
        .eq('status', 'released')
        .order('created_at', { ascending: false }),
      supabase
        .from('payment_vouchers')
        .select('*, vendor_invoice:vendor_invoices(id, po_id, vendor_invoice_no, invoice_amount_incl_vat, project_id, purchase_order:purchase_orders(id, pss_po_no, supplier_name_raw, wht_rate, vendor:entities(name, bank_name, bank_account_no, bank_account_name))), project:projects(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('checks')
        .select('*, payment_voucher:payment_vouchers(id, voucher_no, net_paid, status, vendor_invoice:vendor_invoices(vendor_invoice_no, purchase_order:purchase_orders(pss_po_no, supplier_name_raw, vendor:entities(name))))')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, status').order('name'),
      supabase.from('entities').select('id, name').eq('type', 'vendor').eq('is_active', true).order('name'),
    ]);
    setInvoices(inv || []);
    setVouchers(vouc || []);
    setChecks(chk || []);
    setPoProjects(proj || []);
    setPoVendors(vend || []);
    setLoading(false);
  }

  // ── Derived sets ────────────────────────────────────────────────────────────

  // All voucher–linked invoice IDs (any status)
  const voucherInvoiceIds = new Set(
    vouchers.map(v => (v as any).vendor_invoice_id).filter(Boolean)
  );

  // Released invoices with no voucher yet
  const invoicesWithNoVoucher = invoices.filter(inv => !voucherInvoiceIds.has(inv.id));

  const highValueNoVoucher = invoicesWithNoVoucher.filter(inv => netPayable(inv) >= 1_000_000);
  const subValueNoVoucher  = invoicesWithNoVoucher.filter(inv => netPayable(inv) <  1_000_000);
  // All actionable invoices for Supervisor (sorted ≥₿1M first)
  const supervisorQueue = [
    ...highValueNoVoucher.sort((a, b) => netPayable(b) - netPayable(a)),
    ...subValueNoVoucher.sort((a, b) => netPayable(b) - netPayable(a)),
  ];

  const pendingManagerVouchers = vouchers.filter(v => v.status === 'pending_manager');
  const approvedVouchers       = vouchers.filter(v => v.status === 'approved');
  const rejectedVouchers       = vouchers.filter(v => v.status === 'rejected');

  // Checks split by state
  const draftChecks   = checks.filter(c => c.status === 'draft');    // issued voucher, no check written yet
  const issuedChecks  = checks.filter(c => c.status === 'issued');   // check written, not cleared
  const clearedChecks = checks.filter(c => c.status === 'cleared');  // reconciled

  // ── Voucher modal helpers ───────────────────────────────────────────────────

  function openModal(inv: VendorInvoice) {
    const po = (inv as any).purchase_order;
    setSelectedInvoice(inv);
    setWhtMode('simple');
    setSelectedWhtRate(po?.wht_rate != null ? po.wht_rate : null);
    setPickerOpen(false);
    setBankAccount('KBank PSS Main');
    setCustomLines(CUSTOM_TIERS.map(t => ({ ...t, baseAmount: '' })));
    setAppliedCustomLines(null);
  }

  function closeModal() {
    setSelectedInvoice(null);
    setWhtMode('simple');
    setSelectedWhtRate(null);
    setPickerOpen(false);
    setBankAccount('KBank PSS Main');
    setCustomLines(CUSTOM_TIERS.map(t => ({ ...t, baseAmount: '' })));
    setAppliedCustomLines(null);
  }

  function openCustomModal() {
    setCustomLines(
      appliedCustomLines
        ? appliedCustomLines.map(l => ({ ...l }))
        : CUSTOM_TIERS.map(t => ({ ...t, baseAmount: '' }))
    );
    setCustomModalOpen(true);
    setPickerOpen(false);
  }

  function cancelCustomModal() {
    setCustomModalOpen(false);
    if (!appliedCustomLines) setWhtMode('simple');
  }

  function applyCustomModal() {
    setAppliedCustomLines(customLines.map(l => ({ ...l })));
    setWhtMode('custom');
    setSelectedWhtRate(null);
    setCustomModalOpen(false);
  }

  // Modal calculations
  const modalGross   = selectedInvoice?.invoice_amount_incl_vat ?? 0;
  const modalExclVat = modalGross / 1.07;

  const customWorkingTotalBase = customLines.reduce((s, l) => s + (parseFloat(l.baseAmount) || 0), 0);
  const customWorkingTotalWht  = customLines.reduce((s, l) => {
    const base = parseFloat(l.baseAmount) || 0;
    return s + base * l.rate;
  }, 0);

  const appliedTotalWht: number | null =
    whtMode === 'custom' && appliedCustomLines
      ? +appliedCustomLines.reduce((s, l) => {
          const base = parseFloat(l.baseAmount) || 0;
          return s + base * l.rate;
        }, 0).toFixed(2)
      : whtMode === 'simple' && selectedWhtRate !== null
        ? +(modalExclVat * selectedWhtRate).toFixed(2)
        : null;

  const modalNetPayable = appliedTotalWht !== null ? +(modalGross - appliedTotalWht).toFixed(2) : modalGross;

  const canSubmit = !!bankAccount && (
    (whtMode === 'simple' && selectedWhtRate !== null) ||
    (whtMode === 'custom' && appliedCustomLines !== null)
  );

  // ── PO drill-down ───────────────────────────────────────────────────────────

  async function openPODrillDown(poId: string) {
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, supplier_name_raw, vendor:entities!vendor_id(*), project:projects(*)')
      .eq('id', poId)
      .maybeSingle();
    if (data) setSelectedPO(data as PurchaseOrder);
  }

  // ── Voucher sequences ───────────────────────────────────────────────────────

  async function getNextVoucherNo(): Promise<string> {
    const today    = format(new Date(), 'yyyy-MM-dd');
    const shortDate = format(new Date(), 'yyyyMMdd');
    const { data } = await supabase
      .from('voucher_sequences')
      .select('*')
      .eq('seq_date', today)
      .maybeSingle();
    let seq = 1;
    if (data) {
      seq = data.last_seq + 1;
      await supabase.from('voucher_sequences').update({ last_seq: seq }).eq('seq_date', today);
    } else {
      await supabase.from('voucher_sequences').insert({ seq_date: today, last_seq: 1 });
    }
    return `VCH-${format(new Date(), 'yyyy')}-${shortDate}-${String(seq).padStart(3, '0')}`;
  }

  // ── Notifications ───────────────────────────────────────────────────────────

  async function insertPaymentNotifications(
    voucherId: string,
    netPaid: number,
    vendorName: string,
    projectName: string,
  ) {
    const notifications: {
      user_id: string;
      title: string;
      message: string;
      type: 'warning' | 'info';
      is_read: boolean;
      related_entity_type: string;
      related_entity_id: string;
    }[] = [];

    if (netPaid >= 1_000_000) {
      const { data: mgr } = await supabase
        .from('user_profiles').select('id').eq('role', 'accounts_manager').maybeSingle();
      if (mgr) {
        notifications.push({
          user_id: mgr.id,
          title: 'Sign-off required',
          message: `Payment of ${formatTHB(netPaid)} to ${vendorName} for ${projectName} requires your co-signature.`,
          type: 'warning',
          is_read: false,
          related_entity_type: 'payment_voucher',
          related_entity_id: voucherId,
        });
      }
    }
    if (netPaid >= 3_000_000) {
      const { data: ceo } = await supabase
        .from('user_profiles').select('id').eq('role', 'ceo').maybeSingle();
      if (ceo) {
        notifications.push({
          user_id: ceo.id,
          title: 'Large payment approved',
          message: `Payment of ${formatTHB(netPaid)} to ${vendorName} for ${projectName} has been approved.`,
          type: 'info',
          is_read: false,
          related_entity_type: 'payment_voucher',
          related_entity_id: voucherId,
        });
      }
    }
    if (notifications.length > 0) {
      await supabase.from('notifications').insert(notifications);
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function issueVoucher() {
    if (!selectedInvoice || !user) return;
    if (whtMode === 'simple' && selectedWhtRate === null) return;
    if (whtMode === 'custom' && !appliedCustomLines) return;
    if (!bankAccount) return;
    setSubmitting(true);

    const voucherNo = await getNextVoucherNo();
    const po = (selectedInvoice as any).purchase_order;
    const gross    = selectedInvoice.invoice_amount_incl_vat || 0;
    const exclVat  = gross / 1.07;
    const vendorName  = po?.vendor?.name ?? po?.supplier_name_raw ?? 'Unknown vendor';
    const projectName = (selectedInvoice as any).project?.name ?? 'Unknown project';

    let totalWhtAmount = 0;
    if (whtMode === 'simple') {
      totalWhtAmount = +(exclVat * selectedWhtRate!).toFixed(2);
    } else {
      totalWhtAmount = +appliedCustomLines!.reduce((sum, l) => {
        const base = parseFloat(l.baseAmount) || 0;
        return sum + base * l.rate;
      }, 0).toFixed(2);
    }

    const netPaid = +(gross - totalWhtAmount).toFixed(2);
    const requiresManager = netPaid >= 1_000_000;
    const ceoPay = netPaid >= 3_000_000;

    const { data: voucherData, error } = await supabase
      .from('payment_vouchers')
      .insert({
        voucher_no: voucherNo,
        vendor_invoice_id: selectedInvoice.id,
        project_id: selectedInvoice.project_id,
        amount: gross,
        wht_amount: totalWhtAmount,
        net_paid: netPaid,
        voucher_date: new Date().toISOString().substring(0, 10),
        prepared_by: user.id,
        requires_manager_approval: requiresManager,
        ceo_notified: ceoPay,
        ceo_notified_at: ceoPay ? new Date().toISOString() : null,
        status: requiresManager ? 'pending_manager' : 'approved',
      })
      .select()
      .maybeSingle();

    if (!error && voucherData) {
      let whtLines: { voucher_id: string; base_amount: number; wht_rate: number; wht_amount: number }[];
      if (whtMode === 'simple') {
        whtLines = [{
          voucher_id: voucherData.id,
          base_amount: +exclVat.toFixed(2),
          wht_rate: selectedWhtRate!,
          wht_amount: totalWhtAmount,
        }];
      } else {
        whtLines = appliedCustomLines!
          .filter(l => parseFloat(l.baseAmount) > 0)
          .map(l => {
            const base = parseFloat(l.baseAmount);
            return { voucher_id: voucherData.id, base_amount: base, wht_rate: l.rate, wht_amount: +(base * l.rate).toFixed(2) };
          });
      }

      // Create draft check record (no check_no/date yet — filled by Banking Officer)
      await Promise.all([
        supabase.from('voucher_wht_lines').insert(whtLines),
        supabase.from('checks').insert({
          voucher_id: voucherData.id,
          bank_account: bankAccount,
          check_no: null,
          check_date: null,
          payee: vendorName,
          amount: netPaid,
          status: 'draft',
        }),
        // NOTE: vendor_invoices.status is NOT mutated here.
        // It is moved to 'paid' ONLY when the Banking Officer issues the physical check.
        insertPaymentNotifications(voucherData.id, netPaid, vendorName, projectName),
      ]);
    }

    closeModal();
    setSubmitting(false);
    loadData();
  }

  async function approveVoucher(voucherId: string) {
    if (!user) return;
    await supabase
      .from('payment_vouchers')
      .update({ status: 'approved', manager_approved_by: user.id, manager_approved_at: new Date().toISOString() })
      .eq('id', voucherId);
    await supabase
      .from('checks')
      .update({ signed_by_manager: user.id })
      .eq('voucher_id', voucherId);
    loadData();
  }

  async function rejectVoucher() {
    if (!rejectingVoucher || !user || !rejectComment.trim()) return;
    setRejecting(true);
    try {
      await supabase
        .from('payment_vouchers')
        .update({
          status: 'rejected',
          rejection_comment: rejectComment.trim(),
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
        })
        .eq('id', rejectingVoucher.id);
      // Return invoice to released so Supervisor can re-issue
      if ((rejectingVoucher as any).vendor_invoice_id) {
        await supabase
          .from('vendor_invoices')
          .update({ status: 'released' })
          .eq('id', (rejectingVoucher as any).vendor_invoice_id);
      }
      setRejectingVoucher(null);
      setRejectComment('');
      loadData();
    } finally {
      setRejecting(false);
    }
  }

  // ── Banking Officer: Issue Check ────────────────────────────────────────────

  function openCheckModal(voucher: PaymentVoucher) {
    setCheckModalVoucher(voucher);
    setCheckNo('');
    setCheckDate(new Date().toISOString().substring(0, 10));
    setIssuingCheck(false);
  }

  function closeCheckModal() {
    setCheckModalVoucher(null);
    setCheckNo('');
    setCheckDate('');
  }

  async function issueCheck() {
    if (!checkModalVoucher || !user || !checkNo.trim() || !checkDate) return;
    setIssuingCheck(true);
    try {
      const invoiceId = (checkModalVoucher as any).vendor_invoice?.id
        ?? (checkModalVoucher as any).vendor_invoice_id;

      await Promise.all([
        // 1. Mark payment_voucher as issued
        supabase
          .from('payment_vouchers')
          .update({ status: 'issued' })
          .eq('id', checkModalVoucher.id),
        // 2. Update checks record with check number, date, and issued status
        supabase
          .from('checks')
          .update({
            check_no: checkNo.trim(),
            check_date: checkDate,
            status: 'issued',
            signed_by_supervisor: user.id,
          })
          .eq('voucher_id', checkModalVoucher.id),
        // 3. Mark vendor_invoice as paid — THIS IS THE ONLY PLACE THIS HAPPENS
        ...(invoiceId
          ? [supabase.from('vendor_invoices').update({ status: 'paid' }).eq('id', invoiceId)]
          : []),
      ]);

      closeCheckModal();
      loadData();
    } finally {
      setIssuingCheck(false);
    }
  }

  // ── Bank Reconciliation: Mark Cleared ───────────────────────────────────────

  function openClearModal(chk: Check) {
    setMarkingCleared(chk);
    setClearDate(new Date().toISOString().substring(0, 10));
    setClearNote('');
  }

  function closeClearModal() {
    setMarkingCleared(null);
    setClearDate('');
    setClearNote('');
  }

  async function markCleared() {
    if (!markingCleared || !clearDate) return;
    setSavingClear(true);
    try {
      await supabase
        .from('checks')
        .update({
          status: 'cleared',
          cleared_at: new Date(clearDate).toISOString(),
          cleared_note: clearNote.trim() || null,
        })
        .eq('id', markingCleared.id);
      closeClearModal();
      loadData();
    } finally {
      setSavingClear(false);
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function VoucherCard({
    voucher,
    actionSlot,
  }: {
    voucher: PaymentVoucher;
    actionSlot?: React.ReactNode;
  }) {
    const vPo = (voucher as any).vendor_invoice?.purchase_order;
    const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
    const invoiceNo  = (voucher as any).vendor_invoice?.vendor_invoice_no ?? '—';
    return (
      <div className="bg-white rounded-md border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          {vPo?.pss_po_no && (
            <button
              onClick={() => openPODrillDown(vPo.id)}
              className="text-xs font-medium text-[#1D9E75] hover:underline underline-offset-2 mb-0.5 block"
            >
              {vPo.pss_po_no}
            </button>
          )}
          <p className="text-sm font-semibold text-gray-800 truncate">{vendorName}</p>
          <p className="text-xs text-gray-400">{voucher.voucher_no} · {invoiceNo} · {formatDate(voucher.voucher_date)}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-bold text-gray-800">{formatTHB(voucher.net_paid)}</span>
          {actionSlot}
        </div>
      </div>
    );
  }

  function InvoiceCard({
    inv,
    tag,
    actionSlot,
  }: {
    inv: VendorInvoice;
    tag?: React.ReactNode;
    actionSlot?: React.ReactNode;
  }) {
    const po          = (inv as any).purchase_order;
    const vendorName  = po?.vendor?.name ?? po?.supplier_name_raw ?? '—';
    const projectShort = (inv as any).project?.name?.split('–')[0]?.trim() || '—';
    const net = netPayable(inv);
    return (
      <div className="bg-white rounded-md border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          {po?.pss_po_no && (
            <button
              onClick={() => openPODrillDown(po.id)}
              className="text-xs font-medium text-[#1D9E75] hover:underline underline-offset-2 mb-0.5 block"
            >
              {po.pss_po_no}
            </button>
          )}
          <p className="text-sm font-semibold text-gray-800 truncate">{vendorName}</p>
          <p className="text-xs text-gray-400">{projectShort} · {inv.vendor_invoice_no || 'No invoice no.'}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-bold text-gray-800">{formatTHB(net)}</span>
          {tag}
          {actionSlot}
        </div>
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUPERVISOR VIEW
  // ─────────────────────────────────────────────────────────────────────────────

  if (isSupervisor) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">EVP-approved invoices — issue vouchers and track progress</p>
        </div>

        {/* A — Active: invoices awaiting voucher */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SectionHeader
            icon={<CreditCard size={14} />}
            title="Active — Issue Voucher"
            count={supervisorQueue.length}
            accent="green"
          />
          <div className="p-4 space-y-2">
            {supervisorQueue.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">All invoices have vouchers in progress.</p>
            ) : (
              supervisorQueue.map(inv => {
                const net = netPayable(inv);
                const isHighValue = net >= 1_000_000;
                return (
                  <InvoiceCard
                    key={inv.id}
                    inv={inv}
                    actionSlot={
                      <button
                        onClick={() => openModal(inv)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          isHighValue
                            ? 'bg-[#EF9F27]/10 border border-[#EF9F27]/40 text-[#C47F00] hover:bg-[#EF9F27]/20'
                            : 'bg-[#0f1923] text-white hover:bg-[#1a2b3c]'
                        }`}
                      >
                        <CreditCard size={12} />
                        {isHighValue ? 'Submit for Co-Sign' : 'Issue Voucher'}
                      </button>
                    }
                  />
                );
              })
            )}
          </div>
        </div>

        {/* B — In Progress: Awaiting Manager Co-Sign */}
        {pendingManagerVouchers.length > 0 && (
          <div className="border border-[#EF9F27]/30 rounded-lg overflow-hidden">
            <SectionHeader
              icon={<Clock size={14} />}
              title="In Progress — Awaiting Manager Co-Sign"
              count={pendingManagerVouchers.length}
              accent="amber"
            />
            <div className="p-4 space-y-2">
              {pendingManagerVouchers.map(v => (
                <VoucherCard
                  key={v.id}
                  voucher={v}
                  actionSlot={
                    <span className="text-xs text-[#EF9F27] font-medium bg-[#EF9F27]/10 px-2 py-0.5 rounded-full">
                      Awaiting Co-Sign
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* C — In Progress: Awaiting Check Issuance */}
        {approvedVouchers.length > 0 && (
          <div className="border border-[#1D9E75]/30 rounded-lg overflow-hidden">
            <SectionHeader
              icon={<CheckSquare size={14} />}
              title="In Progress — Awaiting Check Issuance"
              count={approvedVouchers.length}
              accent="green"
            />
            <div className="p-4 space-y-2">
              {approvedVouchers.map(v => (
                <VoucherCard
                  key={v.id}
                  voucher={v}
                  actionSlot={
                    <span className="text-xs text-[#1D9E75] font-medium bg-[#1D9E75]/10 px-2 py-0.5 rounded-full">
                      Approved — Awaiting Banking
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Rejected vouchers */}
        {rejectedVouchers.length > 0 && (
          <div className="border border-[#E24B4A]/30 rounded-lg overflow-hidden">
            <SectionHeader
              icon={<AlertTriangle size={14} />}
              title={`${rejectedVouchers.length} Voucher${rejectedVouchers.length > 1 ? 's' : ''} Rejected by Manager`}
              accent="red"
            />
            <div className="p-4 space-y-2">
              {rejectedVouchers.map(v => {
                const vPo = (v as any).vendor_invoice?.purchase_order;
                return (
                  <div key={v.id} className="bg-white rounded-md border border-[#E24B4A]/20 px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        {vPo?.pss_po_no && (
                          <button onClick={() => openPODrillDown(vPo.id)} className="text-xs font-medium text-[#1D9E75] hover:underline underline-offset-2 mb-0.5 block">
                            {vPo.pss_po_no}
                          </button>
                        )}
                        <p className="text-sm font-semibold text-gray-800">{v.voucher_no}</p>
                        <p className="text-xs text-gray-500">{formatTHB(v.net_paid)} · {formatDate(v.voucher_date)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium text-[#E24B4A] mb-0.5">Manager's comment</p>
                        <p className="text-xs text-gray-700 max-w-xs text-right">{(v as any).rejection_comment || '—'}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Invoice returned to queue — correct and re-issue.</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Voucher + Custom WHT modals */}
        {renderIssueVoucherModal()}
        {renderCustomWhtModal()}
        {renderRejectModal()}
        {selectedPO && (
          <PODetailModal key={selectedPO.id} po={selectedPO} projects={poProjects} vendors={poVendors}
            onClose={() => setSelectedPO(null)} onSuccess={() => { setSelectedPO(null); loadData(); }} />
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MANAGER VIEW
  // ─────────────────────────────────────────────────────────────────────────────

  if (isManager || isCEO) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">Payment pipeline visibility and co-sign authority</p>
        </div>

        {/* A — Active: Co-Sign queue */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SectionHeader
            icon={<CheckSquare size={14} />}
            title="Active — Vouchers Awaiting Co-Sign"
            count={pendingManagerVouchers.length}
            accent={pendingManagerVouchers.length > 0 ? 'amber' : 'gray'}
          />
          <div className="p-4 space-y-2">
            {pendingManagerVouchers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No vouchers awaiting your co-signature.</p>
            ) : (
              pendingManagerVouchers.map(v => (
                <VoucherCard
                  key={v.id}
                  voucher={v}
                  actionSlot={
                    isManager ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setRejectingVoucher(v); setRejectComment(''); }}
                          className="flex items-center gap-1.5 border border-[#E24B4A] text-[#E24B4A] px-3 py-1.5 rounded text-xs font-medium hover:bg-[#E24B4A]/5 transition-colors"
                        >
                          <X size={12} />
                          Reject
                        </button>
                        <button
                          onClick={() => approveVoucher(v.id)}
                          className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#178a64] transition-colors"
                        >
                          <CheckCircle size={12} />
                          Co-sign
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Awaiting Manager</span>
                    )
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* B — In Progress: Awaiting Supervisor Voucher */}
        {highValueNoVoucher.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <SectionHeader
              icon={<Clock size={14} />}
              title="In Progress — Awaiting Supervisor Voucher"
              count={highValueNoVoucher.length}
              accent="gray"
            />
            <div className="p-4 space-y-2">
              {highValueNoVoucher.map(inv => (
                <InvoiceCard
                  key={inv.id}
                  inv={inv}
                  tag={<span className="text-xs text-gray-400 italic">Awaiting Supervisor</span>}
                />
              ))}
            </div>
          </div>
        )}

        {/* C — In Progress: Awaiting Check Issuance */}
        {approvedVouchers.length > 0 && (
          <div className="border border-[#1D9E75]/30 rounded-lg overflow-hidden">
            <SectionHeader
              icon={<CreditCard size={14} />}
              title="In Progress — Awaiting Check Issuance"
              count={approvedVouchers.length}
              accent="green"
            />
            <div className="p-4 space-y-2">
              {approvedVouchers.map(v => (
                <VoucherCard
                  key={v.id}
                  voucher={v}
                  actionSlot={
                    <span className="text-xs text-[#1D9E75] font-medium bg-[#1D9E75]/10 px-2 py-0.5 rounded-full">
                      Co-signed — Awaiting Banking
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        )}

        {renderRejectModal()}
        {selectedPO && (
          <PODetailModal key={selectedPO.id} po={selectedPO} projects={poProjects} vendors={poVendors}
            onClose={() => setSelectedPO(null)} onSuccess={() => { setSelectedPO(null); loadData(); }} />
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BANKING OFFICER VIEW
  // ─────────────────────────────────────────────────────────────────────────────

  if (isBanking) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payment Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">Write and reconcile payment checks</p>
        </div>

        {/* A — Active: Issue Checks */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <SectionHeader
            icon={<CreditCard size={14} />}
            title="Active — Issue Checks"
            count={approvedVouchers.length}
            accent={approvedVouchers.length > 0 ? 'green' : 'gray'}
          />
          <div className="p-4 space-y-2">
            {approvedVouchers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No approved vouchers awaiting check issuance.</p>
            ) : (
              approvedVouchers.map(v => {
                const vi  = (v as any).vendor_invoice;
                const vPo = vi?.purchase_order;
                const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
                const invoiceNo  = vi?.vendor_invoice_no ?? '—';
                const bankAcc = checks.find(c => c.voucher_id === v.id)?.bank_account ?? '—';
                return (
                  <div key={v.id} className="bg-white rounded-md border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      {vPo?.pss_po_no && (
                        <button
                          onClick={() => openPODrillDown(vPo.id)}
                          className="text-xs font-medium text-[#1D9E75] hover:underline underline-offset-2 mb-0.5 block"
                        >
                          {vPo.pss_po_no}
                        </button>
                      )}
                      <p className="text-sm font-semibold text-gray-800 truncate">{vendorName}</p>
                      <p className="text-xs text-gray-400">{v.voucher_no} · {invoiceNo}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Building2 size={10} /> {bankAcc}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-gray-800">{formatTHB(v.net_paid)}</span>
                      <button
                        onClick={() => openCheckModal(v)}
                        className="flex items-center gap-1.5 bg-[#0f1923] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#1a2b3c] transition-colors"
                      >
                        <CreditCard size={12} />
                        Issue Check
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* B — In Progress: Pending Manager Co-Sign */}
        {pendingManagerVouchers.length > 0 && (
          <div className="border border-[#EF9F27]/30 rounded-lg overflow-hidden">
            <SectionHeader
              icon={<Clock size={14} />}
              title="In Progress — Pending Manager Co-Sign"
              count={pendingManagerVouchers.length}
              accent="amber"
            />
            <div className="p-4 space-y-2">
              {pendingManagerVouchers.map(v => (
                <VoucherCard
                  key={v.id}
                  voucher={v}
                  actionSlot={
                    <span className="text-xs text-[#EF9F27] font-medium bg-[#EF9F27]/10 px-2 py-0.5 rounded-full">
                      Pending Co-Sign
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* C — In Progress: Pending Supervisor Voucher */}
        {invoicesWithNoVoucher.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <SectionHeader
              icon={<Clock size={14} />}
              title="In Progress — Pending Supervisor Voucher"
              count={invoicesWithNoVoucher.length}
              accent="gray"
            />
            <div className="p-4 space-y-2">
              {invoicesWithNoVoucher.map(inv => (
                <InvoiceCard
                  key={inv.id}
                  inv={inv}
                  tag={<span className="text-xs text-gray-400 italic">Awaiting Voucher</span>}
                />
              ))}
            </div>
          </div>
        )}

        {/* Bank Reconciliation — collapsible accordion */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setReconOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2 text-gray-600">
              <Building2 size={14} />
              <span className="text-sm font-semibold">Bank Reconciliation</span>
              {issuedChecks.length > 0 && (
                <span className="text-xs font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full">
                  {issuedChecks.length} to clear
                </span>
              )}
            </div>
            <ChevronRight size={14} className={`text-gray-400 transition-transform ${reconOpen ? 'rotate-90' : ''}`} />
          </button>

          {reconOpen && (
            <div className="divide-y divide-gray-100">
              {/* Issued checks awaiting bank clearance */}
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Checks Issued — Awaiting Bank Clearance ({issuedChecks.length})
                </p>
                {issuedChecks.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No checks awaiting clearance.</p>
                ) : (
                  <div className="space-y-2">
                    {issuedChecks.map(chk => {
                      const v    = chk.payment_voucher;
                      const vPo  = (v as any)?.vendor_invoice?.purchase_order;
                      const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
                      return (
                        <div key={chk.id} className="bg-white rounded-md border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{vendorName}</p>
                            <p className="text-xs text-gray-400">
                              Check #{chk.check_no} · {formatDate(chk.check_date)} · {chk.bank_account}
                            </p>
                            <p className="text-xs text-gray-400">{v?.voucher_no}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-bold text-gray-800">{formatTHB(chk.amount)}</span>
                            <button
                              onClick={() => openClearModal(chk)}
                              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                            >
                              <CheckCircle size={12} />
                              Mark Cleared
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cleared history */}
              {clearedChecks.length > 0 && (
                <div className="p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Cleared — Bank Confirmed ({clearedChecks.length})
                  </p>
                  <div className="space-y-2">
                    {clearedChecks.map(chk => {
                      const v   = chk.payment_voucher;
                      const vPo = (v as any)?.vendor_invoice?.purchase_order;
                      const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
                      return (
                        <div key={chk.id} className="bg-gray-50 rounded-md border border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-700">{vendorName}</p>
                            <p className="text-xs text-gray-400">
                              Check #{chk.check_no} · Cleared {formatDate(chk.cleared_at)}
                              {chk.cleared_note ? ` · ${chk.cleared_note}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium text-gray-600">{formatTHB(chk.amount)}</span>
                            <span className="text-xs text-[#1D9E75] font-medium bg-[#1D9E75]/10 px-2 py-0.5 rounded-full">Cleared</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modals */}
        {renderIssueCheckModal()}
        {renderMarkClearedModal()}
        {selectedPO && (
          <PODetailModal key={selectedPO.id} po={selectedPO} projects={poProjects} vendors={poVendors}
            onClose={() => setSelectedPO(null)} onSuccess={() => { setSelectedPO(null); loadData(); }} />
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // OTHER ROLES — read-only summary
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Payment Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">EVP-approved invoices ready for payment</p>
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">PO No.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Invoice No.</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Net Payable</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoicesWithNoVoucher.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No invoices ready for payment</td>
              </tr>
            ) : (
              invoicesWithNoVoucher.map(inv => {
                const po = (inv as any).purchase_order;
                const vendorName = po?.vendor?.name ?? po?.supplier_name_raw ?? '—';
                return (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-xs font-medium text-[#1D9E75]">{po?.pss_po_no || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{vendorName}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{inv.vendor_invoice_no || '—'}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatTHB(netPayable(inv))}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1D9E75] bg-[#1D9E75]/8 px-2 py-0.5 rounded-full">
                        <CheckCircle size={11} />Released
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {selectedPO && (
        <PODetailModal key={selectedPO.id} po={selectedPO} projects={poProjects} vendors={poVendors}
          onClose={() => setSelectedPO(null)} onSuccess={() => { setSelectedPO(null); loadData(); }} />
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // MODAL RENDERERS (shared across views)
  // ─────────────────────────────────────────────────────────────────────────────

  function renderIssueVoucherModal() {
    if (!selectedInvoice) return null;
    const modalPo = (selectedInvoice as any).purchase_order;
    const modalVendorName = modalPo?.vendor?.name ?? modalPo?.supplier_name_raw ?? '—';
    const vendorBankName: string | null = modalPo?.vendor?.bank_name ?? null;
    const vendorBankAccNo: string | null = modalPo?.vendor?.bank_account_no ?? null;
    const vendorBankAccName: string | null = modalPo?.vendor?.bank_account_name ?? null;
    const hasBankDetails = vendorBankName || vendorBankAccNo;
    const isOver = customLines.reduce((s, l) => s + (parseFloat(l.baseAmount) || 0), 0) > modalExclVat + 1;

    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-800">Issue Payment Voucher</h2>
            <button onClick={closeModal}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between items-start">
                <span className="text-gray-500 shrink-0">Vendor</span>
                <div className="text-right ml-4">
                  <p className="font-medium text-gray-800">{modalVendorName}</p>
                  {hasBankDetails && (
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                      {[vendorBankName, vendorBankAccNo].filter(Boolean).join(' · ')}
                      {vendorBankAccName ? ` (${vendorBankAccName})` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Invoice No.</span>
                <span>{selectedInvoice.vendor_invoice_no || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Gross Amount</span>
                <span>{formatTHB(modalGross)}</span>
              </div>

              {/* WHT picker */}
              <div ref={pickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen(o => !o)}
                  className={`w-full flex justify-between items-center rounded-md px-2 py-1.5 -mx-2 transition-colors text-sm ${
                    appliedTotalWht === null ? 'bg-[#E24B4A]/8 hover:bg-[#E24B4A]/12' : 'hover:bg-gray-100'
                  }`}
                >
                  <span className={appliedTotalWht === null ? 'text-[#E24B4A] font-medium' : 'text-gray-500'}>
                    {whtMode === 'custom' ? 'WHT Custom' : `WHT${selectedWhtRate !== null ? ` ${(selectedWhtRate * 100).toFixed(0)}%` : ''}`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={appliedTotalWht === null ? 'text-xs italic text-[#E24B4A]' : appliedTotalWht > 0 ? 'text-[#E24B4A]' : 'text-gray-400'}>
                      {appliedTotalWht === null ? 'tap to select' : appliedTotalWht > 0 ? `(${formatTHB(appliedTotalWht)})` : '฿0'}
                    </span>
                    {whtMode === 'custom' && appliedCustomLines && (
                      <button type="button" onClick={e => { e.stopPropagation(); openCustomModal(); }} className="text-xs text-[#1D9E75] underline underline-offset-2 ml-1">Edit</button>
                    )}
                    <ChevronDown size={13} className={`text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {pickerOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                    <div className="px-4 pt-3 pb-1.5">
                      <p className="text-xs font-semibold text-gray-700">Fill Applicable WHT Amount</p>
                    </div>
                    <div className="px-2 pb-1">
                      {SIMPLE_WHT_OPTIONS.map(opt => {
                        const optWhtAmt = +(modalExclVat * opt.rate).toFixed(2);
                        const isSelected = whtMode === 'simple' && selectedWhtRate === opt.rate;
                        return (
                          <button key={opt.rate} type="button"
                            onClick={() => { setWhtMode('simple'); setSelectedWhtRate(opt.rate); setAppliedCustomLines(null); setPickerOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${isSelected ? 'bg-[#1D9E75]/10 text-[#1D9E75]' : 'hover:bg-gray-50 text-gray-700'}`}
                          >
                            <span className="font-semibold w-8 text-left shrink-0">{(opt.rate * 100).toFixed(0)}%</span>
                            <span className="flex-1 text-left text-xs text-gray-500 pl-1">{opt.label}</span>
                            <span className={`font-medium text-right ${isSelected ? 'text-[#1D9E75]' : 'text-gray-700'}`}>
                              {opt.rate === 0 ? '฿0' : formatTHB(optWhtAmt)}
                            </span>
                            {isSelected && <CheckCircle size={13} className="text-[#1D9E75] ml-2 shrink-0" />}
                          </button>
                        );
                      })}
                      <button type="button" onClick={openCustomModal}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${whtMode === 'custom' ? 'bg-[#1D9E75]/10 text-[#1D9E75]' : 'hover:bg-gray-50 text-gray-700'}`}
                      >
                        <span className="font-semibold w-8 text-left shrink-0 text-xs">Mix</span>
                        <span className="flex-1 text-left text-xs text-gray-500 pl-1">Custom — split by rate</span>
                        <span className={`font-medium text-right text-xs ${whtMode === 'custom' ? 'text-[#1D9E75]' : 'text-gray-500'}`}>
                          {whtMode === 'custom' && appliedCustomLines ? formatTHB(appliedTotalWht ?? 0) : 'Enter amounts →'}
                        </span>
                        {whtMode === 'custom' && <CheckCircle size={13} className="text-[#1D9E75] ml-2 shrink-0" />}
                      </button>
                    </div>
                    <div className="border-t border-gray-100 mx-3 mb-2.5 pt-2 flex justify-between items-center">
                      <span className="text-xs font-semibold text-gray-600">Net Payable</span>
                      <span className="text-sm font-bold text-gray-900">
                        {appliedTotalWht !== null ? formatTHB(modalNetPayable) : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                <span className="font-semibold text-gray-700">Net Payable</span>
                <span className={`font-bold text-base ${appliedTotalWht !== null ? 'text-gray-900' : 'text-gray-400'}`}>
                  {appliedTotalWht !== null ? formatTHB(modalNetPayable) : '—'}
                </span>
              </div>
            </div>

            {appliedTotalWht === null && (
              <p className="text-xs text-[#E24B4A] font-medium -mt-2">WHT selection is required before issuing this voucher.</p>
            )}
            {appliedTotalWht !== null && modalNetPayable >= 1_000_000 && (
              <div className="flex items-start gap-2 p-3 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg">
                <AlertTriangle size={14} className="text-[#EF9F27] shrink-0 mt-0.5" />
                <p className="text-xs text-[#EF9F27] font-medium">Payment ≥ ฿1,000,000 requires Accounts Manager co-signature</p>
              </div>
            )}
            {appliedTotalWht !== null && modalNetPayable >= 3_000_000 && (
              <div className="flex items-start gap-2 p-3 bg-[#E24B4A]/10 border border-[#E24B4A]/30 rounded-lg">
                <AlertTriangle size={14} className="text-[#E24B4A] shrink-0 mt-0.5" />
                <p className="text-xs text-[#E24B4A] font-medium">Payment ≥ ฿3,000,000 – CEO will be notified</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Bank Account</label>
                <select
                  value={bankAccount}
                  onChange={e => setBankAccount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                >
                  <option value="KBank PSS Main">KBank PSS Main</option>
                  <option value="SCB PSS Project">SCB PSS Project</option>
                </select>
              </div>
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <span className="text-xs text-blue-600">Check number and date will be entered by the Banking Officer when the physical check is written.</span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={closeModal} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={issueVoucher} disabled={submitting || !canSubmit}
                className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Processing...' : 'Issue Voucher'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderCustomWhtModal() {
    if (!customModalOpen || !selectedInvoice) return null;
    const remaining = +(modalExclVat - customWorkingTotalBase).toFixed(2);
    const isBalanced = Math.abs(remaining) < 1;
    const isOver = remaining < -1;
    return (
      <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Custom WHT Breakdown</h2>
              <p className="text-xs text-gray-400 mt-0.5">Enter the ex-VAT taxable base for each applicable rate</p>
            </div>
            <button onClick={cancelCustomModal}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className={`mx-6 mt-4 rounded-lg px-4 py-3 flex items-start gap-3 transition-colors ${
            isBalanced ? 'bg-[#1D9E75]/8 border border-[#1D9E75]/25' :
            isOver ? 'bg-[#E24B4A]/5 border border-[#E24B4A]/25' :
            'bg-gray-50 border border-gray-100'
          }`}>
            <Info size={14} className={`mt-0.5 shrink-0 ${isBalanced ? 'text-[#1D9E75]' : isOver ? 'text-[#E24B4A]' : 'text-gray-400'}`} />
            <div className="text-xs space-y-1 w-full">
              <div className="flex justify-between">
                <span className="text-gray-500">Invoice Ex-VAT total</span>
                <span className="font-medium text-gray-700">{formatTHB(modalExclVat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Allocated so far</span>
                <span className="font-medium text-gray-700">{formatTHB(customWorkingTotalBase)}</span>
              </div>
              <div className={`flex justify-between font-semibold border-t pt-1 mt-0.5 ${
                isBalanced ? 'border-[#1D9E75]/20 text-[#1D9E75]' :
                isOver ? 'border-[#E24B4A]/20 text-[#E24B4A]' :
                'border-gray-200 text-gray-800'
              }`}>
                <span>Remaining unallocated</span>
                <span>{formatTHB(remaining)}</span>
              </div>
            </div>
          </div>
          <div className="px-6 pt-4 pb-2">
            <div className="grid grid-cols-3 gap-3 mb-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Amount (Ex-VAT ฿)</span>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide text-center">WHT Rate</span>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide text-right">WHT Total</span>
            </div>
            <div className="space-y-2.5">
              {customLines.map((line, i) => {
                const base = parseFloat(line.baseAmount) || 0;
                const whtTotal = +(base * line.rate).toFixed(2);
                return (
                  <div key={line.rate} className="grid grid-cols-3 gap-3 items-center">
                    <input type="number" min="0" value={line.baseAmount}
                      onChange={e => { const next = [...customLines]; next[i] = { ...next[i], baseAmount: e.target.value }; setCustomLines(next); }}
                      placeholder="0"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-right tabular-nums"
                    />
                    <div className="flex justify-center">
                      <span className="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-full">{line.label}</span>
                    </div>
                    <div className="text-right">
                      <span className={`text-sm font-semibold tabular-nums ${whtTotal > 0 ? 'text-[#E24B4A]' : 'text-gray-200'}`}>
                        {whtTotal > 0 ? formatTHB(whtTotal) : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-3 items-center border-t border-gray-150 mt-4 pt-3">
              <span className="text-xs font-bold text-gray-700 col-span-2">Total WHT withheld</span>
              <div className="text-right">
                <span className={`text-sm font-bold tabular-nums ${customWorkingTotalWht > 0 ? 'text-[#E24B4A]' : 'text-gray-300'}`}>
                  {customWorkingTotalWht > 0 ? formatTHB(customWorkingTotalWht) : '—'}
                </span>
              </div>
            </div>
            {isOver && <p className="text-xs text-[#E24B4A] font-medium mt-2">Allocated base exceeds ex-VAT total by {formatTHB(Math.abs(remaining))}.</p>}
          </div>
          <div className="px-6 py-4 flex gap-3">
            <button type="button" onClick={cancelCustomModal} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={applyCustomModal} disabled={customWorkingTotalBase === 0 || isOver}
              className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderRejectModal() {
    if (!rejectingVoucher) return null;
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-[#E24B4A]" />
              <h3 className="text-sm font-semibold text-gray-900">Reject Payment Voucher</h3>
            </div>
            <button onClick={() => setRejectingVoucher(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-500 mb-0.5">Voucher</p>
              <p className="text-sm font-semibold text-gray-900">{rejectingVoucher.voucher_no}</p>
              <p className="text-sm text-gray-700">{formatTHB(rejectingVoucher.net_paid)}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Reason for rejection <span className="text-[#E24B4A]">*</span>
              </label>
              <textarea
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="Explain what needs to be corrected before resubmission..."
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 focus:border-[#E24B4A] resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">The Accounts Supervisor will see this comment and can re-issue the voucher after corrections.</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setRejectingVoucher(null)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={rejectVoucher} disabled={rejecting || !rejectComment.trim()}
                className="flex-1 bg-[#E24B4A] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#c93f3e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {rejecting ? 'Rejecting...' : 'Reject Voucher'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderIssueCheckModal() {
    if (!checkModalVoucher) return null;
    const vi  = (checkModalVoucher as any).vendor_invoice;
    const vPo = vi?.purchase_order;
    const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
    const invoiceNo  = vi?.vendor_invoice_no ?? '—';
    const bankAcc = checks.find(c => c.voucher_id === checkModalVoucher.id)?.bank_account ?? 'KBank PSS Main';
    const canIssue = checkNo.trim().length > 0 && checkDate.length > 0;
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-[#0f1923]" />
              <h3 className="text-sm font-semibold text-gray-900">Issue Check</h3>
            </div>
            <button onClick={closeCheckModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Payment summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Payee</span>
                <span className="font-medium text-gray-800">{vendorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Invoice No.</span>
                <span className="text-gray-700">{invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Voucher No.</span>
                <span className="text-gray-700">{checkModalVoucher.voucher_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Bank Account</span>
                <span className="text-gray-700">{bankAcc}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                <span className="font-semibold text-gray-700">Net Payable</span>
                <span className="font-bold text-base text-gray-900">{formatTHB(checkModalVoucher.net_paid)}</span>
              </div>
            </div>

            {/* Check number */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Check Number <span className="text-[#E24B4A]">*</span>
              </label>
              <input
                type="text"
                value={checkNo}
                onChange={e => setCheckNo(e.target.value)}
                placeholder="e.g. 0012345"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 font-mono"
              />
            </div>

            {/* Check date */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Check Date <span className="text-[#E24B4A]">*</span>
              </label>
              <input
                type="date"
                value={checkDate}
                onChange={e => setCheckDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
              />
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                This action will mark the invoice as <strong>Paid</strong> and is irreversible. Ensure the check details are correct before confirming.
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={closeCheckModal} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={issueCheck} disabled={issuingCheck || !canIssue}
                className="flex-1 bg-[#0f1923] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {issuingCheck ? 'Processing...' : 'Confirm & Issue Check'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderMarkClearedModal() {
    if (!markingCleared) return null;
    const v    = markingCleared.payment_voucher;
    const vPo  = (v as any)?.vendor_invoice?.purchase_order;
    const vendorName = vPo?.vendor?.name ?? vPo?.supplier_name_raw ?? '—';
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Mark Check as Cleared</h3>
            </div>
            <button onClick={closeClearModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Payee</span>
                <span className="font-medium text-gray-800">{vendorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Check No.</span>
                <span className="text-gray-700 font-mono">{markingCleared.check_no}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Check Date</span>
                <span className="text-gray-700">{formatDate(markingCleared.check_date)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="font-semibold text-gray-700">Amount</span>
                <span className="font-bold text-gray-900">{formatTHB(markingCleared.amount)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Bank Clearing Date <span className="text-[#E24B4A]">*</span>
              </label>
              <input
                type="date"
                value={clearDate}
                onChange={e => setClearDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={clearNote}
                onChange={e => setClearNote(e.target.value)}
                placeholder="e.g. Bank statement ref 2026-05"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={closeClearModal} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={markCleared} disabled={savingClear || !clearDate}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingClear ? 'Saving...' : 'Confirm Cleared'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
