import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PurchaseOrder, Project, Entity, COST_CATEGORY_LABELS } from '../types';
import { useAuth } from '../context/AuthContext';
import Badge, { statusVariant } from '../components/ui/Badge';
import { formatTHBCompact, formatDate } from '../utils/formatters';
import POCreationWizard from '../components/pos/POCreationWizard';

export default function PurchaseOrders() {
  const { profile } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [vendors, setVendors] = useState<Entity[]>([]);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [{ data: purchaseOrders }, { data: proj }, { data: vend }] = await Promise.all([
      supabase.from('purchase_orders').select('*, vendor:entities!vendor_id(*), project:projects(*)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, status').order('name'),
      supabase.from('entities').select('id, name').eq('type', 'vendor').order('name'),
    ]);
    setPos((purchaseOrders as PurchaseOrder[]) || []);
    setProjects(proj || []);
    setVendors(vend || []);
    setLoading(false);
  }

  const filtered = pos.filter(po => {
    if (projectFilter && (po.project as Project | undefined)?.id !== projectFilter) return false;
    if (!search) return true;
    return (
      (po.pss_po_no ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (po.vendor as Entity | undefined)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      (po.project as Project | undefined)?.name?.toLowerCase().includes(search.toLowerCase())
    );
  });

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
            {filtered.length !== pos.length ? `${filtered.length} of ${pos.length} POs` : `${pos.length} total POs`}
          </p>
        </div>
        {profile?.role === 'cost_controller' && (
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors"
          >
            <Plus size={16} />
            New PO
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
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

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">PO No.</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">PO Value</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">VAT 7%</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total incl. VAT</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No purchase orders found</td></tr>
            ) : filtered.map(po => (
              <tr key={po.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {po.pss_po_no ?? <span className="text-gray-400 italic text-xs">Pending approval</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{(po.vendor as Entity | undefined)?.name ?? '—'}</td>
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
    </div>
  );
}
