import { useState, useEffect } from 'react';
import { X, CreditCard as Edit2, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PurchaseOrder, Project, Entity, POMilestone, POSimplePayment, COST_CATEGORY_LABELS, fmtTHB } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../../config/roles';
import Badge, { statusVariant } from '../ui/Badge';
import { formatDate } from '../../utils/formatters';
import POCreationWizard from './POCreationWizard';

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

export default function PODetailModal({ po, projects, vendors, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [milestones, setMilestones] = useState<POMilestone[]>([]);
  const [payments, setPayments] = useState<POSimplePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittedBy, setSubmittedBy] = useState<AuditProfile | null>(null);
  const [approvedBy, setApprovedBy] = useState<AuditProfile | null>(null);
  const [rejectedBy, setRejectedBy] = useState<AuditProfile | null>(null);

  const canEdit = hasRole(profile?.role, PROCUREMENT_WRITE_ROLES) &&
    (po.status === 'draft' || po.status === 'pending_approval');

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

    // Load audit trail profiles
    const ids = [po.submitted_by, po.approved_by, po.rejected_by].filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, full_name')
        .in('id', ids);
      const profileMap = new Map((profiles as AuditProfile[] ?? []).map(p => [p.id, p]));
      setSubmittedBy(po.submitted_by ? (profileMap.get(po.submitted_by) ?? null) : null);
      setApprovedBy(po.approved_by ? (profileMap.get(po.approved_by) ?? null) : null);
      setRejectedBy(po.rejected_by ? (profileMap.get(po.rejected_by) ?? null) : null);
    }
    setLoading(false);
  }

  const supplierName = (po.vendor as Entity | undefined)?.name
    ?? vendors.find(v => v.id === po.vendor_id)?.name
    ?? po.supplier_name_raw
    ?? '—';

  const projectName = (po.project as Project | undefined)?.name
    ?? projects.find(p => p.id === po.project_id)?.name
    ?? '—';

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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-2xl border border-gray-200 my-4">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-semibold text-gray-900">
                {po.pss_po_no ?? <span className="italic text-gray-400 font-normal text-sm">No PSS No. yet</span>}
              </h2>
              <Badge label={po.status.replace(/_/g, ' ')} variant={statusVariant(po.status)} />
              {po.status === 'pending_approval' && (
                <span className="text-xs text-[#EF9F27] bg-[#EF9F27]/10 px-2 py-0.5 rounded-full font-medium">
                  Awaiting approval
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{projectName}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {canEdit && (
              <button
                onClick={() => setMode('edit')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f1923] text-white text-xs font-medium rounded-lg hover:bg-[#1a2b3c] transition-colors"
              >
                <Edit2 size={12} />
                Edit PO
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-6">

            {/* Warning for pending_approval + can edit */}
            {canEdit && po.status === 'pending_approval' && (
              <div className="flex items-start gap-2 bg-[#EF9F27]/10 border border-[#EF9F27]/30 rounded-lg p-3">
                <AlertTriangle size={14} className="text-[#EF9F27] mt-0.5 shrink-0" />
                <p className="text-xs text-[#92650a]">
                  This PO is awaiting approval. You may still edit it — doing so will return it to Draft and require re-submission.
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

            {/* Core details — two columns */}
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
            {po.has_supplier_milestones && milestones.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">{milestones.length} Milestones</p>
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
                        <tr key={m.id} className="border-b border-gray-50">
                          <td className="px-3 py-2 font-semibold text-gray-700">MS{m.milestone_number}</td>
                          <td className="px-3 py-2 text-gray-600">{m.notes ?? '—'}</td>
                          <td className="px-3 py-2 text-right text-gray-700">{m.milestone_pct != null ? `${(m.milestone_pct * 100).toFixed(0)}%` : '—'}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-800">{fmtTHB(m.amount_due)}</td>
                          <td className="px-3 py-2 text-gray-500">{formatDate(m.planned_payment_date)}</td>
                          <td className="px-3 py-2">
                            <Badge
                              label={m.status}
                              variant={m.status === 'paid' ? 'green' : m.status === 'invoiced' ? 'amber' : 'gray'}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
        )}
      </div>
    </div>
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
