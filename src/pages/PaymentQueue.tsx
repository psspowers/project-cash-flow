import { useEffect, useState, useRef } from 'react';
import { CreditCard, AlertTriangle, X, CheckCircle, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { VendorInvoice, PaymentVoucher } from '../types';
import { useAuth } from '../context/AuthContext';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHB, formatDate } from '../utils/formatters';
import { checkAndNotifyOverrun } from '../utils/overrunNotification';

const WHT_OPTIONS = [
  { rate: 0,    label: 'None' },
  { rate: 0.01, label: '1% — Transport / freight' },
  { rate: 0.03, label: '3% — Professional services' },
  { rate: 0.05, label: '5% — Rent / other' },
] as const;

export default function PaymentQueue() {
  const { profile, user } = useAuth();
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<VendorInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Voucher form state (controlled, no react-hook-form needed here)
  const [bankAccount, setBankAccount] = useState('KBank PSS Main');
  const [checkNo, setCheckNo] = useState('');
  const [checkDate, setCheckDate] = useState('');

  // WHT picker — null means not yet confirmed
  const [selectedWhtRate, setSelectedWhtRate] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, []);

  // Close picker on outside click
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
    setSelectedWhtRate(preRate);
    setPickerOpen(false);
    setBankAccount('KBank PSS Main');
    setCheckNo('');
    setCheckDate('');
  }

  function closeModal() {
    setSelectedInvoice(null);
    setSelectedWhtRate(null);
    setPickerOpen(false);
  }

  async function loadData() {
    const [{ data: inv }, { data: vouc }] = await Promise.all([
      supabase
        .from('vendor_invoices')
        .select('*, project:projects(name), purchase_order:purchase_orders(supplier_name_raw, wht_rate, vendor:entities(name))')
        .eq('status', 'released')
        .order('created_at', { ascending: false }),
      supabase.from('payment_vouchers').select('*').order('created_at', { ascending: false }),
    ]);
    setInvoices(inv || []);
    setVouchers(vouc || []);
    setLoading(false);
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
    checkNoVal: string,
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
          message: `Payment of ${formatTHB(netPaid)} to ${vendorName} for ${projectName} has been approved. Check no: ${checkNoVal}.`,
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
    if (!selectedInvoice || !user || selectedWhtRate === null) return;
    if (!bankAccount || !checkNo || !checkDate) return;
    setSubmitting(true);

    const voucherNo = await getNextVoucherNo();
    const po = (selectedInvoice as any).purchase_order;
    const gross = selectedInvoice.invoice_amount_incl_vat || 0;
    const exclVat = gross / 1.07;
    const whtAmount = +(exclVat * selectedWhtRate).toFixed(2);
    const netPaid = +(gross - whtAmount).toFixed(2);
    const requiresManager = netPaid >= 1000000;
    const ceoPay = netPaid >= 3000000;

    const { data: voucherData, error } = await supabase
      .from('payment_vouchers')
      .insert({
        voucher_no: voucherNo,
        vendor_invoice_id: selectedInvoice.id,
        project_id: selectedInvoice.project_id,
        amount: gross,
        wht_amount: whtAmount,
        net_paid: netPaid,
        voucher_date: new Date().toISOString().substring(0, 10),
        prepared_by: user.id,
        requires_manager_approval: requiresManager,
        ceo_notified: ceoPay,
        ceo_notified_at: ceoPay ? new Date().toISOString() : null,
        status: requiresManager ? 'pending_manager' : 'issued',
      })
      .select()
      .maybeSingle();

    if (!error && voucherData) {
      const vendorName = po?.vendor?.name ?? po?.supplier_name_raw ?? 'Unknown vendor';
      const projectName = (selectedInvoice as any).project?.name ?? 'Unknown project';

      await Promise.all([
        supabase.from('checks').insert({
          voucher_id: voucherData.id,
          bank_account: bankAccount,
          check_no: checkNo,
          check_date: checkDate,
          payee: vendorName,
          amount: netPaid,
          status: requiresManager ? 'draft' : 'issued',
        }),
        supabase.from('vendor_invoices').update({ status: 'paid' }).eq('id', selectedInvoice.id),
        insertPaymentNotifications(voucherData.id, netPaid, vendorName, projectName, checkNo),
      ]);

      if (!requiresManager && selectedInvoice.project_id && user) {
        await checkAndNotifyOverrun(supabase, selectedInvoice.project_id, checkNo, user.id);
      }
    }

    closeModal();
    setSubmitting(false);
    loadData();
  }

  async function approveVoucher(voucherId: string) {
    if (!user) return;
    const { data: vData } = await supabase
      .from('payment_vouchers').select('project_id').eq('id', voucherId).maybeSingle();
    await supabase
      .from('payment_vouchers')
      .update({ status: 'issued', manager_approved_by: user.id, manager_approved_at: new Date().toISOString() })
      .eq('id', voucherId);
    const { data: checkData } = await supabase
      .from('checks').select('check_no').eq('voucher_id', voucherId).maybeSingle();
    await supabase
      .from('checks')
      .update({ status: 'issued', signed_by_manager: user.id })
      .eq('voucher_id', voucherId);
    if (vData && checkData) {
      await checkAndNotifyOverrun(
        supabase,
        (vData as { project_id: string }).project_id,
        (checkData as { check_no: string }).check_no,
        user.id,
      );
    }
    loadData();
  }

  const isSupervisor = profile?.role === 'accounts_supervisor';
  const isManager = profile?.role === 'accounts_manager';
  const isCEO = profile?.role === 'ceo';

  const pendingManagerVouchers = vouchers.filter(v => v.status === 'pending_manager');

  // Live modal calculations
  const modalGross = selectedInvoice?.invoice_amount_incl_vat ?? 0;
  const modalExclVat = modalGross / 1.07;
  const modalWhtAmt = selectedWhtRate !== null ? +(modalExclVat * selectedWhtRate).toFixed(2) : null;
  const modalNetPayable = modalWhtAmt !== null ? +(modalGross - modalWhtAmt).toFixed(2) : modalGross;
  const canSubmit = selectedWhtRate !== null && bankAccount && checkNo && checkDate;

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

      {/* Manager sign-off queue */}
      {(isManager || isCEO) && pendingManagerVouchers.length > 0 && (
        <div className="bg-[#EF9F27]/5 border border-[#EF9F27]/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-[#EF9F27]" />
            <span className="text-sm font-semibold text-[#EF9F27]">Requires Manager Sign-Off</span>
          </div>
          <div className="space-y-2">
            {pendingManagerVouchers.map(v => (
              <div key={v.id} className="bg-white rounded-md border border-[#EF9F27]/20 p-3 flex items-center justify-between">
                <div>
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
            ))}
          </div>
        </div>
      )}

      {/* Invoice Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
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
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No invoices ready for payment</td>
              </tr>
            ) : invoices.map(inv => {
              const invPo = (inv as any).purchase_order;
              const invGross = inv.invoice_amount_incl_vat || 0;
              const invWhtRate = invPo?.wht_rate ?? 0;
              const invExclVat = invGross / 1.07;
              const invWhtAmt = +(invExclVat * invWhtRate).toFixed(2);
              const invNetPayable = +(invGross - invWhtAmt).toFixed(2);
              const invVendorName = invPo?.vendor?.name ?? invPo?.supplier_name_raw ?? '—';
              return (
                <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
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
                    {invNetPayable >= 1000000
                      ? <span className="text-xs text-[#EF9F27] font-medium">Required</span>
                      : <span className="text-xs text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge label={inv.status.replace(/_/g, ' ')} variant={statusVariant(inv.status)} />
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
            })}
          </tbody>
        </table>
      </div>

      {/* Issue Payment Voucher Modal */}
      {selectedInvoice && (() => {
        const modalPo = (selectedInvoice as any).purchase_order;
        const modalVendorName = modalPo?.vendor?.name ?? modalPo?.supplier_name_raw ?? '—';
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
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vendor</span>
                    <span className="font-medium">{modalVendorName}</span>
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
                        selectedWhtRate === null
                          ? 'bg-[#E24B4A]/8 hover:bg-[#E24B4A]/12'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <span className={selectedWhtRate === null ? 'text-[#E24B4A] font-medium' : 'text-gray-500'}>
                        WHT{selectedWhtRate !== null ? ` ${(selectedWhtRate * 100).toFixed(0)}%` : ''}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={
                          selectedWhtRate === null
                            ? 'text-xs italic text-[#E24B4A]'
                            : modalWhtAmt! > 0 ? 'text-[#E24B4A]' : 'text-gray-400'
                        }>
                          {selectedWhtRate === null
                            ? 'tap to select'
                            : modalWhtAmt! > 0 ? `(${formatTHB(modalWhtAmt!)})` : '฿0'
                          }
                        </span>
                        <ChevronDown
                          size={13}
                          className={`text-gray-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </button>

                    {/* WHT breakdown dropdown */}
                    {pickerOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                        <div className="px-4 pt-3 pb-1.5">
                          <p className="text-xs font-semibold text-gray-700">Fill Applicable WHT Amount</p>
                        </div>
                        <div className="px-2 pb-1">
                          {WHT_OPTIONS.map(opt => {
                            const optWhtAmt = +(modalExclVat * opt.rate).toFixed(2);
                            const isSelected = selectedWhtRate === opt.rate;
                            return (
                              <button
                                key={opt.rate}
                                type="button"
                                onClick={() => { setSelectedWhtRate(opt.rate); setPickerOpen(false); }}
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
                        </div>
                        <div className="border-t border-gray-100 mx-3 mb-2.5 pt-2 flex justify-between items-center">
                          <span className="text-xs font-semibold text-gray-600">Net Payable</span>
                          <span className="text-sm font-bold text-gray-900">
                            {selectedWhtRate !== null ? formatTHB(modalNetPayable) : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between border-t border-gray-200 pt-2 mt-1">
                    <span className="font-semibold text-gray-700">Net Payable</span>
                    <span className={`font-bold text-base ${selectedWhtRate !== null ? 'text-gray-900' : 'text-gray-400'}`}>
                      {selectedWhtRate !== null ? formatTHB(modalNetPayable) : '—'}
                    </span>
                  </div>
                </div>

                {selectedWhtRate === null && (
                  <p className="text-xs text-[#E24B4A] font-medium -mt-2">
                    WHT selection is required before issuing this voucher.
                  </p>
                )}

                {selectedWhtRate !== null && modalNetPayable >= 1000000 && (
                  <div className="flex items-start gap-2 p-3 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg">
                    <AlertTriangle size={14} className="text-[#EF9F27] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#EF9F27] font-medium">
                      Payment ≥ ฿1,000,000 requires Accounts Manager co-signature
                    </p>
                  </div>
                )}

                {selectedWhtRate !== null && modalNetPayable >= 3000000 && (
                  <div className="flex items-start gap-2 p-3 bg-[#E24B4A]/10 border border-[#E24B4A]/30 rounded-lg">
                    <AlertTriangle size={14} className="text-[#E24B4A] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#E24B4A] font-medium">
                      Payment ≥ ฿3,000,000 – CEO will be notified
                    </p>
                  </div>
                )}

                {/* Form fields */}
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
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Check No.</label>
                    <input
                      value={checkNo}
                      onChange={e => setCheckNo(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      placeholder="CHK-001"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Check Date</label>
                    <input
                      type="date"
                      value={checkDate}
                      onChange={e => setCheckDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
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
    </div>
  );
}
