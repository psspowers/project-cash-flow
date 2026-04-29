import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
    canReschedule,
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
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-[#0f1923]">{project.name}</h1>
              <Badge label={PROJECT_STATUS_LABELS[project.status]} variant={statusVariant(project.status)} />
            </div>
            <p className="text-sm text-gray-500">{(project.client as { name?: string } | undefined)?.name ?? '—'}</p>
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
    </ProjectDetailContext.Provider>
  );
}
