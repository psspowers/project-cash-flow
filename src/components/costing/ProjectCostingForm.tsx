import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project, ProjectCosting, COSTING_CATEGORY_KEYS, fmtTHB } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface Props {
  project: Project;
  existingCosting?: ProjectCosting | null;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORY_DISPLAY: Record<typeof COSTING_CATEGORY_KEYS[number], string> = {
  cost_01_civil: '[01] Civil & Earthworks',
  cost_02_pv_modules: '[02] PV Modules (panels)',
  cost_03_mounting: '[03] Mounting Structures',
  cost_04_inverters: '[04] Inverters & Electrical Equipment',
  cost_05_hv_switchgear: '[05] HV/MV Switchgear & Transformers',
  cost_06_cabling: '[06] Cabling (DC, AC, Communication)',
  cost_07_installation: '[07] Installation & Commissioning',
  cost_08_engineering: '[08] Engineering & Consulting',
  cost_09_logistics: '[09] Logistics & Site Services',
  cost_10_testing: '[10] Testing, O&M Handover & Warranty',
};

function emptyFields() {
  const obj: Record<string, string> = {};
  COSTING_CATEGORY_KEYS.forEach(k => { obj[k] = ''; });
  return obj;
}

function initFromCosting(costing: ProjectCosting | null | undefined): Record<string, string> {
  if (!costing) return emptyFields();
  const obj: Record<string, string> = {};
  COSTING_CATEGORY_KEYS.forEach(k => {
    const v = costing[k as keyof ProjectCosting] as number;
    obj[k] = v > 0 ? String(v) : '';
  });
  return obj;
}

export default function ProjectCostingForm({ project, existingCosting, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const hasOriginal = !!existingCosting;

  const [salesPrice, setSalesPrice] = useState(
    existingCosting ? String(existingCosting.sales_price_excl_vat) : ''
  );
  const [costs, setCosts] = useState<Record<string, string>>(initFromCosting(existingCosting));
  const [notes, setNotes] = useState(existingCosting?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const salesExcl = parseFloat(salesPrice) || 0;
  const salesIncl = salesExcl * 1.07;

  const origSalesExcl = existingCosting?.sales_price_excl_vat ?? 0;

  const totalCost = useMemo(() =>
    COSTING_CATEGORY_KEYS.reduce((s, k) => s + (parseFloat(costs[k]) || 0), 0),
    [costs]
  );

  const origTotalCost = useMemo(() =>
    hasOriginal
      ? COSTING_CATEGORY_KEYS.reduce((s, k) => s + ((existingCosting![k as keyof ProjectCosting] as number) || 0), 0)
      : 0,
    [existingCosting, hasOriginal]
  );

  const margin = salesExcl - totalCost;
  const marginPct = salesExcl > 0 ? (margin / salesExcl) * 100 : 0;
  const origMargin = origSalesExcl - origTotalCost;
  const origMarginPct = origSalesExcl > 0 ? (origMargin / origSalesExcl) * 100 : 0;

  const marginColor = (pct: number) =>
    pct > 10 ? 'text-[#1D9E75]' : pct >= 0 ? 'text-[#EF9F27]' : 'text-[#E24B4A]';

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!salesPrice || salesExcl <= 0) errs.salesPrice = 'Sales price must be greater than 0';
    const anyPositive = COSTING_CATEGORY_KEYS.some(k => (parseFloat(costs[k]) || 0) > 0);
    if (!anyPositive) errs.costs = 'At least one cost category must be greater than 0';
    COSTING_CATEGORY_KEYS.forEach(k => {
      const v = parseFloat(costs[k]) || 0;
      if (v < 0) errs[k] = 'Cannot be negative';
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function notifySuraphol(projectName: string) {
    const { data: cm } = await supabase.from('user_profiles').select('id').eq('role', 'construction_manager').maybeSingle();
    if (cm) {
      await supabase.from('notifications').insert({
        user_id: cm.id,
        title: `Estimation ready for review — ${projectName}`,
        message: `Niramon has submitted the estimation for ${projectName}. Awaiting your review.`,
        type: 'info',
        is_read: false,
        related_entity_type: 'project',
        related_entity_id: project.id,
      });
    }
  }

  async function doSave(submit: boolean) {
    if (!validate()) return;
    setSaving(true);

    const catValues: Record<string, number> = {};
    COSTING_CATEGORY_KEYS.forEach(k => { catValues[k] = parseFloat(costs[k]) || 0; });

    const costingStatus = submit ? 'submitted' : 'draft';

    const insertData: Record<string, unknown> = {
      project_id: project.id,
      stage: 'estimation',
      sales_price_excl_vat: salesExcl,
      sales_price_incl_vat: salesIncl,
      ...catValues,
      gross_margin_amount: margin,
      gross_margin_pct: marginPct,
      notes: notes || null,
      status: costingStatus,
    };

    if (submit && user) {
      insertData.submitted_by = user.id;
      insertData.submitted_at = new Date().toISOString();
    }

    const { error: costingErr } = await supabase.from('project_costings').insert(insertData);
    if (costingErr) { setSaving(false); setErrors({ form: costingErr.message }); return; }

    if (submit) {
      await supabase.from('projects').update({ status: 'estimation_submitted' }).eq('id', project.id);
      await notifySuraphol(project.name);
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-3xl my-6 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10">
          <div>
            <h2 className="text-base font-semibold text-[#0f1923]">New Estimation</h2>
            <p className="text-xs text-gray-400 mt-0.5">{project.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Sales Price row */}
          <div className={hasOriginal ? 'grid grid-cols-2 gap-4' : ''}>
            {hasOriginal && (
              <div>
                <label className="text-xs font-medium text-gray-400 mb-1 block">Original — Sales Price excl VAT (฿)</label>
                <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500">
                  {fmtTHB(origSalesExcl)}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                {hasOriginal ? 'New — Sales Price excl VAT (฿) *' : 'Sales Price excl VAT (฿) *'}
              </label>
              <input
                type="number"
                min="0"
                value={salesPrice}
                onChange={e => { setSalesPrice(e.target.value); setErrors(prev => ({ ...prev, salesPrice: '' })); }}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] ${errors.salesPrice ? 'border-[#E24B4A]' : 'border-gray-200'}`}
                placeholder="0"
              />
              {errors.salesPrice && <p className="text-xs text-[#E24B4A] mt-1">{errors.salesPrice}</p>}
              {salesExcl > 0 && (
                <p className="text-xs text-gray-400 mt-1">incl VAT 7%: {fmtTHB(salesIncl)}</p>
              )}
            </div>
          </div>

          {/* Cost Categories */}
          <div>
            <div className={`grid gap-x-4 mb-2 ${hasOriginal ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {hasOriginal && (
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Original Estimate</h3>
              )}
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {hasOriginal ? 'New Estimate' : 'Cost Categories'}
              </h3>
            </div>
            {errors.costs && <p className="text-xs text-[#E24B4A] mb-2">{errors.costs}</p>}
            <div className="space-y-2">
              {COSTING_CATEGORY_KEYS.map(k => {
                const origVal = hasOriginal
                  ? (existingCosting![k as keyof ProjectCosting] as number) || 0
                  : 0;
                return (
                  <div key={k} className={`grid gap-x-4 ${hasOriginal ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {hasOriginal && (
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">{CATEGORY_DISPLAY[k]}</label>
                        <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500">
                          {fmtTHB(origVal)}
                        </div>
                      </div>
                    )}
                    <div>
                      {!hasOriginal && (
                        <label className="text-xs text-gray-500 mb-1 block">{CATEGORY_DISPLAY[k]}</label>
                      )}
                      {hasOriginal && (
                        <label className="text-xs text-gray-500 mb-1 block invisible">{CATEGORY_DISPLAY[k]}</label>
                      )}
                      <input
                        type="number"
                        min="0"
                        value={costs[k]}
                        onChange={e => {
                          setCosts(prev => ({ ...prev, [k]: e.target.value }));
                          setErrors(prev => ({ ...prev, [k]: '', costs: '' }));
                        }}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] ${errors[k] ? 'border-[#E24B4A]' : 'border-gray-200'}`}
                        placeholder={hasOriginal ? String(origVal || 0) : '0'}
                      />
                      {errors[k] && <p className="text-xs text-[#E24B4A] mt-0.5">{errors[k]}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Summary */}
          <div className={`grid gap-4 ${hasOriginal ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {hasOriginal && (
              <div className="bg-[#F8F8F7] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Original Summary</h3>
                {[
                  { label: 'Total Cost excl VAT', value: fmtTHB(origTotalCost) },
                  { label: 'Total Cost incl VAT', value: fmtTHB(origTotalCost * 1.07) },
                ].map(r => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span className="text-gray-400">{r.label}</span>
                    <span className="font-medium text-gray-500">{r.value}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Gross Margin ฿</span>
                    <span className={`font-semibold ${marginColor(origMarginPct)}`}>{fmtTHB(origMargin)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Gross Margin %</span>
                    <span className={`font-semibold ${marginColor(origMarginPct)}`}>
                      {origSalesExcl > 0 ? origMarginPct.toFixed(1) + '%' : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-[#F8F8F7] rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
                {hasOriginal ? 'New Summary' : 'Live Summary'}
              </h3>
              {[
                { label: 'Total Cost excl VAT', value: fmtTHB(totalCost) },
                { label: 'Total Cost incl VAT', value: fmtTHB(totalCost * 1.07) },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="font-medium text-[#0f1923]">{r.value}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Gross Margin ฿</span>
                  <span className={`font-semibold ${marginColor(marginPct)}`}>{fmtTHB(margin)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Gross Margin %</span>
                  <span className={`font-semibold ${marginColor(marginPct)}`}>
                    {salesExcl > 0 ? marginPct.toFixed(1) + '%' : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {errors.form && <p className="text-xs text-[#E24B4A]">{errors.form}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => doSave(false)}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[#378ADD] text-white rounded-lg hover:bg-[#2a6fb5] transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={() => doSave(true)}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save & Submit for Review'}
          </button>
        </div>
      </div>
    </div>
  );
}
