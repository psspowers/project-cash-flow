import { useState } from 'react';
import { X, Receipt, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Project, CostCategory, COST_CATEGORY_LABELS } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface Props {
  projects: Project[];
  defaultProjectId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const COST_CATEGORIES: { value: CostCategory; label: string }[] = Object.entries(COST_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as CostCategory, label })
);

export default function NewExpenseModal({ projects, defaultProjectId, onClose, onSuccess }: Props) {
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    project_id: defaultProjectId ?? projects[0]?.id ?? '',
    cost_category: '01_civil' as CostCategory,
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    receipt_ref: '',
  });

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const amount = parseFloat(form.amount);
    if (!form.project_id) { setError('Please select a project.'); return; }
    if (!form.description.trim()) { setError('Please enter a description.'); return; }
    if (isNaN(amount) || amount <= 0) { setError('Please enter a valid amount greater than zero.'); return; }
    if (!form.expense_date) { setError('Please select an expense date.'); return; }

    setSubmitting(true);
    setError(null);

    const { error: insertError } = await supabase.from('project_expenses').insert({
      project_id: form.project_id,
      cost_category: form.cost_category,
      description: form.description.trim(),
      amount,
      expense_date: form.expense_date,
      receipt_ref: form.receipt_ref.trim() || null,
      submitted_by: profile.id,
      status: 'draft',
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onSuccess();
    }, 800);
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
              <h2 className="text-sm font-semibold text-gray-900">New Expense</h2>
              <p className="text-xs text-gray-400">Direct project cost entry</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle size={36} className="text-[#1D9E75]" />
            <p className="text-sm font-medium text-gray-700">Expense recorded successfully</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">

            {/* Project */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Project <span className="text-red-400">*</span></label>
              <select
                value={form.project_id}
                onChange={e => set('project_id', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800"
              >
                <option value="">Select project...</option>
                {projects
                  .filter(p => ['active', 'completed'].includes(p.status))
                  .map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name.split('–')[0].split('—')[0].trim()}
                    </option>
                  ))}
              </select>
            </div>

            {/* Cost Category */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Cost Category <span className="text-red-400">*</span></label>
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

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Description <span className="text-red-400">*</span></label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Amount (฿) <span className="text-red-400">*</span></label>
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
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Expense Date <span className="text-red-400">*</span></label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={e => set('expense_date', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 text-gray-800"
                />
              </div>
            </div>

            {/* Receipt Ref */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Receipt Reference <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={form.receipt_ref}
                onChange={e => set('receipt_ref', e.target.value)}
                placeholder="Receipt no. or reference"
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
                Save Expense
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
