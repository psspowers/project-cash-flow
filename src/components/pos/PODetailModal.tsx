import { useState, useEffect } from 'react';
import { X, CreditCard as Edit2, Clock, CheckCircle, XCircle, AlertTriangle, GitBranch } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PurchaseOrder, Project, Entity, POMilestone, POSimplePayment, POAuditLog, COST_CATEGORY_LABELS, fmtTHB } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../../config/roles';
import Badge, { statusVariant } from '../ui/Badge';
import { formatDate } from '../../utils/formatters';
import POCreationWizard from './POCreationWizard';
import AmendmentChoiceModal from './AmendmentChoiceModal';
import NonCommercialEditModal from './NonCommercialEditModal';
import { logPOAction } from '../../services/workflow';
import CommentThread from '../ui/CommentThread';
import WorkflowTimeline from './WorkflowTimeline';

interface Props {
  po: PurchaseOrder;
  projects: Project[];
  vendors: Entity[];
  onClose: () => void;
  onSuccess: () => void;
}

interface AuditProfile {
  id: string;
  full_name: string;
}

type ModalMode = 'view' | 'edit' | 'amend_choice' | 'amend_non_commercial' | 'amend_commercial';

const ISSUED_STATUSES = new Set(['approved', 'partially_paid', 'fully_paid']);

export default function PODetailModal({ po, projects, vendors, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<ModalMode>('view');
  const [milestones, setMilestones] = useState<POMilestone[]>([]);
  const [payments, setPayments] = useState<POSimplePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedBy, setSubmittedBy] = useState<AuditProfile | null>(null);
  const [approvedBy, setApprovedBy] = useState<AuditProfile | null>(null);
  const [rejectedBy, setRejectedBy] = useState<AuditProfile | null>(null);
  const [activeRevisionId, setActiveRevisionId] = useState<string | null>(null);
  const [activeRevisionPo, setActiveRevisionPo] = useState<PurchaseOrder | null>(null);
  const [activeRevisionActorMap, setActiveRevisionActorMap] = useState<Map<string, string>>(new Map());
  const [viewingRevision, setViewingRevision] = useState(false);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const [commercialDraftPo, setCommercialDraftPo] = useState<PurchaseOrder | null>(null);
  const [amendError, setAmendError] = useState<string | null>(null);
  const [creatingRevision, setCreatingRevision] = useState(false);
  const [auditActorMap, setAuditActorMap] = useState<Map<string, string>>(new Map());

  const isIssued = ISSUED_STATUSES.has(po.status);
  const canEdit = hasRole(profile?.role, PROCUREMENT_WRITE_ROLES) &&
    (po.status === 'draft' || po.status === 'pending_cc');
  const canAmend = hasRole(profile?.role, PROCUREMENT_WRITE_ROLES) && isIssued;

  useEffect(() => {
    loadDetails();
  }, [po.id]);

  async function loadDetails() {
    setLoading(true);

    const [milestonesRes, paymentsRes] = await Promise.all([
      supabase.from('po_milestones').select('*').eq('purchase_order_id', po.id).order('milestone_number'),
      supabase.from('po_simple_payments').select('*').eq('purchase_order_id', po.id).order('payment_month'),
    ]);
    setMilestones((milestonesRes.data as POMilestone[]) ?? []);
    setPayments((paymentsRes.data as POSimplePayment[]) ?? []);

    // Check for active revision child POs (lock detection) — fetch full PO for timeline
    const { data: revisions } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('parent_po_id', po.id)
      .not('status', 'in', '(voided,cancelled)')
      .order('version', { ascending: false })
      .limit(1);

    const revPo = revisions && revisions.length > 0 ? (revisions[0] as PurchaseOrder) : null;
    setActiveRevisionId(revPo ? revPo.id : null);
    setActiveRevisionPo(revPo);

    // Fetch audit log for the revision PO so we can show its timeline with actor names
    if (revPo) {
      const { data: revAuditRows } = await supabase
        .from('po_audit_log')
        .select('to_status, actor_id')
        .eq('po_id', revPo.id)
        .order('created_at', { ascending: true });
      const revLogs = (revAuditRows as Pick<POAuditLog, 'to_status' | 'actor_id'>[] | null) ?? [];
      const revActorIds = Array.from(new Set(revLogs.map(r => r.actor_id).filter(Boolean)));
      let revNameMap = new Map<string, string>();
      if (revActorIds.length > 0) {
        const { data: revProfiles } = await supabase
          .from('user_profiles')
          .select('id, full_name')
          .in('id', revActorIds);
        revNameMap = new Map((revProfiles as AuditProfile[] ?? []).map(p => [p.id, p.full_name]));
      }
      const revActorMap = new Map<string, string>();
      for (const row of revLogs) {
        const name = revNameMap.get(row.actor_id);
        if (name) revActorMap.set(row.to_status, name);
      }
      setActiveRevisionActorMap(revActorMap);
    }

    // Fetch audit log to build per-step actor map
    const { data: auditRows } = await supabase
      .from('po_audit_log')
      .select('to_status, actor_id')
      .eq('po_id', po.id)
      .order('created_at', { ascending: true });

    const auditLogs = (auditRows as Pick<POAuditLog, 'to_status' | 'actor_id'>[] | null) ?? [];

    // Collect all unique actor IDs (audit log + direct PO fields)
    const allActorIds = Array.from(new Set([
      ...auditLogs.map(r => r.actor_id),
      po.submitted_by,
      po.approved_by,
      po.rejected_by,
    ].filter(Boolean) as string[]));

    let profileNameMap = new Map<string, string>();
    if (allActorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', allActorIds);
      profileNameMap = new Map((profiles as AuditProfile[] ?? []).map(p => [p.id, p.full_name]));
    }

    // Map to_status → actor full_name (last entry wins for each status)
    const actorMap = new Map<string, string>();
    for (const row of auditLogs) {
      const name = profileNameMap.get(row.actor_id);
      if (name) actorMap.set(row.to_status, name);
    }
    setAuditActorMap(actorMap);

    const profileMap = new Map((
      allActorIds
        .map(id => ({ id, full_name: profileNameMap.get(id) ?? '' }))
        .filter(p => p.full_name)
    ).map(p => [p.id, p as AuditProfile]));

    setSubmittedBy(po.submitted_by ? (profileMap.get(po.submitted_by) ?? null) : null);
    setApprovedBy(po.approved_by ? (profileMap.get(po.approved_by) ?? null) : null);
    setRejectedBy(po.rejected_by ? (profileMap.get(po.rejected_by) ?? null) : null);
    setLoading(false);
  }

  async function handleCommercialAmendment() {
    if (!profile) return;
    setCreatingRevision(true);
    setAmendError(null);

    // Fetch the full original PO record
    const { data: original, error: fetchError } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', po.id)
      .maybeSingle();

    if (fetchError || !original) {
      setAmendError(fetchError?.message ?? 'Failed to load PO data.');
      setCreatingRevision(false);
      return;
    }

    const newVersion = (original.version ?? 1) + 1;

    const { data: newPO, error: insertError } = await supabase
      .from('purchase_orders')
      .insert({
        project_id: original.project_id,
        vendor_id: original.vendor_id,
        description: original.description,
        cost_category: original.cost_category,
        po_amount_excl_vat: original.po_amount_excl_vat,
        vat_7pct: original.vat_7pct,
        po_amount_incl_vat: original.po_amount_incl_vat,
        wht_applies: original.wht_applies,
        wht_3pct: original.wht_3pct,
        wht_applicable: original.wht_applicable,
        wht_rate: original.wht_rate,
        has_supplier_milestones: original.has_supplier_milestones,
        supplier_name_raw: original.supplier_name_raw,
        notes: original.notes,
        status: 'draft_revision',
        version: newVersion,
        parent_po_id: po.id,
        revision_reason: null,
        pss_po_no: null,
        pending_invoice_amount: 0,
        pending_remaining_amount: 0,
      })
      .select('*')
      .single();

    if (insertError || !newPO) {
      setAmendError(insertError?.message ?? 'Failed to create revision draft.');
      setCreatingRevision(false);
      return;
    }

    // Copy milestones if applicable
    if (original.has_supplier_milestones && milestones.length > 0) {
      await supabase.from('po_milestones').insert(
        milestones.map(m => ({
          purchase_order_id: newPO.id,
          milestone_number: m.milestone_number,
          milestone_pct: m.milestone_pct,
          amount_due: m.amount_due,
          planned_payment_date: m.planned_payment_date ?? null,
          notes: m.notes ?? null,
          status: 'pending',
          paid_amount: 0,
        }))
      );
    } else if (!original.has_supplier_milestones && payments.length > 0) {
      await supabase.from('po_simple_payments').insert(
        payments.map(p => ({
          purchase_order_id: newPO.id,
          payment_month: p.payment_month,
          amount: p.amount,
        }))
      );
    }

    await logPOAction(
      newPO.id,
      'revision_created',
      null,
      'draft_revision',
      profile.id,
      `Commercial amendment of ${po.pss_po_no ?? po.id} (v${original.version ?? 1} → v${newVersion})`,
    );

    await logPOAction(
      po.id,
      'amendment_initiated',
      po.status,
      po.status,
      profile.id,
      `Commercial amendment draft created (revision v${newVersion}, id: ${newPO.id})`,
    );

    setCommercialDraftPo(newPO as PurchaseOrder);
    setCreatingRevision(false);
    setMode('amend_commercial');
  }

  async function submitRevisionDraft() {
    if (!profile || !activeRevisionPo) return;
    setSubmittingRevision(true);
    setAmendError(null);

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'pending_revision_approval',
        submitted_by: profile.id,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', activeRevisionPo.id);

    if (error) {
      setAmendError(error.message);
      setSubmittingRevision(false);
      return;
    }

    await logPOAction(
      activeRevisionPo.id,
      'revision_submitted',
      'draft_revision',
      'pending_revision_approval',
      profile.id,
      `Amendment v${activeRevisionPo.version} submitted for EVP approval`,
    );

    // Notify EVP
    const evp = await (async () => {
      const { data } = await supabase.from('user_profiles').select('id').eq('role', 'evp').maybeSingle();
      return data as { id: string } | null;
    })();
    if (evp) {
      await supabase.from('notifications').insert({
        user_id: evp.id,
        title: `Amendment ready for approval — ${projectName}`,
        message: `A revised purchase order (v${activeRevisionPo.version}) for "${activeRevisionPo.description}" has been submitted for your approval.`,
        type: 'alert',
        is_read: false,
        related_entity_type: 'purchase_order',
        related_entity_id: activeRevisionPo.id,
      });
    }

    setSubmittingRevision(false);
    onSuccess(); // reload parent list so status refreshes
  }

  // Which PO to actually display — parent or its active revision
  const displayPo = viewingRevision && activeRevisionPo ? activeRevisionPo : po;
  const displayActorMap = viewingRevision && activeRevisionPo ? activeRevisionActorMap : auditActorMap;

  function revisionRoleLabel(status: string): { action: string; role: string } {
    if (status === 'draft_revision') return { action: 'Submit amendment draft', role: 'Procurement' };
    if (status === 'pending_revision_approval' || status === 'pending_evp') return { action: 'Approve amendment', role: 'EVP' };
    if (status === 'pending_ceo') return { action: 'Approve amendment', role: 'CEO' };
    return { action: 'Review', role: status.replace(/_/g, ' ') };
  }

  const supplierName = (displayPo.vendor as Entity | undefined)?.name
    ?? vendors.find(v => v.id === displayPo.vendor_id)?.name
    ?? displayPo.supplier_name_raw
    ?? '—';

  const projectName = (displayPo.project as Project | undefined)?.name
    ?? projects.find(p => p.id === displayPo.project_id)?.name
    ?? '—';

  // ── Commercial amendment wizard ──────────────────────────────────────────────
  if (mode === 'amend_commercial' && commercialDraftPo) {
    return (
      <POCreationWizard
        projects={projects}
        vendors={vendors}
        editPo={commercialDraftPo}
        onClose={() => { setMode('view'); setCommercialDraftPo(null); }}
        onSuccess={() => { onSuccess(); }}
      />
    );
  }

  // ── Standard edit wizard (draft / pending_cc) ──────────────────────────
  if (mode === 'edit') {
    return (
      <POCreationWizard
        projects={projects}
        vendors={vendors}
        editPo={po}
        onClose={() => setMode('view')}
        onSuccess={() => { onSuccess(); }}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-xl w-full max-w-5xl border border-gray-200 my-4 flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>

          {/* Header */}
          <div className="px-6 pt-4 pb-3 border-b border-gray-100 shrink-0 space-y-3">
            {/* Back breadcrumb when viewing the revision */}
            {viewingRevision && (
              <button
                onClick={() => setViewingRevision(false)}
                className="flex items-center gap-1 text-xs text-[#1D9E75] hover:text-[#178a63] transition-colors -mb-1"
              >
                <span className="text-base leading-none">←</span>
                Back to {po.pss_po_no ?? 'original PO'}
              </button>
            )}

            {/* Row 1: title + actions */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-base font-semibold text-gray-900">
                    {displayPo.pss_po_no ?? <span className="italic text-gray-400 font-normal text-sm">No PSS No. yet</span>}
                  </h2>
                  <Badge label={displayPo.status.replace(/_/g, ' ')} variant={statusVariant(displayPo.status)} />
                  {displayPo.status === 'pending_cc' && (
                    <span className="text-xs text-[#EF9F27] bg-[#EF9F27]/10 px-2 py-0.5 rounded-full font-medium">
                      Awaiting approval
                    </span>
                  )}
                  {displayPo.version > 1 && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
                      v{displayPo.version}
                    </span>
                  )}
                  {viewingRevision && (
                    <span className="text-xs text-[#EF9F27] bg-[#EF9F27]/10 px-2 py-0.5 rounded-full font-medium">
                      Amendment
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{projectName}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Submit amendment draft for approval */}
                {viewingRevision && activeRevisionPo?.status === 'draft_revision' && hasRole(profile?.role, PROCUREMENT_WRITE_ROLES) && (
                  <button
                    onClick={submitRevisionDraft}
                    disabled={submittingRevision}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1D9E75] text-white text-xs font-medium rounded-lg hover:bg-[#178a63] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submittingRevision ? (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircle size={12} />
                    )}
                    Submit for Approval
                  </button>
                )}
                {canEdit && !viewingRevision && (
                  <button
                    onClick={() => setMode('edit')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f1923] text-white text-xs font-medium rounded-lg hover:bg-[#1a2b3c] transition-colors"
                  >
                    <Edit2 size={12} />
                    Edit PO
                  </button>
                )}
                {canAmend && !viewingRevision && (
                  <button
                    onClick={() => setMode('amend_choice')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f1923] text-white text-xs font-medium rounded-lg hover:bg-[#1a2b3c] transition-colors"
                  >
                    <GitBranch size={12} />
                    Amend PO
                  </button>
                )}
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Row 2: workflow timeline — shows the relevant PO's path */}
            <WorkflowTimeline po={displayPo} auditActorMap={displayActorMap} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            /* 2-col grid: details left, chat right */
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

              {/* ── LEFT: PO details (scrollable) ─────────────────────────── */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 lg:border-r lg:border-gray-100">

                {/* Active revision warning — shows who holds the ball */}
                {isIssued && activeRevisionPo && !viewingRevision && (() => {
                  const { action, role } = revisionRoleLabel(activeRevisionPo.status);
                  return (
                    <div className="flex items-start gap-2.5 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg p-3">
                      <AlertTriangle size={14} className="text-[#EF9F27] mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#92650a] mb-0.5">
                          Commercial amendment in progress
                          <span className="ml-1.5 font-normal text-[#EF9F27]">(v{activeRevisionPo.version})</span>
                        </p>
                        <p className="text-xs text-[#92650a]">
                          Next action:{' '}
                          <span className="font-semibold">{action}</span>
                          <span className="mx-1 text-[#EF9F27]">·</span>
                          <span className="font-semibold">{role}</span>
                        </p>
                        <p className="text-[10px] text-[#92650a]/70 mt-0.5">
                          Commercial edits are locked until the amendment is resolved.
                        </p>
                      </div>
                      <button
                        onClick={() => setViewingRevision(true)}
                        className="shrink-0 text-[10px] font-semibold text-[#EF9F27] bg-white border border-[#EF9F27]/40 px-2.5 py-1.5 rounded-lg hover:bg-[#EF9F27]/10 transition-colors whitespace-nowrap"
                      >
                        View Active Amendment
                      </button>
                    </div>
                  );
                })()}

                {/* Warning for pending_cc + can edit */}
                {canEdit && po.status === 'pending_cc' && (
                  <div className="flex items-start gap-2 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg p-3">
                    <AlertTriangle size={14} className="text-[#EF9F27] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#92650a]">
                      This PO is awaiting approval. You may still edit it — doing so will return it to Draft and require re-submission.
                    </p>
                  </div>
                )}

                {/* Revision draft notice */}
                {po.status === 'draft_revision' && po.parent_po_id && (
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <GitBranch size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700">
                      This is a commercial amendment draft. Edit and resubmit through the approval chain.
                    </p>
                  </div>
                )}

                {/* Rejection notice */}
                {po.rejection_reason && (
                  <div className="flex items-start gap-2 bg-[#E24B4A]/8 border border-[#E24B4A]/20 rounded-lg p-3">
                    <XCircle size={14} className="text-[#E24B4A] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-[#E24B4A] mb-0.5">Rejection reason</p>
                      <p className="text-xs text-gray-700">{po.rejection_reason}</p>
                    </div>
                  </div>
                )}

                {/* Amendment error */}
                {amendError && (
                  <div className="flex items-start gap-2 bg-[#E24B4A]/8 border border-[#E24B4A]/20 rounded-lg p-3">
                    <XCircle size={14} className="text-[#E24B4A] mt-0.5 shrink-0" />
                    <p className="text-xs text-[#E24B4A]">{amendError}</p>
                  </div>
                )}

                {/* Core details */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-0.5">Supplier</p>
                    <p className="text-gray-800">{supplierName}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-0.5">Cost Category</p>
                    <p className="text-gray-800">{COST_CATEGORY_LABELS[po.cost_category] ?? po.cost_category}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-medium text-gray-400 mb-0.5">Description</p>
                    <p className="text-gray-800">{po.description || '—'}</p>
                  </div>
                  {po.notes && (
                    <div className="col-span-2">
                      <p className="text-xs font-medium text-gray-400 mb-0.5">Notes</p>
                      <p className="text-gray-700 text-sm">{po.notes}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-0.5">PO Type</p>
                    <p className="text-gray-800">{po.has_supplier_milestones ? 'Milestone PO' : 'Simple PO'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-0.5">WHT 3%</p>
                    <p className="text-gray-800">{po.wht_applies ? 'Applies' : 'Not applicable'}</p>
                  </div>
                </div>

                {/* Financials */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Contract excl. VAT</span>
                    <span className="font-medium text-gray-800">{fmtTHB(po.po_amount_excl_vat)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>VAT 7%</span>
                    <span>{fmtTHB(po.vat_7pct)}</span>
                  </div>
                  {po.wht_applies && (
                    <div className="flex justify-between text-sm text-[#EF9F27]">
                      <span>WHT 3% (withheld)</span>
                      <span>{fmtTHB(po.wht_3pct)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200 text-base">
                    <span>Total incl. VAT</span>
                    <span>{fmtTHB(po.po_amount_incl_vat)}</span>
                  </div>
                  {po.wht_applies && (
                    <div className="flex justify-between text-xs text-gray-400 border-t border-gray-100 pt-1">
                      <span>Net payable after WHT</span>
                      <span>{fmtTHB(po.po_amount_incl_vat - po.wht_3pct)}</span>
                    </div>
                  )}
                </div>

                {/* Milestones */}
                {po.has_supplier_milestones && milestones.length > 0 && (() => {
                  const paidCount = milestones.filter(m => m.status === 'paid').length;
                  const invoicedCount = milestones.filter(m => m.status === 'invoiced').length;
                  const paidAmt = milestones.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount_due, 0);
                  const totalAmt = milestones.reduce((s, m) => s + m.amount_due, 0);
                  const paidPct = totalAmt > 0 ? (paidAmt / totalAmt) * 100 : 0;
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-600">{milestones.length} Milestones</p>
                        <span className="text-xs text-gray-400">
                          {paidCount} paid · {invoicedCount} invoiced · {milestones.length - paidCount - invoicedCount} pending
                        </span>
                      </div>
                      <div className="mb-3 space-y-1">
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-[#1D9E75] rounded-full transition-all duration-500"
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span className="text-[#1D9E75] font-medium">{fmtTHB(paidAmt)} paid</span>
                          <span>{fmtTHB(totalAmt - paidAmt)} remaining</span>
                        </div>
                      </div>
                      <div className="border border-gray-100 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                              <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-500">Description</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">%</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-500">Amount</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-500">Planned</th>
                              <th className="text-left px-3 py-2 font-medium text-gray-500">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {milestones.map(m => (
                              <tr
                                key={m.id}
                                className={`border-b border-gray-50 ${m.status === 'paid' ? 'bg-[#1D9E75]/[0.03]' : ''}`}
                              >
                                <td className="px-3 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    {m.status === 'paid'
                                      ? <CheckCircle size={12} className="text-[#1D9E75] shrink-0" />
                                      : <span className="w-3 h-3 rounded-full border-2 border-gray-200 shrink-0 inline-block" />
                                    }
                                    <span className="font-semibold text-gray-700">MS{m.milestone_number}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-gray-600">{m.notes ?? '—'}</td>
                                <td className="px-3 py-2.5 text-right text-gray-700">{m.milestone_pct != null && m.milestone_pct > 0 ? `${(m.milestone_pct * 100).toFixed(0)}%` : '—'}</td>
                                <td className="px-3 py-2.5 text-right font-medium text-gray-800 tabular-nums">{fmtTHB(m.amount_due)}</td>
                                <td className="px-3 py-2.5 text-gray-500">{formatDate(m.planned_payment_date) || '—'}</td>
                                <td className="px-3 py-2.5">
                                  <Badge
                                    label={m.status}
                                    variant={m.status === 'paid' ? 'green' : m.status === 'invoiced' ? 'amber' : 'gray'}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-100 bg-gray-50">
                              <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-gray-600">Total</td>
                              <td className="px-3 py-2 text-right text-xs font-bold text-gray-900 tabular-nums">{fmtTHB(totalAmt)}</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}

                {/* Simple payment schedule */}
                {!po.has_supplier_milestones && payments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">Payment Schedule</p>
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-100">
                            <th className="text-left px-3 py-2 font-medium text-gray-500">Payment Month</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-500">Amount (incl VAT)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map(p => (
                            <tr key={p.id} className="border-b border-gray-50">
                              <td className="px-3 py-2 text-gray-600">{p.payment_month ? p.payment_month.substring(0, 7) : '—'}</td>
                              <td className="px-3 py-2 text-right font-medium text-gray-800">{fmtTHB(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Audit trail */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-3">Audit Trail</p>
                  <div className="space-y-2">
                    <AuditRow
                      icon={<Clock size={13} className="text-gray-400" />}
                      label="Created"
                      name={null}
                      date={po.created_at}
                    />
                    {po.submitted_at && (
                      <AuditRow
                        icon={<Clock size={13} className="text-[#EF9F27]" />}
                        label="Submitted for approval"
                        name={submittedBy?.full_name ?? null}
                        date={po.submitted_at}
                      />
                    )}
                    {po.approved_at && (
                      <AuditRow
                        icon={<CheckCircle size={13} className="text-[#1D9E75]" />}
                        label="Approved"
                        name={approvedBy?.full_name ?? null}
                        date={po.approved_at}
                      />
                    )}
                    {po.rejected_at && (
                      <AuditRow
                        icon={<XCircle size={13} className="text-[#E24B4A]" />}
                        label="Rejected"
                        name={rejectedBy?.full_name ?? null}
                        date={po.rejected_at}
                      />
                    )}
                  </div>
                </div>

              </div>

              {/* ── RIGHT: Chat panel ──────────────────────────────────────── */}
              <div className="w-full lg:w-[340px] shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-gray-100 min-h-[420px] lg:min-h-0">
                <CommentThread entityType="purchase_order" entityId={po.id} entityLabel={po.pss_po_no ?? undefined} />
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Amendment choice overlay */}
      {mode === 'amend_choice' && (
        <AmendmentChoiceModal
          poNumber={po.pss_po_no}
          isLocked={activeRevisionId !== null}
          onSelectNonCommercial={() => setMode('amend_non_commercial')}
          onSelectCommercial={handleCommercialAmendment}
          onClose={() => setMode('view')}
        />
      )}

      {/* Non-commercial edit overlay */}
      {mode === 'amend_non_commercial' && profile && (
        <NonCommercialEditModal
          po={po}
          actorId={profile.id}
          onClose={() => setMode('view')}
          onSuccess={() => { onSuccess(); }}
        />
      )}

      {/* Creating revision spinner overlay */}
      {creatingRevision && (
        <div className="fixed inset-0 bg-black/20 z-[60] flex items-center justify-center">
          <div className="bg-white rounded-xl px-6 py-5 flex items-center gap-3 shadow-xl border border-gray-200">
            <div className="w-5 h-5 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-700">Creating revision draft…</p>
          </div>
        </div>
      )}
    </>
  );
}

function AuditRow({ icon, label, name, date }: { icon: React.ReactNode; label: string; name: string | null; date: string }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-gray-600">
      <span className="shrink-0">{icon}</span>
      <span className="font-medium">{label}</span>
      {name && <span className="text-gray-400">by <span className="text-gray-600">{name}</span></span>}
      <span className="text-gray-400 ml-auto shrink-0">{formatDate(date)}</span>
    </div>
  );
}
