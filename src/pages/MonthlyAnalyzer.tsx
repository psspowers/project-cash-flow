import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, CalendarClock, TrendingUp } from 'lucide-react';
import MonthlyAnalysis from '../components/dashboard/MonthlyAnalysis';
import MonthlyAnalysisBalance from '../components/dashboard/MonthlyAnalysisBalance';
import MonthlyAnalysisUninvoiced from '../components/dashboard/MonthlyAnalysisUninvoiced';
import MonthlyAnalysisCashIn from '../components/dashboard/MonthlyAnalysisCashIn';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'paid' | 'balance' | 'uninvoiced' | 'cashin';

interface Tab {
  id: TabId;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
}

const TABS: Tab[] = [
  {
    id: 'paid',
    label: 'Paid Invoices',
    sublabel: 'Milestones fully settled',
    icon: <CheckCircle2 size={15} />,
    accentColor: 'text-[#1D9E75]',
    accentBg: 'bg-[#1D9E75]/10',
    accentBorder: 'border-[#1D9E75]',
  },
  {
    id: 'balance',
    label: 'Invoice Balance',
    sublabel: 'Received but unpaid',
    icon: <Clock size={15} />,
    accentColor: 'text-[#E24B4A]',
    accentBg: 'bg-[#E24B4A]/10',
    accentBorder: 'border-[#E24B4A]',
  },
  {
    id: 'uninvoiced',
    label: 'Yet to Invoice',
    sublabel: 'Future forecast',
    icon: <CalendarClock size={15} />,
    accentColor: 'text-amber-600',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-500',
  },
  {
    id: 'cashin',
    label: 'Cash In',
    sublabel: 'Confirmed client receipts',
    icon: <TrendingUp size={15} />,
    accentColor: 'text-[#1D9E75]',
    accentBg: 'bg-[#1D9E75]/10',
    accentBorder: 'border-[#1D9E75]',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MonthlyAnalyzer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = rawTab && TABS.some(t => t.id === rawTab) ? rawTab : 'paid';

  // Normalise URL when no valid tab param is present
  useEffect(() => {
    if (!rawTab || !TABS.some(t => t.id === rawTab)) {
      setSearchParams({ tab: 'paid' }, { replace: true });
    }
  }, [rawTab, setSearchParams]);

  function switchTab(id: TabId) {
    setSearchParams({ tab: id });
  }

  const active = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="p-6 space-y-5 max-w-full">

      {/* Page header */}
      <div>
        <h1 className="text-[15px] font-semibold text-gray-900">Monthly Analyzer</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Pivot tables across projects &amp; months — click any cell to drill down
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex items-stretch gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {TABS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`
                relative flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-[13px] font-medium
                transition-all duration-150 select-none
                ${isActive
                  ? `bg-white shadow-sm ${tab.accentColor}`
                  : 'text-gray-400 hover:text-gray-600 hover:bg-white/60'
                }
              `}
            >
              <span className={`${isActive ? tab.accentColor : 'text-gray-400'}`}>
                {tab.icon}
              </span>
              <span className="hidden sm:block">{tab.label}</span>
              {/* Active indicator line */}
              {isActive && (
                <span
                  className={`absolute bottom-0 left-4 right-4 h-[2px] rounded-full ${tab.accentBorder} border-b-2`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active tab sub-label */}
      <div className={`flex items-center gap-2 ${active.accentColor}`}>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${active.accentBg}`}>
          {active.icon}
          {active.label} — {active.sublabel}
        </span>
      </div>

      {/* Tab panels — kept mounted but hidden via CSS so data doesn't refetch on switch */}
      <div className={activeTab === 'paid' ? 'block' : 'hidden'}>
        <MonthlyAnalysis />
      </div>

      <div className={activeTab === 'balance' ? 'block' : 'hidden'}>
        <MonthlyAnalysisBalance />
      </div>

      <div className={activeTab === 'uninvoiced' ? 'block' : 'hidden'}>
        <MonthlyAnalysisUninvoiced />
      </div>

      <div className={activeTab === 'cashin' ? 'block' : 'hidden'}>
        <MonthlyAnalysisCashIn />
      </div>

    </div>
  );
}
