import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface PivotDrillRow {
  project: string;
  monthLabel: string;
  poNo: string;
  supplier: string;
  description: string;
  milestoneNo: string; // string so caller can pass "—" for invoice-only rows
  amount: number;
}

export interface PivotDataRow {
  project: string;
  monthKey: string; // 'YYYY-MM'
  amount: number;
  drillRow: PivotDrillRow;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function toMonthLabel(monthKey: string): string {
  try {
    return format(parseISO(`${monthKey}-01`), 'MMM-yy');
  } catch {
    return monthKey;
  }
}

export function fmtTHB2dp(n: number): string {
  if (n === 0) return '—';
  return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// DrillDownModal
// ---------------------------------------------------------------------------

interface DrillDownModalProps {
  rows: PivotDrillRow[];
  cellLabel: string;
  onClose: () => void;
}

export function DrillDownModal({ rows, cellLabel, onClose }: DrillDownModalProps) {
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[80vh] flex flex-col border border-black/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
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
                <th className="text-right px-4 py-3">Amount</th>
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
                    {fmtTHB2dp(r.amount)}
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
// PivotTable
// ---------------------------------------------------------------------------

interface PivotTableProps {
  data: PivotDataRow[];
  loading: boolean;
  emptyMessage?: string;
}

export function PivotTable({ data, loading, emptyMessage = 'No data found' }: PivotTableProps) {
  const [drill, setDrill] = useState<{ rows: PivotDrillRow[]; label: string } | null>(null);

  // Build pivot structure
  const monthKeySet = new Set<string>();
  const projectNameSet = new Set<string>();
  for (const r of data) {
    monthKeySet.add(r.monthKey);
    projectNameSet.add(r.project);
  }
  const monthKeys = [...monthKeySet].sort();
  const projectNames = [...projectNameSet].sort();

  // cell map: `${project}||${monthKey}` → PivotDrillRow[]
  const cellMap = new Map<string, PivotDrillRow[]>();
  for (const r of data) {
    const key = `${r.project}||${r.monthKey}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push(r.drillRow);
  }

  function cellSum(project: string, mk: string): number {
    return (cellMap.get(`${project}||${mk}`) ?? []).reduce((s, d) => s + d.amount, 0);
  }
  function projectTotal(project: string): number {
    return monthKeys.reduce((s, mk) => s + cellSum(project, mk), 0);
  }
  function monthTotal(mk: string): number {
    return projectNames.reduce((s, p) => s + cellSum(p, mk), 0);
  }
  const grandTotal = monthKeys.reduce((s, mk) => s + monthTotal(mk), 0);

  function openDrill(project: string | null, mk: string | null) {
    let rows: PivotDrillRow[] = [];
    let label = '';
    if (project && mk) {
      rows = cellMap.get(`${project}||${mk}`) ?? [];
      label = `${project} — ${toMonthLabel(mk)}`;
    } else if (project) {
      rows = monthKeys.flatMap(m => cellMap.get(`${project}||${m}`) ?? []);
      label = `${project} — Grand Total`;
    } else if (mk) {
      rows = projectNames.flatMap(p => cellMap.get(`${p}||${mk}`) ?? []);
      label = `${toMonthLabel(mk)} — All Projects`;
    } else {
      rows = [...cellMap.values()].flat();
      label = 'Grand Total — All Projects & Months';
    }
    if (rows.length > 0) setDrill({ rows, label });
  }

  if (loading) {
    return (
      <div className="space-y-2 py-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-2">
        <p className="text-[13px] text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-[#F8F8F7]">
              <th className="sticky left-0 z-10 bg-[#F8F8F7] text-left px-4 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 whitespace-nowrap min-w-[180px]">
                Project
              </th>
              {monthKeys.map(mk => (
                <th key={mk} className="text-right px-3 py-2.5 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">
                  {toMonthLabel(mk)}
                </th>
              ))}
              <th className="text-right px-4 py-2.5 font-bold text-gray-700 border-b border-l border-gray-200 bg-green-50 whitespace-nowrap">
                Grand Total
              </th>
            </tr>
          </thead>
          <tbody>
            {projectNames.map((project, pi) => {
              const rowTotal = projectTotal(project);
              const bg = pi % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF9]';
              return (
                <tr key={project} className={bg}>
                  <td className={`sticky left-0 z-10 ${bg} px-4 py-2 font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap truncate max-w-[180px]`}>
                    {project}
                  </td>
                  {monthKeys.map(mk => {
                    const val = cellSum(project, mk);
                    const hasDrill = (cellMap.get(`${project}||${mk}`) ?? []).length > 0;
                    return (
                      <td
                        key={mk}
                        className={`text-right px-3 py-2 tabular-nums border-b border-gray-50 transition-colors ${
                          val > 0 && hasDrill
                            ? 'text-gray-800 font-medium cursor-pointer hover:bg-blue-50 hover:text-blue-600'
                            : 'text-gray-300'
                        }`}
                        onClick={() => hasDrill && openDrill(project, mk)}
                      >
                        {val > 0 ? fmtTHB2dp(val) : '—'}
                      </td>
                    );
                  })}
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
