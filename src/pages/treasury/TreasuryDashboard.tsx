import { useEffect, useState } from 'react';
import {
  Landmark, Plus, ChevronDown, ChevronRight, X, AlertTriangle,
  ArrowDownLeft, ArrowUpRight, TrendingDown, TrendingUp, Save,
  Trash2, Check, Building2, UserPlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { FINANCE_ROLES } from '../../config/roles';
import {
  Loan, LoanTransaction, FacilityType, LoanEventType,
  CashFlowDirection, Entity, SgaActual, TreasuryAdjustment,
} from '../../types';
import { formatTHB, formatTHBCompact } from '../../utils/formatters';
import { formatDate } from '../../utils/formatters';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TREASURY_ROLES = [...FINANCE_ROLES, 'evp'] as string[];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getCashFlowDirection(
  facilityType: FacilityType,
  eventType: LoanEventType,
): CashFlowDirection {
  if (facilityType === 'borrowing' && eventType === 'drawdown') return 'in';
  if (facilityType === 'borrowing' && eventType === 'repayment') return 'out';
  if (facilityType === 'lending' && eventType === 'drawdown') return 'out';
  if (facilityType === 'lending' && eventType === 'repayment') return 'in';
  // interest/fee: borrowing pays out, lending receives in
  if (facilityType === 'borrowing') return 'out';
  return 'in';
}

function calculateFacilityBalance(transactions: LoanTransaction[]): number {
  return transactions.reduce((acc, tx) => {
    if (tx.event_type === 'drawdown') return acc + Number(tx.amount);
    if (tx.event_type === 'repayment') return acc - Number(tx.amount);
    return acc;
  }, 0);
}

function fmtAmt(n: number, currency = 'THB'): string {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return formatTHB(n);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-[13px] font-medium rounded-lg transition-colors whitespace-nowrap ${
        active
          ? 'bg-[#0f1923] text-white shadow-sm'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

function DirectionBadge({ dir }: { dir: CashFlowDirection }) {
  return dir === 'in' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">
      <ArrowDownLeft size={10} /> IN
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">
      <ArrowUpRight size={10} /> OUT
    </span>
  );
}

function FacilityTypeBadge({ type }: { type: FacilityType | undefined }) {
  if (!type) return null;
  return type === 'borrowing' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700 border border-red-200">
      <TrendingDown size={10} /> Liability
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700 border border-green-200">
      <TrendingUp size={10} /> Asset
    </span>
  );
}

// ---------------------------------------------------------------------------
// LoanRow — expandable facility with nested transaction ledger
// ---------------------------------------------------------------------------

interface LoanRowProps {
  loan: Loan & { counterparty?: Entity; loan_transactions: LoanTransaction[] };
  onLogTransaction: (loan: Loan) => void;
}

function LoanRow({ loan, onLogTransaction }: LoanRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const balance = calculateFacilityBalance(loan.loan_transactions ?? []);
  const txCount = loan.loan_transactions?.length ?? 0;
  const facilityType = loan.facility_type ?? 'borrowing';

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <td className="px-4 py-3 w-6">
          <span className="text-gray-400">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </td>
        <td className="px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-gray-800">
              {loan.name || (loan as any).counterparty?.name || '—'}
            </p>
            {loan.notes && <p className="text-[11px] text-gray-400 mt-0.5 italic">{loan.notes}</p>}
          </div>
        </td>
        <td className="px-4 py-3 text-[12px] text-gray-500">
          {(loan as any).counterparty?.name ?? '—'}
        </td>
        <td className="px-4 py-3">
          <FacilityTypeBadge type={facilityType} />
        </td>
        <td className="px-4 py-3 text-[12px] text-gray-700 tabular-nums text-right">
          {fmtAmt(Number(loan.principal), loan.currency)}
          <span className="text-gray-400 ml-1 text-[11px]">{loan.currency}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <span className={`text-[13px] font-bold tabular-nums ${balance > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
            {fmtAmt(balance, loan.currency)}
          </span>
          {txCount === 0 && (
            <p className="text-[10px] text-gray-300">No transactions</p>
          )}
        </td>
        <td className="px-4 py-3 text-[11px] text-gray-400">
          {loan.due_date ? formatDate(loan.due_date) : '—'}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); onLogTransaction(loan); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-[#0f1923] text-white rounded-lg hover:bg-[#1a2b3c] transition-colors whitespace-nowrap"
          >
            <Plus size={11} />
            Log Transaction
          </button>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50">
          <td colSpan={8} className="px-6 py-4 border-b-2 border-slate-200">
            <p className="text-[12px] font-semibold text-gray-600 mb-3 flex items-center gap-2">
              <Building2 size={13} className="text-gray-400" />
              Transaction Ledger
              <span className="font-normal text-gray-400">({txCount} event{txCount !== 1 ? 's' : ''})</span>
            </p>
            {txCount === 0 ? (
              <p className="text-[12px] text-gray-400 py-3 text-center">No transactions logged yet.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-slate-100 text-gray-500 uppercase text-[10px] tracking-wide">
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Event</th>
                      <th className="text-left px-3 py-2">Direction</th>
                      <th className="text-right px-3 py-2">Amount</th>
                      <th className="text-left px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(loan.loan_transactions ?? [])]
                      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
                      .map((tx) => (
                        <tr key={tx.id} className="border-t border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{formatDate(tx.transaction_date)}</td>
                          <td className="py-2 px-3 capitalize text-gray-700 font-medium">{tx.event_type}</td>
                          <td className="py-2 px-3">
                            <DirectionBadge dir={tx.cash_flow_direction} />
                          </td>
                          <td className="py-2 px-3 text-right font-semibold text-gray-800 tabular-nums">
                            {fmtAmt(Number(tx.amount), loan.currency)}
                          </td>
                          <td className="py-2 px-3 text-gray-400 italic">{tx.notes ?? '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={3} className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Outstanding Balance
                      </td>
                      <td className="px-3 py-2 text-right font-black text-gray-900 tabular-nums">
                        {fmtAmt(balance, loan.currency)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — Loans & Financing
// ---------------------------------------------------------------------------

interface LoansTabProps {
  loans: (Loan & { counterparty?: Entity; loan_transactions: LoanTransaction[] })[];
  entities: Entity[];
  onRefresh: () => void;
  userId: string | undefined;
}

const FINANCIAL_ENTITY_TYPES = [
  { value: 'lender', label: 'Lender' },
  { value: 'bank', label: 'Bank' },
  { value: 'director', label: 'Director' },
  { value: 'related_company', label: 'Related Company' },
  { value: 'financial_institution', label: 'Financial Institution' },
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'internal', label: 'Internal Entity' },
] as const;

type FinancialEntityType = typeof FINANCIAL_ENTITY_TYPES[number]['value'];

function LoansTab({ loans, entities, onRefresh, userId }: LoansTabProps) {
  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [txLoan, setTxLoan] = useState<Loan | null>(null);
  const [saving, setSaving] = useState(false);

  // Facility form state
  const [fName, setFName] = useState('');
  const [fCounterparty, setFCounterparty] = useState('');
  const [fType, setFType] = useState<FacilityType>('borrowing');
  const [fPrincipal, setFPrincipal] = useState('');
  const [fCurrency, setFCurrency] = useState('THB');
  const [fDueDate, setFDueDate] = useState('');
  const [fNotes, setFNotes] = useState('');

  // Inline new-counterparty form state
  const [localEntities, setLocalEntities] = useState<Entity[]>(entities);
  const [showNewCp, setShowNewCp] = useState(false);
  const [cpName, setCpName] = useState('');
  const [cpType, setCpType] = useState<FinancialEntityType>('lender');
  const [cpIsRelated, setCpIsRelated] = useState(false);
  const [cpSaving, setCpSaving] = useState(false);
  const [cpError, setCpError] = useState('');

  // Sync localEntities when parent entities prop changes (e.g. after full refresh)
  useEffect(() => { setLocalEntities(entities); }, [entities]);

  // Auto-set is_related_party based on type
  useEffect(() => {
    if (cpType === 'director' || cpType === 'related_company') {
      setCpIsRelated(true);
    } else {
      setCpIsRelated(false);
    }
  }, [cpType]);

  // Transaction form state
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txEventType, setTxEventType] = useState<LoanEventType>('drawdown');
  const [txAmount, setTxAmount] = useState('');
  const [txNotes, setTxNotes] = useState('');

  function closeFacilityModal() {
    setShowFacilityModal(false);
    setFName(''); setFCounterparty(''); setFPrincipal('');
    setFCurrency('THB'); setFDueDate(''); setFNotes('');
    setShowNewCp(false); setCpName(''); setCpType('lender');
    setCpIsRelated(false); setCpError('');
  }

  async function saveFacility() {
    if (!fName.trim() || !fCounterparty || !fPrincipal) return;
    setSaving(true);
    await supabase.from('loans').insert({
      name: fName.trim(),
      facility_type: fType,
      counterparty_id: fCounterparty,
      principal: parseFloat(fPrincipal),
      currency: fCurrency,
      due_date: fDueDate || null,
      notes: fNotes || null,
    });
    setSaving(false);
    closeFacilityModal();
    onRefresh();
  }

  async function saveCounterparty() {
    if (!cpName.trim()) return;
    setCpError('');
    setCpSaving(true);
    const { data, error } = await supabase
      .from('entities')
      .insert({
        name: cpName.trim(),
        type: cpType,
        is_related_party: cpIsRelated,
        is_active: true,
      })
      .select()
      .single();
    setCpSaving(false);
    if (error || !data) {
      setCpError(error?.message ?? 'Failed to save counterparty.');
      return;
    }
    // Optimistic update: append to local list and auto-select
    setLocalEntities(prev => [...prev, data as Entity].sort((a, b) => a.name.localeCompare(b.name)));
    setFCounterparty((data as Entity).id);
    // Reset and collapse the inline form
    setCpName('');
    setCpType('lender');
    setCpIsRelated(false);
    setShowNewCp(false);
  }

  async function saveTransaction() {
    if (!txLoan || !txDate || !txAmount) return;
    const facilityType = txLoan.facility_type ?? 'borrowing';
    const direction = getCashFlowDirection(facilityType as FacilityType, txEventType);
    setSaving(true);
    await supabase.from('loan_transactions').insert({
      loan_id: txLoan.id,
      transaction_date: txDate,
      event_type: txEventType,
      cash_flow_direction: direction,
      amount: parseFloat(txAmount),
      notes: txNotes || null,
      created_by: userId ?? null,
    });
    setSaving(false);
    setTxLoan(null);
    setTxDate(new Date().toISOString().slice(0, 10));
    setTxEventType('drawdown');
    setTxAmount('');
    setTxNotes('');
    onRefresh();
  }

  const borrowingFacilities = loans.filter(l => (l.facility_type ?? 'borrowing') === 'borrowing');
  const lendingFacilities = loans.filter(l => (l.facility_type ?? 'borrowing') === 'lending');
  const totalBorrowingBalance = borrowingFacilities.reduce((s, l) => s + calculateFacilityBalance(l.loan_transactions ?? []), 0);
  const totalLendingBalance = lendingFacilities.reduce((s, l) => s + calculateFacilityBalance(l.loan_transactions ?? []), 0);

  const previewDirection = txLoan
    ? getCashFlowDirection((txLoan.facility_type ?? 'borrowing') as FacilityType, txEventType)
    : null;

  return (
    <>
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#E24B4A] p-4">
          <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Total Borrowings (Liabilities)</p>
          <p className="text-xl font-bold text-[#E24B4A] tabular-nums">{formatTHBCompact(totalBorrowingBalance)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{borrowingFacilities.length} facilit{borrowingFacilities.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#1D9E75] p-4">
          <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Total Lending (Assets)</p>
          <p className="text-xl font-bold text-[#1D9E75] tabular-nums">{formatTHBCompact(totalLendingBalance)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{lendingFacilities.length} facilit{lendingFacilities.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className={`bg-white rounded-lg border border-gray-200 border-l-4 p-4 ${totalLendingBalance - totalBorrowingBalance >= 0 ? 'border-l-[#1D9E75]' : 'border-l-[#E24B4A]'}`}>
          <p className="text-[11px] text-gray-400 uppercase font-semibold tracking-wide mb-1">Net Financing Position</p>
          <p className={`text-xl font-bold tabular-nums ${totalLendingBalance - totalBorrowingBalance >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
            {formatTHBCompact(totalLendingBalance - totalBorrowingBalance)}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">Lending minus Borrowings</p>
        </div>
      </div>

      {/* Header with Add button */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-gray-700">Loan Facilities</h3>
        <button
          onClick={() => setShowFacilityModal(true)}
          className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[#1a2b3c] transition-colors"
        >
          <Plus size={14} />
          Add Facility
        </button>
      </div>

      {/* Facilities table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <Landmark size={28} className="text-gray-200" />
            <p className="text-[13px] font-semibold text-gray-500">No loan facilities yet</p>
            <p className="text-[12px] text-gray-400">Add your first facility to start tracking cash movements.</p>
            <button
              onClick={() => setShowFacilityModal(true)}
              className="mt-2 flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[#1a2b3c] transition-colors"
            >
              <Plus size={14} /> Add Facility
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="w-6 px-4 py-3" />
                  <th className="text-left px-4 py-3">Facility Name</th>
                  <th className="text-left px-4 py-3">Counterparty</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Principal</th>
                  <th className="text-right px-4 py-3">Outstanding Balance</th>
                  <th className="text-left px-4 py-3">Due Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <LoanRow
                    key={loan.id}
                    loan={loan as any}
                    onLogTransaction={setTxLoan}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Facility Modal */}
      {showFacilityModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-[15px] font-bold text-gray-900">Add Loan Facility</h3>
              <button onClick={closeFacilityModal} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Facility Name</label>
                <input
                  value={fName}
                  onChange={e => setFName(e.target.value)}
                  placeholder="e.g., Director Loan — KBank Q2 2026"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-medium text-gray-600">Counterparty</label>
                  <button
                    type="button"
                    onClick={() => { setShowNewCp(v => !v); setCpError(''); }}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md transition-colors ${
                      showNewCp
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        : 'bg-[#0f1923] text-white hover:bg-[#1a2b3c]'
                    }`}
                  >
                    {showNewCp ? (
                      <><X size={11} /> Cancel</>
                    ) : (
                      <><UserPlus size={11} /> New</>
                    )}
                  </button>
                </div>
                <select
                  value={fCounterparty}
                  onChange={e => setFCounterparty(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                >
                  <option value="">Select entity...</option>
                  {localEntities.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>

                {/* Inline create counterparty sub-form */}
                {showNewCp && (
                  <div className="mt-2 rounded-xl border border-[#1D9E75]/30 bg-[#f0fdf8] p-4 space-y-3">
                    <p className="text-[11px] font-semibold text-[#1D9E75] uppercase tracking-wide flex items-center gap-1.5">
                      <UserPlus size={11} /> Create New Counterparty
                    </p>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Name</label>
                      <input
                        value={cpName}
                        onChange={e => setCpName(e.target.value)}
                        placeholder="e.g., Kasikorn Bank PCL"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">Type</label>
                      <select
                        value={cpType}
                        onChange={e => setCpType(e.target.value as FinancialEntityType)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                      >
                        {FINANCIAL_ENTITY_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={cpIsRelated}
                        onChange={e => setCpIsRelated(e.target.checked)}
                        className="accent-[#1D9E75] w-3.5 h-3.5"
                      />
                      <span className="text-[12px] text-gray-600">
                        Is Related Party
                        {(cpType === 'director' || cpType === 'related_company') && (
                          <span className="ml-1.5 text-[10px] text-[#1D9E75] font-medium">(auto-set)</span>
                        )}
                      </span>
                    </label>
                    {cpError && (
                      <p className="text-[11px] text-[#E24B4A] flex items-center gap-1">
                        <AlertTriangle size={11} /> {cpError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={saveCounterparty}
                      disabled={cpSaving || !cpName.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-[#1D9E75] text-white py-2 rounded-lg text-[12px] font-semibold hover:bg-[#178a64] transition-colors disabled:opacity-50"
                    >
                      {cpSaving ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      {cpSaving ? 'Saving...' : 'Save Counterparty'}
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Facility Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="ftype" value="borrowing" checked={fType === 'borrowing'} onChange={() => setFType('borrowing')} className="accent-[#E24B4A]" />
                    <span className="text-sm text-gray-700">Borrowing <span className="text-gray-400">(Liability)</span></span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="ftype" value="lending" checked={fType === 'lending'} onChange={() => setFType('lending')} className="accent-[#1D9E75]" />
                    <span className="text-sm text-gray-700">Lending <span className="text-gray-400">(Asset)</span></span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Total Principal</label>
                  <input
                    type="number"
                    step="0.01"
                    value={fPrincipal}
                    onChange={e => setFPrincipal(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Currency</label>
                  <select
                    value={fCurrency}
                    onChange={e => setFCurrency(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                  >
                    <option value="THB">THB</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Due / Maturity Date</label>
                <input
                  type="date"
                  value={fDueDate}
                  onChange={e => setFDueDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Notes</label>
                <textarea
                  value={fNotes}
                  onChange={e => setFNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={closeFacilityModal}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveFacility}
                disabled={saving || !fName.trim() || !fCounterparty || !fPrincipal}
                className="flex-1 bg-[#1D9E75] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#178a64] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Facility'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Transaction Modal */}
      {txLoan && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md border border-gray-200 shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-[15px] font-bold text-gray-900">Log Transaction</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {txLoan.name || (txLoan as any).counterparty?.name || '—'}
                  <span className="mx-1.5">·</span>
                  <FacilityTypeBadge type={txLoan.facility_type ?? 'borrowing'} />
                </p>
              </div>
              <button onClick={() => setTxLoan(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Transaction Date</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={e => setTxDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Event Type</label>
                  <select
                    value={txEventType}
                    onChange={e => setTxEventType(e.target.value as LoanEventType)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 bg-white"
                  >
                    <option value="drawdown">Drawdown</option>
                    <option value="repayment">Repayment</option>
                    <option value="interest">Interest</option>
                    <option value="fee">Fee</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Amount ({txLoan.currency})</label>
                <input
                  type="number"
                  step="0.01"
                  value={txAmount}
                  onChange={e => setTxAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                />
              </div>

              {/* Cash flow direction preview */}
              {previewDirection && txAmount && (
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] font-medium ${
                  previewDirection === 'in' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <DirectionBadge dir={previewDirection} />
                  <span>
                    This transaction will be recorded as cash <strong>{previewDirection.toUpperCase()}</strong> for{' '}
                    {fmtAmt(parseFloat(txAmount) || 0, txLoan.currency)}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Notes</label>
                <input
                  value={txNotes}
                  onChange={e => setTxNotes(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setTxLoan(null)}
                className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveTransaction}
                disabled={saving || !txDate || !txAmount}
                className="flex-1 bg-[#1D9E75] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#178a64] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Record Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — SG&A Actuals
// ---------------------------------------------------------------------------

interface SgaTabProps {
  actuals: SgaActual[];
  onRefresh: () => void;
  userId: string | undefined;
}

function SgaTab({ actuals, onRefresh, userId }: SgaTabProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const actualMap = new Map(
    actuals.filter(a => a.year === selectedYear).map(a => [`${a.year}-${a.month}`, a])
  );

  async function save(month: number) {
    const key = `${selectedYear}-${month}`;
    const val = parseFloat(editValues[key] ?? '');
    if (isNaN(val)) return;
    setSaving(p => ({ ...p, [key]: true }));
    await supabase.from('sga_actuals').upsert(
      { year: selectedYear, month, amount: val, entered_by: userId ?? null },
      { onConflict: 'year,month' }
    );
    setSaving(p => ({ ...p, [key]: false }));
    setEditValues(p => { const n = { ...p }; delete n[key]; return n; });
    onRefresh();
  }

  const yearTotal = Array.from({ length: 12 }, (_, i) => i + 1)
    .reduce((s, m) => s + Number(actualMap.get(`${selectedYear}-${m}`)?.amount ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-700">SG&A Actuals</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Enter actual monthly overhead. Blank months use the Dashboard's projected figure.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-gray-500">Year</label>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              <th className="text-left px-5 py-3">Month</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-right px-5 py-3 w-56">Amount (฿)</th>
              <th className="px-5 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
              const key = `${selectedYear}-${month}`;
              const existing = actualMap.get(key);
              const editVal = editValues[key];
              const hasEdit = editVal !== undefined;
              const isSaving = saving[key];

              return (
                <tr key={month} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-[13px] font-medium text-gray-700">{MONTH_NAMES[month - 1]}</td>
                  <td className="px-5 py-3">
                    {existing ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
                        <Check size={11} /> Actual entered
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-400">Projected</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      placeholder={existing ? String(existing.amount) : 'Enter actual...'}
                      value={hasEdit ? editVal : (existing ? String(existing.amount) : '')}
                      onChange={e => setEditValues(p => ({ ...p, [key]: e.target.value }))}
                      className="w-48 border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] text-right focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 tabular-nums"
                    />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => save(month)}
                      disabled={isSaving || (!hasEdit && !existing)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-[#1D9E75] text-white rounded-lg hover:bg-[#178a64] transition-colors disabled:opacity-40"
                    >
                      {isSaving ? (
                        <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Save size={11} />
                      )}
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td colSpan={2} className="px-5 py-3 text-[12px] font-bold text-gray-600 uppercase tracking-wide">
                {selectedYear} Total (actuals only)
              </td>
              <td className="px-5 py-3 text-right text-[14px] font-black text-gray-900 tabular-nums">
                {formatTHB(yearTotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Corporate Adjustments
// ---------------------------------------------------------------------------

interface AdjustmentsTabProps {
  adjustments: TreasuryAdjustment[];
  onRefresh: () => void;
  userId: string | undefined;
}

function AdjustmentsTab({ adjustments, onRefresh, userId }: AdjustmentsTabProps) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = adjustments.filter(a => a.fiscal_year === selectedYear);
  const netTotal = filtered.reduce((s, a) => s + Number(a.amount), 0);

  async function addAdjustment() {
    if (!label.trim() || !amount) return;
    const amt = parseFloat(amount);
    if (isNaN(amt)) return;
    setSaving(true);
    await supabase.from('treasury_adjustments').insert({
      label: label.trim(),
      amount: amt,
      fiscal_year: selectedYear,
      created_by: userId ?? null,
    });
    setSaving(false);
    setLabel('');
    setAmount('');
    onRefresh();
  }

  async function deleteAdj(id: string) {
    setDeleting(id);
    await supabase.from('treasury_adjustments').delete().eq('id', id);
    setDeleting(null);
    onRefresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-700">Corporate Adjustments</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">One-off cash items that affect the treasury waterfall. Negative = cash out.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[12px] text-gray-500">Fiscal Year</label>
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-2">
            <p className="text-[13px] text-gray-400">No adjustments for {selectedYear}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Label</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-left px-5 py-3">Added</th>
                <th className="px-5 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(adj => (
                <tr key={adj.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-[13px] text-gray-800">{adj.label}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-[13px] font-semibold tabular-nums ${Number(adj.amount) >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                      {Number(adj.amount) >= 0 ? '+' : ''}{formatTHB(Number(adj.amount))}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-gray-400">
                    {adj.created_at ? formatDate(adj.created_at.slice(0, 10)) : '—'}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button
                      onClick={() => deleteAdj(adj.id)}
                      disabled={deleting === adj.id}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-[#E24B4A] hover:bg-red-50 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className={`border-t-2 ${netTotal >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <td className="px-5 py-3 text-[12px] font-bold text-gray-600 uppercase tracking-wide">
                  Net Effect — {selectedYear}
                </td>
                <td className={`px-5 py-3 text-right text-[14px] font-black tabular-nums ${netTotal >= 0 ? 'text-[#1D9E75]' : 'text-[#E24B4A]'}`}>
                  {netTotal >= 0 ? '+' : ''}{formatTHB(netTotal)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Inline add form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-[12px] font-semibold text-gray-600 mb-4">Add New Adjustment</p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Label</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g., Equipment deposit refund"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
            />
          </div>
          <div className="w-44">
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Amount (฿, allow negative)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="-500000"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30"
            />
          </div>
          <button
            onClick={addAdjustment}
            disabled={saving || !label.trim() || !amount}
            className="flex items-center gap-2 bg-[#0f1923] text-white px-4 py-2 rounded-lg text-[13px] font-medium hover:bg-[#1a2b3c] transition-colors disabled:opacity-50"
          >
            {saving ? (
              <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Add
          </button>
        </div>
        {amount && parseFloat(amount) < 0 && (
          <p className="text-[11px] text-[#E24B4A] mt-2 flex items-center gap-1">
            <AlertTriangle size={11} />
            Negative amount — this will reduce the projected cash position.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = 'loans' | 'sga' | 'adjustments';

export default function TreasuryDashboard() {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('loans');
  const [loans, setLoans] = useState<(Loan & { counterparty?: Entity; loan_transactions: LoanTransaction[] })[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [sgaActuals, setSgaActuals] = useState<SgaActual[]>([]);
  const [adjustments, setAdjustments] = useState<TreasuryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  const isAuthorized = profile?.role && TREASURY_ROLES.includes(profile.role);

  useEffect(() => {
    if (isAuthorized) loadData();
  }, [isAuthorized]);

  async function loadData() {
    setLoading(true);
    const [loansRes, entitiesRes, sgaRes, adjRes] = await Promise.all([
      supabase
        .from('loans')
        .select('*, counterparty:entities!counterparty_id(*), loan_transactions(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('entities')
        .select('id, name, type, is_related_party')
        .in('type', ['lender', 'bank', 'director', 'related_company', 'financial_institution', 'subsidiary', 'internal'])
        .order('name'),
      supabase.from('sga_actuals').select('*').order('year').order('month'),
      supabase.from('treasury_adjustments').select('*').order('fiscal_year').order('created_at', { ascending: false }),
    ]);
    setLoans((loansRes.data ?? []) as any);
    setEntities((entitiesRes.data ?? []) as Entity[]);
    setSgaActuals((sgaRes.data ?? []) as SgaActual[]);
    setAdjustments((adjRes.data ?? []) as TreasuryAdjustment[]);
    setLoading(false);
  }

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-3">
        <AlertTriangle size={28} className="text-amber-400" />
        <p className="text-[14px] font-semibold text-gray-600">Access Restricted</p>
        <p className="text-[12px] text-gray-400">Treasury is available to Finance and Executive roles only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Landmark size={18} className="text-gray-500" />
            <h1 className="text-xl font-bold text-gray-900">Treasury Control Center</h1>
          </div>
          <p className="text-[13px] text-gray-500 mt-0.5">Loan facilities · SG&A actuals · Corporate adjustments</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
        <TabButton active={activeTab === 'loans'} onClick={() => setActiveTab('loans')}>
          Loans &amp; Financing
        </TabButton>
        <TabButton active={activeTab === 'sga'} onClick={() => setActiveTab('sga')}>
          SG&amp;A Actuals
        </TabButton>
        <TabButton active={activeTab === 'adjustments'} onClick={() => setActiveTab('adjustments')}>
          Corporate Adjustments
        </TabButton>
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === 'loans' && (
            <LoansTab
              loans={loans}
              entities={entities}
              onRefresh={loadData}
              userId={user?.id}
            />
          )}
          {activeTab === 'sga' && (
            <SgaTab
              actuals={sgaActuals}
              onRefresh={loadData}
              userId={user?.id}
            />
          )}
          {activeTab === 'adjustments' && (
            <AdjustmentsTab
              adjustments={adjustments}
              onRefresh={loadData}
              userId={user?.id}
            />
          )}
        </>
      )}
    </div>
  );
}
