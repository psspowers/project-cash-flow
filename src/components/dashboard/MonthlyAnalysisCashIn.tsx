import { useEffect, useState, useCallback } from 'react';
import { X, TrendingUp, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toMonthKey, toMonthLabel, fmtTHB2dp, formatProjectName } from './AnalysisPivotTable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawReceipt {
  id: string;
  project_id: string | null;
  invoice_no: string | null;
  receipt_no: string | null;
  invoice_amount: number;
  received_amount: number;
  receipt_date: string | null;
  project: { id: string; name: string } | null;
}

interface CashInDrillRow {
  project: string;
  monthLabel: string;
  receiptDate: string;
  invoiceNo: string;
  receiptNo: string;
  invoiceAmount: number;
  receivedAmount: number;
}

// ---------------------------------------------------------------------------
// DrillDownModal
// ---------------------------------------------------------------------------

function DrillDownModal({ rows, cellLabel, onClose }: { rows: CashInDrillRow[]; cellLabel: string; onClose: () => void }) {
  const total = rows.reduce((s, r) => s + r.receivedAmount, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col border border-black/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cash In — Drill-Down</h3>
            <p className="text-xs text-gray-400 mt-0.5">{cellLabel}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-100 bg-[#F8F8F7] sticky top-0">
                <th className="text-left px-4 py-3">Project</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Receipt Month</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Receipt Date</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Invoice #</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">Receipt #</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Invoice Amt</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-[#F8F8F7] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-700 whitespace-nowrap">{formatProjectName(r.project)}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.monthLabel}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.receiptDate}</td>
                  <td className="px-4 py-2.5 text-gray-700 font-mono text-xs whitespace-nowrap">{r.invoiceNo || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-700 font-mono text-xs whitespace-nowrap">{r.receiptNo || '—'}</td>
                  <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums whitespace-nowrap">{fmtTHB2dp(r.invoiceAmount)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums whitespace-nowrap">{fmtTHB2dp(r.receivedAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#1D9E75]/5 border-t-2 border-[#1D9E75]/20">
                <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Received</td>
                <td className="px-4 py-2.5 text-right font-bold text-gray-900 tabular-nums text-[13px]">{fmtTHB2dp(total)}</td>
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

export default function MonthlyAnalysisCashIn() {
  const [receipts, setReceipts] = useState<RawReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<{ rows: CashInDrillRow[]; label: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('client_invoices')
      .select('id, project_id, invoice_no, receipt_no, invoice_amount, received_amount, receipt_date, project:projects(id, name)')
      .gt('received_amount', 0)
      .not('receipt_date', 'is', null)
      .order('receipt_date', { ascending: true });

    if (!error && data) setReceipts(data as unknown as RawReceipt[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Build pivot ──────────────────────────────────────────────────────────

  const validReceipts = receipts.filter(r => r.receipt_date && r.project?.name);

  const monthKeySet = new Set<string>();
  const projectNameSet = new Set<string>();

  for (const r of validReceipts) {
    monthKeySet.add(toMonthKey(r.receipt_date!));
    projectNameSet.add(r.project!.name);
  }

  const monthKeys = [...monthKeySet].sort();
  const projectNames = [...projectNameSet].sort();

  const cellMap = new Map<string, CashInDrillRow[]>();

  for (const r of validReceipts) {
    const mk = toMonthKey(r.receipt_date!);
    const project = r.project!.name;
    const key = `${project}||${mk}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push({
      project,
      monthLabel: toMonthLabel(mk),
      receiptDate: r.receipt_date!,
      invoiceNo: r.invoice_no ?? '',
      receiptNo: r.receipt_no ?? '',
      invoiceAmount: Number(r.invoice_amount ?? 0),
      receivedAmount: Number(r.received_amount ?? 0),
    });
  }

  function cellSum(project: string, mk: string): number {
    return (cellMap.get(`${project}||${mk}`) ?? []).reduce((s, d) => s + d.receivedAmount, 0);
  }
  function projectTotal(project: string): number {
    return monthKeys.reduce((s, mk) => s + cellSum(project, mk), 0);
  }
  function monthTotal(mk: string): number {
    return projectNames.reduce((s, p) => s + cellSum(p, mk), 0);
  }
  const grandTotal = monthKeys.reduce((s, mk) => s + monthTotal(mk), 0);

  function exportToCSV() {
    const headers = ['Project', 'Receipt Month', 'Receipt Date', 'Invoice Number', 'Receipt Number', 'Invoice Amount', 'Received Amount'];
    const rows = validReceipts.map(r => [
      r.project?.name || '',
      r.receipt_date ? toMonthLabel(toMonthKey(r.receipt_date)) : '',
      r.receipt_date || '',
      r.invoice_no || '',
      r.receipt_no || '',
      Number(r.invoice_amount || 0),
      Number(r.received_amount || 0),
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `CashIn_Receipts_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  function openDrill(project: string | null, mk: string | null) {
    let rows: CashInDrillRow[] = [];
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-[#1D9E75]" />
            <h2 className="text-[13px] font-semibold text-gray-800">Monthly Analysis — Cash In</h2>
            <button onClick={exportToCSV} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors ml-4">
              <Download size={13} /> Export CSV
            </button>
          </div>
          <p className="text-[11px] text-gray-400">Click any value to drill down · Grouped by receipt date</p>
        </div>

        {loading ? (
          <div className="space-y-2 py-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : validReceipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2">
            <TrendingUp size={28} className="text-gray-200" />
            <p className="text-[13px] text-gray-400">No receipts with confirmed receipt date found</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="bg-[#F8F8F7]">
                  <th className="sticky left-0 z-10 bg-[#F8F8F7] text-left px-4 py-2.5 font-semibold text-gray-600 border-b border-r border-gray-200 whitespace-nowrap min-w-[160px]">
                    Project
                  </th>
                  {monthKeys.map(mk => (
                    <th key={mk} className="text-right px-3 py-2.5 font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">
                      {toMonthLabel(mk)}
                    </th>
                  ))}
                  <th className="text-right px-4 py-2.5 font-bold text-gray-700 border-b border-l border-gray-200 bg-[#1D9E75]/8 whitespace-nowrap"
                    style={{ backgroundColor: 'rgb(29 158 117 / 0.08)' }}>
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
                      <td className={`sticky left-0 z-10 ${bg} px-4 py-2 font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap truncate max-w-[160px]`}>
                        {formatProjectName(project)}
                      </td>
                      {monthKeys.map(mk => {
                        const val = cellSum(project, mk);
                        const hasDrill = (cellMap.get(`${project}||${mk}`) ?? []).length > 0;
                        return (
                          <td
                            key={mk}
                            className={`text-right px-3 py-2 tabular-nums border-b border-gray-50 transition-colors ${
                              val > 0 && hasDrill ? 'text-gray-800 font-medium cursor-pointer hover:bg-blue-50 hover:text-blue-600' : 'text-gray-300'
                            }`}
                            onClick={() => hasDrill && openDrill(project, mk)}
                          >
                            {val > 0 ? fmtTHB2dp(val) : '—'}
                          </td>
                        );
                      })}
                      <td
                        className={`text-right px-4 py-2 font-bold tabular-nums border-l border-gray-200 whitespace-nowrap ${
                          rowTotal > 0 ? 'text-gray-900 cursor-pointer hover:text-blue-600' : 'text-gray-300'
                        }`}
                        style={{ backgroundColor: 'rgb(29 158 117 / 0.08)' }}
                        onClick={() => rowTotal > 0 && openDrill(project, null)}
                      >
                        {rowTotal > 0 ? fmtTHB2dp(rowTotal) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: 'rgb(29 158 117 / 0.3)', backgroundColor: 'rgb(29 158 117 / 0.06)' }}>
                  <td className="sticky left-0 z-10 px-4 py-2.5 font-bold text-gray-700 border-r border-gray-200 whitespace-nowrap uppercase tracking-wide text-[11px]"
                    style={{ backgroundColor: 'rgb(29 158 117 / 0.06)' }}>
                    Grand Total
                  </td>
                  {monthKeys.map(mk => {
                    const val = monthTotal(mk);
                    return (
                      <td
                        key={mk}
                        className={`text-right px-3 py-2.5 font-bold tabular-nums whitespace-nowrap ${
                          val > 0 ? 'text-gray-900 cursor-pointer hover:text-blue-600' : 'text-gray-300'
                        }`}
                        onClick={() => val > 0 && openDrill(null, mk)}
                      >
                        {val > 0 ? fmtTHB2dp(val) : '—'}
                      </td>
                    );
                  })}
                  <td
                    className={`text-right px-4 py-2.5 font-black text-[13px] tabular-nums border-l border-gray-200 whitespace-nowrap ${
                      grandTotal > 0 ? 'text-gray-900 cursor-pointer hover:text-blue-600' : 'text-gray-300'
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

      {drill && <DrillDownModal rows={drill.rows} cellLabel={drill.label} onClose={() => setDrill(null)} />}
    </>
  );
}
