import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PivotTable, PivotDataRow, toMonthKey, toMonthLabel } from '../components/dashboard/AnalysisPivotTable';

interface RawRow {
  id: string;
  milestone_number: number;
  paid_amount: number | null;
  amount_due: number;
  planned_payment_date: string | null;
  purchase_order: {
    pss_po_no: string | null;
    description: string | null;
    supplier_name_raw: string | null;
    project: { name: string } | null;
  } | null;
}

export default function MonthlyAnalyzerPaid() {
  const [data, setData] = useState<PivotDataRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: raw, error } = await supabase
      .from('po_milestones')
      .select(`
        id, milestone_number, paid_amount, amount_due, planned_payment_date,
        purchase_order:purchase_orders (
          pss_po_no, description, supplier_name_raw,
          project:projects ( name )
        )
      `)
      .eq('status', 'paid')
      .not('planned_payment_date', 'is', null)
      .order('planned_payment_date', { ascending: true });

    if (!error && raw) {
      const rows: PivotDataRow[] = (raw as unknown as RawRow[])
        .filter(r => r.planned_payment_date && r.purchase_order?.project?.name)
        .map(r => {
          const project = r.purchase_order!.project!.name;
          const mk = toMonthKey(r.planned_payment_date!);
          const amount = Number(r.paid_amount ?? r.amount_due ?? 0);
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
        <div className="w-8 h-8 bg-[#1D9E75]/10 rounded-lg flex items-center justify-center">
          <CheckCircle2 size={16} className="text-[#1D9E75]" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-gray-900">Paid Invoices</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            PO milestones with status <span className="font-mono bg-gray-100 px-1 rounded">paid</span> — pivot by project &amp; month
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] text-gray-400">Click any value to drill down into individual records</p>
        </div>
        <PivotTable data={data} loading={loading} emptyMessage="No paid milestones found" />
      </div>
    </div>
  );
}
