import { useEffect, useState, useCallback } from 'react';
import { X, BarChart2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toMonthKey, toMonthLabel, fmtTHB2dp } from './AnalysisPivotTable';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawInvoice {
  id: string;
  po_id: string | null;
  invoice_date: string | null;
  invoice_amount_incl_vat: number;
  vendor_invoice_no: string | null;
  purchase_order: {
    pss_po_no: string | null;
    description: string | null;
    supplier_name_raw: string | null;
    project: { id: string; name: string } | null;
  } | null;
}

interface DrillRow {
  project: string;
  monthLabel: string;
  poNo: string;
  supplier: string;
  description: string;
  invoiceNo: string;
  paidAmount: number;
}

// ---------------------------------------------------------------------------
// DrillDownModal
// ---------------------------------------------------------------------------

function DrillDownModal({ rows, cellLabel, onClose }: { rows: DrillRow[]; cellLabel: string; onClose: () => void }) {
  const total = rows.reduce((s, r) => s + r.paidAmount, 0);

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
            <h3 className="text-sm font-semibold text-gray-900">Paid Invoices — Drill-Down</h3>
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
                <th className="text-left px-4 py-3">Month</th>
                <th className="text-left px-4 py-3 whitespace-nowrap">PO Number</th>
                <th className="text-left px-4 py-3">Supplier</th>
                <th className="text-left px-4 py-3 max-w-[180px]">Description</th>
                <th className="text-center px-4 py-3 whitespace-nowrap">Invoice #</th>
                <th className="text-right px-4 py-3 whitespace-nowrap">Paid Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-[#F8F8F7] transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-700 whitespace-nowrap">{r.project}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.monthLabel}</td>
                  <td className="px-4 py-2.5 text-gray-700 font-mono text-xs whitespace-nowrap">{r.poNo || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.supplier || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-[180px] truncate">{r.description || '—'}</td>
                  <td className="px-4 py-2.5 text-center text-gray-500 font-mono text-xs">{r.invoiceNo || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-800 tabular-nums whitespace-nowrap">{fmtTHB2dp(r.paidAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#1D9E75]/5 border-t-2 border-[#1D9E75]/20">
                <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</td>
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

export default function MonthlyAnalysis() {
  const [invoices, setInvoices] = useState<RawInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<{ rows: DrillRow[]; label: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_invoices')
      .select(`
        id, po_id, invoice_date, invoice_amount_incl_vat, vendor_invoice_no,
        purchase_order:purchase_orders (
          pss_po_no, description, supplier_name_raw,
          project:projects ( id, name )
        )
      `)
      .eq('status', 'paid')
      .not('invoice_date', 'is', null)
      .order('invoice_date', { ascending: true });

    if (!error && data) setInvoices(data as unknown as RawInvoice[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Build pivot ──────────────────────────────────────────────────────────

  const monthKeySet = new Set<string>();
  const projectNameSet = new Set<string>();

  for (const inv of invoices) {
    if (!inv.invoice_date || !inv.purchase_order?.project?.name) continue;
    monthKeySet.add(toMonthKey(inv.invoice_date));
    projectNameSet.add(inv.purchase_order.project.name);
  }

  const monthKeys = [...monthKeySet].sort();
  const projectNames = [...projectNameSet].sort();

  const cellMap = new Map<string, DrillRow[]>();

  for (const inv of invoices) {
    if (!inv.invoice_date || !inv.purchase_order?.project?.name) continue;
    const mk = toMonthKey(inv.invoice_date);
    const project = inv.purchase_order.project.name;
    const key = `${project}||${mk}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push({
      project,
      monthLabel: toMonthLabel(mk),
      poNo: inv.purchase_order.pss_po_no ?? '',
      supplier: inv.purchase_order.supplier_name_raw ?? '',
      description: inv.purchase_order.description ?? '',
      invoiceNo: inv.vendor_invoice_no ?? '',
      paidAmount: Number(inv.invoice_amount_incl_vat ?? 0),
    });
  }

  function cellSum(project: string, mk: string): number {
    return (cellMap.get(`${project}||${mk}`) ?? []).reduce((s, d) => s + d.paidAmount, 0);
  }
  function projectTotal(project: string): number {
    return monthKeys.reduce((s, mk) => s + cellSum(project, mk), 0);
  }
  function monthTotal(mk: string): number {
    return projectNames.reduce((s, p) => s + cellSum(p, mk), 0);
  }
  const grandTotal = monthKeys.reduce((s, mk) => s + monthTotal(mk), 0);

  function openDrill(project: string | null, mk: string | null) {
    let rows: DrillRow[] = [];
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
            <BarChart2 size={15} className="text-gray-400" />
            <h2 className="text-[13px] font-semibold text-gray-800">Monthly Analysis — Invoices Paid</h2>
          </div>
          <p className="text-[11px] text-gray-400">Click any value to drill down</p>
        </div>

        {loading ? (
          <div className="space-y-2 py-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2">
            <BarChart2 size={28} className="text-gray-200" />
            <p className="text-[13px] text-gray-400">No paid invoices found</p>
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
                      <td className={`sticky left-0 z-10 ${bg} px-4 py-2 font-medium text-gray-700 border-r border-gray-100 whitespace-nowrap truncate max-w-[160px]`}>
                        {project}
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
                        className={`text-right px-4 py-2 font-bold tabular-nums border-l border-gray-200 bg-green-50 whitespace-nowrap ${
                          rowTotal > 0 ? 'text-gray-900 cursor-pointer hover:bg-green-100 hover:text-blue-600' : 'text-gray-300'
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
                          val > 0 ? 'text-gray-900 cursor-pointer hover:bg-green-100 hover:text-blue-600' : 'text-gray-300'
                        }`}
                        onClick={() => val > 0 && openDrill(null, mk)}
                      >
                        {val > 0 ? fmtTHB2dp(val) : '—'}
                      </td>
                    );
                  })}
                  <td
                    className={`text-right px-4 py-2.5 font-black text-[13px] tabular-nums border-l border-green-200 whitespace-nowrap ${
                      grandTotal > 0 ? 'text-gray-900 cursor-pointer hover:bg-green-100 hover:text-blue-600' : 'text-gray-300'
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
