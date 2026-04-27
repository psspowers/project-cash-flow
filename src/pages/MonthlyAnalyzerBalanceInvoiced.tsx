import { useEffect, useState, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PivotTable, PivotDataRow, toMonthKey, toMonthLabel } from '../components/dashboard/AnalysisPivotTable';

interface RawRow {
  id: string;
  vendor_invoice_no: string | null;
  invoice_date: string | null;
  planned_payment_date: string | null;
  invoice_amount_incl_vat: number;
  status: string;
  purchase_order: {
    pss_po_no: string | null;
    description: string | null;
    supplier_name_raw: string | null;
  } | null;
  project: { name: string } | null;
}

export default function MonthlyAnalyzerBalanceInvoiced() {
  const [data, setData] = useState<PivotDataRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: raw, error } = await supabase
      .from('vendor_invoices')
      .select(`
        id, vendor_invoice_no, invoice_date, planned_payment_date,
        invoice_amount_incl_vat, status,
        purchase_order:purchase_orders ( pss_po_no, description, supplier_name_raw ),
        project:projects ( name )
      `)
      .in('status', ['received', 'approved_cm', 'approved_evp', 'released'])
      .order('invoice_date', { ascending: true });

    if (!error && raw) {
      const rows: PivotDataRow[] = (raw as unknown as RawRow[])
        .filter(r => r.project?.name)
        .map(r => {
          const project = r.project!.name;
          // Use planned_payment_date if set, otherwise fall back to invoice_date, then today
          const dateStr = r.planned_payment_date ?? r.invoice_date ?? new Date().toISOString().slice(0, 10);
          const mk = toMonthKey(dateStr);
          const amount = Number(r.invoice_amount_incl_vat ?? 0);
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
              milestoneNo: r.vendor_invoice_no ?? '—',
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
        <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
          <Clock size={16} className="text-amber-500" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-gray-900">Balance of Invoiced</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Vendor invoices received but not yet paid — pivot by project &amp; expected payment month
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-black/[0.08] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] text-gray-400">Click any value to drill down into individual records</p>
        </div>
        <PivotTable data={data} loading={loading} emptyMessage="No outstanding invoices found" />
      </div>
    </div>
  );
}
