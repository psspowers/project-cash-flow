import { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Plus, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project, Entity, CostCategory, COST_CATEGORY_LABELS, fmtTHB, PurchaseOrder } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useTaxConfig } from '../../hooks/useTaxConfig';
import VendorCombobox from '../ui/VendorCombobox';
import { PO_THRESHOLD_CM, PO_THRESHOLD_EVP } from '../../config/thresholds';
import { submitPO } from '../../services/workflow';
import type { POActionParams } from '../../services/workflow';

interface Props {
  projects: Project[];
  vendors: Entity[];
  onClose: () => void;
  onSuccess: () => void;
  editPo?: PurchaseOrder;
}

interface MilestoneRow {
  description: string;
  pct: string;
  planned_payment_date: string;
}

interface SimplePaymentRow {
  payment_month: string;
  amount: string;
}

type POType = 'simple' | 'milestone';
type SubmitMode = 'draft' | 'submit';

const CURRENCIES = ['THB', 'USD', 'EUR', 'CNY', 'JPY'] as const;

export default function POCreationWizard({ projects, vendors, onClose, onSuccess, editPo }: Props) {
  const { user } = useAuth();
  const { vatRate } = useTaxConfig();
  const isEdit = !!editPo;
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(isEdit);

  const [projectId, setProjectId] = useState(editPo?.project_id ?? '');
  const [poType, setPoType] = useState<POType>(editPo?.has_supplier_milestones ? 'milestone' : 'simple');
  const [description, setDescription] = useState(editPo?.description ?? '');
  const [vendorId, setVendorId] = useState(editPo?.vendor_id ?? '');
  const [costCategory, setCostCategory] = useState<CostCategory | ''>(editPo?.cost_category ?? '');
  const [whtRate, setWhtRate] = useState<number>(editPo?.wht_rate ?? 0);

  // Amount / currency state
  const [exclVat, setExclVat] = useState(editPo ? String(editPo.po_amount_excl_vat) : '');
  const [vatApplies, setVatApplies] = useState<boolean>(editPo ? (editPo.vat_7pct ?? 0) > 0 : true);
  const [currency, setCurrency] = useState<string>(editPo?.currency ?? 'THB');
  const [fxRate, setFxRate] = useState<string>(editPo?.fx_rate ? String(editPo.fx_rate) : '1');

  const [simplePayments, setSimplePayments] = useState<SimplePaymentRow[]>([{ payment_month: '', amount: '' }]);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([{ description: '', pct: '', planned_payment_date: '' }]);

  // Pre-fill WHT rate from vendor's default when vendor changes (new PO only)
  useEffect(() => {
    if (isEdit || !vendorId) return;
    const vendor = vendors.find(v => v.id === vendorId);
    if (vendor?.default_wht_rate != null) {
      setWhtRate(vendor.default_wht_rate);
    }
  }, [vendorId, isEdit, vendors]);

  // Load child records when editing
  useEffect(() => {
    if (!editPo) return;
    async function loadChildren() {
      setLoadingEdit(true);
      if (editPo!.has_supplier_milestones) {
        const { data } = await supabase
          .from('po_milestones')
          .select('*')
          .eq('purchase_order_id', editPo!.id)
          .order('milestone_number');
        if (data && data.length > 0) {
          setMilestones(data.map((m: { description?: string; milestone_pct: number; planned_payment_date?: string }) => ({
            description: m.description ?? '',
            pct: String(+(m.milestone_pct * 100).toFixed(2)),
            planned_payment_date: m.planned_payment_date ? m.planned_payment_date.substring(0, 7) : '',
          })));
        }
      } else {
        const { data } = await supabase
          .from('po_simple_payments')
          .select('*')
          .eq('purchase_order_id', editPo!.id)
          .order('payment_month');
        if (data && data.length > 0) {
          setSimplePayments(data.map((p: { payment_month: string; amount: number }) => ({
            payment_month: p.payment_month.substring(0, 7),
            amount: String(p.amount),
          })));
        }
      }
      setLoadingEdit(false);
    }
    loadChildren();
  }, [editPo]);

  // Derived math — all THB values for downstream cash flow
  const exclVatNum = Number(exclVat) || 0;
  const fxRateNum = Math.max(Number(fxRate) || 1, 0.000001);
  const isForeign = currency !== 'THB';
  // THB-equivalent base — the only number that matters for PO financials
  const exclVatTHB = +(exclVatNum * fxRateNum).toFixed(2);
  const vatNum = vatApplies ? +(exclVatTHB * vatRate).toFixed(2) : 0;
  const inclVatNum = +(exclVatTHB + vatNum).toFixed(2);
  const whtNum = +(exclVatTHB * whtRate).toFixed(2);

  const totalMilestonePct = milestones.reduce((sum, m) => sum + (Number(m.pct) || 0), 0);
  const totalSimpleAmount = simplePayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const activeProjects = projects.filter(p => p.status === 'active');

  function validateStep(s: number): string {
    if (s === 1) {
      if (!projectId) return 'Please select a project.';
      if (!costCategory) return 'Please select a cost category.';
      if (!description.trim()) return 'Please enter a description.';
    }
    if (s === 2) {
      if (!exclVatNum || exclVatNum <= 0) return 'Please enter a valid contract amount.';
      if (isForeign && fxRateNum <= 0) return 'Please enter a valid FX rate.';
    }
    if (s === 3) {
      if (poType === 'milestone') {
        if (milestones.some(m => !m.description.trim() || !m.pct)) return 'All milestones must have a description and percentage.';
        if (Math.abs(totalMilestonePct - 100) > 0.01) return `Milestone percentages must sum to 100%. Currently: ${totalMilestonePct.toFixed(1)}%`;
      } else {
        const hasPayments = simplePayments.some(p => p.payment_month && Number(p.amount) > 0);
        if (!hasPayments) return 'Please add at least one planned payment date and amount.';
        if (simplePayments.length > 1 && Math.abs(totalSimpleAmount - inclVatNum) > 1) {
          return `Split payment amounts must sum to ${fmtTHB(inclVatNum)}. Currently: ${fmtTHB(totalSimpleAmount)}`;
        }
      }
    }
    return '';
  }

  function next() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError('');
    setStep(s => s + 1);
  }

  function back() { setError(''); setStep(s => s - 1); }

  function addMilestone() { setMilestones(ms => [...ms, { description: '', pct: '', planned_payment_date: '' }]); }
  function removeMilestone(i: number) { setMilestones(ms => ms.filter((_, idx) => idx !== i)); }
  function updateMilestone(i: number, field: keyof MilestoneRow, val: string) {
    setMilestones(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  }

  function addPayment() { setSimplePayments(ps => [...ps, { payment_month: '', amount: '' }]); }
  function removePayment(i: number) { setSimplePayments(ps => ps.filter((_, idx) => idx !== i)); }
  function updatePayment(i: number, field: keyof SimplePaymentRow, val: string) {
    setSimplePayments(ps => ps.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }

  async function save(mode: SubmitMode) {
    const err = validateStep(3);
    if (err) { setError(err); return; }
    if (!user) return;
    setSaving(true);
    setError('');

    // When editing a PO in the CC approval stage, any save reverts it to draft for re-submission
    const wasInApproval = isEdit && editPo?.status === 'pending_cc';
    const status = wasInApproval ? 'draft' : (mode === 'draft' ? 'draft' : 'pending_cc');
    const now = new Date().toISOString();

    // Milestone amount_due is based on THB-equivalent excl VAT
    const milestoneAmountBase = exclVatTHB;

    if (isEdit && editPo) {
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          vendor_id: vendorId || null,
          description: description.trim(),
          cost_category: costCategory,
          po_amount_excl_vat: exclVatTHB,
          vat_7pct: vatNum,
          po_amount_incl_vat: inclVatNum,
          wht_applies: whtRate > 0,
          wht_rate: whtRate,
          wht_3pct: whtNum,
          currency,
          fx_rate: fxRateNum,
          status,
          has_supplier_milestones: poType === 'milestone',
          submitted_by: status === 'pending_cc' ? user.id : editPo.submitted_by ?? null,
          submitted_at: status === 'pending_cc' ? now : editPo.submitted_at ?? null,
        })
        .eq('id', editPo.id);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      // Delete old child records, then re-insert
      await Promise.all([
        supabase.from('po_milestones').delete().eq('purchase_order_id', editPo.id),
        supabase.from('po_simple_payments').delete().eq('purchase_order_id', editPo.id),
      ]);

      if (poType === 'milestone') {
        await supabase.from('po_milestones').insert(
          milestones.map((m, i) => ({
            purchase_order_id: editPo.id,
            milestone_number: i + 1,
            milestone_pct: Number(m.pct) / 100,
            amount_due: +(milestoneAmountBase * (Number(m.pct) / 100)).toFixed(2),
            planned_payment_date: m.planned_payment_date ? m.planned_payment_date + '-01' : null,
            status: 'pending',
          }))
        );
      } else {
        const paymentRows = simplePayments
          .filter(p => p.payment_month && Number(p.amount) > 0)
          .map(p => ({
            purchase_order_id: editPo.id,
            payment_month: p.payment_month + '-01',
            amount: Number(p.amount),
          }));
        if (paymentRows.length > 0) await supabase.from('po_simple_payments').insert(paymentRows);
      }

      if (status === 'pending_cc') {
        const projectName = projects.find(p => p.id === projectId)?.name ?? '';
        const poParams: POActionParams = {
          poId: editPo!.id,
          actorId: user.id,
          projectName,
          projectId,
          poDescription: description.trim(),
          poAmountInclVat: inclVatNum,
          currentStatus: editPo!.status as never,
        };
        await submitPO(poParams);
      }

      setSaving(false);
      onSuccess();
      return;
    }

    // --- Create new PO ---
    const { data: poData, error: poError } = await supabase
      .from('purchase_orders')
      .insert({
        pss_po_no: null,
        project_id: projectId,
        vendor_id: vendorId || null,
        description: description.trim(),
        cost_category: costCategory,
        po_amount_excl_vat: exclVatTHB,
        vat_7pct: vatNum,
        po_amount_incl_vat: inclVatNum,
        wht_applies: whtRate > 0,
        wht_rate: whtRate,
        wht_3pct: whtNum,
        currency,
        fx_rate: fxRateNum,
        status,
        has_supplier_milestones: poType === 'milestone',
        submitted_by: mode === 'submit' ? user.id : null,
        submitted_at: mode === 'submit' ? now : null,
      })
      .select()
      .maybeSingle();

    if (poError || !poData) {
      setError(poError?.message ?? 'Failed to create PO.');
      setSaving(false);
      return;
    }

    const poId = (poData as { id: string }).id;

    if (poType === 'milestone') {
      await supabase.from('po_milestones').insert(
        milestones.map((m, i) => ({
          purchase_order_id: poId,
          milestone_number: i + 1,
          milestone_pct: Number(m.pct) / 100,
          amount_due: +(milestoneAmountBase * (Number(m.pct) / 100)).toFixed(2),
          planned_payment_date: m.planned_payment_date ? m.planned_payment_date + '-01' : null,
          status: 'pending',
        }))
      );
    } else {
      const paymentRows = simplePayments
        .filter(p => p.payment_month && Number(p.amount) > 0)
        .map(p => ({
          purchase_order_id: poId,
          payment_month: p.payment_month + '-01',
          amount: Number(p.amount),
        }));
      if (paymentRows.length > 0) await supabase.from('po_simple_payments').insert(paymentRows);
    }

    if (mode === 'submit') {
      const projectName = activeProjects.find(p => p.id === projectId)?.name ?? '';
      const poParams: POActionParams = {
        poId: (poData as { id: string }).id,
        actorId: user.id,
        projectName,
        projectId,
        poDescription: description.trim(),
        poAmountInclVat: inclVatNum,
        currentStatus: 'draft',
      };
      await submitPO(poParams);
    }

    setSaving(false);
    onSuccess();
  }

  const selectedProject = [...activeProjects, ...projects].find(p => p.id === projectId);
  const stepLabels = ['Basic Details', 'Amount', poType === 'simple' ? 'Payment Plan' : 'Milestones', 'Review'];
  const wasInApproval = isEdit && editPo?.status === 'pending_cc';

  if (loadingEdit) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl w-full max-w-xl border border-gray-200 p-12 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-xl border border-gray-200 my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {isEdit ? `Edit PO${editPo?.pss_po_no ? ` — ${editPo.pss_po_no}` : ''}` : 'New Purchase Order'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Step {step} of 4</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={16} /></button>
        </div>

        <div className="px-6 pt-5">
          <div className="flex items-center">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    i + 1 < step ? 'bg-[#1D9E75] text-white' :
                    i + 1 === step ? 'border-2 border-[#1D9E75] text-[#1D9E75]' :
                    'border-2 border-gray-200 text-gray-300'
                  }`}>
                    {i + 1 < step ? <CheckCircle size={12} /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${i + 1 <= step ? 'text-[#1D9E75]' : 'text-gray-300'}`}>{label}</span>
                </div>
                {i < 3 && <div className={`flex-1 h-px mx-2 ${i + 1 < step ? 'bg-[#1D9E75]' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-[#E24B4A]/8 border border-[#E24B4A]/20 rounded-lg p-3">
              <AlertTriangle size={14} className="text-[#E24B4A] mt-0.5 shrink-0" />
              <p className="text-xs text-[#E24B4A]">{error}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Project *</label>
                {isEdit ? (
                  <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500">
                    {selectedProject?.name ?? projectId}
                  </div>
                ) : (
                  <select value={projectId} onChange={e => setProjectId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                    <option value="">Select project...</option>
                    {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                {!isEdit && projects.length !== activeProjects.length && (
                  <p className="text-xs text-gray-400 mt-1">{projects.length - activeProjects.length} project(s) not yet active are hidden.</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-2 block">PO Type *</label>
                <div className="grid grid-cols-2 gap-3">
                  {([['simple', 'Simple PO', 'Single invoice, consultants, logistics'],
                     ['milestone', 'Milestone PO', 'Installation, large subcontractors']] as const).map(([val, title, sub]) => (
                    <button key={val} type="button" onClick={() => setPoType(val)}
                      className={`border-2 rounded-lg p-3 text-left transition-all ${poType === val ? 'border-[#1D9E75] bg-[#1D9E75]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                      <p className="text-sm font-semibold text-gray-800">{title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Description *</label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                  placeholder="Scope of work or service..." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Supplier</label>
                <VendorCombobox
                  vendors={vendors}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder="No supplier assigned yet"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Cost Category *</label>
                <select value={costCategory} onChange={e => setCostCategory(e.target.value as CostCategory)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                  <option value="">Select category...</option>
                  {Object.entries(COST_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Withholding Tax (WHT)</label>
                <select
                  value={whtRate}
                  onChange={e => setWhtRate(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                >
                  <option value={0}>0% — None</option>
                  <option value={0.01}>1% — Transport / freight services</option>
                  <option value={0.03}>3% — Professional / consulting services</option>
                  <option value={0.05}>5% — Rent / other</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Pre-filled from vendor default where available.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Currency row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Currency *</label>
                  <select
                    value={currency}
                    onChange={e => {
                      setCurrency(e.target.value);
                      if (e.target.value === 'THB') setFxRate('1');
                    }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {isForeign && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">
                      FX Rate <span className="text-gray-400 font-normal">(THB per 1 {currency})</span>
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={fxRate}
                      onChange={e => setFxRate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      placeholder="e.g. 36.5"
                    />
                  </div>
                )}
              </div>

              {/* Amount input */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Contract Amount excl. VAT ({currency}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={exclVat}
                  onChange={e => setExclVat(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                  placeholder="0.00"
                />
              </div>

              {/* VAT toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={vatApplies}
                    onChange={e => setVatApplies(e.target.checked)}
                  />
                  <div className={`w-9 h-5 rounded-full transition-colors ${vatApplies ? 'bg-[#1D9E75]' : 'bg-gray-300'}`} />
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${vatApplies ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">Apply 7% VAT</span>
              </label>

              {!vatApplies && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  VAT-exempt — the contract amount excl. VAT is also the total payable amount.
                </div>
              )}

              {/* Summary breakdown */}
              {exclVatNum > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-100">
                  {isForeign && (
                    <div className="flex justify-between text-sm pb-2 border-b border-gray-200 mb-2">
                      <span className="text-gray-500">Amount in {currency}</span>
                      <span className="font-medium text-gray-700">{exclVatNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                    </div>
                  )}
                  {[
                    ['Contract excl. VAT (THB)', fmtTHB(exclVatTHB), 'text-gray-800'],
                    ...(vatApplies ? [['VAT 7%', fmtTHB(vatNum), 'text-gray-600']] : []),
                    ...(whtRate > 0 ? [[`WHT ${(whtRate * 100).toFixed(0)}% (withheld)`, fmtTHB(whtNum), 'text-[#EF9F27]']] : []),
                  ].map(([label, val, cls]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className={`${String(label).startsWith('WHT') ? 'text-[#EF9F27]' : 'text-gray-500'}`}>{label}</span>
                      <span className={`font-medium ${cls}`}>{val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200">
                    <span>Total incl. VAT (THB)</span>
                    <span className="text-base">{fmtTHB(inclVatNum)}</span>
                  </div>
                  {whtRate > 0 && (
                    <div className="flex justify-between text-xs text-gray-400 border-t border-gray-100 pt-1">
                      <span>Net payable after WHT</span>
                      <span>{fmtTHB(inclVatNum - whtNum)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && poType === 'simple' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-0.5">Contract Total: <span className="text-[#0f1923] font-bold">{fmtTHB(inclVatNum)}</span></p>
                <p className="text-xs text-gray-400">Enter when PSS expects to pay. Single payment: enter the full amount.</p>
              </div>
              <div className="space-y-2">
                {simplePayments.map((p, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Month</label>
                      <input type="month" value={p.payment_month} onChange={e => updatePayment(i, 'payment_month', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Amount (฿)</label>
                      <input type="number" step="0.01" value={p.amount}
                        onChange={e => updatePayment(i, 'amount', e.target.value)}
                        placeholder={simplePayments.length === 1 ? String(inclVatNum) : '0.00'}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                    </div>
                    {simplePayments.length > 1 && (
                      <button onClick={() => removePayment(i)} className="mb-0.5 text-gray-400 hover:text-[#E24B4A] transition-colors pb-2">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {simplePayments.length > 1 && (
                <div className={`text-xs font-medium px-3 py-2 rounded-lg ${Math.abs(totalSimpleAmount - inclVatNum) > 1 ? 'bg-[#E24B4A]/10 text-[#E24B4A]' : 'bg-[#1D9E75]/10 text-[#1D9E75]'}`}>
                  Total: {fmtTHB(totalSimpleAmount)} / {fmtTHB(inclVatNum)}
                </div>
              )}
              <button type="button" onClick={addPayment} className="flex items-center gap-2 text-sm text-[#1D9E75] hover:text-[#178a64] font-medium">
                <Plus size={14} /> Add payment tranche
              </button>
            </div>
          )}

          {step === 3 && poType === 'milestone' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-0.5">Contract Total: <span className="text-[#0f1923] font-bold">{fmtTHB(inclVatNum)}</span></p>
                <p className="text-xs text-gray-400">Milestones are work events. Planned payment date is when PSS expects to pay after completion.</p>
              </div>
              <div className="space-y-3">
                {milestones.map((m, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-600">Milestone {i + 1}</span>
                      {milestones.length > 1 && (
                        <button onClick={() => removeMilestone(i)} className="text-gray-400 hover:text-[#E24B4A] transition-colors"><Trash2 size={13} /></button>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Description</label>
                      <input value={m.description} onChange={e => updateMilestone(i, 'description', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                        placeholder="e.g. Equipment delivery & site mobilisation" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">% of contract</label>
                        <input type="number" step="0.1" min="0" max="100" value={m.pct}
                          onChange={e => updateMilestone(i, 'pct', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white" placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Amount (excl VAT, THB)</label>
                        <div className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-gray-50 text-gray-600">
                          {m.pct ? fmtTHB(+(exclVatTHB * (Number(m.pct) / 100)).toFixed(0)) : '—'}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Planned Payment Month</label>
                      <input type="month" value={m.planned_payment_date} onChange={e => updateMilestone(i, 'planned_payment_date', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white" />
                    </div>
                  </div>
                ))}
              </div>
              <div className={`text-xs font-medium px-3 py-2 rounded-lg ${Math.abs(totalMilestonePct - 100) > 0.01 ? 'bg-[#E24B4A]/10 text-[#E24B4A]' : 'bg-[#1D9E75]/10 text-[#1D9E75]'}`}>
                Total: {totalMilestonePct.toFixed(1)}% {Math.abs(totalMilestonePct - 100) <= 0.01 ? '— all milestones accounted for' : '(must reach 100%)'}
              </div>
              <button type="button" onClick={addMilestone} className="flex items-center gap-2 text-sm text-[#1D9E75] hover:text-[#178a64] font-medium">
                <Plus size={14} /> Add milestone
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {wasInApproval && (
                <div className="flex items-start gap-2 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg p-3">
                  <AlertTriangle size={14} className="text-[#EF9F27] mt-0.5 shrink-0" />
                  <p className="text-xs text-[#92650a]">
                    This PO was pending approval. Saving will return it to <strong>Draft</strong> status and it must be re-submitted for approval.
                  </p>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-100 text-sm">
                {[
                  ['Project', selectedProject?.name ?? '—'],
                  ['Type', poType === 'simple' ? 'Simple PO' : 'Milestone PO'],
                  ['Supplier', vendors.find(v => v.id === vendorId)?.name ?? 'Not assigned'],
                  ['Category', costCategory ? COST_CATEGORY_LABELS[costCategory] : '—'],
                  ['Description', description],
                  ...(isForeign ? [['Currency', `${currency} @ ${fxRateNum} THB/${currency}`]] : []),
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-gray-500 shrink-0">{label}</span>
                    <span className="text-right text-xs font-medium">{val}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 space-y-1">
                  {isForeign && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Contract ({currency})</span>
                      <span>{exclVatNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-gray-500"><span>excl. VAT (THB)</span><span>{fmtTHB(exclVatTHB)}</span></div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>VAT {vatApplies ? '7%' : '(exempt)'}</span>
                    <span>{fmtTHB(vatNum)}</span>
                  </div>
                  {whtRate > 0 && <div className="flex justify-between text-xs text-[#EF9F27]"><span>WHT {(whtRate * 100).toFixed(0)}%</span><span>{fmtTHB(whtNum)}</span></div>}
                  <div className="flex justify-between font-bold text-gray-900"><span>Total incl. VAT</span><span className="text-base">{fmtTHB(inclVatNum)}</span></div>
                </div>
              </div>

              {poType === 'milestone' && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-600">{milestones.length} Milestones</p>
                  {milestones.map((m, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5">
                      <span>{i + 1}. {m.description}</span>
                      <span className="font-medium">{m.pct}%</span>
                    </div>
                  ))}
                </div>
              )}

              {poType === 'simple' && simplePayments.some(p => p.payment_month) && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-600">Payment Schedule</p>
                  {simplePayments.filter(p => p.payment_month).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5">
                      <span>{p.payment_month}</span>
                      <span className="font-medium">{fmtTHB(Number(p.amount) || inclVatNum)}</span>
                    </div>
                  ))}
                </div>
              )}

              {!wasInApproval && (
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-600">
                  PSS PO number will be assigned automatically when approved by {
                    inclVatNum < PO_THRESHOLD_CM ? 'the Construction Manager' :
                    inclVatNum < PO_THRESHOLD_EVP ? 'the EVP' : 'the CEO'
                  }.
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button onClick={() => save('draft')} disabled={saving}
                  className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors">
                  {saving ? 'Saving...' : 'Save as Draft'}
                </button>
                <button onClick={() => save('submit')} disabled={saving}
                  className="flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60 transition-colors">
                  {saving ? 'Submitting...' : wasInApproval ? 'Save & Re-submit' : 'Submit for Approval'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button onClick={step === 1 ? onClose : back}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">
            <ChevronLeft size={15} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 && (
            <button onClick={next}
              className="flex items-center gap-1.5 bg-[#0f1923] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors">
              Next <ChevronRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
