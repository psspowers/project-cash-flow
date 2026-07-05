import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Search, Send, ArrowUp, ArrowDown, ArrowUpDown, Filter, X, Download, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PurchaseOrder, VendorInvoice, Project, Entity, COST_CATEGORY_LABELS, SGA_SUBCATEGORY_LABELS } from '../types';
import { useAuth } from '../context/AuthContext';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHBCompact, formatDate } from '../utils/formatters';
import POCreationWizard from '../components/pos/POCreationWizard';
import PODetailModal from '../components/pos/PODetailModal';
import NewExpenseModal from '../components/pos/NewExpenseModal';
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../config/roles';

type SortCol = 'ref' | 'vendor' | 'project' | 'category' | 'value';
type SortDir = 'asc' | 'desc';
type TypeFilter = 'all' | 'po' | 'expense';

interface ColFilters {
  ref: string;
  vendor: string;
  project: string;
  category: string;
  value_min: string;
  value_max: string;
}

const EMPTY_FILTERS: ColFilters = {
  ref: '',
  vendor: '',
  project: '',
  category: '',
  value_min: '',
  value_max: '',
};

// Unified row type for display
type ListRow =
  | { kind: 'po'; po: PurchaseOrder }
  | { kind: 'expense'; expense: VendorInvoice };

function rowKey(r: ListRow) { return r.kind === 'po' ? r.po.id : r.expense.id; }
function rowVendorName(r: ListRow): string {
  if (r.kind === 'po') return (r.po.vendor as Entity | undefined)?.name ?? r.po.supplier_name_raw ?? '';
  return (r.expense.vendor as Entity | undefined)?.name ?? '';
}
function rowProjectName(r: ListRow): string {
  if (r.kind === 'po') return (r.po.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '';
  return (r.expense.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '';
}
function rowProjectId(r: ListRow): string {
  if (r.kind === 'po') return (r.po.project as Project | undefined)?.id ?? '';
  return (r.expense.project as Project | undefined)?.id ?? '';
}
function rowCategory(r: ListRow): string {
  if (r.kind === 'po') return COST_CATEGORY_LABELS[r.po.cost_category] || r.po.cost_category || '';
  if (r.expense.sga_subcategory) return SGA_SUBCATEGORY_LABELS[r.expense.sga_subcategory as keyof typeof SGA_SUBCATEGORY_LABELS] ?? r.expense.sga_subcategory;
  if (r.expense.cost_category) return COST_CATEGORY_LABELS[r.expense.cost_category] || r.expense.cost_category;
  return '—';
}
function rowValueExcl(r: ListRow): number {
  if (r.kind === 'po') return r.po.po_amount_excl_vat ?? 0;
  // expenses are stored incl-VAT (no separate excl field) — treat amount as total
  return r.expense.invoice_amount_incl_vat ?? 0;
}
function rowVat(r: ListRow): number {
  if (r.kind === 'po') return r.po.vat_7pct ?? 0;
  return 0;
}
function rowTotal(r: ListRow): number {
  if (r.kind === 'po') return r.po.po_amount_incl_vat ?? 0;
  return r.expense.invoice_amount_incl_vat ?? 0;
}
function rowDate(r: ListRow): string {
  if (r.kind === 'po') return r.po.po_date ?? '';
  return r.expense.invoice_date ?? r.expense.created_at ?? '';
}
function rowStatus(r: ListRow): string {
  if (r.kind === 'po') return r.po.status;
  return r.expense.status;
}
function rowRef(r: ListRow): string {
  if (r.kind === 'po') return r.po.pss_po_no ?? '';
  return r.expense.vendor_invoice_no ?? '';
}
function rowDescription(r: ListRow): string {
  if (r.kind === 'po') return r.po.description ?? '';
  return r.expense.description ?? '';
}

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: SortDir }) {
  if (sortCol !== col) return <ArrowUpDown size={11} className="text-gray-300 group-hover:text-gray-400 transition-colors" />;
  return sortDir === 'asc'
    ? <ArrowUp size={11} className="text-[#1D9E75]" />
    : <ArrowDown size={11} className="text-[#1D9E75]" />;
}

export default function PurchaseOrders() {
  const { profile, user } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [expenses, setExpenses] = useState<VendorInvoice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Entity[]>([]);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [colFilters, setColFilters] = useState<ColFilters>(EMPTY_FILTERS);
  const [openFilterCol, setOpenFilterCol] = useState<SortCol | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const canWrite = hasRole(profile?.role, PROCUREMENT_WRITE_ROLES);
  const isCostController = profile?.role === 'cost_controller';
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setOpenFilterCol(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { loadData(); }, []);

  async function handleSubmitDraft(poId: string) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'pending_cc',
          submitted_at: new Date().toISOString(),
          submitted_by: user?.id ?? null,
        })
        .eq('id', poId);
      if (error) {
        alert('Failed to submit PO for approval. Please try again.');
        return;
      }
      await loadData();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loadData() {
    const [{ data: purchaseOrders }, { data: expenseRows }, { data: proj }, { data: vend }] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*, supplier_name_raw, vendor:entities!vendor_id(*), project:projects(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('vendor_invoices')
        .select('*, vendor:entities!vendor_id(*), project:projects(*)')
        .is('po_id', null)
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, status, project_type').order('name'),
      supabase.from('entities').select('id, name').eq('type', 'vendor').eq('is_active', true).order('name'),
    ]);
    setPos((purchaseOrders as PurchaseOrder[]) || []);
    setExpenses((expenseRows as VendorInvoice[]) || []);
    setProjects(proj || []);
    setVendors(vend || []);
    setLoading(false);
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function toggleFilterCol(col: SortCol) {
    setOpenFilterCol(prev => prev === col ? null : col);
  }

  function clearColFilter(col: keyof ColFilters) {
    setColFilters(prev => ({ ...prev, [col]: '' }));
  }

  function clearAllColFilters() {
    setColFilters(EMPTY_FILTERS);
  }

  const setFilter = useCallback((key: keyof ColFilters, val: string) => {
    setColFilters(prev => ({ ...prev, [key]: val }));
  }, []);

  // Build unified rows based on type filter
  const allRows: ListRow[] = [
    ...(typeFilter !== 'expense' ? pos.map(po => ({ kind: 'po' as const, po })) : []),
    ...(typeFilter !== 'po' ? expenses.map(expense => ({ kind: 'expense' as const, expense })) : []),
  ];

  // Derive distinct categories from all rows
  const distinctCategories = Array.from(
    new Set(allRows.map(r => rowCategory(r)).filter(Boolean))
  ).sort();

  // Derive distinct project names from all rows
  const distinctProjectNames = Array.from(
    new Set(allRows.map(r => rowProjectName(r)).filter(Boolean))
  ).sort();

  // Filtering
  const filtered = allRows.filter(r => {
    if (projectFilter && rowProjectId(r) !== projectFilter) return false;
    if (search) {
      const lc = search.toLowerCase();
      const match = (
        rowRef(r).toLowerCase().includes(lc) ||
        rowVendorName(r).toLowerCase().includes(lc) ||
        rowProjectName(r).toLowerCase().includes(lc) ||
        rowDescription(r).toLowerCase().includes(lc)
      );
      if (!match) return false;
    }

    if (colFilters.ref && !rowRef(r).toLowerCase().includes(colFilters.ref.toLowerCase())) return false;
    if (colFilters.vendor && !rowVendorName(r).toLowerCase().includes(colFilters.vendor.toLowerCase())) return false;
    if (colFilters.project && rowProjectName(r) !== colFilters.project) return false;
    if (colFilters.category && rowCategory(r) !== colFilters.category) return false;
    if (colFilters.value_min !== '') {
      const min = parseFloat(colFilters.value_min);
      if (!isNaN(min) && rowValueExcl(r) < min) return false;
    }
    if (colFilters.value_max !== '') {
      const max = parseFloat(colFilters.value_max);
      if (!isNaN(max) && rowValueExcl(r) > max) return false;
    }

    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;
    let av: string | number = 0;
    let bv: string | number = 0;
    if (sortCol === 'ref') { av = rowRef(a); bv = rowRef(b); }
    else if (sortCol === 'vendor') { av = rowVendorName(a); bv = rowVendorName(b); }
    else if (sortCol === 'project') { av = rowProjectName(a); bv = rowProjectName(b); }
    else if (sortCol === 'category') { av = rowCategory(a); bv = rowCategory(b); }
    else if (sortCol === 'value') { av = rowValueExcl(a); bv = rowValueExcl(b); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Active filter chips
  const activeChips: { label: string; keys: (keyof ColFilters)[] }[] = [];
  if (colFilters.ref) activeChips.push({ label: `Ref: ${colFilters.ref}`, keys: ['ref'] });
  if (colFilters.vendor) activeChips.push({ label: `Vendor: ${colFilters.vendor}`, keys: ['vendor'] });
  if (colFilters.project) activeChips.push({ label: `Project: ${colFilters.project}`, keys: ['project'] });
  if (colFilters.category) activeChips.push({ label: `Category: ${colFilters.category}`, keys: ['category'] });
  if (colFilters.value_min || colFilters.value_max) {
    const min = colFilters.value_min ? `฿${Number(colFilters.value_min).toLocaleString()}` : '';
    const max = colFilters.value_max ? `฿${Number(colFilters.value_max).toLocaleString()}` : '';
    const label = min && max ? `Value: ${min} – ${max}` : min ? `Value ≥ ${min}` : `Value ≤ ${max}`;
    activeChips.push({ label, keys: ['value_min', 'value_max'] });
  }
  const hasAnyColFilter = activeChips.length > 0;

  function exportCSV() {
    const headers = [
      'Type',
      'Ref / PO No.',
      'Vendor',
      'Project',
      'Category',
      'Date',
      'Amount Excl VAT (THB)',
      'VAT 7% (THB)',
      'Total Incl VAT (THB)',
      'Status',
      'Description',
    ];

    const rows = sorted.map(r => [
      r.kind === 'po' ? 'PO' : 'Expense',
      rowRef(r),
      rowVendorName(r),
      rowProjectName(r),
      rowCategory(r),
      rowDate(r) ? formatDate(rowDate(r)) : '',
      rowValueExcl(r).toFixed(2),
      rowVat(r).toFixed(2),
      rowTotal(r).toFixed(2),
      rowStatus(r).replace(/_/g, ' '),
      rowDescription(r).replace(/,/g, ';').replace(/\n/g, ' '),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `po_and_expenses_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const totalPOs = pos.length;
  const totalExpenses = expenses.length;
  const subtitlePO = typeFilter === 'all' || typeFilter === 'po'
    ? `${typeFilter === 'all' ? filtered.filter(r => r.kind === 'po').length : sorted.filter(r => r.kind === 'po').length} PO${totalPOs !== 1 ? 's' : ''}`
    : null;
  const subtitleExp = typeFilter === 'all' || typeFilter === 'expense'
    ? `${typeFilter === 'all' ? filtered.filter(r => r.kind === 'expense').length : sorted.filter(r => r.kind === 'expense').length} Expense${totalExpenses !== 1 ? 's' : ''}`
    : null;
  const subtitle = [subtitlePO, subtitleExp].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">PO &amp; Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {(isCostController || canWrite) && (
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <Download size={15} />
              Export CSV
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => setShowExpenseModal(true)}
              className="flex items-center gap-2 border border-[#1D9E75] text-[#1D9E75] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1D9E75]/5 transition-colors"
            >
              <Receipt size={15} />
              New Expense
            </button>
          )}
          {canWrite && (
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors"
            >
              <Plus size={16} />
              New PO
            </button>
          )}
        </div>
      </div>

      {/* Search + Project filter + Type tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search POs &amp; expenses..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 w-full"
          />
        </div>
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="py-2 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 appearance-none cursor-pointer min-w-[180px]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
        >
          <option value="">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name.split('–')[0].split('—')[0].trim()}
            </option>
          ))}
        </select>
        {projectFilter && (
          <button onClick={() => setProjectFilter('')} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Clear
          </button>
        )}

        {/* Type filter tabs */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 ml-auto">
          {(['all', 'po', 'expense'] as TypeFilter[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'all' ? `All (${totalPOs + totalExpenses})` : t === 'po' ? `POs (${totalPOs})` : `Expenses (${totalExpenses})`}
            </button>
          ))}
        </div>
      </div>

      {/* Active column filter chips */}
      {hasAnyColFilter && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 font-medium">Filters:</span>
          {activeChips.map(chip => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1D9E75]/10 text-[#1D9E75] text-xs font-medium rounded-full border border-[#1D9E75]/20"
            >
              {chip.label}
              <button onClick={() => chip.keys.forEach(k => clearColFilter(k))} className="hover:text-[#178a64] transition-colors">
                <X size={11} />
              </button>
            </span>
          ))}
          <button onClick={clearAllColFilters} className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2">
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" ref={filterPanelRef}>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              {/* Type badge column */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-[80px]">Type</th>

              {/* Ref / PO No. header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button onClick={() => handleSort('ref')} className="group flex items-center gap-1 hover:text-gray-700 transition-colors">
                    Ref / PO No.
                    <SortIcon col="ref" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                  <button
                    onClick={() => toggleFilterCol('ref')}
                    className={`p-0.5 rounded transition-colors ${colFilters.ref ? 'text-[#1D9E75]' : 'text-gray-300 hover:text-gray-500'}`}
                  >
                    <Filter size={11} />
                  </button>
                  {openFilterCol === 'ref' && (
                    <div className="absolute z-20 mt-1 top-full left-0 w-52 bg-white rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Filter Ref / PO No.</p>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Contains..."
                        value={colFilters.ref}
                        onChange={e => setFilter('ref', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      />
                      {colFilters.ref && <button onClick={() => clearColFilter('ref')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
                    </div>
                  )}
                </div>
              </th>

              {/* Vendor header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button onClick={() => handleSort('vendor')} className="group flex items-center gap-1 hover:text-gray-700 transition-colors">
                    Vendor
                    <SortIcon col="vendor" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                  <button
                    onClick={() => toggleFilterCol('vendor')}
                    className={`p-0.5 rounded transition-colors ${colFilters.vendor ? 'text-[#1D9E75]' : 'text-gray-300 hover:text-gray-500'}`}
                  >
                    <Filter size={11} />
                  </button>
                  {openFilterCol === 'vendor' && (
                    <div className="absolute z-20 mt-1 top-full left-0 w-56 bg-white rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Filter Vendor</p>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Contains..."
                        value={colFilters.vendor}
                        onChange={e => setFilter('vendor', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      />
                      {colFilters.vendor && <button onClick={() => clearColFilter('vendor')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
                    </div>
                  )}
                </div>
              </th>

              {/* Project header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button onClick={() => handleSort('project')} className="group flex items-center gap-1 hover:text-gray-700 transition-colors">
                    Project
                    <SortIcon col="project" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                  <button
                    onClick={() => toggleFilterCol('project')}
                    className={`p-0.5 rounded transition-colors ${colFilters.project ? 'text-[#1D9E75]' : 'text-gray-300 hover:text-gray-500'}`}
                  >
                    <Filter size={11} />
                  </button>
                  {openFilterCol === 'project' && (
                    <div className="absolute z-20 mt-1 top-full left-0 w-56 bg-white rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Filter Project</p>
                      <select
                        autoFocus
                        value={colFilters.project}
                        onChange={e => setFilter('project', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                      >
                        <option value="">All projects</option>
                        {distinctProjectNames.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      {colFilters.project && <button onClick={() => clearColFilter('project')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
                    </div>
                  )}
                </div>
              </th>

              {/* Category header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button onClick={() => handleSort('category')} className="group flex items-center gap-1 hover:text-gray-700 transition-colors">
                    Category
                    <SortIcon col="category" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                  <button
                    onClick={() => toggleFilterCol('category')}
                    className={`p-0.5 rounded transition-colors ${colFilters.category ? 'text-[#1D9E75]' : 'text-gray-300 hover:text-gray-500'}`}
                  >
                    <Filter size={11} />
                  </button>
                  {openFilterCol === 'category' && (
                    <div className="absolute z-20 mt-1 top-full left-0 w-52 bg-white rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Filter Category</p>
                      <select
                        autoFocus
                        value={colFilters.category}
                        onChange={e => setFilter('category', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                      >
                        <option value="">All categories</option>
                        {distinctCategories.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {colFilters.category && <button onClick={() => clearColFilter('category')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
                    </div>
                  )}
                </div>
              </th>

              {/* Value header */}
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center justify-end gap-1 relative">
                  <button onClick={() => handleSort('value')} className="group flex items-center gap-1 hover:text-gray-700 transition-colors">
                    Value
                    <SortIcon col="value" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                  <button
                    onClick={() => toggleFilterCol('value')}
                    className={`p-0.5 rounded transition-colors ${(colFilters.value_min || colFilters.value_max) ? 'text-[#1D9E75]' : 'text-gray-300 hover:text-gray-500'}`}
                  >
                    <Filter size={11} />
                  </button>
                  {openFilterCol === 'value' && (
                    <div className="absolute z-20 mt-1 top-full right-0 w-60 bg-white rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Filter Value (฿)</p>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">Min</label>
                          <input
                            autoFocus type="number" placeholder="0" value={colFilters.value_min}
                            onChange={e => setFilter('value_min', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">Max</label>
                          <input
                            type="number" placeholder="∞" value={colFilters.value_max}
                            onChange={e => setFilter('value_max', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                          />
                        </div>
                      </div>
                      {(colFilters.value_min || colFilters.value_max) && (
                        <button onClick={() => { clearColFilter('value_min'); clearColFilter('value_max'); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                      )}
                    </div>
                  )}
                </div>
              </th>

              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">VAT 7%</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total incl. VAT</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-12 text-gray-400 text-sm">No records found</td></tr>
            ) : sorted.map(r => {
              const isExpense = r.kind === 'expense';
              return (
                <tr key={rowKey(r)} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  {/* Type badge */}
                  <td className="px-4 py-3">
                    {isExpense ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Receipt size={9} />
                        Expense
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#1D9E75]/10 text-[#1D9E75] border border-[#1D9E75]/20">
                        PO
                      </span>
                    )}
                  </td>

                  {/* Ref / PO No. */}
                  <td className="px-4 py-3">
                    {!isExpense ? (
                      <button
                        onClick={() => setSelectedPO(r.po)}
                        className="text-sm font-medium text-[#1D9E75] hover:text-[#178a64] hover:underline transition-colors text-left"
                      >
                        {r.po.pss_po_no ?? <span className="text-gray-400 italic text-xs not-italic font-normal">Pending approval</span>}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-500">{r.expense.vendor_invoice_no || <span className="text-gray-300">—</span>}</span>
                    )}
                  </td>

                  {/* Vendor */}
                  <td className="px-4 py-3 text-sm text-gray-600">{rowVendorName(r) || '—'}</td>

                  {/* Project */}
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{rowProjectName(r) || '—'}</td>

                  {/* Category */}
                  <td className="px-4 py-3 text-xs text-gray-500">{rowCategory(r)}</td>

                  {/* Value */}
                  <td className="px-4 py-3 text-right text-sm text-gray-700">{formatTHBCompact(rowValueExcl(r))}</td>

                  {/* VAT */}
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
                    {isExpense ? <span className="text-gray-300">—</span> : formatTHBCompact(rowVat(r))}
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800">{formatTHBCompact(rowTotal(r))}</td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <Badge label={rowStatus(r).replace(/_/g, ' ')} variant={statusVariant(rowStatus(r))} />
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-xs text-gray-500">{rowDate(r) ? formatDate(rowDate(r)) : '—'}</td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    {!isExpense && canWrite && r.po.status === 'draft' && !r.po.pss_po_no && (
                      <button
                        onClick={() => handleSubmitDraft(r.po.id)}
                        disabled={isSubmitting}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#EF9F27] text-[#EF9F27] text-xs font-medium rounded-lg hover:bg-[#EF9F27]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      >
                        <Send size={11} />
                        Submit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showWizard && (
        <POCreationWizard
          projects={projects}
          vendors={vendors}
          onClose={() => setShowWizard(false)}
          onSuccess={() => { setShowWizard(false); loadData(); }}
        />
      )}

      {showExpenseModal && (
        <NewExpenseModal
          projects={projects}
          vendors={vendors}
          onClose={() => setShowExpenseModal(false)}
          onSuccess={() => { setShowExpenseModal(false); loadData(); }}
        />
      )}

      {selectedPO && (
        <PODetailModal
          key={selectedPO.id}
          po={selectedPO}
          projects={projects}
          vendors={vendors}
          onClose={() => setSelectedPO(null)}
          onSuccess={() => { setSelectedPO(null); loadData(); }}
        />
      )}
    </div>
  );
}
