import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderOpen, PlusCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { executeBudgetPatch } from '../utils/budgetPatch';
import {
  Project,
  ProjectStatus,
  Entity,
  projectStatusGroup,
  PROJECT_STATUS_LABELS,
  fmtTHBCompact,
} from '../types';
import Badge, { statusVariant } from '../components/ui/Badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = 'active' | 'estimation' | 'budget' | 'completed';

interface ClientInvoiceRow {
  project_id: string;
  received_amount: number;
}

interface PaymentVoucherRow {
  project_id: string;
  net_paid: number;
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'estimation', label: 'Estimation' },
  { key: 'budget', label: 'Budget' },
  { key: 'completed', label: 'Completed' },
];

// Map project status to the badge variant required by the spec.
// active → green
// estimation_* → gray
// budget_* → blue
// completed → gray
function projectBadgeVariant(
  status: ProjectStatus,
): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === 'active') return 'green';
  if (status === 'completed') return 'gray';
  if (
    status === 'estimation_draft' ||
    status === 'estimation_submitted' ||
    status === 'estimation_cm_approved' ||
    status === 'estimation_approved'
  )
    return 'gray';
  if (
    status === 'budget_draft' ||
    status === 'budget_submitted' ||
    status === 'budget_cm_approved'
  ) return 'blue';
  return statusVariant(status);
}

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function SkeletonLine({ w = 'w-full', h = 'h-3' }: { w?: string; h?: string }) {
  return <div className={`${w} ${h} bg-gray-100 rounded animate-pulse`} />;
}

function TableBodySkeleton({ rows = 5, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-50">
          {/* Project cell */}
          <td className="px-4 py-3.5">
            <SkeletonLine w="w-3/4" />
            <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 animate-pulse" />
            <SkeletonLine w="w-1/3" h="h-2" />
          </td>
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
              <SkeletonLine w="w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Mini progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5">
      <div
        className="h-1.5 rounded-full bg-[#1D9E75] transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Projects() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tab, setTab] = useState<TabKey>('active');
  const [projects, setProjects] = useState<Project[]>([]);
  const [clientInvoices, setClientInvoices] = useState<ClientInvoiceRow[]>([]);
  const [paymentVouchers, setPaymentVouchers] = useState<PaymentVoucherRow[]>([]);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [clients, setClients] = useState<Entity[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const userId = user?.id;
      const [
        { data: proj, error: e1 },
        { data: ciRaw, error: e2 },
        { data: pvRaw, error: e3 },
        { data: clientList, error: e4 },
        { data: viewRows },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('*, client:entities!client_entity_id(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('client_invoices')
          .select('project_id, received_amount'),
        supabase
          .from('payment_vouchers')
          .select('project_id, net_paid')
          .eq('status', 'issued'),
        supabase
          .from('entities')
          .select('*')
          .eq('type', 'client')
          .order('name'),
        userId
          ? supabase
              .from('project_views')
              .select('project_id, view_count')
              .eq('user_id', userId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const firstError = e1 || e2 || e3 || e4;
      if (firstError) throw firstError;

      const viewMap: Record<string, number> = {};
      (viewRows ?? []).forEach((r: { project_id: string; view_count: number }) => {
        viewMap[r.project_id] = r.view_count;
      });

      setProjects(proj ?? []);
      setClientInvoices(ciRaw ?? []);
      setPaymentVouchers(pvRaw ?? []);
      setClients(clientList ?? []);
      setViewCounts(viewMap);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to load projects',
      );
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getMetrics(projectId: string): {
    received: number;
    paid: number;
    margin: number;
  } {
    const received = clientInvoices
      .filter((ci) => ci.project_id === projectId)
      .reduce((s, ci) => s + Number(ci.received_amount || 0), 0);
    const paid = paymentVouchers
      .filter((pv) => pv.project_id === projectId)
      .reduce((s, pv) => s + Number(pv.net_paid || 0), 0);
    return { received, paid, margin: received - paid };
  }

  // ---------------------------------------------------------------------------
  // Filtered & counted projects
  // ---------------------------------------------------------------------------

  const tabCounts: Record<TabKey, number> = useMemo(
    () => ({
      active: projects.filter((p) => projectStatusGroup(p.status) === 'active')
        .length,
      estimation: projects.filter(
        (p) => projectStatusGroup(p.status) === 'estimation',
      ).length,
      budget: projects.filter((p) => projectStatusGroup(p.status) === 'budget')
        .length,
      completed: projects.filter(
        (p) => projectStatusGroup(p.status) === 'completed',
      ).length,
    }),
    [projects],
  );

  const filteredProjects: Project[] = useMemo(() => {
    const q = search.toLowerCase();
    return projects
      .filter((p) => projectStatusGroup(p.status) === tab)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          (p.client as unknown as { name?: string })?.name
            ?.toLowerCase()
            .includes(q),
      )
      .sort((a, b) => (viewCounts[b.id] ?? 0) - (viewCounts[a.id] ?? 0));
  }, [projects, tab, search, viewCounts]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FolderOpen size={32} className="text-gray-300" />
        <p className="text-[13px] text-gray-500">{error}</p>
        <button
          onClick={loadData}
          className="text-sm px-4 py-2 bg-[#0f1923] text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            PSS Power Solutions — solar EPC portfolio
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={executeBudgetPatch}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 mr-4"
          >
            ⚠️ EXECUTE BUDGET PATCH
          </button>
          <button
            onClick={() => setShowNewProject(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0f1923] text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            <PlusCircle size={15} />
            New Project
          </button>
        </div>
      </div>

      {/* Toolbar: tabs + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Tab bar */}
        <div className="flex gap-1 bg-white border border-black/[0.08] rounded-lg p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${
                tab === key
                  ? 'bg-[#0f1923] text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
              {!loading && (
                <span
                  className={`ml-1.5 text-xs font-normal ${
                    tab === key ? 'opacity-60' : 'opacity-40'
                  }`}
                >
                  ({tabCounts[key]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search project or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 text-[13px] border border-black/[0.08] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/20 w-60 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-black/[0.08] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-[#F8F8F7]">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Project
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Client
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Contract ฿
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Received ฿
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Cost Paid ฿
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Margin ฿
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Completion %
              </th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableBodySkeleton rows={6} cols={8} />
            ) : filteredProjects.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    tab={tab}
                    hasSearch={search.length > 0}
                    onClearSearch={() => setSearch('')}
                    onNewProject={() => setShowNewProject(true)}
                  />
                </td>
              </tr>
            ) : (
              filteredProjects.map((project) => {
                const { received, paid, margin } = getMetrics(project.id);
                const completionPct =
                  project.contract_incl_vat > 0
                    ? (received / project.contract_incl_vat) * 100
                    : 0;

                return (
                  <tr
                    key={project.id}
                    className="border-b border-gray-50 last:border-0 hover:bg-[#F8F8F7] cursor-pointer transition-colors"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    {/* Project name + mini progress bar */}
                    <td className="px-4 py-3.5 max-w-[220px]">
                      <p className="text-[13px] font-medium text-gray-900 truncate">
                        {project.name}
                      </p>
                      <ProgressBar pct={completionPct} />
                      <p className="text-xs text-gray-400 mt-0.5">
                        {completionPct.toFixed(0)}% received
                      </p>
                    </td>

                    {/* Client */}
                    <td className="px-4 py-3.5 text-[13px] text-gray-600 max-w-[160px]">
                      <span className="truncate block">
                        {(
                          project.client as unknown as {
                            name?: string;
                          } | null
                        )?.name ?? '—'}
                      </span>
                    </td>

                    {/* Contract */}
                    <td className="px-4 py-3.5 text-right text-[13px] font-medium text-gray-800 tabular-nums">
                      {fmtTHBCompact(project.contract_incl_vat)}
                    </td>

                    {/* Received */}
                    <td className="px-4 py-3.5 text-right text-[13px] text-[#1D9E75] font-medium tabular-nums">
                      {fmtTHBCompact(received)}
                    </td>

                    {/* Cost paid */}
                    <td className="px-4 py-3.5 text-right text-[13px] text-gray-600 tabular-nums">
                      {fmtTHBCompact(paid)}
                    </td>

                    {/* Margin */}
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span
                        className={`text-[13px] font-semibold ${
                          margin >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'
                        }`}
                      >
                        {fmtTHBCompact(margin)}
                      </span>
                    </td>

                    {/* Completion % — same as progress but numeric */}
                    <td className="px-4 py-3.5 text-right text-[13px] text-gray-500 tabular-nums">
                      {completionPct.toFixed(1)}%
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3.5 text-center">
                      <Badge
                        label={PROJECT_STATUS_LABELS[project.status]}
                        variant={projectBadgeVariant(project.status)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer row — project count */}
        {!loading && filteredProjects.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 bg-[#F8F8F7]">
            <p className="text-xs text-gray-400">
              {filteredProjects.length} project
              {filteredProjects.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </p>
          </div>
        )}
      </div>

      {showNewProject && (
        <NewProjectModal
          clients={clients}
          onClose={() => setShowNewProject(false)}
          onSaved={(id) => { setShowNewProject(false); navigate(`/projects/${id}`); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Project Modal
// ---------------------------------------------------------------------------

interface NewProjectModalProps {
  clients: Entity[];
  onClose: () => void;
  onSaved: (projectId: string) => void;
}

function NewProjectModal({ clients, onClose, onSaved }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [contractExcl, setContractExcl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const contractIncl = (parseFloat(contractExcl) || 0) * 1.07;

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Project name is required';
    if (!contractExcl || parseFloat(contractExcl) <= 0) errs.contractExcl = 'Contract value must be greater than 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    const excl = parseFloat(contractExcl) || 0;
    const { data, error } = await supabase.from('projects').insert({
      name: name.trim(),
      client_entity_id: clientId || null,
      contract_excl_vat: excl,
      contract_incl_vat: contractIncl,
      start_date: startDate || null,
      description: description.trim() || null,
      status: 'estimation_draft',
      currency: 'THB',
    }).select('id').maybeSingle();

    setSaving(false);
    if (error) { setErrors({ form: error.message }); return; }
    if (data) onSaved(data.id);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-lg my-10 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-[#0f1923]">New Project</h2>
            <p className="text-xs text-gray-400 mt-0.5">Create a new solar EPC project</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] ${errors.name ? 'border-[#E24B4A]' : 'border-gray-200'}`}
              placeholder="e.g. Solar Farm Phase 3"
            />
            {errors.name && <p className="text-xs text-[#E24B4A] mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Client</label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] bg-white"
            >
              <option value="">— No client selected —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Contract Value excl VAT (฿) *</label>
            <input
              type="number"
              min="0"
              value={contractExcl}
              onChange={e => { setContractExcl(e.target.value); setErrors(p => ({ ...p, contractExcl: '' })); }}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] ${errors.contractExcl ? 'border-[#E24B4A]' : 'border-gray-200'}`}
              placeholder="0"
            />
            {errors.contractExcl && <p className="text-xs text-[#E24B4A] mt-1">{errors.contractExcl}</p>}
            {contractIncl > 0 && (
              <p className="text-xs text-gray-400 mt-1">incl VAT 7%: ฿{contractIncl.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Start Date (optional)</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
              placeholder="Brief project description..."
            />
          </div>

          {errors.form && <p className="text-xs text-[#E24B4A]">{errors.form}</p>}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60"
          >
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state component
// ---------------------------------------------------------------------------

function EmptyState({
  tab,
  hasSearch,
  onClearSearch,
  onNewProject,
}: {
  tab: TabKey;
  hasSearch: boolean;
  onClearSearch: () => void;
  onNewProject: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <Search size={28} className="text-gray-200" />
        <p className="text-[13px] text-gray-400">No projects match your search</p>
        <button
          onClick={onClearSearch}
          className="text-xs px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Clear search
        </button>
      </div>
    );
  }

  const messages: Record<TabKey, { heading: string; sub: string }> = {
    active: {
      heading: 'No active projects',
      sub: 'Projects move here once a budget is approved and construction begins.',
    },
    estimation: {
      heading: 'No estimation-stage projects',
      sub: 'Create a new project to start building your sales estimation.',
    },
    budget: {
      heading: 'No budget-stage projects',
      sub: 'Projects appear here once an estimation is approved and a budget is drafted.',
    },
    completed: {
      heading: 'No completed projects yet',
      sub: 'Finished projects will be archived here for reference.',
    },
  };

  const { heading, sub } = messages[tab];

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-3">
      <FolderOpen size={32} className="text-gray-200" />
      <p className="text-[13px] font-medium text-gray-500">{heading}</p>
      <p className="text-xs text-gray-400 text-center max-w-xs">{sub}</p>
      {tab === 'estimation' && (
        <button
          onClick={onNewProject}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#0f1923] text-white rounded-md hover:bg-gray-800 transition-colors"
        >
          <PlusCircle size={13} />
          New Project
        </button>
      )}
    </div>
  );
}
