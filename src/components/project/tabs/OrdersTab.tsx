import { useState } from 'react';
import { Plus, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, X, Pencil, Save, XCircle as XCircleIcon } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useProjectDetail } from '../../../context/ProjectDetailContext';
import {
  fmtTHB, COSTING_CATEGORY_KEYS, PROJECT_STATUS_LABELS, CostCategory,
} from '../../../types';
import type { ProjectCosting, VariationOrder, Entity } from '../../../types';
import Badge, { statusVariant } from '../../ui/Badge';
import { formatDate } from '../../../utils/formatters';
import VendorCombobox from '../../ui/VendorCombobox';
import { CATEGORY_MAP, CATEGORY_KEY_LABELS } from '../projectDetailConstants';
import { useAuth } from '../../../context/AuthContext';

interface OverrunInfo {
  budgetAmt: number;
  voAdj: number;
  effectiveBudget: number;
  existingPOs: number;
  newAmt: number;
  totalCommitted: number;
  overrunAmt: number;
  overrunPct: number;
  categoryLabel: string;
}

// ── Inline-edit primitives ────────────────────────────────────────────────────

function InlineNum({
  value, onSave, active,
}: {
  value: number;
  onSave: (v: number) => Promise<void>;
  active: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (!active) return <>{fmtTHB(value)}</>;

  if (editing) {
    const commit = async () => {
      setSaving(true);
      await onSave(parseFloat(draft) || 0);
      setSaving(false);
      setEditing(false);
    };
    return (
      <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          type="number"
          min="0"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-28 text-right border border-[#378ADD]/60 bg-[#378ADD]/5 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#378ADD]/30"
        />
        <button onClick={commit} disabled={saving} className="text-[#1D9E75] hover:text-[#178a64] disabled:opacity-40"><Save size={11} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><XCircleIcon size={11} /></button>
      </span>
    );
  }

  return (
    <span
      className="group inline-flex items-center gap-1 cursor-pointer rounded px-1 -mx-1 hover:bg-[#378ADD]/8 transition-colors"
      onDoubleClick={e => { e.stopPropagation(); setDraft(String(value)); setEditing(true); }}
      title="Double-click to edit"
    >
      {fmtTHB(value)}
      <Pencil size={9} className="text-gray-300 group-hover:text-[#378ADD] transition-colors shrink-0" />
    </span>
  );
}

function InlineDate({
  value, onSave, active,
}: {
  value: string | undefined;
  onSave: (v: string) => Promise<void>;
  active: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const display = value ? formatDate(value) : <span className="text-gray-400 italic text-[10px]">Unscheduled</span>;

  if (!active) return <>{display}</>;

  if (editing) {
    const commit = async () => {
      if (draft) { setSaving(true); await onSave(`${draft}-01`); setSaving(false); }
      setEditing(false);
    };
    return (
      <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          type="month"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="border border-[#378ADD]/60 bg-[#378ADD]/5 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#378ADD]/30"
        />
        <button onClick={commit} disabled={saving} className="text-[#1D9E75] hover:text-[#178a64] disabled:opacity-40"><Save size={11} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><XCircleIcon size={11} /></button>
      </span>
    );
  }

  return (
    <span
      className="group inline-flex items-center gap-1 cursor-pointer rounded px-1 -mx-1 hover:bg-[#378ADD]/8 transition-colors whitespace-nowrap"
      onDoubleClick={e => { e.stopPropagation(); setDraft(value ? value.substring(0, 7) : ''); setEditing(true); }}
      title="Double-click to edit"
    >
      {display}
      <Pencil size={9} className="text-gray-300 group-hover:text-[#378ADD] transition-colors shrink-0" />
    </span>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function OrdersTab() {
  const { project, orders, poMilestones, vendors, budget, vos, reload, isCostController, isCM, isFinancialsLocked } = useProjectDetail();
  const { user } = useAuth();

  const canEdit = isCostController && !isFinancialsLocked;

  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [showNewPO, setShowNewPO] = useState(false);
  const [poForm, setPoForm] = useState({
    pss_po_no: '',
    vendor_id: '',
    description: '',
    cost_category: '01_civil' as CostCategory,
    po_amount_excl_vat: '',
  });
  const [formError, setFormError] = useState('');
  const [overrunAcknowledged, setOverrunAcknowledged] = useState(false);

  const poCatTotal = (cat: CostCategory) =>
    orders.filter(o => o.cost_category === cat).reduce((s, o) => s + o.po_amount_excl_vat, 0);

  const computeOverrun = (): OverrunInfo | null => {
    if (!poForm.po_amount_excl_vat) return null;
    const newAmt = parseFloat(poForm.po_amount_excl_vat) || 0;
    if (newAmt <= 0) return null;
    const catKey = (Object.entries(CATEGORY_MAP) as [import('../../../types').CostingCategoryKey, CostCategory][])
      .find(([, v]) => v === poForm.cost_category)?.[0];
    if (!catKey) return null;
    const budgetAmt = budget ? ((budget[catKey as keyof ProjectCosting] as number) ?? 0) : 0;
    const voAdj = vos
      .filter(v => v.status === 'evp_approved')
      .reduce((s, v) => s + ((v[catKey as keyof VariationOrder] as number) ?? 0), 0);
    const effectiveBudget = budgetAmt + voAdj;
    const existingPOs = orders
      .filter(o => o.cost_category === poForm.cost_category && o.status !== 'draft')
      .reduce((s, o) => s + o.po_amount_excl_vat, 0);
    const totalCommitted = existingPOs + newAmt;
    const overrunAmt = totalCommitted - effectiveBudget;
    if (overrunAmt <= 0) return null;
    return {
      budgetAmt, voAdj, effectiveBudget, existingPOs, newAmt, totalCommitted, overrunAmt,
      overrunPct: effectiveBudget > 0 ? (overrunAmt / effectiveBudget) * 100 : 0,
      categoryLabel: CATEGORY_KEY_LABELS[catKey],
    };
  };

  const computeWithinBudget = (): { remaining: number; label: string } | null => {
    if (!budget || !poForm.po_amount_excl_vat) return null;
    const newAmt = parseFloat(poForm.po_amount_excl_vat) || 0;
    if (newAmt <= 0) return null;
    const catKey = (Object.entries(CATEGORY_MAP) as [import('../../../types').CostingCategoryKey, CostCategory][])
      .find(([, v]) => v === poForm.cost_category)?.[0];
    if (!catKey) return null;
    const budgetAmt = (budget[catKey as keyof ProjectCosting] as number) ?? 0;
    const voAdj = vos
      .filter(v => v.status === 'evp_approved')
      .reduce((s, v) => s + ((v[catKey as keyof VariationOrder] as number) ?? 0), 0);
    const effectiveBudget = budgetAmt + voAdj;
    const existingPOs = orders
      .filter(o => o.cost_category === poForm.cost_category && o.status !== 'draft')
      .reduce((s, o) => s + o.po_amount_excl_vat, 0);
    const remaining = effectiveBudget - existingPOs - newAmt;
    if (remaining < 0) return null;
    return { remaining, label: CATEGORY_KEY_LABELS[catKey] };
  };

  async function markMilestoneComplete(milestoneId: string, poNo: string | null, vendorName: string, milestoneNum: number, amountDue: number) {
    if (!project) return;
    await supabase.from('po_milestones').update({ status: 'invoiced' }).eq('id', milestoneId);
    const { data: ccProfile } = await supabase.from('user_profiles').select('id').eq('role', 'cost_controller').maybeSingle();
    if (ccProfile) {
      await supabase.from('notifications').insert({
        user_id: (ccProfile as { id: string }).id,
        title: `${project.name} — Milestone complete`,
        message: `${project.name} — ${poNo ?? 'Draft PO'} ${vendorName}: Milestone #${milestoneNum} marked complete. Supplier may now raise invoice for ${fmtTHB(amountDue)}.`,
        type: 'info',
        is_read: false,
        related_entity_type: 'project',
        related_entity_id: project.id,
      });
    }
    await reload();
  }

  async function savePOAmount(poId: string, newExcl: number) {
    const vat = newExcl * 0.07;
    await supabase.from('purchase_orders').update({
      po_amount_excl_vat: newExcl,
      vat_7pct: vat,
      po_amount_incl_vat: newExcl + vat,
    }).eq('id', poId);
    await reload();
  }

  async function saveMilestoneField(id: string, field: 'amount_due' | 'planned_payment_date', value: number | string) {
    await supabase.from('po_milestones').update({ [field]: value }).eq('id', id);
    await reload();
  }

  async function saveInvoiceField(id: string, field: 'invoice_amount_incl_vat' | 'planned_payment_date', value: number | string) {
    await supabase.from('vendor_invoices').update({ [field]: value }).eq('id', id);
    await reload();
  }

  async function submitPO() {
    if (!project?.id) return;
    setFormError('');
    if (project.status !== 'active') {
      setFormError(`Purchase orders can only be created for Active projects. This project is currently in ${PROJECT_STATUS_LABELS[project.status] ?? project.status} stage.`);
      return;
    }
    const amt = parseFloat(poForm.po_amount_excl_vat) || 0;
    const vat = amt * 0.07;
    const total = amt + vat;
    const { error } = await supabase.from('purchase_orders').insert({
      project_id: project.id,
      pss_po_no: poForm.pss_po_no,
      vendor_id: poForm.vendor_id,
      description: poForm.description,
      cost_category: poForm.cost_category,
      po_amount_excl_vat: amt,
      vat_7pct: vat,
      po_amount_incl_vat: total,
      status: 'draft',
    });
    if (error) { setFormError(error.message); return; }
    const overrunInfo = computeOverrun();
    if (overrunInfo) {
      const vendor = vendors.find(v => v.id === poForm.vendor_id);
      const [evpRes, ceoRes, actorRes] = await Promise.all([
        supabase.from('user_profiles').select('id').eq('role', 'evp').maybeSingle(),
        supabase.from('user_profiles').select('id').eq('role', 'ceo').maybeSingle(),
        supabase.from('user_profiles').select('full_name').eq('id', user?.id ?? '').maybeSingle(),
      ]);
      const actorName = (actorRes.data as { full_name: string } | null)?.full_name ?? 'A team member';
      const msg = `PO ${poForm.pss_po_no} created by ${actorName} for ${vendor?.name ?? 'unknown vendor'} on ${project.name} in category ${overrunInfo.categoryLabel} commits ${fmtTHB(overrunInfo.totalCommitted)} against a budget of ${fmtTHB(overrunInfo.effectiveBudget)}. Overrun: ${fmtTHB(overrunInfo.overrunAmt)}. No Variation Order covers this amount.`;
      if (evpRes.data) await supabase.from('notifications').insert({ user_id: (evpRes.data as { id: string }).id, title: `Cost overrun — ${project.name} ${overrunInfo.categoryLabel}`, message: msg, type: 'warning', is_read: false });
      if (ceoRes.data) await supabase.from('notifications').insert({ user_id: (ceoRes.data as { id: string }).id, title: `Cost overrun — ${project.name} ${overrunInfo.categoryLabel}`, message: msg, type: 'warning', is_read: false });
    }
    setShowNewPO(false);
    setPoForm({ pss_po_no: '', vendor_id: '', description: '', cost_category: '01_civil', po_amount_excl_vat: '' });
    setOverrunAcknowledged(false);
    setFormError('');
    reload();
  }

  return (
    <div className="space-y-4">
      {isFinancialsLocked && (
        <div className="flex items-center gap-2 bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg px-4 py-2.5">
          <span className="text-xs font-medium text-[#E24B4A]">Financials are locked — all data is read-only.</span>
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-2 bg-[#378ADD]/5 border border-[#378ADD]/20 rounded-lg px-4 py-2.5">
          <Pencil size={12} className="text-[#378ADD] shrink-0" />
          <span className="text-xs text-[#378ADD] font-medium">Reconciliation mode — double-click any amount or date to edit inline.</span>
        </div>
      )}

      {project?.status === 'active' && isCostController && !isFinancialsLocked && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowNewPO(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#1D9E75] text-white text-sm rounded hover:bg-[#178a64] transition-colors"
          >
            <Plus size={14} /> New PO
          </button>
        </div>
      )}

      <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
              {['', 'PO No.', 'Vendor', 'Category', 'PO Amount (excl VAT)', 'VAT 7%', 'Total (incl VAT)', 'Balance Due', 'Status'].map(h => (
                <th key={h} className={`px-4 py-2.5 text-left font-medium text-gray-500 ${h === 'Balance Due' ? 'text-[#E24B4A]' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <>
                <tr
                  key={o.id}
                  className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7] cursor-pointer"
                  onClick={() => setExpandedPO(expandedPO === o.id ? null : o.id)}
                >
                  <td className="px-3 py-2.5 text-gray-400 w-8">
                    {expandedPO === o.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-[#0f1923]">
                    {o.pss_po_no ?? <span className="text-gray-400 italic text-xs">Pending approval</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{(o.vendor as Entity | undefined)?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{o.cost_category.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <InlineNum
                      value={o.po_amount_excl_vat}
                      active={canEdit}
                      onSave={v => savePOAmount(o.id, v)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{fmtTHB(o.vat_7pct)}</td>
                  <td className="px-4 py-2.5 font-medium">{fmtTHB(o.po_amount_incl_vat)}</td>
                  <td className="px-4 py-2.5 font-medium text-[#E24B4A]">{fmtTHB(
                    o.has_supplier_milestones
                      ? poMilestones.filter(pm => pm.purchase_order_id === o.id && pm.status !== 'paid').reduce((sum, pm) => sum + (pm.amount_due ?? 0), 0)
                      : (o.pending_invoice_amount ?? 0) + (o.pending_remaining_amount ?? 0)
                  )}</td>
                  <td className="px-4 py-2.5">
                    <Badge label={o.status.replace(/_/g, ' ')} variant={statusVariant(o.status)} />
                  </td>
                </tr>
                {expandedPO === o.id && (() => {
                  const vendorName = (o.vendor as Entity | undefined)?.name ?? '—';
                  if (o.has_supplier_milestones) {
                    const oMilestones = poMilestones
                      .filter(pm => pm.purchase_order_id === o.id)
                      .sort((a, b) => a.milestone_number - b.milestone_number);
                    return oMilestones.length > 0 ? oMilestones.map(pm => (
                      <tr key={pm.id} className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.03)]">
                        <td className="px-3 py-2" />
                        <td colSpan={8} className="px-4 py-2">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 text-xs text-gray-600 flex-1 flex-wrap">
                              <span className="font-semibold text-[#0f1923]">MS{pm.milestone_number}</span>
                              <span>{pm.milestone_pct != null ? `${(pm.milestone_pct * 100).toFixed(0)}%` : '—'}</span>
                              <span className="flex items-center gap-1">
                                <span className="text-gray-400">Due: </span>
                                <InlineNum
                                  value={pm.amount_due}
                                  active={canEdit}
                                  onSave={v => saveMilestoneField(pm.id, 'amount_due', v)}
                                />
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="text-gray-400">Planned: </span>
                                <InlineDate
                                  value={pm.planned_payment_date}
                                  active={canEdit}
                                  onSave={v => saveMilestoneField(pm.id, 'planned_payment_date', v)}
                                />
                              </span>
                              <Badge
                                label={pm.status}
                                variant={pm.status === 'paid' ? 'green' : pm.status === 'invoiced' ? 'amber' : 'gray'}
                              />
                            </div>
                            {isCM && pm.status === 'pending' && (
                              <button
                                onClick={() => markMilestoneComplete(pm.id, o.pss_po_no, vendorName, pm.milestone_number, pm.amount_due)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1D9E75] text-white text-xs font-medium rounded-lg hover:bg-[#178a64] transition-colors whitespace-nowrap shrink-0"
                              >
                                <CheckCircle size={11} />
                                Mark Complete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr key={`${o.id}-empty`} className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.03)]">
                        <td className="px-3 py-2" />
                        <td colSpan={8} className="px-4 py-2 text-xs text-gray-400 italic">No milestones configured for this PO</td>
                      </tr>
                    );
                  }
                  return o.invoices.length > 0 ? o.invoices.map(inv => (
                    <tr key={inv.id} className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.03)]">
                      <td className="px-3 py-2" />
                      <td colSpan={8} className="px-4 py-2">
                        <div className="grid grid-cols-6 gap-4 text-xs text-gray-600">
                          <span><span className="text-gray-400">Invoice: </span>{inv.vendor_invoice_no ?? '—'}</span>
                          <span><span className="text-gray-400">Date: </span>{formatDate(inv.invoice_date)}</span>
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">Total Invoice: </span>
                            <InlineNum
                              value={inv.invoice_amount_incl_vat}
                              active={canEdit}
                              onSave={v => saveInvoiceField(inv.id, 'invoice_amount_incl_vat', v)}
                            />
                          </span>
                          <span><span className="text-gray-400">WHT 3%: </span>{fmtTHB(inv.wht_3pct)}</span>
                          <span><span className="text-gray-400">Paid to date: </span><span className="text-[#1D9E75] font-medium">{fmtTHB(inv.received_amount ?? 0)}</span></span>
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">Planned pmt: </span>
                            <InlineDate
                              value={inv.planned_payment_date ?? undefined}
                              active={canEdit}
                              onSave={v => saveInvoiceField(inv.id, 'planned_payment_date', v)}
                            />
                          </span>
                        </div>
                        <div className="mt-1.5">
                          <Badge label={inv.status.replace(/_/g, ' ')} variant={statusVariant(inv.status)} />
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr key={`${o.id}-empty`} className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.03)]">
                      <td className="px-3 py-2" />
                      <td colSpan={8} className="px-4 py-2 text-xs text-gray-400 italic">No invoices for this PO</td>
                    </tr>
                  );
                })()}
              </>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">No purchase orders</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNewPO && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="px-5 py-4 border-b border-[rgba(0,0,0,0.08)] flex justify-between items-center">
              <h3 className="font-semibold text-[#0f1923]">New Purchase Order</h3>
              <button onClick={() => { setShowNewPO(false); setFormError(''); }}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { key: 'pss_po_no', label: 'PSS PO No.' },
                { key: 'description', label: 'Description' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-gray-500 mb-1 block">{f.label}</label>
                  <input
                    type="text"
                    value={poForm[f.key as keyof typeof poForm] as string}
                    onChange={e => setPoForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full border border-[rgba(0,0,0,0.12)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1D9E75]"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Vendor</label>
                <VendorCombobox
                  vendors={vendors}
                  value={poForm.vendor_id}
                  onChange={id => setPoForm(prev => ({ ...prev, vendor_id: id }))}
                  placeholder="Select vendor"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Cost Category</label>
                <select
                  value={poForm.cost_category}
                  onChange={e => setPoForm(prev => ({ ...prev, cost_category: e.target.value as CostCategory }))}
                  className="w-full border border-[rgba(0,0,0,0.12)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1D9E75]"
                >
                  {(Object.entries(CATEGORY_MAP) as [import('../../../types').CostingCategoryKey, CostCategory][]).map(([k, v]) => (
                    <option key={v} value={v}>{CATEGORY_KEY_LABELS[k]}</option>
                  ))}
                </select>
                {budget && (() => {
                  const catKey = (Object.entries(CATEGORY_MAP) as [import('../../../types').CostingCategoryKey, CostCategory][])
                    .find(([, v]) => v === poForm.cost_category)?.[0];
                  if (!catKey) return null;
                  const budgetAmt = (budget[catKey as keyof ProjectCosting] as number) ?? 0;
                  const committed = poCatTotal(poForm.cost_category);
                  const newAmt = parseFloat(poForm.po_amount_excl_vat) || 0;
                  const pending = orders
                    .filter(o => o.cost_category === poForm.cost_category && o.status !== 'cancelled')
                    .reduce((s, o) => {
                      const paid = o.invoices.reduce((si, i) => si + (i.received_amount ?? 0), 0);
                      return s + (o.po_amount_excl_vat - paid);
                    }, 0);
                  const paid = committed - pending;
                  const newTotal = committed + newAmt;
                  const usedPct = budgetAmt > 0 ? Math.min((paid / budgetAmt) * 100, 100) : 0;
                  const pendingPct = budgetAmt > 0 ? Math.min((pending / budgetAmt) * 100, 100 - usedPct) : 0;
                  const newPct = budgetAmt > 0 ? Math.min((newAmt / budgetAmt) * 100, 100 - usedPct - pendingPct) : 0;
                  const overrun = newTotal > budgetAmt;
                  const remaining = budgetAmt - newTotal;
                  return (
                    <div className="mt-2.5 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F8F8F7] p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#0f1923]">Budget utilisation</span>
                        <span className={`font-semibold ${overrun ? 'text-[#E24B4A]' : 'text-gray-600'}`}>
                          {fmtTHB(newTotal)} / {fmtTHB(budgetAmt)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden flex">
                        <div className="h-full bg-[#1D9E75] transition-all duration-300" style={{ width: `${usedPct}%` }} />
                        <div className="h-full bg-[#1D9E75]/40 transition-all duration-300" style={{ width: `${pendingPct}%` }} />
                        {newAmt > 0 && (
                          <div className={`h-full transition-all duration-300 ${overrun ? 'bg-[#E24B4A]/70' : 'bg-[#378ADD]/60'}`} style={{ width: `${newPct}%` }} />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1D9E75] inline-block" />Paid {fmtTHB(paid)}</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1D9E75]/40 inline-block" />Pending {fmtTHB(pending)}</span>
                        {newAmt > 0 && (
                          <span className={`flex items-center gap-1.5 ${overrun ? 'text-[#E24B4A] font-medium' : ''}`}>
                            <span className={`w-2.5 h-2.5 rounded-sm inline-block ${overrun ? 'bg-[#E24B4A]/70' : 'bg-[#378ADD]/60'}`} />
                            This PO {fmtTHB(newAmt)}
                          </span>
                        )}
                        <span className={`flex items-center gap-1.5 ml-auto font-medium ${overrun ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
                          {overrun ? `Over by ${fmtTHB(Math.abs(remaining))}` : `Remaining ${fmtTHB(remaining)}`}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">PO Amount (excl VAT)</label>
                <input
                  type="number"
                  value={poForm.po_amount_excl_vat}
                  onChange={e => setPoForm(prev => ({ ...prev, po_amount_excl_vat: e.target.value }))}
                  className="w-full border border-[rgba(0,0,0,0.12)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1D9E75]"
                  placeholder="0"
                />
                {poForm.po_amount_excl_vat && (
                  <p className="text-xs text-gray-400 mt-1">
                    VAT 7%: {fmtTHB((parseFloat(poForm.po_amount_excl_vat) || 0) * 0.07)} | Total incl VAT: {fmtTHB((parseFloat(poForm.po_amount_excl_vat) || 0) * 1.07)}
                  </p>
                )}
              </div>
              {(() => {
                const overrun = computeOverrun();
                const withinBudget = !overrun ? computeWithinBudget() : null;
                if (!budget && poForm.po_amount_excl_vat) {
                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-500">
                      No approved budget found. Overrun checking is unavailable until the budget is EVP-approved.
                    </div>
                  );
                }
                if (withinBudget) {
                  return (
                    <div className="bg-[#1D9E75]/5 border border-[#1D9E75]/20 rounded-lg p-3 text-xs text-[#1D9E75]">
                      Within budget — {fmtTHB(withinBudget.remaining)} remaining in {withinBudget.label} after this PO.
                    </div>
                  );
                }
                if (overrun) {
                  return (
                    <div className="border-2 border-[#EF9F27] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-[#EF9F27] shrink-0" />
                        <span className="text-sm font-semibold text-[#92650a]">Cost overrun warning</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <span className="text-gray-500">Category</span><span className="font-medium text-right">{overrun.categoryLabel}</span>
                        <span className="text-gray-500">Budget</span><span className="font-medium text-right">{fmtTHB(overrun.budgetAmt)}</span>
                        {overrun.voAdj > 0 && (
                          <>
                            <span className="text-gray-500">VO Adjustment</span><span className="font-medium text-right text-[#1D9E75]">+{fmtTHB(overrun.voAdj)}</span>
                            <span className="text-gray-500">Effective Budget</span><span className="font-medium text-right">{fmtTHB(overrun.effectiveBudget)}</span>
                          </>
                        )}
                        <span className="text-gray-500">Existing POs</span><span className="font-medium text-right">{fmtTHB(overrun.existingPOs)}</span>
                        <span className="text-gray-500">This PO</span><span className="font-medium text-right">{fmtTHB(overrun.newAmt)}</span>
                        <span className="text-gray-700 font-semibold border-t border-gray-200 pt-1">Total committed</span>
                        <span className="font-semibold text-[#E24B4A] text-right border-t border-gray-200 pt-1">{fmtTHB(overrun.totalCommitted)}</span>
                        <span className="text-[#E24B4A] font-semibold">Overrun</span>
                        <span className="font-bold text-[#E24B4A] text-right">{fmtTHB(overrun.overrunAmt)} ({overrun.overrunPct.toFixed(1)}% over)</span>
                      </div>
                      <p className="text-xs text-[#92650a] bg-[#EF9F27]/10 rounded p-2">
                        No approved Variation Order covers this. PSS will absorb this overrun as a real loss.
                      </p>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={overrunAcknowledged}
                          onChange={e => setOverrunAcknowledged(e.target.checked)}
                          className="mt-0.5 accent-[#EF9F27]"
                        />
                        <span className="text-xs text-gray-700">I understand this creates a cost overrun and confirm I want to proceed.</span>
                      </label>
                    </div>
                  );
                }
                return null;
              })()}
              {formError && <p className="text-xs text-[#E24B4A]">{formError}</p>}
            </div>
            <div className="px-5 py-4 border-t border-[rgba(0,0,0,0.08)] flex justify-end gap-2">
              <button onClick={() => { setShowNewPO(false); setFormError(''); setOverrunAcknowledged(false); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={submitPO}
                disabled={!!(computeOverrun() && !overrunAcknowledged)}
                className="px-4 py-2 bg-[#1D9E75] text-white text-sm rounded hover:bg-[#178a64] disabled:opacity-50 disabled:cursor-not-allowed"
              >Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
