import { useEffect, useState, useMemo } from 'react';
import { format, parseISO, addMonths, isAfter } from 'date-fns';
import { Download, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatTHB } from '../utils/formatters';

interface MonthlyVAT {
  month: string;
  monthLabel: string;
  outputTaxBase: number;
  outputVAT: number;
  inputTaxBase: number;
  inputVAT: number;
  netPayable: number;
  filed: boolean;
}

function exportXLS(rows: MonthlyVAT[], selectedMonth: string) {
  const sheetName = selectedMonth ? rows[0]?.monthLabel ?? 'PP30' : 'All Months';
  const header = ['Month', 'Output Tax Base (THB)', 'Output VAT 7% (THB)', 'Input Tax Base (THB)', 'Input VAT 7% (THB)', 'Net VAT Payable (THB)', 'Filing Status'];
  const dataRows = rows.map(m => [
    m.monthLabel,
    m.outputTaxBase.toFixed(2),
    m.outputVAT.toFixed(2),
    m.inputTaxBase.toFixed(2),
    m.inputVAT.toFixed(2),
    m.netPayable.toFixed(2),
    m.filed ? 'Filed' : 'Pending',
  ]);
  const totalOutputBase = rows.reduce((s, m) => s + m.outputTaxBase, 0);
  const totalOutputVAT = rows.reduce((s, m) => s + m.outputVAT, 0);
  const totalInputBase = rows.reduce((s, m) => s + m.inputTaxBase, 0);
  const totalInputVAT = rows.reduce((s, m) => s + m.inputVAT, 0);
  const totalNet = +(totalOutputVAT - totalInputVAT).toFixed(2);
  dataRows.push(['TOTAL', totalOutputBase.toFixed(2), totalOutputVAT.toFixed(2), totalInputBase.toFixed(2), totalInputVAT.toFixed(2), totalNet.toFixed(2), '']);

  const xmlRows = [header, ...dataRows].map(row =>
    `<Row>${row.map(cell => `<Cell><Data ss:Type="${typeof cell === 'number' || (!isNaN(Number(cell)) && String(cell) !== '' && cell !== 'Filed' && cell !== 'Pending' && cell !== 'TOTAL') ? 'Number' : 'String'}">${String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`).join('')}</Row>`
  ).join('');

  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${sheetName}"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PP30_${selectedMonth || 'All'}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VATReport() {
  const [rawData, setRawData] = useState<MonthlyVAT[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: clientInvoices }, { data: vendorInvoices }] = await Promise.all([
      supabase
        .from('milestone_invoices')
        .select('invoice_date, invoice_amount')
        .not('invoice_date', 'is', null)
        .order('invoice_date', { ascending: false }),
      supabase
        .from('vendor_invoices')
        .select('invoice_date, purchase_order:purchase_orders!po_id(vat_7pct, wht_3pct, po_amount_excl_vat)')
        .not('invoice_date', 'is', null)
        .order('invoice_date', { ascending: false }),
    ]);

    const monthMap = new Map<string, MonthlyVAT>();
    const today = new Date();

    const ensureMonth = (monthKey: string, invoiceDate: string) => {
      if (!monthMap.has(monthKey)) {
        const deadline = addMonths(parseISO(monthKey + '-01'), 1);
        deadline.setDate(15);
        monthMap.set(monthKey, {
          month: monthKey,
          monthLabel: format(parseISO(invoiceDate), 'MMMM yyyy'),
          outputTaxBase: 0,
          outputVAT: 0,
          inputTaxBase: 0,
          inputVAT: 0,
          netPayable: 0,
          filed: isAfter(today, deadline),
        });
      }
      return monthMap.get(monthKey)!;
    };

    (clientInvoices || []).forEach(inv => {
      if (!inv.invoice_date || !inv.invoice_amount) return;
      const monthKey = inv.invoice_date.substring(0, 7);
      const entry = ensureMonth(monthKey, inv.invoice_date);
      const taxBase = +(inv.invoice_amount / 1.07).toFixed(2);
      entry.outputTaxBase += taxBase;
      entry.outputVAT += +(inv.invoice_amount - taxBase).toFixed(2);
    });

    (vendorInvoices || []).forEach(inv => {
      if (!inv.invoice_date) return;
      const po = (inv.purchase_order as { vat_7pct: number; wht_3pct: number; po_amount_excl_vat: number } | null);
      if (!po || Number(po.wht_3pct) !== 0) return;
      const monthKey = inv.invoice_date.substring(0, 7);
      const entry = ensureMonth(monthKey, inv.invoice_date);
      entry.inputTaxBase += Number(po.po_amount_excl_vat) || 0;
      entry.inputVAT += Number(po.vat_7pct) || 0;
    });

    const result = Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, entry]) => {
        entry.outputTaxBase = +entry.outputTaxBase.toFixed(2);
        entry.outputVAT = +entry.outputVAT.toFixed(2);
        entry.inputTaxBase = +entry.inputTaxBase.toFixed(2);
        entry.inputVAT = +entry.inputVAT.toFixed(2);
        entry.netPayable = +(entry.outputVAT - entry.inputVAT).toFixed(2);
        return entry;
      });

    setRawData(result);
    setLoading(false);
  }

  const availableMonths = rawData.map(m => ({ value: m.month, label: m.monthLabel }));

  const monthlyData = useMemo(() =>
    selectedMonth ? rawData.filter(m => m.month === selectedMonth) : rawData,
    [rawData, selectedMonth]
  );

  const totalOutputBase = monthlyData.reduce((s, m) => s + m.outputTaxBase, 0);
  const totalOutputVAT = monthlyData.reduce((s, m) => s + m.outputVAT, 0);
  const totalInputBase = monthlyData.reduce((s, m) => s + m.inputTaxBase, 0);
  const totalInputVAT = monthlyData.reduce((s, m) => s + m.inputVAT, 0);
  const totalNetPayable = +(totalOutputVAT - totalInputVAT).toFixed(2);

  const currentMonth = monthlyData[0];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">VAT Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Value Added Tax summary – PP.30 filing</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center gap-2">
            <Filter size={14} className="text-gray-400" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 pr-8 appearance-none"
            >
              <option value="">All Months</option>
              {availableMonths.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => exportXLS(monthlyData, selectedMonth)}
            className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors"
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#378ADD] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Output VAT Collected</p>
          <p className="text-lg font-bold text-gray-900">{formatTHB(currentMonth?.outputVAT ?? 0)}</p>
          <p className="text-xs text-gray-400 mt-1">{currentMonth?.monthLabel ?? '—'} · Tax base {formatTHB(currentMonth?.outputTaxBase ?? 0)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#1D9E75] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Input VAT Paid</p>
          <p className="text-lg font-bold text-gray-900">{formatTHB(currentMonth?.inputVAT ?? 0)}</p>
          <p className="text-xs text-gray-400 mt-1">{currentMonth?.monthLabel ?? '—'} · Tax base {formatTHB(currentMonth?.inputTaxBase ?? 0)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#E24B4A] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Net VAT Payable</p>
          <p className={`text-lg font-bold ${(currentMonth?.netPayable ?? 0) > 0 ? 'text-[#E24B4A]' : 'text-[#1D9E75]'}`}>
            {formatTHB(currentMonth?.netPayable ?? 0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {(currentMonth?.netPayable ?? 0) > 0 ? 'Payable to RD' : (currentMonth?.netPayable ?? 0) < 0 ? 'Credit / Refund' : 'Nil'}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            {selectedMonth ? `${currentMonth?.monthLabel ?? ''} Breakdown` : 'Monthly Breakdown'}
          </h2>
          <span className="text-xs text-gray-400">For PP.30 filing — due 15th of following month</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Month</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Output Tax Base</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Output VAT 7%</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Input Tax Base</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Input VAT 7%</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Net Payable</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No invoice data</td></tr>
            ) : (
              <>
                {monthlyData.map(m => (
                  <tr key={m.month} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-800">{m.monthLabel}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-600">{formatTHB(m.outputTaxBase)}</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-[#378ADD]">{formatTHB(m.outputVAT)}</td>
                    <td className="px-5 py-3 text-right text-sm text-gray-600">{formatTHB(m.inputTaxBase)}</td>
                    <td className="px-5 py-3 text-right text-sm font-medium text-[#1D9E75]">{formatTHB(m.inputVAT)}</td>
                    <td className={`px-5 py-3 text-right text-sm font-semibold ${m.netPayable > 0 ? 'text-[#E24B4A]' : m.netPayable < 0 ? 'text-[#1D9E75]' : 'text-gray-500'}`}>
                      {formatTHB(m.netPayable)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {m.filed ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Filed</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-[#B45309]">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="px-5 py-3 text-sm text-gray-800">TOTAL</td>
                  <td className="px-5 py-3 text-right text-sm text-gray-700">{formatTHB(totalOutputBase)}</td>
                  <td className="px-5 py-3 text-right text-sm text-[#378ADD]">{formatTHB(totalOutputVAT)}</td>
                  <td className="px-5 py-3 text-right text-sm text-gray-700">{formatTHB(totalInputBase)}</td>
                  <td className="px-5 py-3 text-right text-sm text-[#1D9E75]">{formatTHB(totalInputVAT)}</td>
                  <td className={`px-5 py-3 text-right text-sm font-bold ${totalNetPayable > 0 ? 'text-[#E24B4A]' : totalNetPayable < 0 ? 'text-[#1D9E75]' : 'text-gray-500'}`}>
                    {formatTHB(totalNetPayable)}
                  </td>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
