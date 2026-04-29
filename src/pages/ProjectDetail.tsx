import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COSTING_CATEGORY_KEYS, PROJECT_STATUS_LABELS } from '../types';
import Badge, { statusVariant } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { useProjectData } from '../hooks/useProjectData';
import { ProjectDetailContext } from '../context/ProjectDetailContext';
import type { ProjectDetailContextValue } from '../context/ProjectDetailContext';
import type { VariationOrder } from '../types';
import OverviewTab from '../components/project/tabs/OverviewTab';
import CostingTab from '../components/project/tabs/CostingTab';
import VarianceTab from '../components/project/tabs/VarianceTab';
import OrdersTab from '../components/project/tabs/OrdersTab';
import CashflowTab from '../components/project/tabs/CashflowTab';
import TimelineTab from '../components/project/tabs/TimelineTab';

type Tab = 'overview' | 'costing' | 'variance' | 'orders' | 'cashflow' | 'timeline';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'costing', label: 'Costing' },
  { key: 'variance', label: 'Cost Variance' },
  { key: 'orders', label: 'Purchase Orders' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'timeline', label: 'S-Curve' },
];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, user } = useAuth();

  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'overview';
  const [tab, setTab] = useState<Tab>(initialTab);

  const data = useProjectData(id);
  const { project, costings, vos, orders, orphanVendorInvoices, clientInvoices, profiles, loading } = data;

  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [lockSaving, setLockSaving] = useState(false);

  // Track project view for personalised sorting
  useEffect(() => {
    if (!id || !user?.id) return;
    supabase.rpc('upsert_project_view', { p_user_id: user.id, p_project_id: id }).then(() => {});
  }, [id, user?.id]);

  const estimation = costings.find(c => c.stage === 'estimation');
  const budget = costings.find(c => c.stage === 'budget');
  const isCostController = profile?.role === 'cost_controller';
  const isAccountsManager = profile?.role === 'accounts_manager';
  const canReschedule = isCostController || isAccountsManager;
  const isCM = profile?.role === 'construction_manager';
  const isEVP = profile?.role === 'evp';
  const isCEO = profile?.role === 'ceo';
  const isPO = isCEO || isEVP;

  const isFinancialsLocked = project?.is_financials_locked ?? false;

  async function handleLockFinancials() {
    if (!project) return;
    setLockSaving(true);
    await supabase.from('projects').update({ is_financials_locked: true }).eq('id', project.id);
    setShowLockConfirm(false);
    setLockSaving(false);
    await data.reload();
  }

  const totalReceived = clientInvoices.reduce((s, i) => s + (i.received_amount ?? 0), 0);
  const totalPaid = useMemo(
    () =>
      orders.reduce((s, o) => s + o.invoices.reduce((si, i) => si + (i.received_amount ?? 0), 0), 0) +
      orphanVendorInvoices.reduce((s, i) => s + i.received_amount, 0),
    [orders, orphanVendorInvoices],
  );

  function profileName(uid?: string | null): string {
    if (!uid) return '—';
    return profiles.find(p => p.id === uid)?.full_name ?? '—';
  }

  function voTotalCost(vo: VariationOrder): number {
    return COSTING_CATEGORY_KEYS.reduce((s, k) => s + ((vo[k as keyof VariationOrder] as number) ?? 0), 0);
  }

  const ctxValue: ProjectDetailContextValue = {
    ...data,
    estimation,
    budget,
    isCostController,
    isAccountsManager,
    isCM,
    isEVP,
    isCEO,
    isPO,
    canReschedule,
    isFinancialsLocked,
    totalReceived,
    totalPaid,
    profileName,
    voTotalCost,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center">
        <span className="text-gray-400 text-sm">Project not found.</span>
      </div>
    );
  }

  return (
    <ProjectDetailContext.Provider value={ctxValue}>
      <div className="min-h-screen bg-[#F8F8F7]">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center gap-1.5 text-gray-500 hover:text-[#0f1923] text-sm mb-5 transition-colors"
          >
            <ArrowLeft size={15} /> Back to Projects
          </button>

          <div className="mb-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h1 className="text-xl font-bold text-[#0f1923]">{project.name}</h1>
                  {isFinancialsLocked && (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-[#E24B4A] bg-[#E24B4A]/8 border border-[#E24B4A]/20 rounded-full px-2.5 py-0.5">
                      <Lock size={11} /> Financials Locked
                    </span>
                  )}
                  <Badge label={PROJECT_STATUS_LABELS[project.status]} variant={statusVariant(project.status)} />
                </div>
                <p className="text-sm text-gray-500">{(project.client as { name?: string } | undefined)?.name ?? '—'}</p>
              </div>

              {isPO && !isFinancialsLocked && (
                <button
                  onClick={() => setShowLockConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#E24B4A]/40 text-[#E24B4A] text-xs font-medium rounded-lg hover:bg-[#E24B4A]/5 transition-colors shrink-0 mt-0.5"
                >
                  <Lock size={12} /> Lock Financials
                </button>
              )}
            </div>
          </div>

          <div className="flex border-b border-[rgba(0,0,0,0.08)] mb-6">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'border-b-2 border-[#1D9E75] text-[#1D9E75]'
                    : 'text-gray-500 hover:text-[#0f1923]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && <OverviewTab />}
          {tab === 'costing' && <CostingTab />}
          {tab === 'variance' && <VarianceTab />}
          {tab === 'orders' && <OrdersTab />}
          {tab === 'cashflow' && <CashflowTab />}
          {tab === 'timeline' && <TimelineTab />}
        </div>
      </div>

      {/* Lock Financials confirmation modal */}
      {showLockConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200 shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#E24B4A]/10 flex items-center justify-center shrink-0">
                <Lock size={16} className="text-[#E24B4A]" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Lock Financials?</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed">
                Are you sure? <span className="font-semibold">Locking financials will permanently disable editing</span> for all Budgets, POs, and Invoices on this project.
              </p>
              <div className="bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-[#E24B4A]">This action cannot be undone.</p>
                <p className="text-xs text-[#c73d3c]">The data will be permanently read-only. The Cost Controller will no longer be able to make inline edits to any financial records on this project.</p>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowLockConfirm(false)}
                disabled={lockSaving}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLockFinancials}
                disabled={lockSaving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#E24B4A] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#c73d3c] disabled:opacity-60 transition-colors"
              >
                <Lock size={14} />
                {lockSaving ? 'Locking...' : 'Yes, Lock Financials'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProjectDetailContext.Provider>
  );
}
