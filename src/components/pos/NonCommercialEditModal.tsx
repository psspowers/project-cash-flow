import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PurchaseOrder } from '../../types';
import { logPOAction } from '../../services/workflow';

interface Props {
  po: PurchaseOrder;
  actorId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NonCommercialEditModal({ po, actorId, onClose, onSuccess }: Props) {
  const [description, setDescription] = useState(po.description ?? '');
  const [notes, setNotes] = useState(po.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);

    const changes: string[] = [];
    if (description !== (po.description ?? '')) {
      changes.push(`Description: From "${po.description ?? ''}" To "${description}"`);
    }
    if (notes !== (po.notes ?? '')) {
      changes.push(`Notes: From "${po.notes ?? ''}" To "${notes}"`);
    }

    if (changes.length === 0) {
      onClose();
      return;
    }

    const { error: updateError } = await supabase
      .from('purchase_orders')
      .update({ description, notes })
      .eq('id', po.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    await logPOAction(
      po.id,
      'non_commercial_edit',
      po.status,
      po.status,
      actorId,
      changes.join(' | '),
    );

    setSaving(false);
    onSuccess();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg border border-gray-200 shadow-xl">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Non-Commercial Edit</h2>
            <p className="text-xs text-gray-400 mt-0.5">{po.pss_po_no ?? 'No PO number'} — no re-approval required</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] resize-none placeholder-gray-300"
              placeholder="Scope of work or purchase description…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Internal Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] resize-none placeholder-gray-300"
              placeholder="Internal reference, contact name, clarifications…"
            />
          </div>

          {error && (
            <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/8 border border-[#E24B4A]/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#1D9E75] text-white text-xs font-medium rounded-lg hover:bg-[#178a65] transition-colors disabled:opacity-60"
            >
              {saving ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
              ) : (
                <Save size={12} />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
