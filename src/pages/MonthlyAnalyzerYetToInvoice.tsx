import { useEffect, useState, useCallback } from 'react';
import { FileWarning } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PivotTable, PivotDataRow, toMonthKey, toMonthLabel } from '../components/dashboard/AnalysisPivotTable';

interface RawRow {
  id: string;
  milestone_number: number;
  amount_due: number;
  planned_payment_date: string | null;
  purchase_order: {
    pss_po_no: string | null;
    description: string | null;
    supplier_name_raw: string | null;
    project: { name: string } | null;
  } | null;
}

export default function MonthlyAnalyzerYetToInvoice() {
  const [data, setData] = useState<PivotDataRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: raw, error } = await supabase
      .from('po_milestones')
      .select(`
        id, milestone_number, amount_due, planned_payment_date,
        purchase_order:purchase_orders (
          pss_po_no, description, supplier_name_raw,
          project:projects ( name )
        )
      `)
      .eq('status', 'pending')
      .order('planned_payment_date', { ascending: true });

    if (!error && raw) {
      const rows: PivotDataRow[] = (raw as unknown as RawRow[])
        .filter(r => r.purchase_order?.project?.name)
        .map(r => {
          const project = r.purchase_order!.project!.name;
          const dateStr = r.planned_payment_date ?? new Date().toISOString().slice(0, 10);
          const mk = toMonthKey(dateStr);
          const amount = Number(r.amount_due ?? 0);
          return {
            project,
            monthKey: mk,
            amount,
            drillRow: {
              project,
              monthLabel: toMonthLabel(mk),
              poNo: r.purchase_order?.pss_po_no ?? '',
              supplier: r.purchase_order?.supplier_name_raw ?? '',
              description: r.purchase_order?.description ?? '',
              milestoneNo: String(r.milestone_number),
              amount,
            },
          };
        });
      setData(rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="p-6 space-y-4 max-w-full">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-[#E24B4A]/10 rounded-lg flex items-center justify-center">
          <FileWarning size={16} className="text-[#E24B4A]" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-gray-900">Yet to Invoice</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            PO milestones with status <span className="font-mono bg-gray-100 px-1 rounded">pending</span> — committed but supplier has not yet invoiced
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] text-gray-400">Click any value to drill down into individual records</p>
        </div>
        <PivotTable data={data} loading={loading} emptyMessage="No pending milestones found" />
      </div>
    </div>
  );
}
