import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ChevronDown,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Project,
  ProjectCosting,
  VariationOrder,
  PurchaseOrder,
  COSTING_CATEGORY_KEYS,
  COSTING_CATEGORY_LABELS,
  fmtTHB,
  fmtTHBCompact,
} from '../types';

interface ActualByCategory {
  [category: string]: number;
}

interface VarianceRow {
  key: string;
  label: string;
  estimation: number | null;
  budget: number | null;
  actual: number;
  variance: number | null;
  variancePct: number | null;
}

const CATEGORY_FIELD_MAP: Record<string, string> = {
  cost_01_civil: '01_civil',
  cost_02_pv_modules: '02_pv_modules',
  cost_03_mounting: '03_mounting',
  cost_04_inverters: '04_inverters_electrical',
  cost_05_hv_switchgear: '05_hv_switchgear',
  cost_06_cabling: '06_cabling',
  cost_07_installation: '07_installation',
  cost_08_engineering: '08_engineering',
  cost_09_logistics: '09_logistics',
  cost_10_testing: '10_testing_warranty',
};

function SummaryCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: 'green' | 'red' | 'amber' | 'blue' | 'default';
}) {
  const accent =
    variant === 'green'
      ? 'text-[#1D9E75]'
      : variant === 'red'
      ? 'text-[#E24B4A]'
      : variant === 'amber'
      ? 'text-[#EF9F27]'
      : variant === 'blue'
      ? 'text-[#378ADD]'
      : 'text-[#0f1923]';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1 min-w-0">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent} truncate`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function VarianceBadge({ value, pct }: { value: number | null; pct: number | null }) {
  if (value === null) {
    return (
      <span className="text-xs text-gray-400">--</span>
    );
  }
  if (value > 0) {
    return (
      <div className="flex flex-col items-end">
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#E24B4A]">
          <ArrowUpRight size={11} />
          {fmtTHBCompact(value)}
        </span>
        {pct !== null && (
          <span className="text-[10px] text-[#E24B4A]/80">{pct.toFixed(1)}%</span>
        )}
      </div>
    );
  }
  if (value < 0) {
    return (
      <div className="flex flex-col items-end">
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#1D9E75]">
          <ArrowDownRight size={11} />
          {fmtTHBCompact(Math.abs(value))}
        </span>
        {pct !== null && (
          <span className="text-[10px] text-[#1D9E75]/80">{pct.toFixed(1)}%</span>
        )}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
      <Minus size={11} />
      ฿0
    </span>
  );
}

function VarianceCellBg({ value, budget }: { value: number | null; budget: number | null }) {
  if (value === null || budget === null) return 'bg-gray-50';
  if (value > 0) return 'bg-[#E24B4A]/5';
  if (value < 0) return 'bg-[#1D9E75]/5';
  return 'bg-white';
}

export default function CostVariance() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [costings, setCostings] = useState<(ProjectCosting & { project_id: string })[]>([]);
  const [variationOrders, setVariationOrders] = useState<VariationOrder[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [projectsRes, costingsRes, voRes, poRes] = await Promise.all([
      supabase.from('projects').select('*').order('name'),
      supabase.from('project_costings').select('*').eq('status', 'evp_approved'),
      supabase.from('variation_orders').select('*').order('vo_number'),
      supabase
        .from('purchase_orders')
        .select('*, vendor:entities!vendor_id(name), project:projects(name)')
        .neq('status', 'draft'),
    ]);
    setProjects(projectsRes.data ?? []);
    setCostings(costingsRes.data ?? []);
    setVariationOrders(voRes.data ?? []);
    setPurchaseOrders(poRes.data ?? []);
    setLoading(false);
  }

  const filteredCostings = useMemo(() => {
    if (selectedProjectId === 'all') return costings;
    return costings.filter((c) => c.project_id === selectedProjectId);
  }, [costings, selectedProjectId]);

  const filteredVOs = useMemo(() => {
    if (selectedProjectId === 'all') return variationOrders;
    return variationOrders.filter((v) => v.project_id === selectedProjectId);
  }, [variationOrders, selectedProjectId]);

  const filteredPOs = useMemo(() => {
    if (selectedProjectId === 'all') return purchaseOrders;
    return purchaseOrders.filter((p) => p.project_id === selectedProjectId);
  }, [purchaseOrders, selectedProjectId]);

  function latestCosting(stage: 'estimation' | 'budget'): ProjectCosting | null {
    const matching = filteredCostings
      .filter((c) => c.stage === stage)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    if (selectedProjectId !== 'all') {
      return matching[0] ?? null;
    }

    const byProject = new Map<string, ProjectCosting>();
    for (const c of costings.filter((c) => c.stage === stage)) {
      const existing = byProject.get(c.project_id);
      if (
        !existing ||
        new Date(c.created_at) > new Date(existing.created_at)
      ) {
        byProject.set(c.project_id, c);
      }
    }
    return null;
  }

  const estimationRows = useMemo(() => {
    if (selectedProjectId !== 'all') return latestCosting('estimation');
    const byProject = new Map<string, ProjectCosting>();
    for (const c of costings.filter((c) => c.stage === 'estimation')) {
      const existing = byProject.get(c.project_id);
      if (!existing || new Date(c.created_at) > new Date(existing.created_at)) {
        byProject.set(c.project_id, c);
      }
    }
    return [...byProject.values()];
  }, [costings, selectedProjectId]);

  const budgetRows = useMemo(() => {
    if (selectedProjectId !== 'all') {
      return latestCosting('budget');
    }
    const byProject = new Map<string, ProjectCosting>();
    for (const c of costings.filter((c) => c.stage === 'budget')) {
      const existing = byProject.get(c.project_id);
      if (!existing || new Date(c.created_at) > new Date(existing.created_at)) {
        byProject.set(c.project_id, c);
      }
    }
    return [...byProject.values()];
  }, [costings, selectedProjectId]);

  function sumCostingField(
    data: ProjectCosting | ProjectCosting[] | null,
    field: keyof ProjectCosting
  ): number | null {
    if (!data) return null;
    if (Array.isArray(data)) {
      if (data.length === 0) return null;
      return data.reduce((s, c) => s + ((c[field] as number) ?? 0), 0);
    }
    return (data[field] as number) ?? 0;
  }

  const actualsByCategory = useMemo<ActualByCategory>(() => {
    const result: ActualByCategory = {};
    for (const key of Object.values(CATEGORY_FIELD_MAP)) {
      result[key] = 0;
    }
    for (const po of filteredPOs) {
      if (po.cost_category && result[po.cost_category] !== undefined) {
        result[po.cost_category] += po.po_amount_excl_vat ?? 0;
      }
    }
    return result;
  }, [filteredPOs]);

  const totalActualCost = useMemo(
    () => Object.values(actualsByCategory).reduce((s, v) => s + v, 0),
    [actualsByCategory]
  );

  const totalEstimationRevenue = useMemo(() => {
    if (Array.isArray(estimationRows)) {
      return estimationRows.reduce(
        (s, c) => s + (c.sales_price_excl_vat ?? 0),
        0
      );
    }
    return (estimationRows as ProjectCosting | null)?.sales_price_excl_vat ?? 0;
  }, [estimationRows]);

  const totalBudgetRevenue = useMemo(() => {
    if (Array.isArray(budgetRows)) {
      return budgetRows.reduce(
        (s, c) => s + (c.sales_price_excl_vat ?? 0),
        0
      );
    }
    return (budgetRows as ProjectCosting | null)?.sales_price_excl_vat ?? 0;
  }, [budgetRows]);

  const totalEstimationCost = useMemo(() => {
    if (Array.isArray(estimationRows)) {
      return estimationRows.reduce(
        (s, c) => s + (c.total_cost_excl_vat ?? 0),
        0
      );
    }
    return (estimationRows as ProjectCosting | null)?.total_cost_excl_vat ?? 0;
  }, [estimationRows]);

  const totalBudgetCost = useMemo(() => {
    if (Array.isArray(budgetRows)) {
      return budgetRows.reduce(
        (s, c) => s + (c.total_cost_excl_vat ?? 0),
        0
      );
    }
    return (budgetRows as ProjectCosting | null)?.total_cost_excl_vat ?? 0;
  }, [budgetRows]);

  const budgetMargin = totalBudgetRevenue - totalBudgetCost;
  const budgetMarginPct =
    totalBudgetRevenue > 0 ? (budgetMargin / totalBudgetRevenue) * 100 : 0;

  const actualMargin = totalBudgetRevenue - totalActualCost;
  const actualMarginPct =
    totalBudgetRevenue > 0 ? (actualMargin / totalBudgetRevenue) * 100 : 0;

  const approvedVORevenue = filteredVOs
    .filter((v) => v.status === 'evp_approved')
    .reduce((s, v) => s + (v.revenue_increase ?? 0), 0);

  const approvedVOCostKeys = COSTING_CATEGORY_KEYS;
  const approvedVOCostTotal = filteredVOs
    .filter((v) => v.status === 'evp_approved')
    .reduce((s, v) => {
      return (
        s +
        approvedVOCostKeys.reduce(
          (cs, k) => cs + ((v[k as keyof VariationOrder] as number) ?? 0),
          0
        )
      );
    }, 0);

  const overruns = Math.max(0, totalActualCost - totalBudgetCost);
  const forecastMargin =
    budgetMargin + approvedVORevenue - approvedVOCostTotal - overruns;
  const forecastRevenue = totalBudgetRevenue + approvedVORevenue;
  const forecastMarginPct =
    forecastRevenue > 0 ? (forecastMargin / forecastRevenue) * 100 : 0;

  const varianceRows = useMemo<VarianceRow[]>(() => {
    return COSTING_CATEGORY_KEYS.map((key) => {
      const poKey = CATEGORY_FIELD_MAP[key];

      const estVal = Array.isArray(estimationRows)
        ? estimationRows.length > 0
          ? estimationRows.reduce(
              (s, c) => s + ((c[key as keyof ProjectCosting] as number) ?? 0),
              0
            )
          : null
        : (estimationRows as ProjectCosting | null)?.[key as keyof ProjectCosting] != null
        ? ((estimationRows as ProjectCosting)[key as keyof ProjectCosting] as number)
        : null;

      const budVal = Array.isArray(budgetRows)
        ? budgetRows.length > 0
          ? budgetRows.reduce(
              (s, c) => s + ((c[key as keyof ProjectCosting] as number) ?? 0),
              0
            )
          : null
        : (budgetRows as ProjectCosting | null)?.[key as keyof ProjectCosting] != null
        ? ((budgetRows as ProjectCosting)[key as keyof ProjectCosting] as number)
        : null;

      const actualVal = actualsByCategory[poKey] ?? 0;
      const variance = budVal !== null ? actualVal - budVal : null;
      const variancePct =
        budVal !== null && budVal !== 0
          ? (actualVal - budVal) / budVal * 100
          : null;

      return {
        key,
        label: COSTING_CATEGORY_LABELS[key],
        estimation: estVal,
        budget: budVal,
        actual: actualVal,
        variance,
        variancePct,
      };
    });
  }, [estimationRows, budgetRows, actualsByCategory]);

  const totalVariance =
    totalBudgetCost > 0 ? totalActualCost - totalBudgetCost : null;
  const totalVariancePct =
    totalBudgetCost > 0
      ? (totalActualCost - totalBudgetCost) / totalBudgetCost * 100
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F7]">
      <div className="px-6 py-5 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0f1923]">
              Cost Variance Report
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Estimation vs Budget vs Committed across all projects
            </p>
          </div>
          <div className="relative">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white text-[#0f1923] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75]"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex gap-3 flex-wrap">
          <SummaryCard
            label="Total Revenue (Budget)"
            value={fmtTHBCompact(totalBudgetRevenue)}
            sub={
              totalEstimationRevenue
                ? `Est. ${fmtTHBCompact(totalEstimationRevenue)}`
                : undefined
            }
            variant="blue"
          />
          <SummaryCard
            label="Total Budget Cost"
            value={fmtTHBCompact(totalBudgetCost)}
            sub={
              totalEstimationCost
                ? `Est. ${fmtTHBCompact(totalEstimationCost)}`
                : undefined
            }
            variant="default"
          />
          <SummaryCard
            label="Total Committed Cost (POs)"
            value={fmtTHBCompact(totalActualCost)}
            sub={
              totalVariance !== null
                ? `${totalVariance >= 0 ? '+' : ''}${fmtTHBCompact(totalVariance)} vs budget`
                : undefined
            }
            variant={
              totalVariance === null
                ? 'default'
                : totalVariance > 0
                ? 'red'
                : 'green'
            }
          />
          <SummaryCard
            label="Budget Gross Margin"
            value={`${fmtTHBCompact(budgetMargin)} (${budgetMarginPct.toFixed(1)}%)`}
            variant={budgetMarginPct >= 10 ? 'green' : 'amber'}
          />
          <SummaryCard
            label="Committed Margin Today"
            value={`${fmtTHBCompact(actualMargin)} (${actualMarginPct.toFixed(1)}%)`}
            variant={actualMarginPct >= 10 ? 'green' : actualMarginPct >= 0 ? 'amber' : 'red'}
          />
          <SummaryCard
            label="Forecast Margin"
            value={`${fmtTHBCompact(forecastMargin)} (${forecastMarginPct.toFixed(1)}%)`}
            sub={
              approvedVORevenue > 0
                ? `Incl. VO +${fmtTHBCompact(approvedVORevenue)} rev`
                : undefined
            }
            variant={
              forecastMarginPct >= 10
                ? 'green'
                : forecastMarginPct >= 0
                ? 'amber'
                : 'red'
            }
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-[#0f1923]">
              3-Way Variance Table
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8F8F7] border-b border-gray-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 w-52">
                    Category
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">
                    Estimation
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">
                    Budget
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">
                    Committed (POs)
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">
                    Variance
                  </th>
                </tr>
              </thead>
              <tbody>
                {varianceRows.map((row, idx) => (
                  <tr
                    key={row.key}
                    className={`border-b border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8F8F7]/40'} hover:bg-blue-50/20 transition-colors`}
                  >
                    <td className="px-5 py-2.5 text-xs font-medium text-[#0f1923]">
                      {row.label}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                      {row.estimation !== null ? fmtTHBCompact(row.estimation) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-700 font-medium">
                      {row.budget !== null ? fmtTHBCompact(row.budget) : (
                        <span className="text-gray-300">--</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-[#0f1923] font-semibold">
                      {row.actual > 0 ? fmtTHBCompact(row.actual) : (
                        <span className="text-gray-300">฿0</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right ${VarianceCellBg({ value: row.variance, budget: row.budget })}`}
                    >
                      <VarianceBadge value={row.variance} pct={row.variancePct} />
                    </td>
                  </tr>
                ))}

                <tr className="border-t-2 border-gray-200 bg-[#F8F8F7]">
                  <td className="px-5 py-3 text-xs font-bold text-[#0f1923]">
                    Total Cost
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 font-semibold">
                    {totalEstimationCost > 0 ? fmtTHBCompact(totalEstimationCost) : '--'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-700 font-bold">
                    {totalBudgetCost > 0 ? fmtTHBCompact(totalBudgetCost) : '--'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-[#0f1923] font-bold">
                    {fmtTHBCompact(totalActualCost)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${VarianceCellBg({ value: totalVariance, budget: totalBudgetCost > 0 ? totalBudgetCost : null })}`}
                  >
                    <VarianceBadge value={totalVariance} pct={totalVariancePct} />
                  </td>
                </tr>

                <tr className="bg-white">
                  <td className="px-5 py-2.5 text-xs font-bold text-[#0f1923]">
                    Revenue
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[#378ADD] font-semibold">
                    {totalEstimationRevenue > 0
                      ? fmtTHBCompact(totalEstimationRevenue)
                      : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[#378ADD] font-bold">
                    {totalBudgetRevenue > 0
                      ? fmtTHBCompact(totalBudgetRevenue)
                      : '--'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                    —
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                    —
                  </td>
                </tr>

                <tr className="bg-[#1D9E75]/5 border-t border-[#1D9E75]/20">
                  <td className="px-5 py-3 text-xs font-bold text-[#0f1923]">
                    Gross Margin
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-semibold text-[#1D9E75]">
                    {totalEstimationRevenue > 0 && totalEstimationCost > 0
                      ? fmtTHBCompact(totalEstimationRevenue - totalEstimationCost)
                      : '--'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-[#1D9E75]">
                    {totalBudgetRevenue > 0
                      ? `${fmtTHBCompact(budgetMargin)} (${budgetMarginPct.toFixed(1)}%)`
                      : '--'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-[#1D9E75]">
                    {totalBudgetRevenue > 0
                      ? `${fmtTHBCompact(actualMargin)} (${actualMarginPct.toFixed(1)}%)`
                      : '--'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {totalBudgetRevenue > 0 && (
                      <VarianceBadge
                        value={actualMargin - budgetMargin}
                        pct={
                          budgetMargin !== 0
                            ? ((actualMargin - budgetMargin) / Math.abs(budgetMargin)) * 100
                            : null
                        }
                      />
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {filteredVOs.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#0f1923]">
                Variation Orders
              </h2>
              <span className="text-xs text-gray-400">
                {filteredVOs.length} record{filteredVOs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8F8F7] border-b border-gray-100">
                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500">
                      VO No.
                    </th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                      Description
                    </th>
                    {selectedProjectId === 'all' && (
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">
                        Project
                      </th>
                    )}
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">
                      Revenue +
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">
                      Cost Impact
                    </th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVOs.map((vo, idx) => {
                    const project = projects.find(
                      (p) => p.id === vo.project_id
                    );
                    const voTotalCost = COSTING_CATEGORY_KEYS.reduce(
                      (s, k) =>
                        s + ((vo[k as keyof VariationOrder] as number) ?? 0),
                      0
                    );
                    const isApproved = vo.status === 'evp_approved';

                    return (
                      <tr
                        key={vo.id}
                        className={`border-b border-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8F8F7]/40'}`}
                      >
                        <td className="px-5 py-2.5 text-xs font-mono font-semibold text-[#378ADD]">
                          {vo.vo_number}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 max-w-xs">
                          <p className="truncate">{vo.description}</p>
                          {vo.client_po_reference && (
                            <p className="text-gray-400 text-[10px] mt-0.5">
                              Client PO: {vo.client_po_reference}
                            </p>
                          )}
                        </td>
                        {selectedProjectId === 'all' && (
                          <td className="px-4 py-2.5 text-xs text-gray-600 max-w-[140px]">
                            <span className="truncate block">
                              {project?.name ?? '—'}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-right text-xs font-semibold text-[#1D9E75]">
                          {vo.revenue_increase > 0
                            ? `+${fmtTHBCompact(vo.revenue_increase)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs font-semibold text-[#EF9F27]">
                          {voTotalCost > 0
                            ? `+${fmtTHBCompact(voTotalCost)}`
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              isApproved
                                ? 'bg-[#1D9E75]/10 text-[#1D9E75]'
                                : 'bg-[#EF9F27]/10 text-[#EF9F27]'
                            }`}
                          >
                            {isApproved ? (
                              <TrendingUp size={9} />
                            ) : (
                              <AlertCircle size={9} />
                            )}
                            {isApproved ? 'EVP Approved' : 'Draft'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filteredVOs.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-[#F8F8F7]">
                      <td
                        colSpan={selectedProjectId === 'all' ? 3 : 2}
                        className="px-5 py-2.5 text-xs font-bold text-[#0f1923]"
                      >
                        Total
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-[#1D9E75]">
                        +
                        {fmtTHBCompact(
                          filteredVOs.reduce(
                            (s, v) => s + (v.revenue_increase ?? 0),
                            0
                          )
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-[#EF9F27]">
                        +
                        {fmtTHBCompact(
                          filteredVOs.reduce((s, v) => {
                            return (
                              s +
                              COSTING_CATEGORY_KEYS.reduce(
                                (cs, k) =>
                                  cs +
                                  ((v[k as keyof VariationOrder] as number) ??
                                    0),
                                0
                              )
                            );
                          }, 0)
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {filteredVOs.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <AlertCircle size={20} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No variation orders found</p>
          </div>
        )}
      </div>
    </div>
  );
}
