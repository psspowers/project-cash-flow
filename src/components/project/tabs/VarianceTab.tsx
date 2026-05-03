import { useProjectDetail } from '../../../context/ProjectDetailContext';
import { fmtTHB, COSTING_CATEGORY_KEYS } from '../../../types';
import { CATEGORY_KEY_LABELS, CATEGORY_MAP } from '../projectDetailConstants';

const APPROVED_STATUSES = new Set(['approved', 'partially_paid', 'fully_paid']);
const DRAFT_STATUSES = new Set(['draft', 'pending_approval']);

export default function VarianceTab() {
  const { estimation, budget, orders, poMilestones, vos, totalReceived, totalPaid, voTotalCost } = useProjectDetail();

  // Build a lookup: po id -> { cost_category, status }
  const poMeta = new Map(orders.map(o => [o.id, { category: o.cost_category, status: o.status }]));

  const committedByCategory = (cat: typeof COSTING_CATEGORY_KEYS[number]): { approved: number; draft: number } => {
    const mapped = CATEGORY_MAP[cat];
    let approved = 0;
    let draft = 0;
    for (const pm of poMilestones) {
      const meta = poMeta.get(pm.purchase_order_id);
      if (!meta || meta.category !== mapped) continue;
      if (APPROVED_STATUSES.has(meta.status)) approved += pm.amount_due;
      else if (DRAFT_STATUSES.has(meta.status)) draft += pm.amount_due;
    }
    return { approved, draft };
  };

  const totalEst = COSTING_CATEGORY_KEYS.reduce((s, k) => s + ((estimation?.[k as keyof typeof estimation] as number) ?? 0), 0);
  const totalBud = COSTING_CATEGORY_KEYS.reduce((s, k) => s + ((budget?.[k as keyof typeof budget] as number) ?? 0), 0);
  const totalApprovedCommitted = COSTING_CATEGORY_KEYS.reduce((s, k) => s + committedByCategory(k).approved, 0);
  const totalDraftCommitted = COSTING_CATEGORY_KEYS.reduce((s, k) => s + committedByCategory(k).draft, 0);
  const totalVar = totalBud - totalApprovedCommitted;
  const totalVarPct = totalBud > 0 ? (totalVar / totalBud) * 100 : 0;
  const voRevAdj = vos.filter(v => v.status === 'evp_approved').reduce((s, v) => s + v.revenue_increase, 0);
  const voCostAdj = vos.filter(v => v.status === 'evp_approved').reduce((s, v) => s + voTotalCost(v), 0);
  const budgetRevenue = budget?.sales_price_excl_vat ?? 0;
  const forecastMargin = (budgetRevenue + voRevAdj) - (totalBud + voCostAdj) - Math.max(0, totalApprovedCommitted - totalBud);
  const cashMargin = totalReceived - totalPaid;

  return (
    <div className="bg-white border border-[rgba(0,0,0,0.08)] rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#F8F8F7] border-b border-[rgba(0,0,0,0.06)]">
            {['Category', 'Estimation', 'Budget', 'Committed (POs)', 'Variance', 'Variance %'].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COSTING_CATEGORY_KEYS.map(k => {
            const est = (estimation?.[k as keyof typeof estimation] as number) ?? 0;
            const bud = (budget?.[k as keyof typeof budget] as number) ?? 0;
            const { approved, draft } = committedByCategory(k);
            const variance = bud - approved;
            const variancePct = bud > 0 ? (variance / bud) * 100 : 0;
            const cellCls = approved > bud
              ? 'bg-[#E24B4A]/10 text-[#E24B4A]'
              : approved > est
              ? 'bg-[#EF9F27]/10 text-[#EF9F27]'
              : 'bg-[#1D9E75]/10 text-[#1D9E75]';
            return (
              <tr key={k} className="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#F8F8F7]">
                <td className="px-4 py-2.5 text-gray-700">{CATEGORY_KEY_LABELS[k]}</td>
                <td className="px-4 py-2.5 text-gray-600">{fmtTHB(est)}</td>
                <td className="px-4 py-2.5 text-gray-600">{fmtTHB(bud)}</td>
                <td className={`px-4 py-2.5 font-medium ${cellCls}`}>
                  {fmtTHB(approved)}
                  {draft > 0 && (
                    <span className="text-[10px] text-amber-600 block mt-0.5">+ {fmtTHB(draft)} pending</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 font-medium ${variance < 0 ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
                  {fmtTHB(variance)}
                </td>
                <td className={`px-4 py-2.5 font-medium ${variancePct < 0 ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
                  {variancePct.toFixed(1)}%
                </td>
              </tr>
            );
          })}
          <tr className="bg-[#F8F8F7] border-t-2 border-[rgba(0,0,0,0.1)] font-semibold">
            <td className="px-4 py-3 text-[#0f1923]">Total</td>
            <td className="px-4 py-3">{fmtTHB(totalEst)}</td>
            <td className="px-4 py-3">{fmtTHB(totalBud)}</td>
            <td className="px-4 py-3">
              {fmtTHB(totalApprovedCommitted)}
              {totalDraftCommitted > 0 && (
                <span className="text-[10px] text-amber-600 block mt-0.5 font-normal">+ {fmtTHB(totalDraftCommitted)} pending</span>
              )}
            </td>
            <td className={`px-4 py-3 ${totalVar < 0 ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>{fmtTHB(totalVar)}</td>
            <td className={`px-4 py-3 ${totalVarPct < 0 ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>{totalVarPct.toFixed(1)}%</td>
          </tr>
          <tr className="border-t border-[rgba(0,0,0,0.06)]">
            <td className="px-4 py-3 text-xs font-semibold text-[#0f1923]">Cash Margin Today (actual)</td>
            <td colSpan={4} className="px-4 py-3">
              <span className={`text-xs font-bold ${cashMargin >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                {fmtTHB(cashMargin)}
              </span>
              <span className="text-xs text-gray-400 ml-2">Note: negative mid-project is normal — costs run ahead of client payments.</span>
            </td>
            <td />
          </tr>
          <tr className="border-t border-[rgba(0,0,0,0.04)] bg-[#1D9E75]/5">
            <td className="px-4 py-3 text-xs font-semibold text-[#0f1923]">Forecast Margin at Completion</td>
            <td colSpan={4} className="px-4 py-3">
              <span className={`text-xs font-bold ${forecastMargin >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                {fmtTHB(forecastMargin)}
              </span>
              <span className="text-xs text-gray-400 ml-2">True project P&L — contract value minus approved budget.</span>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
