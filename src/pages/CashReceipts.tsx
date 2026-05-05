import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { supabase } from '../lib/supabase';
import { CashReceipt, Project, Milestone, Entity } from '../types';
import { formatTHB, formatTHBCompact, formatDate } from '../utils/formatters';

interface ReceiptForm {
  project_id: string;
  milestone_id: string;
  company_id: string;
  pss_invoice_no: string;
  receipt_date: string;
  amount_received: number;
  wht_deducted: number;
  bank_account: string;
  reference: string;
  notes: string;
}

export default function CashReceipts() {
  const [receipts, setReceipts] = useState<CashReceipt[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [companies, setCompanies] = useState<Entity[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, watch, reset } = useForm<ReceiptForm>();
  const selectedProjectId = watch('project_id');
  const amountReceived = Number(watch('amount_received') || 0);
  const whtDeducted = Number(watch('wht_deducted') || 0);
  const netReceived = amountReceived - whtDeducted;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadMilestones(selectedProjectId);
    }
  }, [selectedProjectId]);

  async function loadData() {
    const [{ data: rec }, { data: proj }, { data: comp }] = await Promise.all([
      supabase.from('cash_receipts').select('*, project:projects(*), company:entities!company_id(*)').order('receipt_date', { ascending: false }),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('entities').select('id, name').in('type', ['client', 'subsidiary']),
    ]);
    setReceipts(rec || []);
    setProjects(proj || []);
    setCompanies(comp || []);
    setLoading(false);
  }

  async function loadMilestones(projectId: string) {
    const { data } = await supabase.from('milestones').select('*').eq('project_id', projectId).order('milestone_no');
    setMilestones(data || []);
  }

  async function onSubmit(data: ReceiptForm) {
    setSubmitting(true);
    await supabase.from('cash_receipts').insert({
      project_id: data.project_id,
      milestone_id: data.milestone_id || null,
      company_id: data.company_id || null,
      pss_invoice_no: data.pss_invoice_no,
      receipt_date: data.receipt_date,
      amount_received: Number(data.amount_received),
      wht_deducted: Number(data.wht_deducted) || 0,
      net_received: netReceived,
      bank_account: data.bank_account,
      reference: data.reference,
      notes: data.notes,
    });
    reset();
    setShowForm(false);
    setSubmitting(false);
    loadData();
  }

  const totalGross = receipts.reduce((s, r) => s + r.amount_received, 0);
  const totalWHT = receipts.reduce((s, r) => s + r.wht_deducted, 0);
  const totalNet = receipts.reduce((s, r) => s + r.net_received, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cash Receipts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Incoming payments from clients</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors"
        >
          <Plus size={16} />
          Record Receipt
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#378ADD] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Total Gross</p>
          <p className="text-lg font-bold text-gray-900">{formatTHBCompact(totalGross)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#EF9F27] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Total WHT Deducted</p>
          <p className="text-lg font-bold text-gray-900">{formatTHBCompact(totalWHT)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#1D9E75] p-4">
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Total Net Received</p>
          <p className="text-lg font-bold text-gray-900">{formatTHBCompact(totalNet)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">From</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Project / Invoice</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Gross</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">WHT</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Net</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Bank</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No receipts recorded</td></tr>
            ) : receipts.map(r => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-700">{formatDate(r.receipt_date)}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{(r as any).company?.name || '—'}</td>
                <td className="px-4 py-3">
                  <p className="text-xs font-medium text-gray-800 max-w-[160px] truncate">{(r as any).project?.name?.split('–')[0] || '—'}</p>
                  {r.pss_invoice_no && <p className="text-xs text-gray-400">{r.pss_invoice_no}</p>}
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-800">{formatTHB(r.amount_received)}</td>
                <td className="px-4 py-3 text-right text-xs text-[#E24B4A]">{r.wht_deducted > 0 ? `(${formatTHB(r.wht_deducted)})` : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-[#1D9E75]">{formatTHB(r.net_received)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{r.bank_account || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Receipt Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg border border-gray-200 my-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Record Cash Receipt</h2>
              <button onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Project</label>
                  <select {...register('project_id', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                    <option value="">Select...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name.split('–')[0].trim()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Milestone</label>
                  <select {...register('milestone_id')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                    <option value="">None</option>
                    {milestones.map(m => <option key={m.id} value={m.id}>IV.{m.milestone_no}/8 – {m.percentage}%</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">From (Company)</label>
                  <select {...register('company_id')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                    <option value="">Select...</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Receipt Date</label>
                  <input type="date" {...register('receipt_date', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">PSS Invoice No.</label>
                  <input {...register('pss_invoice_no')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" placeholder="IV2026..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Bank Account</label>
                  <select {...register('bank_account')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                    <option value="KBank PSS Main">KBank PSS Main</option>
                    <option value="SCB PSS Project">SCB PSS Project</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Amount Received (฿)</label>
                  <input type="number" step="0.01" {...register('amount_received', { required: true, min: 1 })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">WHT Deducted (฿)</label>
                  <input type="number" step="0.01" {...register('wht_deducted')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" defaultValue={0} />
                </div>
              </div>
              {amountReceived > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 text-sm">
                  <div className="flex justify-between font-semibold text-gray-800">
                    <span>Net Received</span>
                    <span className="text-[#1D9E75]">{formatTHB(netReceived)}</span>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Reference</label>
                <input {...register('reference')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" placeholder="Transfer ref / Cheque no." />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <textarea {...register('notes')} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64] disabled:opacity-60">
                  {submitting ? 'Saving...' : 'Record Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
