import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Search, Send, ArrowUp, ArrowDown, ArrowUpDown, Filter, X, Download, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PurchaseOrder, Project, Entity, COST_CATEGORY_LABELS } from '../types';
import { useAuth } from '../context/AuthContext';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHBCompact, formatDate } from '../utils/formatters';
import POCreationWizard from '../components/pos/POCreationWizard';
import PODetailModal from '../components/pos/PODetailModal';
import NewExpenseModal from '../components/pos/NewExpenseModal';
import { hasRole, PROCUREMENT_WRITE_ROLES } from '../config/roles';

type SortCol = 'po_no' | 'vendor' | 'project' | 'category' | 'po_value';
type SortDir = 'asc' | 'desc';

interface ColFilters {
  po_no: string;
  vendor: string;
  project: string;
  category: string;
  po_value_min: string;
  po_value_max: string;
}

const EMPTY_FILTERS: ColFilters = {
  po_no: '',
  vendor: '',
  project: '',
  category: '',
  po_value_min: '',
  po_value_max: '',
};

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: SortDir }) {
  if (sortCol !== col) return <ArrowUpDown size={11} className="text-gray-300 group-hover:text-gray-400 transition-colors" />;
  return sortDir === 'asc'
    ? <ArrowUp size={11} className="text-[#1D9E75]" />
    : <ArrowDown size={11} className="text-[#1D9E75]" />;
}

export default function PurchaseOrders() {
  const { profile, user } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Entity[]>([]);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sort state
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Per-column filter state
  const [colFilters, setColFilters] = useState<ColFilters>(EMPTY_FILTERS);
  const [openFilterCol, setOpenFilterCol] = useState<SortCol | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  const canWrite = hasRole(profile?.role, PROCUREMENT_WRITE_ROLES);
  const isCostController = profile?.role === 'cost_controller';
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // Close filter panel on outside click
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
    const [{ data: purchaseOrders }, { data: proj }, { data: vend }] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*, supplier_name_raw, vendor:entities!vendor_id(*), project:projects(*)')
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, status').order('name'),
      supabase.from('entities').select('id, name').eq('type', 'vendor').eq('is_active', true).order('name'),
    ]);
    setPos((purchaseOrders as PurchaseOrder[]) || []);
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

  // Derive distinct categories from loaded POs
  const distinctCategories = Array.from(
    new Set(pos.map(po => COST_CATEGORY_LABELS[po.cost_category] || po.cost_category).filter(Boolean))
  ).sort();

  // Derive distinct project names from loaded POs
  const distinctProjectNames = Array.from(
    new Set(pos.map(po => (po.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '').filter(Boolean))
  ).sort();

  // Filtering
  const filtered = pos.filter(po => {
    // Global filters
    if (projectFilter && (po.project as Project | undefined)?.id !== projectFilter) return false;
    if (search) {
      const vendorName = (po.vendor as Entity | undefined)?.name ?? po.supplier_name_raw ?? '';
      const matchSearch = (
        (po.pss_po_no ?? '').toLowerCase().includes(search.toLowerCase()) ||
        vendorName.toLowerCase().includes(search.toLowerCase()) ||
        (po.project as Project | undefined)?.name?.toLowerCase().includes(search.toLowerCase())
      );
      if (!matchSearch) return false;
    }

    // Column-level filters
    if (colFilters.po_no && !(po.pss_po_no ?? '').toLowerCase().includes(colFilters.po_no.toLowerCase())) return false;

    if (colFilters.vendor) {
      const vName = (po.vendor as Entity | undefined)?.name ?? po.supplier_name_raw ?? '';
      if (!vName.toLowerCase().includes(colFilters.vendor.toLowerCase())) return false;
    }

    if (colFilters.project) {
      const pName = (po.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '';
      if (pName !== colFilters.project) return false;
    }

    if (colFilters.category) {
      const cat = COST_CATEGORY_LABELS[po.cost_category] || po.cost_category;
      if (cat !== colFilters.category) return false;
    }

    if (colFilters.po_value_min !== '') {
      const min = parseFloat(colFilters.po_value_min);
      if (!isNaN(min) && (po.po_amount_excl_vat ?? 0) < min) return false;
    }
    if (colFilters.po_value_max !== '') {
      const max = parseFloat(colFilters.po_value_max);
      if (!isNaN(max) && (po.po_amount_excl_vat ?? 0) > max) return false;
    }

    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0;
    let av: string | number = 0;
    let bv: string | number = 0;
    if (sortCol === 'po_no') {
      av = a.pss_po_no ?? '';
      bv = b.pss_po_no ?? '';
    } else if (sortCol === 'vendor') {
      av = (a.vendor as Entity | undefined)?.name ?? a.supplier_name_raw ?? '';
      bv = (b.vendor as Entity | undefined)?.name ?? b.supplier_name_raw ?? '';
    } else if (sortCol === 'project') {
      av = (a.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '';
      bv = (b.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '';
    } else if (sortCol === 'category') {
      av = COST_CATEGORY_LABELS[a.cost_category] || a.cost_category || '';
      bv = COST_CATEGORY_LABELS[b.cost_category] || b.cost_category || '';
    } else if (sortCol === 'po_value') {
      av = a.po_amount_excl_vat ?? 0;
      bv = b.po_amount_excl_vat ?? 0;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Active column filter chips
  const activeChips: { label: string; keys: (keyof ColFilters)[] }[] = [];
  if (colFilters.po_no) activeChips.push({ label: `PO No: ${colFilters.po_no}`, keys: ['po_no'] });
  if (colFilters.vendor) activeChips.push({ label: `Vendor: ${colFilters.vendor}`, keys: ['vendor'] });
  if (colFilters.project) activeChips.push({ label: `Project: ${colFilters.project}`, keys: ['project'] });
  if (colFilters.category) activeChips.push({ label: `Category: ${colFilters.category}`, keys: ['category'] });
  if (colFilters.po_value_min || colFilters.po_value_max) {
    const min = colFilters.po_value_min ? `฿${Number(colFilters.po_value_min).toLocaleString()}` : '';
    const max = colFilters.po_value_max ? `฿${Number(colFilters.po_value_max).toLocaleString()}` : '';
    const label = min && max ? `PO Value: ${min} – ${max}` : min ? `PO Value ≥ ${min}` : `PO Value ≤ ${max}`;
    activeChips.push({ label, keys: ['po_value_min', 'po_value_max'] });
  }

  const hasAnyColFilter = activeChips.length > 0;

  function exportCSV() {
    const headers = [
      'PSS PO No',
      'Vendor',
      'Project',
      'Category',
      'PO Date',
      'Amount Excl VAT (THB)',
      'VAT 7% (THB)',
      'Total Incl VAT (THB)',
      'WHT Applies',
      'WHT Rate (%)',
      'WHT Amount (THB)',
      'Status',
      'Version',
      'Notes',
    ];

    const rows = sorted.map(po => [
      po.pss_po_no ?? '',
      (po.vendor as Entity | undefined)?.name ?? po.supplier_name_raw ?? '',
      (po.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '',
      COST_CATEGORY_LABELS[po.cost_category] ?? po.cost_category,
      po.po_date ? formatDate(po.po_date) : '',
      po.po_amount_excl_vat?.toFixed(2) ?? '0.00',
      po.vat_7pct?.toFixed(2) ?? '0.00',
      po.po_amount_incl_vat?.toFixed(2) ?? '0.00',
      po.wht_applies ? 'Yes' : 'No',
      po.wht_applies ? (po.wht_rate ?? 3).toString() : '',
      po.wht_applies ? (po.wht_3pct?.toFixed(2) ?? '0.00') : '',
      po.status.replace(/_/g, ' '),
      po.version?.toString() ?? '1',
      (po.notes ?? '').replace(/,/g, ';').replace(/\n/g, ' '),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purchase_orders_${new Date().toISOString().split('T')[0]}.csv`;
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sorted.length !== pos.length ? `${sorted.length} of ${pos.length} POs` : `${pos.length} total POs`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCostController && (
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

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search POs..."
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
          <button
            onClick={() => setProjectFilter('')}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear
          </button>
        )}
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
              <button
                onClick={() => chip.keys.forEach(k => clearColFilter(k))}
                className="hover:text-[#178a64] transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <button
            onClick={clearAllColFilters}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden" ref={filterPanelRef}>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              {/* PO No header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => handleSort('po_no')}
                    className="group flex items-center gap-1 hover:text-gray-700 transition-colors"
                  >
                    PO No.
                    <SortIcon col="po_no" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                  <button
                    onClick={() => toggleFilterCol('po_no')}
                    className={`p-0.5 rounded transition-colors ${colFilters.po_no ? 'text-[#1D9E75]' : 'text-gray-300 hover:text-gray-500'}`}
                  >
                    <Filter size={11} />
                  </button>
                  {openFilterCol === 'po_no' && (
                    <div className="absolute z-20 mt-1 top-full left-0 w-52 bg-white rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Filter PO No.</p>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Contains..."
                        value={colFilters.po_no}
                        onChange={e => setFilter('po_no', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      />
                      {colFilters.po_no && (
                        <button onClick={() => clearColFilter('po_no')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* Vendor header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => handleSort('vendor')}
                    className="group flex items-center gap-1 hover:text-gray-700 transition-colors"
                  >
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
                      {colFilters.vendor && (
                        <button onClick={() => clearColFilter('vendor')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* Project header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => handleSort('project')}
                    className="group flex items-center gap-1 hover:text-gray-700 transition-colors"
                  >
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
                      {colFilters.project && (
                        <button onClick={() => clearColFilter('project')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* Category header */}
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center gap-1 relative">
                  <button
                    onClick={() => handleSort('category')}
                    className="group flex items-center gap-1 hover:text-gray-700 transition-colors"
                  >
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
                      {colFilters.category && (
                        <button onClick={() => clearColFilter('category')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
                      )}
                    </div>
                  )}
                </div>
              </th>

              {/* PO Value header */}
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">
                <div className="flex items-center justify-end gap-1 relative">
                  <button
                    onClick={() => handleSort('po_value')}
                    className="group flex items-center gap-1 hover:text-gray-700 transition-colors"
                  >
                    PO Value
                    <SortIcon col="po_value" sortCol={sortCol} sortDir={sortDir} />
                  </button>
                  <button
                    onClick={() => toggleFilterCol('po_value')}
                    className={`p-0.5 rounded transition-colors ${(colFilters.po_value_min || colFilters.po_value_max) ? 'text-[#1D9E75]' : 'text-gray-300 hover:text-gray-500'}`}
                  >
                    <Filter size={11} />
                  </button>
                  {openFilterCol === 'po_value' && (
                    <div className="absolute z-20 mt-1 top-full right-0 w-60 bg-white rounded-lg shadow-lg border border-gray-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-600">Filter PO Value (฿)</p>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">Min</label>
                          <input
                            autoFocus
                            type="number"
                            placeholder="0"
                            value={colFilters.po_value_min}
                            onChange={e => setFilter('po_value_min', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-gray-400 mb-0.5 block">Max</label>
                          <input
                            type="number"
                            placeholder="∞"
                            value={colFilters.po_value_max}
                            onChange={e => setFilter('po_value_max', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                          />
                        </div>
                      </div>
                      {(colFilters.po_value_min || colFilters.po_value_max) && (
                        <button onClick={() => { clearColFilter('po_value_min'); clearColFilter('po_value_max'); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
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
              <tr><td colSpan={10} className="text-center py-12 text-gray-400 text-sm">No purchase orders found</td></tr>
            ) : sorted.map(po => (
              <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedPO(po)}
                    className="text-sm font-medium text-[#1D9E75] hover:text-[#178a64] hover:underline transition-colors text-left"
                  >
                    {po.pss_po_no ?? <span className="text-gray-400 italic text-xs not-italic font-normal">Pending approval</span>}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {(po.vendor as Entity | undefined)?.name ?? po.supplier_name_raw ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">
                  {(po.project as Project | undefined)?.name?.split('–')[0]?.trim() ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{COST_CATEGORY_LABELS[po.cost_category] || po.cost_category}</td>
                <td className="px-4 py-3 text-right text-sm text-gray-700">{formatTHBCompact(po.po_amount_excl_vat)}</td>
                <td className="px-4 py-3 text-right text-xs text-gray-500">{formatTHBCompact(po.vat_7pct)}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800">{formatTHBCompact(po.po_amount_incl_vat)}</td>
                <td className="px-4 py-3 text-center">
                  <Badge label={po.status.replace(/_/g, ' ')} variant={statusVariant(po.status)} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{formatDate(po.po_date)}</td>
                <td className="px-4 py-3">
                  {canWrite && po.status === 'draft' && !po.pss_po_no && (
                    <button
                      onClick={() => handleSubmitDraft(po.id)}
                      disabled={isSubmitting}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-[#EF9F27] text-[#EF9F27] text-xs font-medium rounded-lg hover:bg-[#EF9F27]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      <Send size={11} />
                      Submit
                    </button>
                  )}
                </td>
              </tr>
            ))}
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
          onClose={() => setShowExpenseModal(false)}
          onSuccess={() => { setShowExpenseModal(false); }}
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
