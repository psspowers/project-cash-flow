import { useState } from 'react';
import { X, Receipt, AlertCircle, CheckCircle, Building2, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  Project, Entity, CostCategory, COST_CATEGORY_LABELS,
  SgaSubcategory, SGA_SUBCATEGORY_LABELS,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import VendorCombobox from '../ui/VendorCombobox';

interface Props {
  projects: Project[];
  vendors: Entity[];
  defaultProjectId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const COST_CATEGORIES: { value: CostCategory; label: string }[] = Object.entries(COST_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as CostCategory, label })
);

const SGA_SUBCATEGORIES: { value: SgaSubcategory; label: string }[] = Object.entries(SGA_SUBCATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as SgaSubcategory, label })
);

export default function NewExpenseModal({ projects, vendors, defaultProjectId, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const overheadProjects = projects.filter(p => p.project_type === 'overhead');
  const constructionProjects = projects.filter(
    p => p.project_type !== 'overhead' && ['active', 'completed'].includes(p.status)
  );

  const initialProjectId = defaultProjectId ?? overheadProjects[0]?.id ?? constructionProjects[0]?.id ?? '';

  const [form, setForm] = useState({
    project_id: initialProjectId,
    vendor_id: '',
    cost_category: '01_civil' as CostCategory,
    sga_subcategory: 'office_admin' as SgaSubcategory,
    description: '',
    amount: '',
    invoice_date: new Date().toISOString().split('T')[0],
    vendor_invoice_no: '',
  });

  const isOverhead = overheadProjects.some(p => p.id === form.project_id);

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    setError(null);
  }

  function handleProjectChange(projectId: string) {
    setForm(prev => ({ ...prev, project_id: projectId }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const amount = parseFloat(form.amount);
    if (!form.project_id) { setError('Please select an account.'); return; }
    if (!form.vendor_id) { setError('Please select a vendor.'); return; }
    if (!form.description.trim()) { setError('Please enter a description.'); return; }
    if (isNaN(amount) || amount <= 0) { setError('Please enter a valid amount greater than zero.'); return; }
    if (!form.invoice_date) { setError('Please select an invoice date.'); return; }

    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from('vendor_invoices').insert({
      po_id: null,
      project_id: form.project_id,
      vendor_id: form.vendor_id,
      cost_category: isOverhead ? null : form.cost_category,
      sga_subcategory: isOverhead ? form.sga_subcategory : null,
      description: form.description.trim(),
      invoice_amount_incl_vat: amount,
      received_amount: 0,
      wht_3pct: 0,
      net_payable: amount,
      invoice_date: form.invoice_date,
      vendor_invoice_no: form.vendor_invoice_no.trim() || null,
      status: 'received',
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => { onSuccess(); }, 800);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg border border-gray-200 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1D9E75]/10 flex items-center justify-center">
              <Receipt size={16} className="text-[#1D9E75]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">New Direct Bill / Expense</h2>
              <p className="text-xs text-gray-400">Direct vendor invoice — routed to CM for review</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle size={36} className="text-[#1D9E75]" />
            <p className="text-sm font-medium text-gray-700">Invoice logged — pending CM review</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">

            {/* Account selector */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Account <span className="text-red-400">*</span>
              </label>
              <select
                value={form.project_id}
                onChange={e => handleProjectChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800"
              >
                <option value="">Select account...</option>

                {overheadProjects.length > 0 && (
                  <optgroup label="SG&A / Overhead">
                    {overheadProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )}

                {constructionProjects.length > 0 && (
                  <optgroup label="Construction Projects">
                    {constructionProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name.split('–')[0].split('—')[0].trim()}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {form.project_id && (
                <div className={`flex items-center gap-1.5 mt-1.5 text-[11px] font-medium ${
                  isOverhead ? 'text-amber-600' : 'text-[#1D9E75]'
                }`}>
                  {isOverhead
                    ? <><Building2 size={11} /> SG&A overhead — select an expense type below</>
                    : <><Layers size={11} /> Construction project — select a cost category below</>
                  }
                </div>
              )}
            </div>

            {/* Classification */}
            {isOverhead ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Expense Type <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.sga_subcategory}
                  onChange={e => set('sga_subcategory', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-amber-200 rounded-lg bg-amber-50/40 focus:outline-none focus:ring-2 focus:ring-amber-400/30 text-gray-800"
                >
                  {SGA_SUBCATEGORIES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Cost Category <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.cost_category}
                  onChange={e => set('cost_category', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800"
                >
                  {COST_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Vendor / Supplier */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Vendor / Supplier <span className="text-red-400">*</span>
              </label>
              <VendorCombobox
                vendors={vendors}
                value={form.vendor_id}
                onChange={id => set('vendor_id', id)}
                placeholder="Select vendor..."
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Description <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Brief description of the expense"
                maxLength={300}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800 placeholder-gray-400"
              />
            </div>

            {/* Amount + Date row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Amount (฿) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800 placeholder-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Invoice Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.invoice_date}
                  onChange={e => set('invoice_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800"
                />
              </div>
            </div>

            {/* Invoice Ref */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Supplier Invoice No. <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.vendor_invoice_no}
                onChange={e => set('vendor_invoice_no', e.target.value)}
                placeholder="e.g. INV-2026-001"
                maxLength={100}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800 placeholder-gray-400"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-[#0f1923] text-white text-sm font-medium rounded-lg hover:bg-[#1a2b3c] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting && (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Log Bill
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
