import { useEffect, useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Download, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PaymentVoucher } from '../types';
import { formatTHB } from '../utils/formatters';

interface MonthlyWHT {
  month: string;
  monthLabel: string;
  grossPayments: number;
  totalWHT: number;
  netPaid: number;
  count: number;
}

function exportXLS(rows: MonthlyWHT[], selectedMonth: string) {
  const sheetName = selectedMonth ? rows[0]?.monthLabel ?? 'WHT' : 'All Months';
  const header = ['Month', 'Vouchers', 'Gross Payments (THB)', 'WHT 3% Deducted (THB)', 'Net Paid (THB)', 'Effective Rate (%)'];
  const dataRows = rows.map(m => [
    m.monthLabel,
    m.count,
    m.grossPayments.toFixed(2),
    m.totalWHT.toFixed(2),
    m.netPaid.toFixed(2),
    m.grossPayments > 0 ? (m.totalWHT / m.grossPayments * 100).toFixed(2) : '0.00',
  ]);
  const totalGross = rows.reduce((s, m) => s + m.grossPayments, 0);
  const totalWHT = rows.reduce((s, m) => s + m.totalWHT, 0);
  const totalNet = rows.reduce((s, m) => s + m.netPaid, 0);
  dataRows.push(['TOTAL', rows.reduce((s, m) => s + m.count, 0), totalGross.toFixed(2), totalWHT.toFixed(2), totalNet.toFixed(2), totalGross > 0 ? (totalWHT / totalGross * 100).toFixed(2) : '0.00']);

  const xmlRows = [header, ...dataRows].map(row =>
    `<Row>${row.map(cell => `<Cell><Data ss:Type="${typeof cell === 'number' || (!isNaN(Number(cell)) && String(cell) !== '') ? 'Number' : 'String'}">${String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`).join('')}</Row>`
  ).join('');

  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${sheetName}"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `WHT_PND53_${selectedMonth || 'All'}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WHTReport() {
  const [vouchers, setVouchers] = useState<PaymentVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const { data } = await supabase
      .from('payment_vouchers')
      .select('*')
      .eq('status', 'issued')
      .order('voucher_date', { ascending: false });
    setVouchers(data || []);
    setLoading(false);
  }

  const allMonthlyData = useMemo<MonthlyWHT[]>(() => {
    const monthMap = new Map<string, MonthlyWHT>();
    vouchers.forEach(v => {
      if (!v.voucher_date) return;
      const monthKey = v.voucher_date.substring(0, 7);
      const existing = monthMap.get(monthKey) || {
        month: monthKey,
        monthLabel: format(parseISO(v.voucher_date), 'MMMM yyyy'),
        grossPayments: 0,
        totalWHT: 0,
        netPaid: 0,
        count: 0,
      };
      existing.grossPayments += v.amount;
      existing.totalWHT += v.wht_amount;
      existing.netPaid += v.net_paid;
      existing.count++;
      monthMap.set(monthKey, existing);
    });
    return Array.from(monthMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([, v]) => v);
  }, [vouchers]);

  const availableMonths = allMonthlyData.map(m => ({ value: m.month, label: m.monthLabel }));

  const monthlyData = useMemo(() =>
    selectedMonth ? allMonthlyData.filter(m => m.month === selectedMonth) : allMonthlyData,
    [allMonthlyData, selectedMonth]
  );

  const totalGross = monthlyData.reduce((s, m) => s + m.grossPayments, 0);
  const totalWHT = monthlyData.reduce((s, m) => s + m.totalWHT, 0);
  const totalNet = monthlyData.reduce((s, m) => s + m.netPaid, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">WHT Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">Withholding tax deductions – PND.3 / PND.53 summary</p>
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
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Total Gross Payments</p>
          <p className="text-lg font-bold text-gray-900">{formatTHB(totalGross)}</p>
          {selectedMonth && <p className="text-xs text-gray-400 mt-1">{monthlyData[0]?.monthLabel}</p>}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#EF9F27] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Total WHT 3% Deducted</p>
          <p className="text-lg font-bold text-[#EF9F27]">{formatTHB(totalWHT)}</p>
          {selectedMonth && <p className="text-xs text-gray-400 mt-1">{monthlyData[0]?.monthLabel}</p>}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#1D9E75] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Total Net Paid</p>
          <p className="text-lg font-bold text-gray-900">{formatTHB(totalNet)}</p>
          {selectedMonth && <p className="text-xs text-gray-400 mt-1">{monthlyData[0]?.monthLabel}</p>}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">
            {selectedMonth ? `${monthlyData[0]?.monthLabel ?? ''} Breakdown` : 'Monthly Breakdown'}
          </h2>
          <span className="text-xs text-gray-400">For PND.3 / PND.53 filing</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Month</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Vouchers</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Gross Payments</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">WHT 3% (PND53)</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Net Paid</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Effective Rate</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No payment data</td></tr>
            ) : (
              <>
                {monthlyData.map(m => {
                  const effectiveRate = m.grossPayments > 0 ? (m.totalWHT / m.grossPayments * 100) : 0;
                  return (
                    <tr key={m.month} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-800">{m.monthLabel}</td>
                      <td className="px-5 py-3 text-right text-sm text-gray-500">{m.count}</td>
                      <td className="px-5 py-3 text-right text-sm text-gray-800">{formatTHB(m.grossPayments)}</td>
                      <td className="px-5 py-3 text-right text-sm font-medium text-[#EF9F27]">{formatTHB(m.totalWHT)}</td>
                      <td className="px-5 py-3 text-right text-sm text-gray-800">{formatTHB(m.netPaid)}</td>
                      <td className="px-5 py-3 text-right text-xs text-gray-500">{effectiveRate.toFixed(2)}%</td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="px-5 py-3 text-sm text-gray-800">TOTAL</td>
                  <td className="px-5 py-3 text-right text-sm text-gray-600">{monthlyData.reduce((s, m) => s + m.count, 0)}</td>
                  <td className="px-5 py-3 text-right text-sm text-gray-900">{formatTHB(totalGross)}</td>
                  <td className="px-5 py-3 text-right text-sm text-[#EF9F27]">{formatTHB(totalWHT)}</td>
                  <td className="px-5 py-3 text-right text-sm text-gray-900">{formatTHB(totalNet)}</td>
                  <td className="px-5 py-3 text-right text-xs text-gray-500">{totalGross > 0 ? (totalWHT / totalGross * 100).toFixed(2) : '0.00'}%</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
