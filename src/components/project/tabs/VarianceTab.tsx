import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useProjectDetail } from '../../../context/ProjectDetailContext';
import { fmtTHB, COSTING_CATEGORY_KEYS } from '../../../types';
import { CATEGORY_KEY_LABELS, CATEGORY_MAP } from '../projectDetailConstants';

const APPROVED_STATUSES = new Set(['approved', 'partially_paid', 'fully_paid']);
const DRAFT_STATUSES = new Set(['draft', 'pending_approval']);

export default function VarianceTab() {
  const { estimation, budget, orders, poMilestones, vos, totalReceived, totalPaid, voTotalCost } = useProjectDetail();

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) => {
    const next = new Set(expandedCats);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpandedCats(next);
  };

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
            const isExpanded = expandedCats.has(k);
            const catPOs = orders.filter(o => o.cost_category === CATEGORY_MAP[k]);

            return (
              <tr key={k} className="border-b border-[rgba(0,0,0,0.04)]">
                <td colSpan={6} className="p-0">
                  <table className="w-full">
                    <tbody>
                      <tr
                        className="hover:bg-[#F8F8F7] cursor-pointer"
                        onClick={() => toggleCat(k)}
                      >
                        <td className="px-4 py-2.5 text-gray-700 w-[200px]">
                          <div className="flex items-center gap-1.5">
                            {isExpanded
                              ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                              : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                            {CATEGORY_KEY_LABELS[k]}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 w-[160px]">{fmtTHB(est)}</td>
                        <td className="px-4 py-2.5 text-gray-600 w-[160px]">{fmtTHB(bud)}</td>
                        <td className={`px-4 py-2.5 font-medium w-[180px] ${cellCls}`}>
                          {fmtTHB(approved)}
                          {draft > 0 && (
                            <span className="text-[10px] text-amber-600 block mt-0.5">+ {fmtTHB(draft)} pending</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 font-medium w-[140px] ${variance < 0 ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
                          {fmtTHB(variance)}
                        </td>
                        <td className={`px-4 py-2.5 font-medium ${variancePct < 0 ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
                          {variancePct.toFixed(1)}%
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#F8F8F7]">
                          <td colSpan={6} className="px-8 py-3">
                            <div className="bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
                              {catPOs.length === 0 ? (
                                <p className="p-3 text-xs text-gray-400 text-center">No Purchase Orders for this category.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 border-b border-gray-100 text-gray-500">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-medium">PO No.</th>
                                      <th className="px-3 py-2 text-left font-medium">Vendor</th>
                                      <th className="px-3 py-2 text-left font-medium">Status</th>
                                      <th className="px-3 py-2 text-right font-medium">Amount (excl VAT)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {catPOs.map(po => (
                                      <tr key={po.id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 font-medium text-gray-700">{po.pss_po_no || 'Draft PO'}</td>
                                        <td className="px-3 py-2 text-gray-600">{(po as any).vendor?.name ?? po.supplier_name_raw ?? '—'}</td>
                                        <td className="px-3 py-2">
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            ['approved', 'partially_paid', 'fully_paid'].includes(po.status)
                                              ? 'bg-[#1D9E75]/10 text-[#1D9E75]'
                                              : 'bg-amber-100 text-amber-700'
                                          }`}>
                                            {po.status.replace(/_/g, ' ')}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700">{fmtTHB(po.po_amount_excl_vat)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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
