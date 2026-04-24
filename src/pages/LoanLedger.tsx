import { useEffect, useState } from 'react';
import { Plus, AlertTriangle, X, TrendingUp, TrendingDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { supabase } from '../lib/supabase';
import { Loan, LoanRepayment, Entity } from '../types';
import { formatTHB, formatTHBCompact, formatDate } from '../utils/formatters';

interface LoanForm {
  loan_type: 'received' | 'given';
  counterparty_id: string;
  principal: number;
  currency: string;
  fx_rate_if_usd: number;
  drawdown_date: string;
  due_date: string;
  notes: string;
}

interface RepaymentForm {
  loan_id: string;
  payment_date: string;
  amount: number;
  notes: string;
}

export default function LoanLedger() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [repayments, setRepayments] = useState<LoanRepayment[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showRepayForm, setShowRepayForm] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);

  const loanForm = useForm<LoanForm>();
  const repayForm = useForm<RepaymentForm>();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: lns }, { data: reps }, { data: ents }] = await Promise.all([
      supabase.from('loans').select('*, counterparty:entities!counterparty_id(*)').order('created_at', { ascending: false }),
      supabase.from('loan_repayments').select('*').order('payment_date', { ascending: false }),
      supabase.from('entities').select('id, name').order('name'),
    ]);
    setLoans(lns || []);
    setRepayments(reps || []);
    setEntities(ents || []);
    setLoading(false);
  }

  async function submitLoan(data: LoanForm) {
    await supabase.from('loans').insert({
      loan_type: data.loan_type,
      counterparty_id: data.counterparty_id,
      principal: Number(data.principal),
      currency: data.currency,
      fx_rate_if_usd: data.currency === 'USD' ? Number(data.fx_rate_if_usd) : null,
      drawdown_date: data.drawdown_date,
      due_date: data.due_date,
      outstanding_balance: Number(data.principal),
      notes: data.notes,
    });
    loanForm.reset();
    setShowLoanForm(false);
    loadData();
  }

  async function submitRepayment(data: RepaymentForm) {
    const loan = loans.find(l => l.id === data.loan_id);
    if (!loan) return;
    const newBalance = Math.max(0, loan.outstanding_balance - Number(data.amount));
    await supabase.from('loan_repayments').insert({
      loan_id: data.loan_id,
      payment_date: data.payment_date,
      amount: Number(data.amount),
      notes: data.notes,
    });
    await supabase.from('loans').update({ outstanding_balance: newBalance }).eq('id', data.loan_id);
    repayForm.reset();
    setShowRepayForm(false);
    loadData();
  }

  const received = loans.filter(l => l.loan_type === 'received');
  const given = loans.filter(l => l.loan_type === 'given');
  const totalOwed = received.reduce((s, l) => s + l.outstanding_balance, 0);
  const totalReceivable = given.reduce((s, l) => s + l.outstanding_balance, 0);
  const netPosition = totalReceivable - totalOwed;
  const now = new Date();

  const overdueLoans = received.filter(l => l.due_date && new Date(l.due_date) < now && l.outstanding_balance > 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Loan Ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">Inter-company & external loan positions</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowRepayForm(true)} className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Record Repayment
          </button>
          <button onClick={() => setShowLoanForm(true)} className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#1a2b3c] transition-colors">
            <Plus size={16} />
            New Loan
          </button>
        </div>
      </div>

      {overdueLoans.length > 0 && (
        <div className="bg-[#E24B4A]/5 border border-[#E24B4A]/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} className="text-[#E24B4A]" />
            <span className="text-sm font-semibold text-[#E24B4A]">Overdue Loans</span>
          </div>
          {overdueLoans.map(l => (
            <p key={l.id} className="text-xs text-[#E24B4A]">
              {(l as any).counterparty?.name} – {formatTHB(l.outstanding_balance)} overdue since {formatDate(l.due_date)}
            </p>
          ))}
        </div>
      )}

      {/* Net Position */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#E24B4A] p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown size={16} className="text-[#E24B4A]" />
            <p className="text-xs text-gray-500 uppercase font-medium">Total Owed (Received)</p>
          </div>
          <p className="text-lg font-bold text-[#E24B4A]">{formatTHBCompact(totalOwed)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#1D9E75] p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} className="text-[#1D9E75]" />
            <p className="text-xs text-gray-500 uppercase font-medium">Total Receivable (Given)</p>
          </div>
          <p className="text-lg font-bold text-[#1D9E75]">{formatTHBCompact(totalReceivable)}</p>
        </div>
        <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${netPosition >= 0 ? 'border-l-[#1D9E75]' : 'border-l-[#E24B4A]'} p-4`}>
          <p className="text-xs text-gray-500 uppercase font-medium mb-1">Net Position</p>
          <p className={`text-lg font-bold ${netPosition >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>{formatTHBCompact(netPosition)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loans Received */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-[#E24B4A]/5">
            <h2 className="text-sm font-semibold text-[#E24B4A]">Loans Received (Payable)</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {received.length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">No loans received</p>
            ) : received.map(loan => {
              const isOverdue = loan.due_date && new Date(loan.due_date) < now && loan.outstanding_balance > 0;
              const loanRepayments = repayments.filter(r => r.loan_id === loan.id);
              return (
                <div key={loan.id} className={`p-4 ${isOverdue ? 'bg-[#E24B4A]/5' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{(loan as any).counterparty?.name || '—'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Drawn: {formatDate(loan.drawdown_date)} · Due: {formatDate(loan.due_date)}
                      </p>
                      {loan.currency === 'USD' && loan.fx_rate_if_usd && (
                        <p className="text-xs text-gray-400">USD @ {loan.fx_rate_if_usd}</p>
                      )}
                      {loan.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{loan.notes}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-xs text-gray-400">Outstanding</p>
                      <p className={`text-base font-bold ${isOverdue ? 'text-[#E24B4A]' : 'text-gray-800'}`}>
                        {formatTHB(loan.outstanding_balance)}
                      </p>
                      {isOverdue && <span className="text-xs text-[#E24B4A] font-medium">OVERDUE</span>}
                    </div>
                  </div>
                  <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full bg-[#E24B4A]"
                      style={{ width: `${Math.min(100, (loan.outstanding_balance / loan.principal) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Principal: {formatTHB(loan.principal)} · Repaid: {formatTHB(loanRepayments.reduce((s, r) => s + r.amount, 0))}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Loans Given */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-[#1D9E75]/5">
            <h2 className="text-sm font-semibold text-[#1D9E75]">Loans Given (Receivable)</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {given.length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">No loans given</p>
            ) : given.map(loan => (
              <div key={loan.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{(loan as any).counterparty?.name || '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Drawn: {formatDate(loan.drawdown_date)} · Due: {formatDate(loan.due_date)}
                    </p>
                    {loan.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{loan.notes}</p>}
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-xs text-gray-400">Outstanding</p>
                    <p className={`text-base font-bold ${loan.outstanding_balance > 0 ? 'text-[#1D9E75]' : 'text-gray-400'}`}>
                      {formatTHB(loan.outstanding_balance)}
                    </p>
                    {loan.outstanding_balance === 0 && <span className="text-xs text-gray-400">Repaid</span>}
                  </div>
                </div>
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-[#1D9E75]"
                    style={{ width: `${Math.min(100, ((loan.principal - loan.outstanding_balance) / loan.principal) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Principal: {formatTHB(loan.principal)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Loan Modal */}
      {showLoanForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Record New Loan</h2>
              <button onClick={() => setShowLoanForm(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <form onSubmit={loanForm.handleSubmit(submitLoan)} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Loan Type</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="received" {...loanForm.register('loan_type', { required: true })} className="accent-[#E24B4A]" />
                    <span className="text-sm text-gray-700">Received (Payable)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value="given" {...loanForm.register('loan_type')} className="accent-[#1D9E75]" />
                    <span className="text-sm text-gray-700">Given (Receivable)</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Counterparty</label>
                <select {...loanForm.register('counterparty_id', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                  <option value="">Select...</option>
                  {entities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Principal</label>
                  <input type="number" step="0.01" {...loanForm.register('principal', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Currency</label>
                  <select {...loanForm.register('currency')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                    <option value="THB">THB</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Drawdown Date</label>
                  <input type="date" {...loanForm.register('drawdown_date')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Due Date</label>
                  <input type="date" {...loanForm.register('due_date')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <textarea {...loanForm.register('notes')} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowLoanForm(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64]">Save Loan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repayment Modal */}
      {showRepayForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md border border-gray-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">Record Repayment</h2>
              <button onClick={() => setShowRepayForm(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <form onSubmit={repayForm.handleSubmit(submitRepayment)} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Loan</label>
                <select {...repayForm.register('loan_id', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white">
                  <option value="">Select loan...</option>
                  {loans.filter(l => l.outstanding_balance > 0).map(l => (
                    <option key={l.id} value={l.id}>
                      {(l as any).counterparty?.name} – {formatTHB(l.outstanding_balance)} outstanding
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Payment Date</label>
                  <input type="date" {...repayForm.register('payment_date', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Amount (฿)</label>
                  <input type="number" step="0.01" {...repayForm.register('amount', { required: true })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <input {...repayForm.register('notes')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowRepayForm(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-[#1D9E75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#178a64]">Record Repayment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
