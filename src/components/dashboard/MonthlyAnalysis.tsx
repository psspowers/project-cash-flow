import { useEffect, useState, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { X, BarChart2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaidMilestoneRow {
  id: string;
  milestone_number: number;
  paid_amount: number | null;
  amount_due: number;
  planned_payment_date: string | null;
  purchase_order: {
    pss_po_no: string | null;
    description: string | null;
    supplier_name_raw: string | null;
    project: {
      id: string;
      name: string;
    };
  };
}

interface DrillRow {
  project: string;
  monthLabel: string;
  poNo: string;
  supplier: string;
  description: string;
  milestoneNo: number;
  paidAmount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMonthKey(dateStr: string): string {
  // Returns sortable key: '2024-12'
  return dateStr.slice(0, 7);
}

function toMonthLabel(monthKey: string): string {
  // '2024-12' → 'Dec-24'
  try {
    return format(parseISO(`${monthKey}-01`), 'MMM-yy');
  } catch {
    return monthKey;
  }
}

function fmtTHB2dp(n: number): string {
  if (n === 0) return '—';
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// DrillDownModal
// ---------------------------------------------------------------------------

interface DrillDownModalProps {
  rows: DrillRow[];
  cellLabel: string;
  onClose: () => void;
}

function DrillDownModal({ rows, cellLabel, onClose }: DrillDownModalProps) {
  const total = rows.reduce((s, r) => s + r.paidAmount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-black/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Drill-Down Detail</h3>
            <p className="text-xs text-gray-400 mt-0.5">{cellLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-[#F8F8F7] sticky top-0">
                <th className="text-left px-4 py-3">Project</th>
                <th className="text-left px-4 py-3">Month</th>
                <th className="text-left px-4 py-3">PO Number</th>
                <th className="text-left px-4 py-3">Supplier</th>
                <th className="text-left px-4 py-3 max-w-[200px]">Description</th>
                <th className="text-center px-4 py-3">Milestone #</th>
                <th className="text-right px-4 py-3">Paid Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-[#F8F8F7] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-700 whitespace-nowrap">{r.project}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.monthLabel}</td>
                  <td className="px-4 py-2.5 text-gray-700 font-mono text-xs whitespace-nowrap">{r.poNo || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.supplier || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-[200px] truncate">{r.description || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500">{r.milestoneNo}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums whitespace-nowrap">
                    {fmtTHB2dp(r.paidAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#1D9E75]/5 border-t-2 border-[#1D9E75]/20">
                <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums text-[13px]">
                  {fmtTHB2dp(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MonthlyAnalysis() {
  const [rows, setRows] = useState<PaidMilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<{ rows: DrillRow[]; label: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('po_milestones')
      .select(`
        id,
        milestone_number,
        paid_amount,
        amount_due,
        planned_payment_date,
        purchase_order:purchase_orders (
          pss_po_no,
          description,
          supplier_name_raw,
          project:projects (
            id,
            name
          )
        )
      `)
      .eq('status', 'paid')
      .not('planned_payment_date', 'is', null)
      .order('planned_payment_date', { ascending: true });

    if (!error && data) {
      setRows(data as unknown as PaidMilestoneRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Build pivot ──────────────────────────────────────────────────────────

  // Collect unique sorted month keys and project names
  const monthKeySet = new Set<string>();
  const projectNameSet = new Set<string>();

  for (const r of rows) {
    if (!r.planned_payment_date) continue;
    monthKeySet.add(toMonthKey(r.planned_payment_date));
    const name = r.purchase_order?.project?.name ?? 'Unknown';
    projectNameSet.add(name);
  }

  const monthKeys = [...monthKeySet].sort();
  const projectNames = [...projectNameSet].sort();

  // cell map: `${projectName}||${monthKey}` → DrillRow[]
  const cellMap = new Map<string, DrillRow[]>();

  for (const r of rows) {
    if (!r.planned_payment_date) continue;
    const key = toMonthKey(r.planned_payment_date);
    const project = r.purchase_order?.project?.name ?? 'Unknown';
    const mapKey = `${project}||${key}`;
    if (!cellMap.has(mapKey)) cellMap.set(mapKey, []);
    cellMap.get(mapKey)!.push({
      project,
      monthLabel: toMonthLabel(key),
      poNo: r.purchase_order?.pss_po_no ?? '',
      supplier: r.purchase_order?.supplier_name_raw ?? '',
      description: r.purchase_order?.description ?? '',
      milestoneNo: r.milestone_number,
      paidAmount: Number(r.paid_amount ?? r.amount_due ?? 0),
    });
  }

  function cellSum(project: string, monthKey: string): number {
    return (cellMap.get(`${project}||${monthKey}`) ?? [])
      .reduce((s, d) => s + d.paidAmount, 0);
  }

  function projectTotal(project: string): number {
    return monthKeys.reduce((s, mk) => s + cellSum(project, mk), 0);
  }

  function monthTotal(monthKey: string): number {
    return projectNames.reduce((s, p) => s + cellSum(p, monthKey), 0);
  }

  const grandTotal = monthKeys.reduce((s, mk) => s + monthTotal(mk), 0);

  function openDrill(project: string | null, monthKey: string | null) {
    let drillRows: DrillRow[] = [];
    let label = '';

    if (project && monthKey) {
      drillRows = cellMap.get(`${project}||${monthKey}`) ?? [];
      label = `${project} — ${toMonthLabel(monthKey)}`;
    } else if (project) {
      drillRows = monthKeys.flatMap(mk => cellMap.get(`${project}||${mk}`) ?? []);
      label = `${project} — Grand Total`;
    } else if (monthKey) {
      drillRows = projectNames.flatMap(p => cellMap.get(`${p}||${monthKey}`) ?? []);
      label = `${toMonthLabel(monthKey)} — All Projects`;
    } else {
      drillRows = [...cellMap.values()].flat();
      label = 'Grand Total — All Projects & Months';
    }

    if (drillRows.length > 0) setDrill({ rows: drillRows, label });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 size={15} className="text-gray-400" />
            <h2 className="text-[13px] font-semibold text-gray-800">
              Monthly Analysis — Invoices Paid
            </h2>
          </div>
          <p className="text-[11px] text-gray-400">
            Click any value to drill down
          </p>
        </div>

        {loading ? (
          <div className="space-y-2 py-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2">
            <BarChart2 size={28} className="text-gray-200" />
            <p className="text-[13px] text-gray-400">No paid milestones found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-[#F8F8F7]">
                  {/* Sticky project-name column header */}
                  <th className="sticky left-0 z-10 bg-[#F8F8F7] text-left px-4 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 whitespace-nowrap min-w-[160px]">
                    Project
                  </th>
                  {monthKeys.map(mk => (
                    <th
                      key={mk}
                      className="text-right px-3 py-2.5 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap"
                    >
                      {toMonthLabel(mk)}
                    </th>
                  ))}
                  {/* Grand Total column */}
                  <th className="text-right px-4 py-2.5 font-bold text-gray-700 border-b border-l border-gray-200 bg-green-50 whitespace-nowrap">
                    Grand Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {projectNames.map((project, pi) => {
                  const rowTotal = projectTotal(project);
                  return (
                    <tr
                      key={project}
                      className={pi % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF9]'}
                    >
                      {/* Sticky project name cell */}
                      <td
                        className={`sticky left-0 z-10 px-4 py-2 font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap truncate max-w-[160px] ${
                          pi % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF9]'
                        }`}
                      >
                        {project}
                      </td>

                      {monthKeys.map(mk => {
                        const val = cellSum(project, mk);
                        const drillRows = cellMap.get(`${project}||${mk}`) ?? [];
                        return (
                          <td
                            key={mk}
                            className={`text-right px-3 py-2 tabular-nums border-b border-gray-50 transition-colors ${
                              val > 0
                                ? 'text-gray-800 font-medium cursor-pointer hover:bg-blue-50 hover:text-blue-600'
                                : 'text-gray-300'
                            }`}
                            onClick={() => drillRows.length > 0 && openDrill(project, mk)}
                          >
                            {val > 0 ? fmtTHB2dp(val) : '—'}
                          </td>
                        );
                      })}

                      {/* Project grand total cell */}
                      <td
                        className={`text-right px-4 py-2 font-bold tabular-nums border-l border-gray-200 bg-green-50 whitespace-nowrap ${
                          rowTotal > 0
                            ? 'text-gray-900 cursor-pointer hover:bg-green-100 hover:text-blue-600'
                            : 'text-gray-300'
                        }`}
                        onClick={() => rowTotal > 0 && openDrill(project, null)}
                      >
                        {rowTotal > 0 ? fmtTHB2dp(rowTotal) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Grand Total row */}
              <tfoot>
                <tr className="bg-green-50 border-t-2 border-green-200">
                  <td className="sticky left-0 z-10 bg-green-50 px-4 py-2.5 font-bold text-gray-700 border-r border-green-200 whitespace-nowrap uppercase tracking-wide text-[11px]">
                    Grand Total
                  </td>
                  {monthKeys.map(mk => {
                    const val = monthTotal(mk);
                    return (
                      <td
                        key={mk}
                        className={`text-right px-3 py-2.5 font-bold tabular-nums whitespace-nowrap ${
                          val > 0
                            ? 'text-gray-900 cursor-pointer hover:bg-green-100 hover:text-blue-600'
                            : 'text-gray-300'
                        }`}
                        onClick={() => val > 0 && openDrill(null, mk)}
                      >
                        {val > 0 ? fmtTHB2dp(val) : '—'}
                      </td>
                    );
                  })}
                  {/* Bottom-right corner: overall grand total */}
                  <td
                    className={`text-right px-4 py-2.5 font-black text-[13px] tabular-nums border-l border-green-200 whitespace-nowrap ${
                      grandTotal > 0
                        ? 'text-gray-900 cursor-pointer hover:bg-green-100 hover:text-blue-600'
                        : 'text-gray-300'
                    }`}
                    onClick={() => grandTotal > 0 && openDrill(null, null)}
                  >
                    {grandTotal > 0 ? fmtTHB2dp(grandTotal) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Drill-down modal */}
      {drill && (
        <DrillDownModal
          rows={drill.rows}
          cellLabel={drill.label}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}
