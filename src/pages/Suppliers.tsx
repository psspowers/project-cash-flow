import { useEffect, useState } from 'react';
import {
  Plus, Search, Pencil, X, Check, Building2, ShieldAlert,
  Globe, Phone, Mail, User, CreditCard, FileText, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../config/roles';
import type { SupplierType } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string;
  name: string;
  supplier_type: SupplierType;
  tax_id: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  contact_person_name: string | null;
  contact_person_title: string | null;
  contact_person_phone: string | null;
  contact_person_email: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  default_wht_rate: number | null;
  is_related_party: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface FormData {
  name: string;
  supplier_type: SupplierType;
  tax_id: string;
  address: string;
  website: string;
  phone: string;
  email: string;
  contact_person_name: string;
  contact_person_title: string;
  contact_person_phone: string;
  contact_person_email: string;
  bank_name: string;
  bank_branch: string;
  bank_account_no: string;
  bank_account_name: string;
  default_wht_rate: string;
  is_related_party: boolean;
  notes: string;
}

const EMPTY_FORM: FormData = {
  name: '',
  supplier_type: 'company',
  tax_id: '',
  address: '',
  website: '',
  phone: '',
  email: '',
  contact_person_name: '',
  contact_person_title: '',
  contact_person_phone: '',
  contact_person_email: '',
  bank_name: '',
  bank_branch: '',
  bank_account_no: '',
  bank_account_name: '',
  default_wht_rate: '',
  is_related_party: false,
  notes: '',
};

const WHT_OPTIONS = [
  { label: '0%', value: '0' },
  { label: '1%', value: '1' },
  { label: '3%', value: '3' },
  { label: '5%', value: '5' },
];

const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  company: 'Company',
  individual: 'Individual',
  petty_cash: 'Petty Cash',
};

const SUPPLIER_TYPE_COLORS: Record<SupplierType, string> = {
  company: 'bg-sky-50 text-sky-700 border-sky-200',
  individual: 'bg-teal-50 text-teal-700 border-teal-200',
  petty_cash: 'bg-gray-100 text-gray-500 border-gray-200',
};

type ModalTab = 'identity' | 'contact' | 'payment' | 'notes';

const MODAL_TABS: { id: ModalTab; label: string; icon: React.ReactNode }[] = [
  { id: 'identity', label: 'Identity', icon: <Building2 size={13} /> },
  { id: 'contact', label: 'Contact', icon: <User size={13} /> },
  { id: 'payment', label: 'Payment', icon: <CreditCard size={13} /> },
  { id: 'notes', label: 'Notes', icon: <FileText size={13} /> },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function Field({
  label, children, required,
}: {
  label: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', mono,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 ${mono ? 'font-mono' : ''}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Suppliers() {
  const { profile } = useAuth();
  const canWrite = hasRole(profile?.role, PROCUREMENT_WRITE_ROLES);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<SupplierType | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [tab, setTab] = useState<ModalTab>('identity');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Inline deactivate confirm
  const [confirmToggleId, setConfirmToggleId] = useState<string | null>(null);

  // Expanded row for quick detail view
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => { loadSuppliers(); }, []);

  async function loadSuppliers() {
    const { data } = await supabase
      .from('entities')
      .select('*')
      .eq('type', 'vendor')
      .order('name');
    setSuppliers((data as Supplier[]) || []);
    setLoading(false);
  }

  function set(key: keyof FormData, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setTab('identity');
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      supplier_type: s.supplier_type ?? 'company',
      tax_id: s.tax_id ?? '',
      address: s.address ?? '',
      website: s.website ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      contact_person_name: s.contact_person_name ?? '',
      contact_person_title: s.contact_person_title ?? '',
      contact_person_phone: s.contact_person_phone ?? '',
      contact_person_email: s.contact_person_email ?? '',
      bank_name: s.bank_name ?? '',
      bank_branch: s.bank_branch ?? '',
      bank_account_no: s.bank_account_no ?? '',
      bank_account_name: s.bank_account_name ?? '',
      default_wht_rate: s.default_wht_rate != null ? String(s.default_wht_rate) : '',
      is_related_party: s.is_related_party,
      notes: s.notes ?? '',
    });
    setFormError(null);
    setTab('identity');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('Supplier name is required.'); return; }
    setSaving(true);
    setFormError(null);

    const payload = {
      name: form.name.trim(),
      supplier_type: form.supplier_type,
      tax_id: form.tax_id.trim() || null,
      address: form.address.trim() || null,
      website: form.website.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      contact_person_name: form.contact_person_name.trim() || null,
      contact_person_title: form.contact_person_title.trim() || null,
      contact_person_phone: form.contact_person_phone.trim() || null,
      contact_person_email: form.contact_person_email.trim() || null,
      bank_name: form.bank_name.trim() || null,
      bank_branch: form.bank_branch.trim() || null,
      bank_account_no: form.bank_account_no.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      default_wht_rate: form.default_wht_rate !== '' ? Number(form.default_wht_rate) : null,
      is_related_party: form.is_related_party,
      notes: form.notes.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('entities').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('entities').insert({ ...payload, type: 'vendor', is_active: true }));
    }

    if (error) { setFormError(error.message); } else { closeModal(); await loadSuppliers(); }
    setSaving(false);
  }

  async function handleToggleActive(s: Supplier) {
    await supabase.from('entities').update({ is_active: !s.is_active }).eq('id', s.id);
    setConfirmToggleId(null);
    await loadSuppliers();
  }

  const filtered = suppliers.filter(s => {
    if (!showInactive && !s.is_active) return false;
    if (typeFilter && s.supplier_type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.tax_id ?? '').toLowerCase().includes(q) ||
      (s.contact_person_name ?? '').toLowerCase().includes(q) ||
      (s.phone ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q)
    );
  });

  const activeCount = suppliers.filter(s => s.is_active).length;
  const inactiveCount = suppliers.filter(s => !s.is_active).length;

  // Profile completion score (max 5 key fields)
  function completionScore(s: Supplier): number {
    let score = 0;
    if (s.tax_id) score++;
    if (s.address) score++;
    if (s.contact_person_name) score++;
    if (s.bank_account_no) score++;
    if (s.phone || s.email) score++;
    return score;
  }

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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Name, tax ID, contact..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 w-full"
          />
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['', 'company', 'individual', 'petty_cash'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                typeFilter === t
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === '' ? 'All' : SUPPLIER_TYPE_LABELS[t]}
            </button>
          ))}
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
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Supplier</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tax ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contact</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Phone / Email</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Profile</th>
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
              <>
                <tr
                  key={s.id}
                  className={`border-b border-gray-50 transition-colors cursor-pointer ${
                    s.is_active ? 'hover:bg-gray-50/50' : 'opacity-50 bg-gray-50/30'
                  } ${expandedId === s.id ? 'bg-gray-50/70' : ''}`}
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                        <Building2 size={13} className="text-gray-400" />
                      </div>
                      <div>
                        <p className={`text-sm font-medium leading-tight ${s.is_active ? 'text-gray-800' : 'text-gray-400'}`}>
                          {s.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium border ${SUPPLIER_TYPE_COLORS[s.supplier_type ?? 'company']}`}>
                            {SUPPLIER_TYPE_LABELS[s.supplier_type ?? 'company']}
                          </span>
                          {s.is_related_party && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <ShieldAlert size={9} />
                              Related
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                    {s.tax_id ?? <span className="text-gray-300 text-xs italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {s.contact_person_name ? (
                      <div>
                        <p className="text-sm text-gray-700">{s.contact_person_name}</p>
                        {s.contact_person_title && (
                          <p className="text-xs text-gray-400">{s.contact_person_title}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {s.phone && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Phone size={10} className="text-gray-300 shrink-0" />{s.phone}
                        </div>
                      )}
                      {s.email && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Mail size={10} className="text-gray-300 shrink-0" />{s.email}
                        </div>
                      )}
                      {!s.phone && !s.email && <span className="text-gray-300 text-xs italic">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ProfileDots score={completionScore(s)} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />Inactive
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {confirmToggleId === s.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 mr-1">
                              {s.is_active ? 'Deactivate?' : 'Reactivate?'}
                            </span>
                            <button
                              onClick={() => handleToggleActive(s)}
                              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={() => setConfirmToggleId(null)}
                              className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => openEdit(s)}
                              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                              title="Edit"
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

                {/* Expanded detail row */}
                {expandedId === s.id && (
                  <tr key={`${s.id}-detail`} className="bg-gray-50/60 border-b border-gray-100">
                    <td colSpan={canWrite ? 7 : 6} className="px-6 py-4">
                      <div className="grid grid-cols-4 gap-6 text-xs">
                        <div>
                          <p className="text-gray-400 font-medium uppercase tracking-wide mb-2">Address</p>
                          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{s.address || '—'}</p>
                          {s.website && (
                            <div className="flex items-center gap-1 mt-2 text-sky-600">
                              <Globe size={10} />
                              <span>{s.website}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-gray-400 font-medium uppercase tracking-wide mb-2">Contact Person</p>
                          <p className="text-gray-700">{s.contact_person_name || '—'}</p>
                          {s.contact_person_title && <p className="text-gray-400 mt-0.5">{s.contact_person_title}</p>}
                          {s.contact_person_phone && (
                            <div className="flex items-center gap-1 mt-1.5 text-gray-500">
                              <Phone size={10} />{s.contact_person_phone}
                            </div>
                          )}
                          {s.contact_person_email && (
                            <div className="flex items-center gap-1 mt-0.5 text-gray-500">
                              <Mail size={10} />{s.contact_person_email}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-gray-400 font-medium uppercase tracking-wide mb-2">Payment Details</p>
                          {s.bank_name ? (
                            <div className="space-y-0.5 text-gray-700">
                              <p className="font-medium">{s.bank_name}{s.bank_branch ? ` · ${s.bank_branch}` : ''}</p>
                              <p className="font-mono">{s.bank_account_no || '—'}</p>
                              <p className="text-gray-500">{s.bank_account_name || ''}</p>
                            </div>
                          ) : <p className="text-gray-400">—</p>}
                          {s.default_wht_rate != null && (
                            <p className="mt-2 text-gray-500">Default WHT: <span className="font-medium text-gray-700">{s.default_wht_rate}%</span></p>
                          )}
                        </div>
                        <div>
                          <p className="text-gray-400 font-medium uppercase tracking-wide mb-2">Notes</p>
                          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{s.notes || '—'}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 pb-8 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button onClick={closeModal} className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 px-6">
              {MODAL_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors -mb-px ${
                    tab === t.id
                      ? 'border-[#1D9E75] text-[#1D9E75]'
                      : 'border-transparent text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="px-6 py-5 space-y-4">

              {tab === 'identity' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Supplier Name" required>
                      <Input value={form.name} onChange={v => set('name', v)} placeholder="e.g. Zigma Engineering Co., Ltd." autoFocus />
                    </Field>
                    <Field label="Supplier Type" required>
                      <div className="relative">
                        <select
                          value={form.supplier_type}
                          onChange={e => set('supplier_type', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white pr-8"
                        >
                          <option value="company">Company</option>
                          <option value="individual">Individual</option>
                          <option value="petty_cash">Petty Cash</option>
                        </select>
                        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Tax ID (13-digit TIN)">
                      <Input value={form.tax_id} onChange={v => set('tax_id', v)} placeholder="0105567XXXXXXX" mono />
                    </Field>
                    <Field label="Website">
                      <Input value={form.website} onChange={v => set('website', v)} placeholder="https://www.supplier.co.th" />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Main Phone">
                      <Input value={form.phone} onChange={v => set('phone', v)} placeholder="02-XXX-XXXX" />
                    </Field>
                    <Field label="Main Email">
                      <Input value={form.email} onChange={v => set('email', v)} placeholder="info@supplier.co.th" type="email" />
                    </Field>
                  </div>

                  <Field label="Registered Address">
                    <textarea
                      value={form.address}
                      onChange={e => set('address', e.target.value)}
                      placeholder="Full registered address as it appears on official documents..."
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
                    />
                  </Field>

                  <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div
                      onClick={() => set('is_related_party', !form.is_related_party)}
                      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${form.is_related_party ? 'bg-amber-500' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_related_party ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Related Party</p>
                      <p className="text-xs text-gray-400">Flag if this vendor is an associated or related company</p>
                    </div>
                  </label>
                </>
              )}

              {tab === 'contact' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Contact Person Name">
                      <Input value={form.contact_person_name} onChange={v => set('contact_person_name', v)} placeholder="e.g. Khun Niramon" />
                    </Field>
                    <Field label="Job Title">
                      <Input value={form.contact_person_title} onChange={v => set('contact_person_title', v)} placeholder="e.g. Sales Manager" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Direct Phone / Line">
                      <Input value={form.contact_person_phone} onChange={v => set('contact_person_phone', v)} placeholder="08X-XXX-XXXX" />
                    </Field>
                    <Field label="Direct Email">
                      <Input value={form.contact_person_email} onChange={v => set('contact_person_email', v)} placeholder="niramon@supplier.co.th" type="email" />
                    </Field>
                  </div>
                  <div className="mt-2 p-3 bg-sky-50 rounded-lg border border-sky-100">
                    <p className="text-xs text-sky-700">
                      The contact person's email will be used as the default delivery address when sending Purchase Orders as PDFs.
                    </p>
                  </div>
                </>
              )}

              {tab === 'payment' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Bank Name">
                      <Input value={form.bank_name} onChange={v => set('bank_name', v)} placeholder="e.g. Kasikorn Bank" />
                    </Field>
                    <Field label="Branch">
                      <Input value={form.bank_branch} onChange={v => set('bank_branch', v)} placeholder="e.g. Silom Branch" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Account Number">
                      <Input value={form.bank_account_no} onChange={v => set('bank_account_no', v)} placeholder="XXX-X-XXXXX-X" mono />
                    </Field>
                    <Field label="Account Name">
                      <Input value={form.bank_account_name} onChange={v => set('bank_account_name', v)} placeholder="Registered holder name" />
                    </Field>
                  </div>
                  <Field label="Default WHT Rate">
                    <div className="flex gap-2">
                      {['', ...WHT_OPTIONS.map(o => o.value)].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => set('default_wht_rate', v)}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                            form.default_wht_rate === v
                              ? 'bg-[#0f1923] text-white border-[#0f1923]'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                          }`}
                        >
                          {v === '' ? 'None' : `${v}%`}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">Pre-fills the WHT field when creating a new PO for this supplier.</p>
                  </Field>
                </>
              )}

              {tab === 'notes' && (
                <Field label="Internal Notes">
                  <textarea
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Payment terms, preferred contact instructions, special conditions, flags..."
                    rows={7}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
                  />
                </Field>
              )}

              {formError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
              <div className="flex gap-2">
                {MODAL_TABS.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`w-2 h-2 rounded-full transition-colors ${tab === t.id ? 'bg-[#1D9E75]' : 'bg-gray-200 hover:bg-gray-300'}`}
                    aria-label={`Tab ${i + 1}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2.5">
                <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium bg-[#0f1923] text-white rounded-lg hover:bg-[#1a2b3c] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile completion dots
// ---------------------------------------------------------------------------

function ProfileDots({ score }: { score: number }) {
  return (
    <div className="flex items-center justify-center gap-0.5" title={`${score}/5 fields complete`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${i < score ? 'bg-[#1D9E75]' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  );
}
