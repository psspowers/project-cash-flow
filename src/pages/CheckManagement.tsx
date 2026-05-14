import { useEffect, useState } from 'react';
import {
  CreditCard, CheckCircle2, Clock, History,
  X, AlertCircle, ArrowRight, Calendar, Hash,
  Building2, FileText, Banknote,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { supabase } from '../lib/supabase';
import { formatTHB, formatDate } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckRow {
  id: string;
  voucher_id: string;
  bank_account?: string;
  check_no?: string;
  check_date?: string;
  payee?: string;
  amount: number;
  status: 'draft' | 'issued' | 'cleared' | 'bounced';
  cleared_at?: string;
  cleared_note?: string;
  created_at: string;
  payment_voucher?: {
    id: string;
    voucher_no: string;
    voucher_date?: string;
    net_paid: number;
    wht_amount: number;
    status: string;
    vendor_invoice?: {
      id: string;
      project?: { id: string; name: string };
      purchase_order?: {
        id: string;
        pss_po_no?: string;
        supplier_name_raw?: string;
        vendor?: { name: string; bank_name?: string; bank_account_no?: string; bank_account_name?: string };
      };
    };
  };
}

// Vouchers approved but check still in draft (waiting to be written)
interface PendingVoucher {
  id: string;
  voucher_no: string;
  voucher_date?: string;
  net_paid: number;
  wht_amount: number;
  status: string;
  check_id?: string;
  bank_account?: string;
  payee?: string;
  vendor_invoice?: {
    project?: { id: string; name: string };
    purchase_order?: {
      pss_po_no?: string;
      supplier_name_raw?: string;
      vendor?: { name: string; bank_name?: string; bank_account_no?: string; bank_account_name?: string };
    };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  try {
    return differenceInDays(new Date(), parseISO(dateStr));
  } catch {
    return 0;
  }
}

function supplierName(row: CheckRow | PendingVoucher): string {
  const vi = (row as any).vendor_invoice ?? (row as any).payment_voucher?.vendor_invoice;
  return vi?.purchase_order?.vendor?.name
    ?? vi?.purchase_order?.supplier_name_raw
    ?? (row as any).payee
    ?? '—';
}

function projectName(row: CheckRow | PendingVoucher): string {
  const vi = (row as any).vendor_invoice ?? (row as any).payment_voucher?.vendor_invoice;
  return vi?.project?.name ?? '—';
}

function poNo(row: CheckRow | PendingVoucher): string {
  const vi = (row as any).vendor_invoice ?? (row as any).payment_voucher?.vendor_invoice;
  return vi?.purchase_order?.pss_po_no ?? '—';
}

function bankDetails(row: CheckRow | PendingVoucher): string {
  const vi = (row as any).vendor_invoice ?? (row as any).payment_voucher?.vendor_invoice;
  const v = vi?.purchase_order?.vendor;
  if (!v) return (row as any).bank_account ?? (row as any).payment_voucher?.bank_account ?? '—';
  const parts = [v.bank_name, v.bank_account_no, v.bank_account_name].filter(Boolean);
  return parts.join(' \u00b7 ') || ((row as any).bank_account ?? '—');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StageHeader({
  icon,
  label,
  count,
  total,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl border-b ${color}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-semibold text-sm">{label}</span>
        <span className="ml-1 text-xs font-medium bg-white/20 rounded-full px-2 py-0.5">{count}</span>
      </div>
      {total > 0 && (
        <span className="text-xs font-medium opacity-80">{formatTHB(total)}</span>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-400 w-20 shrink-0">{label}</span>
      <span className="text-gray-200 font-medium break-all">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CheckManagement() {
  const { user } = useAuth();
  const [pendingVouchers, setPendingVouchers] = useState<PendingVoucher[]>([]);
  const [issuedChecks, setIssuedChecks] = useState<CheckRow[]>([]);
  const [clearedChecks, setClearedChecks] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Issue check modal
  const [issueTarget, setIssueTarget] = useState<PendingVoucher | null>(null);
  const [issueCheckNo, setIssueCheckNo] = useState('');
  const [issueCheckDate, setIssueCheckDate] = useState('');
  const [issueCheckBankAccount, setIssueCheckBankAccount] = useState('KBank PSS Main');
  const [issuing, setIssuing] = useState(false);

  // Mark cleared modal
  const [clearTarget, setClearTarget] = useState<CheckRow | null>(null);
  const [clearNote, setClearNote] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);

    const voucherSelect = `
      id, voucher_no, voucher_date, net_paid, wht_amount, status,
      vendor_invoice:vendor_invoices(
        id,
        project:projects(id, name),
        purchase_order:purchase_orders(
          id, pss_po_no, supplier_name_raw,
          vendor:entities(name, bank_name, bank_account_no, bank_account_name)
        )
      )
    `;

    const checkSelect = `
      id, voucher_id, bank_account, check_no, check_date, payee, amount, status,
      cleared_at, cleared_note, created_at,
      payment_voucher:payment_vouchers(
        id, voucher_no, voucher_date, net_paid, wht_amount, status,
        vendor_invoice:vendor_invoices(
          id,
          project:projects(id, name),
          purchase_order:purchase_orders(
            id, pss_po_no, supplier_name_raw,
            vendor:entities(name, bank_name, bank_account_no, bank_account_name)
          )
        )
      )
    `;

    const [{ data: vData }, { data: cData }] = await Promise.all([
      supabase
        .from('payment_vouchers')
        .select(voucherSelect)
        .eq('status', 'approved')
        .order('created_at', { ascending: false }),
      supabase
        .from('checks')
        .select(checkSelect)
        .in('status', ['issued', 'cleared'])
        .order('created_at', { ascending: false }),
    ]);

    // Approved vouchers — fetch their draft check id too
    const vouchers: PendingVoucher[] = (vData ?? []).map((v: any) => ({
      ...v,
      check_id: undefined,
      bank_account: undefined,
      payee: undefined,
    }));

    if (vouchers.length > 0) {
      const voucherIds = vouchers.map(v => v.id);
      const { data: draftChecks } = await supabase
        .from('checks')
        .select('id, voucher_id, bank_account, payee')
        .in('voucher_id', voucherIds)
        .eq('status', 'draft');
      const draftMap = new Map((draftChecks ?? []).map((c: any) => [c.voucher_id, c]));
      vouchers.forEach(v => {
        const dc = draftMap.get(v.id);
        if (dc) {
          v.check_id = dc.id;
          v.bank_account = dc.bank_account;
          v.payee = dc.payee;
        }
      });
    }

    const checks: CheckRow[] = (cData ?? []) as CheckRow[];
    setPendingVouchers(vouchers);
    setIssuedChecks(checks.filter(c => c.status === 'issued'));
    setClearedChecks(checks.filter(c => c.status === 'cleared'));
    setLoading(false);
  }

  // ── Issue Check ────────────────────────────────────────────────────────────

  function openIssue(v: PendingVoucher) {
    setIssueTarget(v);
    setIssueCheckNo('');
    setIssueCheckDate(format(new Date(), 'yyyy-MM-dd'));
    setIssueCheckBankAccount(v.bank_account ?? 'KBank PSS Main');
  }

  function closeIssue() {
    setIssueTarget(null);
    setIssueCheckNo('');
    setIssueCheckDate('');
    setIssueCheckBankAccount('KBank PSS Main');
  }

  async function submitIssue() {
    if (!issueTarget || !issueCheckNo.trim() || !issueCheckDate || !user) return;
    setIssuing(true);
    try {
      await Promise.all([
        supabase
          .from('checks')
          .update({
            check_no: issueCheckNo.trim(),
            check_date: issueCheckDate,
            bank_account: issueCheckBankAccount,
            status: 'issued',
            signed_by_supervisor: user.id,
          })
          .eq('voucher_id', issueTarget.id),
        supabase
          .from('payment_vouchers')
          .update({ status: 'issued' })
          .eq('id', issueTarget.id),
      ]);
      closeIssue();
      await loadData();
    } finally {
      setIssuing(false);
    }
  }

  // ── Mark Cleared ───────────────────────────────────────────────────────────

  function openClear(c: CheckRow) {
    setClearTarget(c);
    setClearNote('');
  }

  async function submitClear() {
    if (!clearTarget || !user) return;
    setClearing(true);
    try {
      await supabase
        .from('checks')
        .update({
          status: 'cleared',
          cleared_at: new Date().toISOString(),
          cleared_note: clearNote.trim() || null,
        })
        .eq('id', clearTarget.id);
      setClearTarget(null);
      await loadData();
    } finally {
      setClearing(false);
    }
  }

  // ── Derived totals ─────────────────────────────────────────────────────────

  const pendingTotal = pendingVouchers.reduce((s, v) => s + (v.net_paid ?? 0), 0);
  const issuedTotal = issuedChecks.reduce((s, c) => s + (c.amount ?? 0), 0);
  const clearedTotal = clearedChecks.reduce((s, c) => s + (c.amount ?? 0), 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Check Management</h1>
        <p className="text-gray-400 text-sm mt-1">Issue, track, and confirm clearance of payment checks</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#0f1923] border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-amber-400 font-medium uppercase tracking-wider mb-1">Pending Issuance</p>
          <p className="text-2xl font-bold text-white">{pendingVouchers.length}</p>
          <p className="text-sm text-gray-400 mt-0.5">{formatTHB(pendingTotal)}</p>
        </div>
        <div className="bg-[#0f1923] border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs text-blue-400 font-medium uppercase tracking-wider mb-1">Awaiting Clearance</p>
          <p className="text-2xl font-bold text-white">{issuedChecks.length}</p>
          <p className="text-sm text-gray-400 mt-0.5">{formatTHB(issuedTotal)}</p>
        </div>
        <div className="bg-[#0f1923] border border-[#1D9E75]/20 rounded-xl p-4">
          <p className="text-xs text-[#1D9E75] font-medium uppercase tracking-wider mb-1">Cleared (All Time)</p>
          <p className="text-2xl font-bold text-white">{clearedChecks.length}</p>
          <p className="text-sm text-gray-400 mt-0.5">{formatTHB(clearedTotal)}</p>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="flex items-center gap-2 mb-5 text-xs text-gray-500">
        <span className="flex items-center gap-1.5 text-amber-400 font-medium">
          <CreditCard size={13} /> Issue Check
        </span>
        <ArrowRight size={13} />
        <span className="flex items-center gap-1.5 text-blue-400 font-medium">
          <Clock size={13} /> Awaiting Clearance
        </span>
        <ArrowRight size={13} />
        <span className="flex items-center gap-1.5 text-[#1D9E75] font-medium">
          <History size={13} /> Payment History
        </span>
      </div>

      {/* Three-column pipeline */}
      <div className="grid grid-cols-3 gap-4 items-start">

        {/* ── Column 1: Issue Check ── */}
        <div className="bg-[#0f1923] rounded-xl border border-amber-500/20 overflow-hidden">
          <StageHeader
            icon={<CreditCard size={15} className="text-amber-400" />}
            label="Issue Check"
            count={pendingVouchers.length}
            total={pendingTotal}
            color="border-amber-500/20 bg-amber-500/5 text-amber-300"
          />
          <div className="p-3 space-y-3 max-h-[calc(100vh-340px)] overflow-y-auto">
            {pendingVouchers.length === 0 && (
              <p className="text-center text-gray-500 text-xs py-8">No vouchers awaiting checks</p>
            )}
            {pendingVouchers.map(v => (
              <div key={v.id} className="bg-[#131f2e] rounded-lg p-3 border border-white/5 hover:border-amber-500/20 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs font-semibold text-amber-300">{v.voucher_no}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{poNo(v)}</p>
                  </div>
                  <p className="text-sm font-bold text-white shrink-0">{formatTHB(v.net_paid)}</p>
                </div>
                <div className="space-y-1 mb-3">
                  <InfoRow label="Supplier" value={supplierName(v)} />
                  <InfoRow label="Project" value={projectName(v)} />
                  <InfoRow label="Bank Acct" value={bankDetails(v)} />
                  {v.wht_amount > 0 && (
                    <InfoRow label="WHT" value={<span className="text-orange-400">-{formatTHB(v.wht_amount)}</span>} />
                  )}
                  <InfoRow label="Date" value={formatDate(v.voucher_date)} />
                </div>
                <button
                  onClick={() => openIssue(v)}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-md py-1.5 transition-colors"
                >
                  Issue Check
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Column 2: Awaiting Clearance ── */}
        <div className="bg-[#0f1923] rounded-xl border border-blue-500/20 overflow-hidden">
          <StageHeader
            icon={<Clock size={15} className="text-blue-400" />}
            label="Awaiting Clearance"
            count={issuedChecks.length}
            total={issuedTotal}
            color="border-blue-500/20 bg-blue-500/5 text-blue-300"
          />
          <div className="p-3 space-y-3 max-h-[calc(100vh-340px)] overflow-y-auto">
            {issuedChecks.length === 0 && (
              <p className="text-center text-gray-500 text-xs py-8">No checks awaiting clearance</p>
            )}
            {issuedChecks.map(c => {
              const days = daysSince(c.check_date ?? c.created_at);
              const vr = c.payment_voucher;
              return (
                <div key={c.id} className="bg-[#131f2e] rounded-lg p-3 border border-white/5 hover:border-blue-500/20 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-semibold text-blue-300">{vr?.voucher_no ?? '—'}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{poNo(c)}</p>
                    </div>
                    <p className="text-sm font-bold text-white shrink-0">{formatTHB(c.amount)}</p>
                  </div>
                  <div className="space-y-1 mb-3">
                    <InfoRow label="Supplier" value={supplierName(c)} />
                    <InfoRow label="Project" value={projectName(c)} />
                    <InfoRow label="Check No" value={<span className="text-blue-200 font-mono">{c.check_no ?? '—'}</span>} />
                    <InfoRow label="Check Date" value={formatDate(c.check_date)} />
                    <InfoRow label="Bank Acct" value={c.bank_account ?? '—'} />
                  </div>
                  {days > 0 && (
                    <div className={`flex items-center gap-1 text-[11px] mb-2 ${days > 7 ? 'text-orange-400' : 'text-gray-500'}`}>
                      <AlertCircle size={11} />
                      {days}d since check date
                    </div>
                  )}
                  <button
                    onClick={() => openClear(c)}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md py-1.5 transition-colors"
                  >
                    Mark Cleared
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Column 3: Payment History ── */}
        <div className="bg-[#0f1923] rounded-xl border border-[#1D9E75]/20 overflow-hidden">
          <StageHeader
            icon={<History size={15} className="text-[#1D9E75]" />}
            label="Payment History"
            count={clearedChecks.length}
            total={clearedTotal}
            color="border-[#1D9E75]/20 bg-[#1D9E75]/5 text-[#1D9E75]"
          />
          <div className="p-3 space-y-3 max-h-[calc(100vh-340px)] overflow-y-auto">
            {clearedChecks.length === 0 && (
              <p className="text-center text-gray-500 text-xs py-8">No cleared payments yet</p>
            )}
            {clearedChecks.map(c => {
              const vr = c.payment_voucher;
              return (
                <div key={c.id} className="bg-[#131f2e] rounded-lg p-3 border border-white/5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-semibold text-[#1D9E75]">{vr?.voucher_no ?? '—'}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{poNo(c)}</p>
                    </div>
                    <p className="text-sm font-bold text-white shrink-0">{formatTHB(c.amount)}</p>
                  </div>
                  <div className="space-y-1">
                    <InfoRow label="Supplier" value={supplierName(c)} />
                    <InfoRow label="Project" value={projectName(c)} />
                    <InfoRow label="Check No" value={<span className="text-gray-300 font-mono">{c.check_no ?? '—'}</span>} />
                    <InfoRow label="Check Date" value={formatDate(c.check_date)} />
                    <InfoRow
                      label="Cleared"
                      value={
                        <span className="text-[#1D9E75]">
                          {c.cleared_at ? formatDate(c.cleared_at) : '—'}
                        </span>
                      }
                    />
                    {c.cleared_note && (
                      <InfoRow label="Note" value={<span className="text-gray-400 italic">{c.cleared_note}</span>} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ── Issue Check Modal ── */}
      {issueTarget && (() => {
        const isOnline = issueCheckBankAccount === 'Online - KBank';
        const refLabel = isOnline ? 'Transaction Number' : 'Check Number';
        const refPlaceholder = isOnline ? 'e.g. TXN20260514001234567' : 'e.g. 1234567';
        const dateLabel = isOnline ? 'Transaction Date' : 'Check Date';
        const modalTitle = isOnline ? 'Record Online Transfer' : 'Issue Check';
        const confirmLabel = isOnline ? 'Confirm & Transfer' : 'Confirm & Issue';
        return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1923] rounded-2xl border border-white/10 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <CreditCard size={16} className="text-amber-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">{modalTitle}</h2>
                  <p className="text-gray-400 text-xs">{issueTarget.voucher_no}</p>
                </div>
              </div>
              <button onClick={closeIssue} className="text-gray-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-3">
              {/* Summary */}
              <div className="bg-[#131f2e] rounded-xl p-3 space-y-2 border border-white/5">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Building2 size={12} />
                  <span className="font-medium text-white">{supplierName(issueTarget)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <FileText size={12} />
                  <span>{poNo(issueTarget)} · {projectName(issueTarget)}</span>
                </div>
                <div className="pt-1 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Net Amount</span>
                  <span className="text-lg font-bold text-white">{formatTHB(issueTarget.net_paid)}</span>
                </div>
                {issueTarget.wht_amount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">WHT Deducted</span>
                    <span className="text-orange-400">-{formatTHB(issueTarget.wht_amount)}</span>
                  </div>
                )}
              </div>

              {/* Payment Method / Bank Account */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5"><Banknote size={12} /> Payment Method / Bank</span>
                </label>
                <select
                  value={issueCheckBankAccount}
                  onChange={e => { setIssueCheckBankAccount(e.target.value); setIssueCheckNo(''); }}
                  className="w-full bg-[#131f2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50 appearance-none"
                >
                  <option value="KBank PSS Main">KBank PSS Main — Check</option>
                  <option value="SCB PSS Project">SCB PSS Project — Check</option>
                  <option value="Online - KBank">Online - KBank (Transfer)</option>
                </select>
              </div>

              {/* Check / Transaction Number */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5"><Hash size={12} /> {refLabel}</span>
                </label>
                <input
                  type="text"
                  value={issueCheckNo}
                  onChange={e => setIssueCheckNo(e.target.value)}
                  placeholder={refPlaceholder}
                  className="w-full bg-[#131f2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50 font-mono"
                  autoFocus
                />
              </div>

              {/* Check / Transaction Date */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  <span className="flex items-center gap-1.5"><Calendar size={12} /> {dateLabel}</span>
                </label>
                <input
                  type="date"
                  value={issueCheckDate}
                  onChange={e => setIssueCheckDate(e.target.value)}
                  className="w-full bg-[#131f2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={closeIssue}
                className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-sm hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitIssue}
                disabled={!issueCheckNo.trim() || !issueCheckDate || issuing}
                className="flex-1 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {issuing ? (
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><CheckCircle2 size={15} /> {confirmLabel}</>
                )}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Mark Cleared Modal ── */}
      {clearTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1923] rounded-2xl border border-white/10 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <CheckCircle2 size={16} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-white font-semibold text-sm">Mark Check Cleared</h2>
                  <p className="text-gray-400 text-xs">{clearTarget.payment_voucher?.voucher_no ?? clearTarget.check_no}</p>
                </div>
              </div>
              <button
                onClick={() => setClearTarget(null)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-3">
              <div className="bg-[#131f2e] rounded-xl p-3 space-y-2 border border-white/5">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Building2 size={12} />
                  <span className="font-medium text-white">{supplierName(clearTarget)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Hash size={12} />
                  <span className="font-mono text-blue-200">{clearTarget.check_no ?? '—'}</span>
                  <span>·</span>
                  <span>{formatDate(clearTarget.check_date)}</span>
                </div>
                <div className="pt-1 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Amount</span>
                  <span className="text-lg font-bold text-white">{formatTHB(clearTarget.amount)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Note (optional)
                </label>
                <textarea
                  value={clearNote}
                  onChange={e => setClearNote(e.target.value)}
                  placeholder="e.g. Cleared via KBank statement 5 May 2026"
                  rows={2}
                  className="w-full bg-[#131f2e] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 resize-none"
                />
              </div>

              <p className="text-xs text-gray-500">
                This confirms the bank has cleared the payment. The check will move to Payment History and cannot be reversed.
              </p>
            </div>

            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setClearTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-sm hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitClear}
                disabled={clearing}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {clearing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><CheckCircle2 size={15} /> Confirm Cleared</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
