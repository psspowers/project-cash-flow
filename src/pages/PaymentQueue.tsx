import { useEffect, useState, useRef } from 'react';
import { CreditCard, AlertTriangle, X, CheckCircle, ChevronDown, Info } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { VendorInvoice, PaymentVoucher, PurchaseOrder, Project, Entity } from '../types';
import { useAuth } from '../context/AuthContext';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHB, formatDate } from '../utils/formatters';
import { checkAndNotifyOverrun } from '../utils/overrunNotification';
import PODetailModal from '../components/pos/PODetailModal';

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

export default function PaymentQueue() {
  const { profile, user } = useAuth();
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<VendorInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // PO drill-down
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poProjects, setPoProjects] = useState<Project[]>([]);
  const [poVendors, setPoVendors] = useState<Entity[]>([]);

  // Voucher form state
  const [bankAccount, setBankAccount] = useState('KBank PSS Main');

  // WHT — simple mode
  const [whtMode, setWhtMode] = useState<WhtMode>('simple');
  const [selectedWhtRate, setSelectedWhtRate] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // WHT — custom mode
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customLines, setCustomLines] = useState<CustomLine[]>(
    CUSTOM_TIERS.map(t => ({ ...t, baseAmount: '' }))
  );
  const [appliedCustomLines, setAppliedCustomLines] = useState<CustomLine[] | null>(null);

  // Write-check modal (Banking Officer)
  const [writeCheckVoucher, setWriteCheckVoucher] = useState<PaymentVoucher | null>(null);
  const [writeCheckNo, setWriteCheckNo] = useState('');
  const [writeCheckDate, setWriteCheckDate] = useState('');
  const [writingCheck, setWritingCheck] = useState(false);

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

  function openModal(inv: VendorInvoice) {
    const po = (inv as any).purchase_order;
    const preRate = (po?.wht_rate != null) ? po.wht_rate : null;
    setSelectedInvoice(inv);
    setWhtMode('simple');
    setSelectedWhtRate(preRate);
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
    if (appliedCustomLines) {
      setCustomLines(appliedCustomLines.map(l => ({ ...l })));
    } else {
      setCustomLines(CUSTOM_TIERS.map(t => ({ ...t, baseAmount: '' })));
    }
    setCustomModalOpen(true);
    setPickerOpen(false);
  }

  function cancelCustomModal() {
    setCustomModalOpen(false);
    if (!appliedCustomLines) {
      setWhtMode('simple');
    }
  }

  function applyCustomModal() {
    setAppliedCustomLines(customLines.map(l => ({ ...l })));
    setWhtMode('custom');
    setSelectedWhtRate(null);
    setCustomModalOpen(false);
  }

  function openWriteCheck(voucher: PaymentVoucher) {
    setWriteCheckVoucher(voucher);
    setWriteCheckNo('');
    setWriteCheckDate(new Date().toISOString().substring(0, 10));
  }

  function closeWriteCheck() {
    setWriteCheckVoucher(null);
    setWriteCheckNo('');
    setWriteCheckDate('');
  }

  async function loadData() {
    const [{ data: inv }, { data: vouc }, { data: proj }, { data: vend }] = await Promise.all([
      supabase
        .from('vendor_invoices')
        .select('*, project:projects(name), purchase_order:purchase_orders(id, pss_po_no, supplier_name_raw, wht_rate, vendor:entities(name, bank_name, bank_account_no, bank_account_name))')
        .eq('status', 'released')
        .order('created_at', { ascending: false }),
      supabase
        .from('payment_vouchers')
        .select('*, vendor_invoice:vendor_invoices(po_id, purchase_order:purchase_orders(id, pss_po_no, supplier_name_raw, wht_rate, vendor:entities(name)))')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, status').order('name'),
      supabase.from('entities').select('id, name').eq('type', 'vendor').eq('is_active', true).order('name'),
    ]);
    setInvoices(inv || []);
    setVouchers(vouc || []);
    setPoProjects(proj || []);
    setPoVendors(vend || []);
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

  async function getNextVoucherNo(): Promise<string> {
    const today = format(new Date(), 'yyyy-MM-dd');
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

    if (netPaid >= 1000000) {
      const { data: managerProfile } = await supabase
        .from('user_profiles').select('id').eq('role', 'accounts_manager').maybeSingle();
      if (managerProfile) {
        notifications.push({
          user_id: managerProfile.id,
          title: 'Sign-off required',
          message: `Payment of ${formatTHB(netPaid)} to ${vendorName} for ${projectName} requires your co-signature.`,
          type: 'warning',
          is_read: false,
          related_entity_type: 'payment_voucher',
          related_entity_id: voucherId,
        });
      }
    }

    if (netPaid >= 3000000) {
      const { data: ceoProfile } = await supabase
        .from('user_profiles').select('id').eq('role', 'ceo').maybeSingle();
      if (ceoProfile) {
        notifications.push({
          user_id: ceoProfile.id,
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

  async function issueVoucher() {
    if (!selectedInvoice || !user) return;
    if (whtMode === 'simple' && selectedWhtRate === null) return;
    if (whtMode === 'custom' && !appliedCustomLines) return;
    if (!bankAccount) return;
    setSubmitting(true);

    const voucherNo = await getNextVoucherNo();
    const po = (selectedInvoice as any).purchase_order;
    const gross = selectedInvoice.invoice_amount_incl_vat || 0;
    const exclVat = gross / 1.07;

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
    const requiresManager = netPaid >= 1000000;
    const ceoPay = netPaid >= 3000000;

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
      const vendorName = po?.vendor?.name ?? po?.supplier_name_raw ?? 'Unknown vendor';
      const projectName = (selectedInvoice as any).project?.name ?? 'Unknown project';

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
            return {
              voucher_id: voucherData.id,
              base_amount: base,
              wht_rate: l.rate,
              wht_amount: +(base * l.rate).toFixed(2),
            };
          });
      }

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
        supabase.from('vendor_invoices').update({ status: 'paid' }).eq('id', selectedInvoice.id),
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

  async function submitWriteCheck() {
    if (!writeCheckVoucher || !writeCheckNo || !writeCheckDate || !user) return;
    setWritingCheck(true);

    const { data: checkData } = await supabase
      .from('checks')
      .select('id, amount, payee')
      .eq('voucher_id', writeCheckVoucher.id)
      .maybeSingle();

    await Promise.all([
      supabase
        .from('checks')
        .update({ check_no: writeCheckNo, check_date: writeCheckDate, status: 'issued' })
        .eq('voucher_id', writeCheckVoucher.id),
      supabase
        .from('payment_vouchers')
        .update({ status: 'issued' })
        .eq('id', writeCheckVoucher.id),
    ]);

    if (writeCheckVoucher.project_id && checkData) {
      await checkAndNotifyOverrun(supabase, writeCheckVoucher.project_id, writeCheckNo, user.id);
    }

    closeWriteCheck();
    setWritingCheck(false);
    loadData();
  }

  const isSupervisor = profile?.role === 'accounts_supervisor';
  const isManager = profile?.role === 'accounts_manager';
  const isCEO = profile?.role === 'ceo';
  const isBankingOfficer = profile?.role === 'banking_finance_officer';

  const pendingManagerVouchers = vouchers.filter(v => v.status === 'pending_manager');
  const approvedVouchers = vouchers.filter(v => v.status === 'approved');

  // Invoices ≥ ฿1M that have not yet had a voucher issued (no voucher references them)
  const voucherInvoiceIds = new Set(vouchers.map(v => (v as any).vendor_invoice_id).filter(Boolean));
  const pendingHighValueInvoices = invoices.filter(inv => {
    const invPo = (inv as any).purchase_order;
    const invGross = inv.invoice_amount_incl_vat || 0;
    const invWhtRate = invPo?.wht_rate ?? 0;
    const invNetPayable = +(invGross - +(( invGross / 1.07) * invWhtRate).toFixed(2)).toFixed(2);
    return invNetPayable >= 1000000 && !voucherInvoiceIds.has(inv.id);
  });

  // Sort invoices: ≥฿1M first, then < ฿1M
  const sortedInvoices = [...invoices].sort((a, b) => {
    const netOf = (inv: VendorInvoice) => {
      const po = (inv as any).purchase_order;
      const gross = inv.invoice_amount_incl_vat || 0;
      const wht = +(( gross / 1.07) * (po?.wht_rate ?? 0)).toFixed(2);
      return +(gross - wht).toFixed(2);
    };
    const aNet = netOf(a);
    const bNet = netOf(b);
    const aHigh = aNet >= 1000000 ? 1 : 0;
    const bHigh = bNet >= 1000000 ? 1 : 0;
    if (aHigh !== bHigh) return bHigh - aHigh;
    return bNet - aNet;
  });

  // Live modal calculations
  const modalGross = selectedInvoice?.invoice_amount_incl_vat ?? 0;
  const modalExclVat = modalGross / 1.07;

  const customWorkingTotalBase = customLines.reduce((s, l) => s + (parseFloat(l.baseAmount) || 0), 0);
  const customWorkingTotalWht = customLines.reduce((s, l) => {
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Payment Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">EVP-approved invoices ready for payment</p>
      </div>

      {/* Manager sign-off queue — always visible to Manager/CEO */}
      {(isManager || isCEO) && (
        <div className={`border rounded-lg p-4 ${pendingManagerVouchers.length > 0 ? 'bg-[#EF9F27]/5 border-[#EF9F27]/30' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className={pendingManagerVouchers.length > 0 ? 'text-[#EF9F27]' : 'text-gray-400'} />
              <span className={`text-sm font-semibold ${pendingManagerVouchers.length > 0 ? 'text-[#EF9F27]' : 'text-gray-500'}`}>
                Manager Co-Sign Queue
              </span>
            </div>
            {pendingManagerVouchers.length > 0 && (
              <span className="bg-[#EF9F27] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingManagerVouchers.length}
              </span>
            )}
          </div>

          {/* Active vouchers needing co-sign */}
          {pendingManagerVouchers.length > 0 && (
            <div className="space-y-2 mb-4">
              {pendingManagerVouchers.map(v => {
                const vPo = (v as any).vendor_invoice?.purchase_order;
                return (
                  <div key={v.id} className="bg-white rounded-md border border-[#EF9F27]/30 p-3 flex items-center justify-between">
                    <div>
                      {vPo?.pss_po_no && (
                        <button
                          onClick={() => openPODrillDown(vPo.id)}
                          className="text-xs font-medium text-[#1D9E75] hover:text-[#178a64] hover:underline underline-offset-2 mb-0.5 block"
                        >
                          {vPo.pss_po_no}
                        </button>
                      )}
                      <p className="text-sm font-medium text-gray-800">{v.voucher_no}</p>
                      <p className="text-xs text-gray-500">{formatDate(v.voucher_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-800">{formatTHB(v.net_paid)}</span>
                      {isManager ? (
                        <button
                          onClick={() => approveVoucher(v.id)}
                          className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#178a64]"
                        >
                          <CheckCircle size={12} />
                          Co-sign
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Awaiting Chudapak's signature</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Invoices ≥ ฿1M awaiting voucher issuance by Supervisor */}
          {pendingHighValueInvoices.length > 0 && (
            <div>
              {pendingManagerVouchers.length > 0 && (
                <div className="border-t border-[#EF9F27]/20 my-3" />
              )}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Awaiting Voucher Issuance — {pendingHighValueInvoices.length} invoice{pendingHighValueInvoices.length > 1 ? 's' : ''} ≥ ฿1,000,000
              </p>
              <div className="space-y-1.5">
                {pendingHighValueInvoices.map(inv => {
                  const po = (inv as any).purchase_order;
                  const gross = inv.invoice_amount_incl_vat || 0;
                  const whtRate = po?.wht_rate ?? 0;
                  const net = +(gross - +(( gross / 1.07) * whtRate).toFixed(2)).toFixed(2);
                  const vendorName = po?.vendor?.name ?? po?.supplier_name_raw ?? '—';
                  const projectShort = (inv as any).project?.name?.split('–')[0]?.trim() || '—';
                  return (
                    <div key={inv.id} className="bg-white rounded-md border border-gray-200 px-3 py-2.5 flex items-center justify-between">
                      <div>
                        {po?.pss_po_no && (
                          <button
                            onClick={() => openPODrillDown(po.id)}
                            className="text-xs font-medium text-[#1D9E75] hover:text-[#178a64] hover:underline underline-offset-2 mb-0.5 block"
                          >
                            {po.pss_po_no}
                          </button>
                        )}
                        <p className="text-sm font-medium text-gray-800">{vendorName}</p>
                        <p className="text-xs text-gray-400">{projectShort} · {inv.vendor_invoice_no || 'No invoice no.'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-700">{formatTHB(net)}</span>
                        <span className="text-xs text-gray-400 italic">Awaiting Supervisor</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pendingManagerVouchers.length === 0 && pendingHighValueInvoices.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-400">No invoices requiring your co-signature.</p>
              <p className="text-xs text-gray-400 mt-1">
                Vouchers ≥ ฿1,000,000 issued by the Accounts Supervisor will appear here for your co-signature.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Banking Officer — approved vouchers awaiting check issuance */}
      {(isBankingOfficer || isCEO) && approvedVouchers.length > 0 && (
        <div className="bg-[#1D9E75]/5 border border-[#1D9E75]/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={15} className="text-[#1D9E75]" />
            <span className="text-sm font-semibold text-[#1D9E75]">Ready to Write Check</span>
          </div>
          <div className="space-y-2">
            {approvedVouchers.map(v => {
              const vPo = (v as any).vendor_invoice?.purchase_order;
              return (
                <div key={v.id} className="bg-white rounded-md border border-[#1D9E75]/20 p-3 flex items-center justify-between">
                  <div>
                    {vPo?.pss_po_no && (
                      <button
                        onClick={() => openPODrillDown(vPo.id)}
                        className="text-xs font-medium text-[#1D9E75] hover:text-[#178a64] hover:underline underline-offset-2 mb-0.5 block"
                      >
                        {vPo.pss_po_no}
                      </button>
                    )}
                    <p className="text-sm font-medium text-gray-800">{v.voucher_no}</p>
                    <p className="text-xs text-gray-500">{formatDate(v.voucher_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-gray-800">{formatTHB(v.net_paid)}</span>
                    {isBankingOfficer ? (
                      <button
                        onClick={() => openWriteCheck(v)}
                        className="flex items-center gap-1.5 bg-[#1D9E75] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#178a64] transition-colors"
                      >
                        <CreditCard size={12} />
                        Write Check
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Awaiting Banking Officer</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">PO No.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Invoice No.</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Gross</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">WHT</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Net Payable</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Mgr Sign</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              {isSupervisor && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const subThresholdInvoices = sortedInvoices.filter(inv => {
                const po = (inv as any).purchase_order;
                const gross = inv.invoice_amount_incl_vat || 0;
                const net = +(gross - +((gross / 1.07) * (po?.wht_rate ?? 0)).toFixed(2)).toFixed(2);
                return net < 1000000;
              });
              if (subThresholdInvoices.length === 0) return (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400 text-sm">No invoices ready for payment</td>
                </tr>
              );
              return subThresholdInvoices.map(inv => {
              const invPo = (inv as any).purchase_order;
              const invGross = inv.invoice_amount_incl_vat || 0;
              const invWhtRate = invPo?.wht_rate ?? 0;
              const invExclVat = invGross / 1.07;
              const invWhtAmt = +(invExclVat * invWhtRate).toFixed(2);
              const invNetPayable = +(invGross - invWhtAmt).toFixed(2);
              const invVendorName = invPo?.vendor?.name ?? invPo?.supplier_name_raw ?? '—';
              return (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    {invPo?.pss_po_no ? (
                      <button
                        onClick={() => openPODrillDown(invPo.id)}
                        className="text-xs font-medium text-[#1D9E75] hover:text-[#178a64] hover:underline underline-offset-2 text-left"
                      >
                        {invPo.pss_po_no}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">{invVendorName}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">
                    {(inv as any).project?.name?.split('–')[0]?.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{inv.vendor_invoice_no || '—'}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">{formatTHB(invGross)}</td>
                  <td className="px-4 py-3 text-right text-xs">
                    {invWhtAmt > 0 ? (
                      <span className="text-[#E24B4A]">
                        ({formatTHB(invWhtAmt)})&nbsp;
                        <span className="text-gray-400">{(invWhtRate * 100).toFixed(0)}%</span>
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{formatTHB(invNetPayable)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs text-gray-300">—</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1D9E75] bg-[#1D9E75]/8 px-2 py-0.5 rounded-full whitespace-nowrap">
                      <CheckCircle size={11} />
                      Supervisor Approved
                    </span>
                  </td>
                  {isSupervisor && (
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openModal(inv)}
                        className="flex items-center gap-1.5 bg-[#0f1923] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#1a2b3c] transition-colors"
                      >
                        <CreditCard size={12} />
                        Issue Check
                      </button>
                    </td>
                  )}
                </tr>
              );
            });
            })()}
          </tbody>
        </table>
      </div>

      {/* Write Check Modal (Banking Officer) */}
      {writeCheckVoucher && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-800">Write Check</h2>
                <p className="text-xs text-gray-400 mt-0.5">{writeCheckVoucher.voucher_no} — {formatTHB(writeCheckVoucher.net_paid)}</p>
              </div>
              <button onClick={closeWriteCheck}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Check No. *</label>
                <input
                  value={writeCheckNo}
                  onChange={e => setWriteCheckNo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                  placeholder="e.g. 001234"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Check Date *</label>
                <input
                  type="date"
                  value={writeCheckDate}
                  onChange={e => setWriteCheckDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={closeWriteCheck} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitWriteCheck}
                  disabled={writingCheck || !writeCheckNo || !writeCheckDate}
                  className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {writingCheck ? 'Saving...' : 'Confirm & Issue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom WHT Breakdown Modal (z-60, sits above the voucher modal) */}
      {customModalOpen && selectedInvoice && (() => {
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

              {/* Unallocated balance helper */}
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
                {/* Column headers */}
                <div className="grid grid-cols-3 gap-3 mb-2">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Amount (Ex-VAT ฿)</span>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide text-center">WHT Rate</span>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wide text-right">WHT Total</span>
                </div>

                {/* Rate rows */}
                <div className="space-y-2.5">
                  {customLines.map((line, i) => {
                    const base = parseFloat(line.baseAmount) || 0;
                    const whtTotal = +(base * line.rate).toFixed(2);
                    return (
                      <div key={line.rate} className="grid grid-cols-3 gap-3 items-center">
                        <input
                          type="number"
                          min="0"
                          value={line.baseAmount}
                          onChange={e => {
                            const next = [...customLines];
                            next[i] = { ...next[i], baseAmount: e.target.value };
                            setCustomLines(next);
                          }}
                          placeholder="0"
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-right tabular-nums"
                        />
                        <div className="flex justify-center">
                          <span className="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1.5 rounded-full">
                            {line.label}
                          </span>
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

                {/* Total WHT row */}
                <div className="grid grid-cols-3 gap-3 items-center border-t border-gray-150 mt-4 pt-3">
                  <span className="text-xs font-bold text-gray-700 col-span-2">Total WHT withheld</span>
                  <div className="text-right">
                    <span className={`text-sm font-bold tabular-nums ${customWorkingTotalWht > 0 ? 'text-[#E24B4A]' : 'text-gray-300'}`}>
                      {customWorkingTotalWht > 0 ? formatTHB(customWorkingTotalWht) : '—'}
                    </span>
                  </div>
                </div>

                {isOver && (
                  <p className="text-xs text-[#E24B4A] font-medium mt-2">
                    Allocated base exceeds ex-VAT total by {formatTHB(Math.abs(remaining))}.
                  </p>
                )}
              </div>

              <div className="px-6 py-4 flex gap-3">
                <button type="button" onClick={cancelCustomModal} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyCustomModal}
                  disabled={customWorkingTotalBase === 0 || isOver}
                  className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Issue Payment Voucher Modal */}
      {selectedInvoice && (() => {
        const modalPo = (selectedInvoice as any).purchase_order;
        const modalVendorName = modalPo?.vendor?.name ?? modalPo?.supplier_name_raw ?? '—';
        const vendorBankName: string | null = modalPo?.vendor?.bank_name ?? null;
        const vendorBankAccNo: string | null = modalPo?.vendor?.bank_account_no ?? null;
        const vendorBankAccName: string | null = modalPo?.vendor?.bank_account_name ?? null;
        const hasBankDetails = vendorBankName || vendorBankAccNo;

        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h2 className="text-base font-semibold text-gray-800">Issue Payment Voucher</h2>
                <button onClick={closeModal}><X size={16} className="text-gray-400" /></button>
              </div>

              <div className="p-6 space-y-4">
                {/* Summary panel */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">

                  {/* Vendor row — name + bank details below */}
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

                  {/* Interactive WHT row */}
                  <div ref={pickerRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setPickerOpen(o => !o)}
                      className={`w-full flex justify-between items-center rounded-md px-2 py-1.5 -mx-2 transition-colors text-sm ${
                        appliedTotalWht === null
                          ? 'bg-[#E24B4A]/8 hover:bg-[#E24B4A]/12'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <span className={appliedTotalWht === null ? 'text-[#E24B4A] font-medium' : 'text-gray-500'}>
                        {whtMode === 'custom'
                          ? 'WHT Custom'
                          : `WHT${selectedWhtRate !== null ? ` ${(selectedWhtRate * 100).toFixed(0)}%` : ''}`
                        }
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={
                          appliedTotalWht === null
                            ? 'text-xs italic text-[#E24B4A]'
                            : appliedTotalWht > 0 ? 'text-[#E24B4A]' : 'text-gray-400'
                        }>
                          {appliedTotalWht === null
                            ? 'tap to select'
                            : appliedTotalWht > 0 ? `(${formatTHB(appliedTotalWht)})` : '฿0'
                          }
                        </span>
                        {whtMode === 'custom' && appliedCustomLines && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); openCustomModal(); }}
                            className="text-xs text-[#1D9E75] underline underline-offset-2 ml-1 hover:text-[#178a64]"
                          >
                            Edit
                          </button>
                        )}
                        <ChevronDown
                          size={13}
                          className={`text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {/* WHT dropdown */}
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
                              <button
                                key={opt.rate}
                                type="button"
                                onClick={() => {
                                  setWhtMode('simple');
                                  setSelectedWhtRate(opt.rate);
                                  setAppliedCustomLines(null);
                                  setPickerOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                                  isSelected
                                    ? 'bg-[#1D9E75]/10 text-[#1D9E75]'
                                    : 'hover:bg-gray-50 text-gray-700'
                                }`}
                              >
                                <span className="font-semibold w-8 text-left shrink-0">
                                  {(opt.rate * 100).toFixed(0)}%
                                </span>
                                <span className="flex-1 text-left text-xs text-gray-500 pl-1">
                                  {opt.label}
                                </span>
                                <span className={`font-medium text-right ${isSelected ? 'text-[#1D9E75]' : 'text-gray-700'}`}>
                                  {opt.rate === 0 ? '฿0' : formatTHB(optWhtAmt)}
                                </span>
                                {isSelected && <CheckCircle size={13} className="text-[#1D9E75] ml-2 shrink-0" />}
                              </button>
                            );
                          })}

                          {/* Custom / mixed-rate option */}
                          <button
                            type="button"
                            onClick={openCustomModal}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                              whtMode === 'custom'
                                ? 'bg-[#1D9E75]/10 text-[#1D9E75]'
                                : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <span className="font-semibold w-8 text-left shrink-0 text-xs">Mix</span>
                            <span className="flex-1 text-left text-xs text-gray-500 pl-1">
                              Custom — split by rate
                            </span>
                            <span className={`font-medium text-right text-xs ${whtMode === 'custom' ? 'text-[#1D9E75]' : 'text-gray-500'}`}>
                              {whtMode === 'custom' && appliedCustomLines
                                ? formatTHB(appliedTotalWht ?? 0)
                                : 'Enter amounts →'
                              }
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
                  <p className="text-xs text-[#E24B4A] font-medium -mt-2">
                    WHT selection is required before issuing this voucher.
                  </p>
                )}

                {appliedTotalWht !== null && modalNetPayable >= 1000000 && (
                  <div className="flex items-start gap-2 p-3 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg">
                    <AlertTriangle size={14} className="text-[#EF9F27] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#EF9F27] font-medium">
                      Payment ≥ ฿1,000,000 requires Accounts Manager co-signature
                    </p>
                  </div>
                )}

                {appliedTotalWht !== null && modalNetPayable >= 3000000 && (
                  <div className="flex items-start gap-2 p-3 bg-[#E24B4A]/10 border border-[#E24B4A]/30 rounded-lg">
                    <AlertTriangle size={14} className="text-[#E24B4A] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#E24B4A] font-medium">
                      Payment ≥ ฿3,000,000 – CEO will be notified
                    </p>
                  </div>
                )}

                {/* Bank account selector */}
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
                  <button type="button" onClick={closeModal} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={issueVoucher}
                    disabled={submitting || !canSubmit}
                    className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? 'Processing...' : 'Issue Voucher'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* PO Drill-Down Modal */}
      {selectedPO && (
        <PODetailModal
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
