import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderOpen, PlusCircle, X, MoreVertical, Trash2, AlertTriangle, TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
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

interface LoanTxRow {
  cash_flow_direction: string;
  amount: number;
}

interface TreasuryAdjRow {
  amount: number;
}

interface SgaActualRow {
  year: number;
  month: number;
  amount: number;
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
  ) return 'gray';
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

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-black/[0.07] p-5 space-y-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
        <div className="h-5 w-16 bg-gray-100 rounded-full" />
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full w-full" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 bg-gray-100 rounded w-2/3" />
            <div className="h-4 bg-gray-100 rounded w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Projects() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const canDelete = profile?.role === 'ceo' || profile?.role === 'evp';

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

  const [loanTxData, setLoanTxData] = useState<LoanTxRow[]>([]);
  const [adjustmentsData, setAdjustmentsData] = useState<TreasuryAdjRow[]>([]);
  const [sgaActualsData, setSgaActualsData] = useState<SgaActualRow[]>([]);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        { data: loanTxRaw },
        { data: adjRaw },
        { data: sgaRaw },
      ] = await Promise.all([
        supabase
          .from('projects')
          .select('*, client:entities!client_entity_id(*)')
          .order('created_at', { ascending: false }),
        supabase.from('client_invoices').select('project_id, received_amount'),
        supabase.from('payment_vouchers').select('project_id, net_paid').eq('status', 'issued'),
        supabase.from('entities').select('*').eq('type', 'client').order('name'),
        userId
          ? supabase.from('project_views').select('project_id, view_count').eq('user_id', userId)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('loan_transactions').select('cash_flow_direction, amount'),
        supabase.from('treasury_adjustments').select('amount'),
        supabase.from('sga_actuals').select('year, month, amount'),
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
      setLoanTxData((loanTxRaw ?? []) as LoanTxRow[]);
      setAdjustmentsData((adjRaw ?? []) as TreasuryAdjRow[]);
      setSgaActualsData((sgaRaw ?? []) as SgaActualRow[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const { error: rpcError } = await supabase.rpc('delete_project_cascade', { p_id: deleteTarget.id });
    setDeleting(false);
    if (rpcError) { setDeleteError(rpcError.message); return; }
    setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  function getMetrics(projectId: string) {
    const received = clientInvoices
      .filter((ci) => ci.project_id === projectId)
      .reduce((s, ci) => s + Number(ci.received_amount || 0), 0);
    const paid = paymentVouchers
      .filter((pv) => pv.project_id === projectId)
      .reduce((s, pv) => s + Number(pv.net_paid || 0), 0);
    return { received, paid, margin: received - paid };
  }

  const tabCounts: Record<TabKey, number> = useMemo(() => ({
    active: projects.filter((p) => projectStatusGroup(p.status) === 'active').length,
    estimation: projects.filter((p) => projectStatusGroup(p.status) === 'estimation').length,
    budget: projects.filter((p) => projectStatusGroup(p.status) === 'budget').length,
    completed: projects.filter((p) => projectStatusGroup(p.status) === 'completed').length,
  }), [projects]);

  const filteredProjects: Project[] = useMemo(() => {
    const q = search.toLowerCase();
    return projects
      .filter((p) => projectStatusGroup(p.status) === tab)
      .filter((p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.client as unknown as { name?: string })?.name?.toLowerCase().includes(q),
      )
      .sort((a, b) => (viewCounts[b.id] ?? 0) - (viewCounts[a.id] ?? 0));
  }, [projects, tab, search, viewCounts]);

  // Portfolio totals for active tab
  const portfolioTotals = useMemo(() => {
    if (tab !== 'active') return null;
    const list = filteredProjects;
    const contract = list.reduce((s, p) => s + (p.contract_incl_vat ?? 0), 0);
    const received = list.reduce((s, p) => s + getMetrics(p.id).received, 0);
    const paid = list.reduce((s, p) => s + getMetrics(p.id).paid, 0);
    const historicalProjectNet = received - paid;

    const netFinancing = loanTxData.reduce((acc, tx) => {
      if (tx.cash_flow_direction === 'in') return acc + Number(tx.amount);
      if (tx.cash_flow_direction === 'out') return acc - Number(tx.amount);
      return acc;
    }, 0);

    const totalAdjustments = adjustmentsData.reduce((s, a) => s + Number(a.amount), 0);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const historicalSga = sgaActualsData
      .filter(a => a.year < currentYear || (a.year === currentYear && a.month <= currentMonth))
      .reduce((s, a) => s + Number(a.amount), 0);

    const trueCashToday = historicalProjectNet + netFinancing + totalAdjustments - historicalSga;

    return { contract, received, paid, margin: received - paid, trueCashToday };
  }, [filteredProjects, clientInvoices, paymentVouchers, loanTxData, adjustmentsData, sgaActualsData, tab]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FolderOpen size={32} className="text-gray-300" />
        <p className="text-[13px] text-gray-500">{error}</p>
        <button onClick={loadData} className="text-sm px-4 py-2 bg-[#0f1923] text-white rounded-lg hover:bg-gray-800 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Projects</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">PSS Power Solutions — solar EPC portfolio</p>
        </div>
        <button
          onClick={() => setShowNewProject(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#0f1923] text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          <PlusCircle size={15} />
          New Project
        </button>
      </div>

      {/* Portfolio summary bar — active tab only */}
      {tab === 'active' && !loading && portfolioTotals && filteredProjects.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Portfolio Contract', value: portfolioTotals.contract, color: 'text-gray-900' },
            { label: 'Total Received', value: portfolioTotals.received, color: 'text-[#1D9E75]' },
            { label: 'Cost Paid', value: portfolioTotals.paid, color: 'text-gray-600' },
            { label: 'Corporate Bank Balance (Est.)', value: portfolioTotals.trueCashToday, color: portfolioTotals.trueCashToday >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-black/[0.07] px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">{m.label}</p>
              <p className={`text-base font-bold tabular-nums ${m.color}`}>{fmtTHBCompact(m.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: tabs + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex gap-1 bg-white border border-black/[0.08] rounded-lg p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap ${
                tab === key ? 'bg-[#0f1923] text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
              {!loading && (
                <span className={`ml-1.5 text-xs font-normal ${tab === key ? 'opacity-60' : 'opacity-40'}`}>
                  ({tabCounts[key]})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search project or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 text-[13px] border border-black/[0.08] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/20 w-60 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          tab={tab}
          hasSearch={search.length > 0}
          onClearSearch={() => setSearch('')}
          onNewProject={() => setShowNewProject(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredProjects.map((project) => {
              const { received, paid, margin } = getMetrics(project.id);
              const completionPct = project.contract_incl_vat > 0
                ? Math.min(100, (received / project.contract_incl_vat) * 100)
                : 0;
              const clientName = (project.client as unknown as { name?: string } | null)?.name ?? null;

              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  clientName={clientName}
                  received={received}
                  paid={paid}
                  margin={margin}
                  completionPct={completionPct}
                  canDelete={canDelete}
                  isMenuOpen={openMenuId === project.id}
                  onMenuOpen={() => setOpenMenuId(project.id)}
                  onMenuClose={() => setOpenMenuId(null)}
                  onDeleteClick={() => { setOpenMenuId(null); setDeleteError(null); setDeleteTarget(project); }}
                  onClick={() => navigate(`/projects/${project.id}`)}
                />
              );
            })}
          </div>

          {/* Footer count */}
          <p className="text-xs text-gray-400 pb-1">
            {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </p>
        </>
      )}

      {showNewProject && (
        <NewProjectModal
          clients={clients}
          onClose={() => setShowNewProject(false)}
          onSaved={(id) => { setShowNewProject(false); navigate(`/projects/${id}`); }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          project={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onConfirm={handleDeleteConfirm}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: Project;
  clientName: string | null;
  received: number;
  paid: number;
  margin: number;
  completionPct: number;
  canDelete: boolean;
  isMenuOpen: boolean;
  onMenuOpen: () => void;
  onMenuClose: () => void;
  onDeleteClick: () => void;
  onClick: () => void;
}

function ProjectCard({
  project, clientName, received, paid, margin, completionPct,
  canDelete, isMenuOpen, onMenuOpen, onMenuClose, onDeleteClick, onClick,
}: ProjectCardProps) {
  const isNegative = margin < 0;

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-xl border border-black/[0.07] hover:border-[#1D9E75]/40 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top accent bar */}
      <div className={`h-0.5 w-full ${project.status === 'active' ? 'bg-[#1D9E75]' : project.status === 'completed' ? 'bg-gray-300' : 'bg-[#378ADD]'}`} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[14px] font-semibold text-gray-900 leading-snug truncate max-w-[260px]">
                {project.name}
              </h3>
              <Badge
                label={PROJECT_STATUS_LABELS[project.status]}
                variant={projectBadgeVariant(project.status)}
              />
            </div>
            {clientName && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{clientName}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {canDelete && (
              <ProjectRowMenu
                project={project}
                isOpen={isMenuOpen}
                onOpen={onMenuOpen}
                onClose={onMenuClose}
                onDeleteClick={onDeleteClick}
              />
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-1">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400">Revenue received</span>
            <span className="font-medium text-gray-700 tabular-nums">{completionPct.toFixed(1)}%</span>
          </div>
          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1D9E75] transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>

        {/* Metrics grid */}
        <div className="mt-4 grid grid-cols-4 gap-3 pt-3 border-t border-gray-50">
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Contract</p>
            <p className="text-[13px] font-semibold text-gray-800 tabular-nums">{fmtTHBCompact(project.contract_incl_vat)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Received</p>
            <p className="text-[13px] font-semibold text-[#1D9E75] tabular-nums">{fmtTHBCompact(received)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Cost Paid</p>
            <p className="text-[13px] font-semibold text-gray-600 tabular-nums">{fmtTHBCompact(paid)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">Cash Balance</p>
            <div className="flex items-center gap-1">
              {isNegative
                ? <TrendingDown size={11} className="text-[#E24B4A] shrink-0" />
                : <TrendingUp size={11} className="text-[#1D9E75] shrink-0" />
              }
              <p className={`text-[13px] font-bold tabular-nums ${isNegative ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
                {fmtTHBCompact(margin)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project row kebab menu
// ---------------------------------------------------------------------------

const DELETABLE_STATUSES: ProjectStatus[] = ['estimation_draft', 'budget_draft'];

interface ProjectRowMenuProps {
  project: Project;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDeleteClick: () => void;
}

function ProjectRowMenu({ project, isOpen, onOpen, onClose, onDeleteClick }: ProjectRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isDeletable = DELETABLE_STATUSES.includes(project.status);

  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={isOpen ? onClose : onOpen}
        className="p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Project actions"
      >
        <MoreVertical size={15} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-black/[0.08] rounded-lg shadow-lg z-30 overflow-hidden">
          {isDeletable ? (
            <button
              onClick={onDeleteClick}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-[#E24B4A] hover:bg-[#E24B4A]/5 transition-colors"
            >
              <Trash2 size={14} />
              Delete Project
            </button>
          ) : (
            <div className="px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 text-sm text-gray-400 cursor-not-allowed">
                <Trash2 size={14} />
                Delete Project
              </div>
              <p className="text-xs text-gray-400 mt-1 leading-snug">Cannot delete an Active or Completed project.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

interface DeleteConfirmModalProps {
  project: Project;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ project, deleting, error, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#E24B4A]/10 flex items-center justify-center">
            <AlertTriangle size={18} className="text-[#E24B4A]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Delete Project</h2>
            <p className="text-[13px] text-gray-500 mt-0.5">This action cannot be undone.</p>
          </div>
          <button onClick={onCancel} disabled={deleting} className="ml-auto text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-5 space-y-3">
          <p className="text-[13px] text-gray-700">
            You are about to permanently delete{' '}
            <span className="font-semibold text-gray-900">{project.name}</span>.
          </p>
          <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-xs text-gray-500 leading-relaxed space-y-1">
            <p className="font-medium text-gray-700 mb-1.5">All related data will be removed:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Purchase orders &amp; PO milestones</li>
              <li>Vendor invoices &amp; payments</li>
              <li>Payment vouchers &amp; checks</li>
              <li>Client milestones &amp; invoices</li>
              <li>Cash receipts</li>
              <li>Project costings &amp; variation orders</li>
              <li>Cash transfers involving this project</li>
              <li>Progress reports</li>
            </ul>
          </div>
          {error && (
            <p className="text-xs text-[#E24B4A] bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCancel} disabled={deleting} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting} className="px-4 py-2 text-sm bg-[#E24B4A] text-white rounded-lg hover:bg-[#c73c3c] transition-colors disabled:opacity-60 flex items-center gap-2 min-w-[120px] justify-center">
            {deleting ? (
              <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting...</>
            ) : (
              <><Trash2 size={13} />Delete Project</>
            )}
          </button>
        </div>
      </div>
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

function NewProjectModal({ clients: initialClients, onClose, onSaved }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [contractExcl, setContractExcl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [clients, setClients] = useState<Entity[]>(initialClients);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  const selectedClient = clients.find(c => c.id === clientId);
  const filteredClients = clientSearch.trim()
    ? clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : clients;
  const contractIncl = (parseFloat(contractExcl) || 0) * 1.07;

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Project name is required';
    if (!clientId) errs.clientId = 'Client is required';
    if (!contractExcl || parseFloat(contractExcl) <= 0) errs.contractExcl = 'Contract value must be greater than 0';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleCreateClient() {
    if (!newClientName.trim() || savingClient) return;
    setSavingClient(true);
    const { data, error } = await supabase
      .from('entities')
      .insert({ name: newClientName.trim(), type: 'client' })
      .select('id, name, type')
      .maybeSingle();
    setSavingClient(false);
    if (error) { alert('Failed to create client: ' + error.message); return; }
    if (data) {
      const newClient = data as Entity;
      setClients(prev => [...prev, newClient].sort((a, b) => a.name.localeCompare(b.name)));
      setClientId(newClient.id);
      setClientSearch(newClient.name);
    }
    setCreatingClient(false);
    setNewClientName('');
    setClientDropdownOpen(false);
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

          <div className="relative">
            <label className="text-xs font-medium text-gray-600 mb-1 block">Client</label>
            <div className="relative">
              <input
                type="text"
                value={clientSearch || (selectedClient ? selectedClient.name : '')}
                onChange={e => { setClientSearch(e.target.value); setClientId(''); setClientDropdownOpen(true); setCreatingClient(false); setErrors(p => ({ ...p, clientId: '' })); }}
                onFocus={() => setClientDropdownOpen(true)}
                onBlur={() => setTimeout(() => setClientDropdownOpen(false), 150)}
                placeholder="Search or select client..."
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] pr-8 ${errors.clientId ? 'border-[#E24B4A]' : 'border-gray-200'}`}
              />
              {clientId && (
                <button type="button" onMouseDown={e => { e.preventDefault(); setClientId(''); setClientSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  <X size={13} />
                </button>
              )}
            </div>
            {errors.clientId && <p className="text-xs text-[#E24B4A] mt-1">{errors.clientId}</p>}

            {clientDropdownOpen && !creatingClient && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  {filteredClients.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400 italic">No clients match "{clientSearch}"</p>
                  )}
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => { setClientId(c.id); setClientSearch(''); setClientDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${clientId === c.id ? 'bg-[#1D9E75]/5 text-[#1D9E75] font-medium' : 'text-gray-700'}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-100">
                  <button
                    type="button"
                    onMouseDown={() => { setCreatingClient(true); setNewClientName(clientSearch); setClientDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-[#1D9E75] font-medium hover:bg-[#1D9E75]/5 flex items-center gap-1.5 transition-colors"
                  >
                    <PlusCircle size={13} />
                    Create new client{clientSearch ? ` "${clientSearch}"` : ''}
                  </button>
                </div>
              </div>
            )}

            {creatingClient && (
              <div className="mt-2 border border-[#1D9E75]/30 rounded-lg p-3 bg-[#1D9E75]/5 space-y-2">
                <p className="text-xs font-medium text-[#1D9E75]">New Client</p>
                <input
                  type="text"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateClient(); } if (e.key === 'Escape') { setCreatingClient(false); setNewClientName(''); } }}
                  autoFocus
                  placeholder="Client / company name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75] bg-white"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setCreatingClient(false); setNewClientName(''); }} className="flex-1 border border-gray-200 text-gray-600 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-50">Cancel</button>
                  <button type="button" onClick={handleCreateClient} disabled={!newClientName.trim() || savingClient} className="flex-1 bg-[#1D9E75] text-white py-1.5 rounded-lg text-xs font-medium hover:bg-[#178a64] disabled:opacity-60 flex items-center justify-center gap-1">
                    {savingClient ? 'Saving...' : 'Save Client'}
                  </button>
                </div>
              </div>
            )}
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-60">
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  tab, hasSearch, onClearSearch, onNewProject,
}: {
  tab: TabKey;
  hasSearch: boolean;
  onClearSearch: () => void;
  onNewProject: () => void;
}) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <Search size={28} className="text-gray-200" />
        <p className="text-[13px] text-gray-400">No projects match your search</p>
        <button onClick={onClearSearch} className="text-xs px-3 py-1.5 border border-gray-200 rounded-md text-gray-500 hover:bg-gray-50 transition-colors">
          Clear search
        </button>
      </div>
    );
  }

  const messages: Record<TabKey, { heading: string; sub: string }> = {
    active: { heading: 'No active projects', sub: 'Projects move here once a budget is approved and construction begins.' },
    estimation: { heading: 'No estimation-stage projects', sub: 'Create a new project to start building your sales estimation.' },
    budget: { heading: 'No budget-stage projects', sub: 'Projects appear here once an estimation is approved and a budget is drafted.' },
    completed: { heading: 'No completed projects yet', sub: 'Finished projects will be archived here for reference.' },
  };

  const { heading, sub } = messages[tab];
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-3">
      <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
        <Zap size={22} className="text-gray-300" />
      </div>
      <p className="text-[13px] font-medium text-gray-500">{heading}</p>
      <p className="text-xs text-gray-400 text-center max-w-xs">{sub}</p>
      {tab === 'estimation' && (
        <button onClick={onNewProject} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#0f1923] text-white rounded-md hover:bg-gray-800 transition-colors">
          <PlusCircle size={13} />
          New Project
        </button>
      )}
    </div>
  );
}
