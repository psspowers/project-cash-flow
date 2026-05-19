import { useState, useEffect } from 'react';
import { Lock, Plus, X, XCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  ProjectCosting, VariationOrder,
  fmtTHB, COSTING_CATEGORY_KEYS, COSTING_CATEGORY_LABELS,
} from '../../../types';
import Badge, { statusVariant } from '../../ui/Badge';
import { formatDate } from '../../../utils/formatters';
import { useAuth } from '../../../context/AuthContext';
import ProjectCostingForm from '../../costing/ProjectCostingForm';
import { useProjectDetail } from '../../../context/ProjectDetailContext';
import { CATEGORY_KEY_LABELS, STATUS_BANNER, DRAFT_STAGES, emptyCosting } from '../projectDetailConstants';
import {
  submitCosting, approveCostingCM, approveCostingEVP,
  rejectCostingCM, rejectCostingEVP, notify,
  CostingActionParams,
} from '../../../services/workflow';

export default function CostingTab() {
  const {
    project, estimation, budget, vos,
    isCostController, isCM, isEVP, isCEO,
    profileName, voTotalCost, reload,
  } = useProjectDetail();

  const { user } = useAuth();

  const [showNewCostingForm, setShowNewCostingForm] = useState(false);
  const [showNewVO, setShowNewVO] = useState(false);

  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetEditFields, setBudgetEditFields] = useState<{ salesPrice: string } & Record<string, string>>({ salesPrice: '' });
  const [budgetEditErrors, setBudgetEditErrors] = useState<Record<string, string>>({});

  const [voForm, setVoForm] = useState({
    vo_number: '',
    client_po_reference: '',
    description: '',
    revenue_increase: '0',
    ...emptyCosting(),
  });

  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rejectStageLabel, setRejectStageLabel] = useState('');
  const [rejectTargetStatus, setRejectTargetStatus] = useState('');

  useEffect(() => {
    const nextNum = vos.length + 1;
    setVoForm(prev => ({ ...prev, vo_number: `VO${String(nextNum).padStart(3, '0')}` }));
  }, [vos.length]);

  if (!project) return null;

  const status = project.status;
  const banner = STATUS_BANNER[status];
  const showRejectionBanner = !!(project.last_rejection_comment && DRAFT_STAGES.has(status));
  const budgetStages = new Set(['budget_draft', 'budget_submitted', 'budget_cm_approved', 'active', 'completed']);
  const estimationOnly = new Set(['estimation_draft', 'estimation_submitted', 'estimation_cm_approved', 'estimation_approved']);
  const showVOs = status === 'active' || status === 'completed';

  function openBudgetEdit() {
    if (!budget) return;
    const fields: Record<string, string> = { salesPrice: String(budget.sales_price_excl_vat) };
    COSTING_CATEGORY_KEYS.forEach(k => { fields[k] = String((budget[k as keyof ProjectCosting] as number) ?? 0); });
    setBudgetEditFields(fields as { salesPrice: string } & Record<string, string>);
    setBudgetEditErrors({});
    setEditingBudget(true);
  }

  async function saveBudgetEdit() {
    if (!budget) return;
    const errs: Record<string, string> = {};
    const salesExcl = parseFloat(budgetEditFields.salesPrice) || 0;
    if (salesExcl <= 0) errs.salesPrice = 'Required';
    const anyPositive = COSTING_CATEGORY_KEYS.some(k => (parseFloat(budgetEditFields[k]) || 0) > 0);
    if (!anyPositive) errs.costs = 'At least one cost must be > 0';
    COSTING_CATEGORY_KEYS.forEach(k => {
      if ((parseFloat(budgetEditFields[k]) || 0) < 0) errs[k] = 'Cannot be negative';
    });
    if (Object.keys(errs).length > 0) { setBudgetEditErrors(errs); return; }
    setActionLoading(true);
    const catValues: Record<string, number> = {};
    COSTING_CATEGORY_KEYS.forEach(k => { catValues[k] = parseFloat(budgetEditFields[k]) || 0; });
    const salesIncl = salesExcl * 1.07;
    const totalCostVal = Object.values(catValues).reduce((s, v) => s + v, 0);
    const marginAmt = salesExcl - totalCostVal;
    const marginPct = salesExcl > 0 ? (marginAmt / salesExcl) * 100 : 0;
    const { error } = await supabase.from('project_costings').update({
      sales_price_excl_vat: salesExcl, sales_price_incl_vat: salesIncl, ...catValues,
      gross_margin_amount: marginAmt, gross_margin_pct: marginPct,
    }).eq('id', budget.id);
    if (error) { setActionError(error.message); setActionLoading(false); return; }
    setEditingBudget(false);
    setActionLoading(false);
    await reload();
  }

  async function submitEstimation() {
    if (!project || !user || !estimation) return;
    setActionLoading(true); setActionError('');
    const params: CostingActionParams = { costingId: estimation.id, projectId: project.id, projectName: project.name, actorId: user.id, stage: 'estimation' };
    const result = await submitCosting(params);
    if (result.error) setActionError(result.error);
    setActionLoading(false);
    await reload();
  }

  async function approveCMEstimation() {
    if (!project || !user || !estimation) return;
    setActionLoading(true); setActionError('');
    const params: CostingActionParams = { costingId: estimation.id, projectId: project.id, projectName: project.name, actorId: user.id, stage: 'estimation' };
    const result = await approveCostingCM(params);
    if (result.error) setActionError(result.error);
    setActionLoading(false);
    await reload();
  }

  async function approveEVPEstimation() {
    if (!project || !user || !estimation) return;
    setActionLoading(true); setActionError('');
    const params: CostingActionParams = { costingId: estimation.id, projectId: project.id, projectName: project.name, actorId: user.id, stage: 'estimation' };
    const result = await approveCostingEVP(params);
    if (result.error) setActionError(result.error);
    setActionLoading(false);
    await reload();
  }

  async function startBudget() {
    if (!project || !estimation) return;
    setActionLoading(true); setActionError('');
    const catValues: Record<string, number> = {};
    COSTING_CATEGORY_KEYS.forEach(k => { catValues[k] = (estimation[k as keyof ProjectCosting] as number) ?? 0; });
    const excl = estimation.sales_price_excl_vat;
    const incl = excl * 1.07;
    const total = estimation.total_cost_excl_vat;
    const margin = excl - total;
    const marginPct = excl > 0 ? (margin / excl) * 100 : 0;
    await supabase.from('project_costings').insert({
      project_id: project.id, stage: 'budget', status: 'draft',
      sales_price_excl_vat: excl, sales_price_incl_vat: incl,
      ...catValues, gross_margin_amount: margin, gross_margin_pct: marginPct,
      notes: estimation.notes ?? null,
    });
    await supabase.from('projects').update({ status: 'budget_draft' }).eq('id', project.id);
    setActionLoading(false);
    await reload();
  }

  async function submitBudget() {
    if (!project || !user || !budget) return;
    setActionLoading(true); setActionError('');
    const params: CostingActionParams = { costingId: budget.id, projectId: project.id, projectName: project.name, actorId: user.id, stage: 'budget' };
    const result = await submitCosting(params);
    if (result.error) setActionError(result.error);
    setActionLoading(false);
    await reload();
  }

  async function approveCMBudget() {
    if (!project || !user || !budget) return;
    setActionLoading(true); setActionError('');
    const params: CostingActionParams = { costingId: budget.id, projectId: project.id, projectName: project.name, actorId: user.id, stage: 'budget' };
    const result = await approveCostingCM(params);
    if (result.error) setActionError(result.error);
    setActionLoading(false);
    await reload();
  }

  async function approveEVPBudget() {
    if (!project || !user || !budget) return;
    setActionLoading(true); setActionError('');
    const params: CostingActionParams = { costingId: budget.id, projectId: project.id, projectName: project.name, actorId: user.id, stage: 'budget' };
    const result = await approveCostingEVP(params);
    if (result.error) setActionError(result.error);
    setActionLoading(false);
    await reload();
  }

  async function markComplete() {
    if (!project) return;
    setActionLoading(true); setActionError('');
    await supabase.from('projects').update({ status: 'completed' }).eq('id', project.id);
    setActionLoading(false);
    await reload();
  }

  function openRejectModal(stageLabel: string, targetStatus: string) {
    setRejectStageLabel(stageLabel);
    setRejectTargetStatus(targetStatus);
    setRejectComment('');
    setShowRejectModal(true);
  }

  async function submitRejection() {
    if (!rejectComment.trim() || !project || !user) return;
    setActionLoading(true); setActionError('');
    setShowRejectModal(false);
    const costingToUpdate = rejectTargetStatus.startsWith('budget') ? budget : estimation;
    const stage: CostingActionParams['stage'] = rejectTargetStatus.startsWith('budget') ? 'budget' : 'estimation';
    if (costingToUpdate) {
      const isEVPReject = rejectTargetStatus === 'evp_rejected';
      let result: { error: string | null };
      if (isEVPReject) {
        result = await rejectCostingEVP(costingToUpdate.id, project.id, project.name, user.id, stage, rejectComment, rejectStageLabel);
      } else {
        result = await rejectCostingCM(costingToUpdate.id, project.id, project.name, user.id, stage, rejectComment, rejectStageLabel);
      }
      if (result.error) setActionError(result.error);
    }
    setRejectComment('');
    setActionLoading(false);
    await reload();
  }

  async function submitVO() {
    if (!project) return;
    setFormError('');
    if (!voForm.client_po_reference) { setFormError('Client PO Reference is required.'); return; }
    if (!voForm.description) { setFormError('Description is required.'); return; }
    const cats: Record<string, number> = {};
    COSTING_CATEGORY_KEYS.forEach(k => { cats[k] = parseFloat(voForm[k as keyof typeof voForm] as string) || 0; });
    const { error } = await supabase.from('variation_orders').insert({
      project_id: project.id,
      vo_number: voForm.vo_number,
      client_po_reference: voForm.client_po_reference,
      description: voForm.description,
      revenue_increase: parseFloat(voForm.revenue_increase) || 0,
      ...cats,
      status: 'draft',
      submitted_by: user?.id ?? null,
      submitted_at: new Date().toISOString(),
    });
    if (error) { setFormError(error.message); return; }
    const { data: evpProfile } = await supabase.from('user_profiles').select('id').eq('role', 'evp').maybeSingle();
    if (evpProfile) {
      await notify((evpProfile as { id: string }).id, `New Variation Order — ${project.name}`, `A new variation order (${voForm.vo_number}) has been submitted for your review.`, 'info', 'project', project.id);
    }
    setShowNewVO(false);
    setVoForm({ vo_number: '', client_po_reference: '', description: '', revenue_increase: '0', ...emptyCosting() });
    setFormError('');
    await reload();
  }

  // ─── Comparison table helpers ───────────────────────────────────────────────
  const hasBoth = !!(estimation && budget);

  function varColor(v: number) {
    if (v > 0) return 'text-[#1D9E75]';
    if (v < 0) return 'text-[#E24B4A]';
    return 'text-gray-400';
  }
  function fmtVar(v: number) {
    if (v === 0) return '—';
    return (v > 0 ? '+' : '') + fmtTHB(v);
  }
  function fmtVarPct(est: number, bud: number): string {
    const v = bud - est;
    if (est === 0 && bud > 0) return 'NEW';
    if (est === 0 && bud === 0) return '—';
    const pct = (v / Math.abs(est)) * 100;
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  }
  function varPctColor(est: number, bud: number): string {
    const v = bud - est;
    if (est === 0 && bud > 0) return 'text-[#378ADD]';
    return varColor(v);
  }

  type CostingRow = { label: string; est: number; bud: number; isBold?: boolean; isMargin?: boolean };
  const rows: CostingRow[] = [
    { label: 'Sales Price (excl VAT)', est: estimation?.sales_price_excl_vat ?? 0, bud: budget?.sales_price_excl_vat ?? 0 },
    { label: 'Sales Price (incl VAT)', est: estimation?.sales_price_incl_vat ?? 0, bud: budget?.sales_price_incl_vat ?? 0 },
    ...COSTING_CATEGORY_KEYS.map(k => ({
      label: CATEGORY_KEY_LABELS[k],
      est: (estimation?.[k as keyof ProjectCosting] as number) ?? 0,
      bud: (budget?.[k as keyof ProjectCosting] as number) ?? 0,
    })),
    { label: 'Total Cost', est: estimation?.total_cost_excl_vat ?? 0, bud: budget?.total_cost_excl_vat ?? 0, isBold: true },
    { label: 'Gross Margin', est: estimation?.gross_margin_amount ?? 0, bud: budget?.gross_margin_amount ?? 0, isMargin: true },
  ];

  const hasEither = !!(estimation || budget);

  return (
    <div className="space-y-5">
      {showRejectionBanner && (
        <div className="rounded-xl border border-[#E24B4A]/30 bg-[#E24B4A]/5 p-4">
          <p className="text-xs font-semibold text-[#E24B4A] mb-1">Rejected at {project.last_rejected_stage}</p>
          <p className="text-xs text-gray-700">On {formatDate(project.last_rejected_at)}: "{project.last_rejection_comment}"</p>
        </div>
      )}

      {banner && (
        <div className={`rounded-xl border ${banner.bg} ${banner.border} px-4 py-3 flex items-center gap-2`}>
          {status === 'active' && <Lock size={14} className={banner.color} />}
          <p className={`text-xs font-medium ${banner.color}`}>{banner.message}</p>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-[#E24B4A]/30 bg-[#E24B4A]/5 px-4 py-3 text-xs text-[#E24B4A]">{actionError}</div>
      )}

      {/* COSTING COMPARISON TABLE */}
      <div className="border border-[rgba(0,0,0,0.08)] rounded-xl bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
          <span className="font-semibold text-[#0f1923] text-sm">Estimation vs Budget</span>
          <div className="flex items-center gap-3">
            {estimation && (
              <span className="text-xs text-gray-400">Estimation: <span className="font-medium text-gray-600">{estimation.status.replace(/_/g, ' ')}</span></span>
            )}
            {budget && (
              <span className="text-xs text-gray-400">Budget: <span className="font-medium text-gray-600">{budget.status.replace(/_/g, ' ')}</span></span>
            )}
          </div>
        </div>

        {!hasEither ? (
          <div className="p-8 flex flex-col items-center justify-center gap-3">
            <span className="text-gray-400 text-sm">No estimation yet</span>
            {isCostController && status === 'estimation_draft' && (
              <button
                onClick={() => setShowNewCostingForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#378ADD] text-white text-xs rounded-lg hover:bg-[#2a6fb5] transition-colors"
              >
                <Plus size={13} /> Create Estimation
              </button>
            )}
          </div>
        ) : (
          <>
            {estimationOnly.has(status) && !budget && (
              <div className="mx-5 my-3 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                <Lock size={13} className="text-gray-400" />
                <p className="text-xs text-gray-400">Budget column will populate after estimation is approved</p>
              </div>
            )}
            {status === 'estimation_approved' && !budget && isCostController && (
              <div className="mx-5 my-3 flex items-center gap-3 px-3 py-2.5 bg-[#1D9E75]/5 border border-[#1D9E75]/20 rounded-lg">
                <p className="text-xs text-gray-600 flex-1">Estimation approved — ready to start budget</p>
                <button
                  onClick={startBudget}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60"
                >
                  Start Budget
                </button>
              </div>
            )}
            {budget?.status === 'evp_approved' && (
              <div className="mx-5 my-3 flex items-center gap-2 px-3 py-2 bg-[#1D9E75]/5 border border-[#1D9E75]/20 rounded-lg">
                <Lock size={13} className="text-[#1D9E75]" />
                <p className="text-xs text-[#1D9E75] font-medium">Budget locked — approved by {profileName(budget.evp_approved_by)} on {formatDate(budget.evp_approved_at)}</p>
              </div>
            )}

            {editingBudget && (
              <div className="mx-5 my-3 flex items-center gap-2 px-3 py-2 bg-[#378ADD]/5 border border-[#378ADD]/20 rounded-lg">
                <span className="text-xs text-[#378ADD] font-medium">Editing Budget — click any value in the Budget column to update it</span>
              </div>
            )}
            {budgetEditErrors.costs && editingBudget && (
              <div className="mx-5 mb-2">
                <p className="text-[#E24B4A] text-xs">{budgetEditErrors.costs}</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
                    <th className="px-5 py-3 text-left font-medium text-gray-500 w-[35%]">Category</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Estimation</th>
                    <th className={`px-4 py-3 text-right font-medium ${editingBudget ? 'text-[#378ADD]' : 'text-gray-500'}`}>
                      Budget {editingBudget && <span className="text-[10px] font-normal">(editable)</span>}
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Variance ฿</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 pr-5">Variance %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isTotal = row.isBold;
                    const isMarginRow = row.isMargin;
                    const isSeparator = i === 1;
                    const fieldKey = i === 0 ? 'salesPrice' : i === 1 ? null : isTotal || isMarginRow ? null : COSTING_CATEGORY_KEYS[i - 2] ?? null;
                    const isEditable = editingBudget && fieldKey !== null && !isTotal && !isMarginRow;
                    const liveBud = (() => {
                      if (!editingBudget) return row.bud;
                      if (i === 0) return parseFloat(budgetEditFields.salesPrice) || 0;
                      if (i === 1) return (parseFloat(budgetEditFields.salesPrice) || 0) * 1.07;
                      if (isTotal) return COSTING_CATEGORY_KEYS.reduce((s, k) => s + (parseFloat(budgetEditFields[k]) || 0), 0);
                      if (isMarginRow) {
                        const sp = parseFloat(budgetEditFields.salesPrice) || 0;
                        const tc = COSTING_CATEGORY_KEYS.reduce((s, k) => s + (parseFloat(budgetEditFields[k]) || 0), 0);
                        return sp - tc;
                      }
                      if (fieldKey) return parseFloat(budgetEditFields[fieldKey]) || 0;
                      return row.bud;
                    })();
                    const variance = liveBud - row.est;
                    const liveMgColor = liveBud >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]';
                    return (
                      <tr
                        key={row.label}
                        className={`border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7] ${isTotal ? 'border-t-2 border-t-[rgba(0,0,0,0.1)]' : ''}`}
                      >
                        <td className={`px-5 py-2.5 ${isTotal || isMarginRow ? 'font-semibold text-[#0f1923]' : 'text-gray-500'} ${isSeparator ? 'border-b-2 border-b-[rgba(0,0,0,0.08)]' : ''}`}>
                          {row.label}
                        </td>
                        <td className={`px-4 py-2.5 text-right ${isTotal ? 'font-semibold' : ''} ${isMarginRow ? (row.est >= 0 ? 'text-[#1D9E75] font-semibold' : 'text-[#E24B4A] font-semibold') : ''}`}>
                          {fmtTHB(row.est)}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${isTotal ? 'font-semibold' : ''} ${isMarginRow ? `${liveMgColor} font-semibold` : ''}`}>
                          {isEditable ? (
                            <div className="flex justify-end">
                              <input
                                type="number"
                                min="0"
                                value={budgetEditFields[fieldKey!]}
                                onChange={e => {
                                  setBudgetEditFields(prev => ({ ...prev, [fieldKey!]: e.target.value }));
                                  setBudgetEditErrors(prev => ({ ...prev, [fieldKey!]: '', costs: '' }));
                                }}
                                className={`w-36 text-right border rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#378ADD]/30 focus:border-[#378ADD] ${budgetEditErrors[fieldKey!] ? 'border-[#E24B4A] bg-[#E24B4A]/5' : 'border-[#378ADD]/40 bg-[#378ADD]/5'}`}
                              />
                            </div>
                          ) : budget || editingBudget ? (
                            <span className={editingBudget && (isTotal || isMarginRow) ? 'font-semibold' : ''}>{fmtTHB(liveBud)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                          {isEditable && budgetEditErrors[fieldKey!] && (
                            <p className="text-[#E24B4A] text-[10px] text-right mt-0.5">{budgetEditErrors[fieldKey!]}</p>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${(hasBoth || editingBudget) ? varColor(variance) : 'text-gray-300'}`}>
                          {(hasBoth || editingBudget) ? fmtVar(variance) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium pr-5 ${(hasBoth || editingBudget) ? varPctColor(row.est, liveBud) : 'text-gray-300'}`}>
                          {(hasBoth || editingBudget) ? fmtVarPct(row.est, liveBud) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Gross Margin % row */}
                  {(() => {
                    const liveSp = editingBudget ? (parseFloat(budgetEditFields.salesPrice) || 0) : (budget?.sales_price_excl_vat ?? 0);
                    const liveTc = editingBudget ? COSTING_CATEGORY_KEYS.reduce((s, k) => s + (parseFloat(budgetEditFields[k]) || 0), 0) : 0;
                    const liveMgPct = editingBudget
                      ? (liveSp > 0 ? ((liveSp - liveTc) / liveSp) * 100 : 0)
                      : (budget?.gross_margin_pct ?? 0);
                    const estMgPct = estimation?.gross_margin_pct ?? 0;
                    const pptDiff = liveMgPct - estMgPct;
                    return (
                      <tr className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7]">
                        <td className="px-5 py-2.5 text-gray-500">Gross Margin %</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${estMgPct >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                          {estimation ? estMgPct.toFixed(1) + '%' : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${liveMgPct >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                          {(budget || editingBudget) ? liveMgPct.toFixed(1) + '%' : <span className="text-gray-300">—</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-medium ${(hasBoth || editingBudget) ? varColor(pptDiff) : 'text-gray-300'}`}>
                          {(hasBoth || editingBudget) ? fmtVar(parseFloat(pptDiff.toFixed(2))) + 'pp' : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-300 pr-5">—</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Action buttons */}
            <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.06)] flex flex-wrap gap-2">
              {isCostController && status === 'estimation_draft' && estimation?.status === 'draft' && (
                <button onClick={submitEstimation} disabled={actionLoading} className="px-4 py-2 bg-[#EF9F27] text-white text-xs rounded-lg hover:bg-[#d4891f] transition-colors disabled:opacity-60">
                  Submit Estimation for CM Review
                </button>
              )}
              {isCM && status === 'estimation_submitted' && (
                <>
                  <button onClick={() => openRejectModal('Estimation — CM Review', 'cm_rejected')} disabled={actionLoading} className="px-3 py-2 border border-[#E24B4A] text-[#E24B4A] text-xs rounded-lg hover:bg-[#E24B4A]/5 transition-colors disabled:opacity-60">Reject Estimation</button>
                  <button onClick={approveCMEstimation} disabled={actionLoading} className="px-3 py-2 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60">Approve Estimation</button>
                </>
              )}
              {isEVP && status === 'estimation_cm_approved' && (
                <>
                  <button onClick={() => openRejectModal('Estimation — EVP Approval', 'evp_rejected')} disabled={actionLoading} className="px-3 py-2 border border-[#E24B4A] text-[#E24B4A] text-xs rounded-lg hover:bg-[#E24B4A]/5 transition-colors disabled:opacity-60">Reject</button>
                  <button onClick={approveEVPEstimation} disabled={actionLoading} className="px-3 py-2 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60">Final Approve Estimation</button>
                </>
              )}
              {isCostController && status === 'budget_draft' && budget?.status === 'draft' && !editingBudget && (
                <>
                  <button onClick={openBudgetEdit} className="px-4 py-2 border border-[#378ADD] text-[#378ADD] text-xs rounded-lg hover:bg-[#378ADD]/5 transition-colors">Edit Budget</button>
                  <button onClick={submitBudget} disabled={actionLoading} className="px-4 py-2 bg-[#EF9F27] text-white text-xs rounded-lg hover:bg-[#d4891f] transition-colors disabled:opacity-60">Submit Budget for Review</button>
                </>
              )}
              {editingBudget && isCostController && budget?.status === 'draft' && (
                <>
                  <button onClick={() => setEditingBudget(false)} className="px-4 py-2 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                  <button onClick={saveBudgetEdit} disabled={actionLoading} className="px-4 py-2 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60">{actionLoading ? 'Saving...' : 'Save Changes'}</button>
                </>
              )}
              {isCM && status === 'budget_submitted' && (
                <>
                  <button onClick={() => openRejectModal('Budget — CM Review', 'cm_rejected')} disabled={actionLoading} className="px-3 py-2 border border-[#E24B4A] text-[#E24B4A] text-xs rounded-lg hover:bg-[#E24B4A]/5 transition-colors disabled:opacity-60">Reject Budget</button>
                  <button onClick={approveCMBudget} disabled={actionLoading} className="px-3 py-2 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60">Approve Budget</button>
                </>
              )}
              {isEVP && status === 'budget_cm_approved' && (
                <>
                  <button onClick={() => openRejectModal('Budget — EVP Approval', 'evp_rejected')} disabled={actionLoading} className="px-3 py-2 border border-[#E24B4A] text-[#E24B4A] text-xs rounded-lg hover:bg-[#E24B4A]/5 transition-colors disabled:opacity-60">Reject</button>
                  <button onClick={approveEVPBudget} disabled={actionLoading} className="px-3 py-2 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60">Activate Project</button>
                </>
              )}
              {(isEVP || isCEO) && status === 'active' && (
                <button onClick={markComplete} disabled={actionLoading} className="px-4 py-2 border border-gray-300 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60">Mark Project Complete</button>
              )}
            </div>
          </>
        )}
      </div>

      {/* VARIATION ORDERS */}
      {showVOs && (
        <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.06)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0f1923]">Variation Orders</h2>
            {isCostController && status === 'active' && (
              <button
                onClick={() => setShowNewVO(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#1D9E75] text-white text-xs rounded-lg hover:bg-[#178a64] transition-colors"
              >
                <Plus size={13} /> New Variation Order
              </button>
            )}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
                {['VO No.', 'Client PO Ref', 'Description', 'Revenue+', 'Total Cost', 'Status', 'Approved by'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vos.map(vo => (
                <tr key={vo.id} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7]">
                  <td className="px-4 py-2.5 font-medium text-[#0f1923]">{vo.vo_number}</td>
                  <td className="px-4 py-2.5 text-gray-600">{vo.client_po_reference}</td>
                  <td className="px-4 py-2.5 text-gray-600">{vo.description}</td>
                  <td className="px-4 py-2.5 text-[#1D9E75] font-medium">{fmtTHB(vo.revenue_increase)}</td>
                  <td className="px-4 py-2.5">{fmtTHB(voTotalCost(vo))}</td>
                  <td className="px-4 py-2.5">
                    <Badge label={vo.status.replace(/_/g, ' ')} variant={statusVariant(vo.status)} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{profileName(vo.evp_approved_by) !== '—' ? profileName(vo.evp_approved_by) : '—'}</td>
                </tr>
              ))}
              {vos.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No variation orders — client scope is unchanged.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODALS */}
      {showNewCostingForm && (
        <ProjectCostingForm
          project={project}
          existingCosting={estimation ?? null}
          onClose={() => setShowNewCostingForm(false)}
          onSaved={async () => { setShowNewCostingForm(false); await reload(); }}
        />
      )}

      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-[#0f1923]">Reject — {rejectStageLabel}</h2>
              <button onClick={() => setShowRejectModal(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Rejection comment *</label>
                <textarea
                  value={rejectComment}
                  onChange={e => setRejectComment(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 resize-none"
                  placeholder="Explain the reason for rejection..."
                />
                {rejectComment.trim() === '' && (
                  <p className="text-xs text-[#E24B4A] mt-1">Comment is required to reject</p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowRejectModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button
                  onClick={submitRejection}
                  disabled={!rejectComment.trim() || actionLoading}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#E24B4A] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#c73d3c] disabled:opacity-60"
                >
                  <XCircle size={15} />
                  Send Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewVO && (() => {
        const voErrors: Record<string, string> = {};
        if (!voForm.vo_number.trim()) voErrors.vo_number = 'VO number is required.';
        if (!voForm.client_po_reference.trim()) voErrors.client_po_reference = 'Client PO reference is required — a Variation Order can only be created against a formal client document.';
        if (!voForm.description.trim()) voErrors.description = 'Please provide a meaningful description (min 10 characters).';
        else if (voForm.description.trim().length < 10) voErrors.description = 'Please provide a meaningful description (min 10 characters).';
        const revIncrease = parseFloat(voForm.revenue_increase) || 0;
        if (revIncrease < 0) voErrors.revenue_increase = 'Revenue increase cannot be negative.';
        const voFormValid = Object.keys(voErrors).length === 0;
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.08)] flex justify-between items-center sticky top-0 bg-white">
                <h3 className="font-semibold text-[#0f1923]">New Variation Order</h3>
                <button onClick={() => { setShowNewVO(false); setFormError(''); }}><X size={16} className="text-gray-400" /></button>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { key: 'vo_number', label: 'VO Number *', type: 'text' },
                  { key: 'client_po_reference', label: 'Client PO Reference *', type: 'text' },
                  { key: 'description', label: 'Description *', type: 'text' },
                  { key: 'revenue_increase', label: 'Revenue Increase (฿)', type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                    <input
                      type={f.type}
                      value={voForm[f.key as keyof typeof voForm] as string}
                      onChange={e => setVoForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1D9E75] ${voErrors[f.key] ? 'border-[#E24B4A]' : 'border-[rgba(0,0,0,0.12)]'}`}
                    />
                    {voErrors[f.key] && <p className="text-xs text-[#E24B4A] mt-0.5">{voErrors[f.key]}</p>}
                  </div>
                ))}
                <p className="text-xs font-semibold text-gray-600 pt-2">Cost Category Changes</p>
                {COSTING_CATEGORY_KEYS.map(k => (
                  <div key={k}>
                    <label className="text-xs text-gray-500 mb-1 block">{COSTING_CATEGORY_LABELS[k]}</label>
                    <input
                      type="number"
                      value={voForm[k as keyof typeof voForm] as string}
                      onChange={e => setVoForm(prev => ({ ...prev, [k]: e.target.value }))}
                      className="w-full border border-[rgba(0,0,0,0.12)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1D9E75]"
                      placeholder="0"
                    />
                  </div>
                ))}
                {formError && <p className="text-xs text-[#E24B4A]">{formError}</p>}
              </div>
              <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex justify-end gap-2 sticky bottom-0 bg-white">
                <button onClick={() => { setShowNewVO(false); setFormError(''); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                <button
                  onClick={submitVO}
                  disabled={!voFormValid}
                  className="px-4 py-2 bg-[#1D9E75] text-white text-sm rounded hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed"
                >Submit</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
