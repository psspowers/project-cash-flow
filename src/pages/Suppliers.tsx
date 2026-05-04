import { useEffect, useState } from 'react';
import { Plus, Search, Pencil, X, Check, Building2, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../config/roles';

interface Supplier {
  id: string;
  name: string;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  is_related_party: boolean;
  is_active: boolean;
  created_at: string;
}

interface SupplierFormData {
  name: string;
  tax_id: string;
  phone: string;
  email: string;
  is_related_party: boolean;
}

const EMPTY_FORM: SupplierFormData = {
  name: '',
  tax_id: '',
  phone: '',
  email: '',
  is_related_party: false,
};

export default function Suppliers() {
  const { profile } = useAuth();
  const canWrite = hasRole(profile?.role, PROCUREMENT_WRITE_ROLES);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate confirm state
  const [confirmToggleId, setConfirmToggleId] = useState<string | null>(null);

  useEffect(() => { loadSuppliers(); }, []);

  async function loadSuppliers() {
    const { data } = await supabase
      .from('entities')
      .select('id, name, tax_id, phone, email, is_related_party, is_active, created_at')
      .eq('type', 'vendor')
      .order('name');
    setSuppliers((data as Supplier[]) || []);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      tax_id: s.tax_id ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      is_related_party: s.is_related_party,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError('Supplier name is required.');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      tax_id: form.tax_id.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      is_related_party: form.is_related_party,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('entities').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('entities').insert({ ...payload, type: 'vendor', is_active: true }));
    }

    if (error) {
      setFormError(error.message);
    } else {
      closeModal();
      await loadSuppliers();
    }
    setSaving(false);
  }

  async function handleToggleActive(supplier: Supplier) {
    await supabase.from('entities').update({ is_active: !supplier.is_active }).eq('id', supplier.id);
    setConfirmToggleId(null);
    await loadSuppliers();
  }

  const filtered = suppliers.filter(s => {
    if (!showInactive && !s.is_active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.tax_id ?? '').toLowerCase().includes(q) ||
      (s.phone ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q)
    );
  });

  const activeCount = suppliers.filter(s => s.is_active).length;
  const inactiveCount = suppliers.filter(s => !s.is_active).length;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active{inactiveCount > 0 ? ` · ${inactiveCount} inactive` : ''}
          </p>
        </div>
        {canWrite && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors"
          >
            <Plus size={16} />
            Add Supplier
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 w-full"
          />
        </div>
        {inactiveCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-[#1D9E75] focus:ring-[#1D9E75]/30"
            />
            Show inactive ({inactiveCount})
          </label>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Supplier Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tax ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              {canWrite && <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 7 : 6} className="text-center py-12 text-gray-400 text-sm">
                  No suppliers found
                </td>
              </tr>
            ) : filtered.map(s => (
              <tr
                key={s.id}
                className={`border-b border-gray-50 transition-colors ${
                  s.is_active ? 'hover:bg-gray-50/50' : 'opacity-50 bg-gray-50/30'
                }`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                      <Building2 size={13} className="text-gray-400" />
                    </div>
                    <span className={`text-sm font-medium ${s.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                      {s.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                  {s.tax_id ?? <span className="text-gray-300 text-xs italic">—</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {s.phone ?? <span className="text-gray-300 text-xs italic">—</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {s.email ?? <span className="text-gray-300 text-xs italic">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.is_related_party ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <ShieldAlert size={10} />
                      Related Party
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
                      External
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {s.is_active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      Inactive
                    </span>
                  )}
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {confirmToggleId === s.id ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-500 mr-1">
                            {s.is_active ? 'Deactivate?' : 'Reactivate?'}
                          </span>
                          <button
                            onClick={() => handleToggleActive(s)}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Confirm"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmToggleId(null)}
                            className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Edit supplier"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmToggleId(s.id)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                              s.is_active
                                ? 'text-gray-400 border-gray-200 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
                                : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'
                            }`}
                          >
                            {s.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Supplier Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                  placeholder="e.g. Thai Electrical Supply Co., Ltd."
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Tax ID (13-digit)</label>
                <input
                  type="text"
                  value={form.tax_id}
                  onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                  placeholder="0105567XXXXXXX"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                    placeholder="02-XXX-XXXX"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                    placeholder="accounts@supplier.co.th"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <div
                  onClick={() => setForm(f => ({ ...f, is_related_party: !f.is_related_party }))}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
                    form.is_related_party ? 'bg-amber-500' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      form.is_related_party ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Related Party</p>
                  <p className="text-xs text-gray-400">Check if this vendor is a related or associated company</p>
                </div>
              </label>

              {formError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-gray-100">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-[#0f1923] text-white rounded-lg hover:bg-[#1a2b3c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
