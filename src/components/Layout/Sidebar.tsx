import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, ShoppingCart, CheckCircle,
  CreditCard, Receipt, BookOpen, FileText, Bell, CalendarRange,
  BarChart3, Zap, ChevronDown, ChevronRight,
  CheckCircle2, Clock, CalendarClock, TrendingUp, Building2,
} from 'lucide-react';
import { UserRole } from '../../types';
import { ANALYZER_ROLES, PROCUREMENT_READ_ROLES } from '../../config/roles';

interface SidebarProps {
  role: UserRole;
  badges?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function NavItem({
  to,
  label,
  icon,
  badge,
  indent = false,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  indent?: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
          indent ? 'pl-8' : ''
        } ${
          isActive
            ? 'bg-[#1D9E75]/15 text-[#1D9E75] font-medium'
            : 'text-white/50 hover:text-white/90 hover:bg-white/5'
        }`
      }
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="bg-[#E24B4A] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

// A sub-link whose "active" state is driven by both path AND ?tab= query param
function TabNavItem({
  tab,
  label,
  icon,
}: {
  tab: string;
  label: string;
  icon: React.ReactNode;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === '/monthly-analyzer' &&
    (location.search === `?tab=${tab}` ||
      // default: "paid" is active when no search param
      (tab === 'paid' && !location.search));

  return (
    <NavLink
      to={`/monthly-analyzer?tab=${tab}`}
      className={`group flex items-center gap-2.5 pl-8 pr-3 py-2 rounded-md text-[13px] transition-colors ${
        isActive
          ? 'bg-[#1D9E75]/15 text-[#1D9E75] font-medium'
          : 'text-white/50 hover:text-white/90 hover:bg-white/5'
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
    </NavLink>
  );
}

function Divider() {
  return <div className="my-2 border-t border-white/[0.08]" />;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/20 select-none">
      {label}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export default function Sidebar({ role, badges = {} }: SidebarProps) {
  const location = useLocation();
  const onAnalyzerPage = location.pathname === '/monthly-analyzer';
  const [analyzerOpen, setAnalyzerOpen] = useState(onAnalyzerPage);

  // Keep group open while on the page even after mount
  const groupOpen = analyzerOpen || onAnalyzerPage;
  const showProcurement = PROCUREMENT_READ_ROLES.includes(role);

  return (
    <aside className="fixed top-0 left-0 w-[220px] h-screen bg-[#0f1923] flex flex-col shrink-0 border-r border-white/5 z-40">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#1D9E75] rounded-lg flex items-center justify-center shrink-0">
            <Zap size={15} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">PSS Power</p>
            <p className="text-white/40 text-xs">Solutions Co., Ltd.</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">

        {/* Dashboard */}
        <NavItem to="/dashboard" label="Dashboard" icon={<LayoutDashboard size={16} />} />

        {/* ── Analytics group ── */}
        {ANALYZER_ROLES.includes(role) && (
          <>
            <Divider />
            <SectionLabel label="Analytics" />

            {/* Collapsible Monthly Analyzer group */}
            <button
              onClick={() => setAnalyzerOpen(o => !o)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                onAnalyzerPage
                  ? 'text-[#1D9E75] font-medium bg-[#1D9E75]/10'
                  : 'text-white/50 hover:text-white/90 hover:bg-white/5'
              }`}
            >
              <TrendingUp size={16} />
              <span className="flex-1 text-left">Monthly Analyzer</span>
              {groupOpen
                ? <ChevronDown size={13} className="shrink-0 opacity-50" />
                : <ChevronRight size={13} className="shrink-0 opacity-50" />
              }
            </button>

            {groupOpen && (
              <div className="space-y-0.5">
                <TabNavItem
                  tab="paid"
                  label="Paid Invoice"
                  icon={<CheckCircle2 size={14} />}
                />
                <TabNavItem
                  tab="balance"
                  label="Balance of Invoiced"
                  icon={<Clock size={14} />}
                />
                <TabNavItem
                  tab="uninvoiced"
                  label="Yet to Invoice"
                  icon={<CalendarClock size={14} />}
                />
                <TabNavItem
                  tab="cashin"
                  label="Cash In"
                  icon={<TrendingUp size={14} />}
                />
              </div>
            )}

            {/* Cash Flow Planner */}
            {['cost_controller', 'accounts_supervisor', 'evp', 'ceo'].includes(role) && (
              <NavItem to="/cash-flow-planner" label="Cash Flow Planner" icon={<CalendarRange size={16} />} />
            )}
          </>
        )}

        <Divider />

        {/* All Projects */}
        {['cost_controller', 'construction_manager', 'evp', 'ceo'].includes(role) && (
          <NavItem to="/projects" label="All Projects" icon={<FolderKanban size={16} />} />
        )}

        {/* ── Procurement group ── */}
        {showProcurement && (
          <>
            <Divider />
            <SectionLabel label="Procurement" />
            <NavItem to="/purchase-orders" label="Purchase Orders" icon={<ShoppingCart size={16} />} />
            <NavItem to="/suppliers" label="Suppliers" icon={<Building2 size={16} />} />
          </>
        )}

        <Divider />

        {/* Approvals */}
        {['cost_controller', 'construction_manager', 'evp', 'procurement', 'accounts_manager'].includes(role) && (
          <NavItem
            to="/approvals"
            label="Approvals"
            icon={<CheckCircle size={16} />}
            badge={badges['approvals']}
          />
        )}

        {/* Remaining role-gated items */}
        {['evp', 'ceo'].includes(role) && (
          <NavItem to="/variance" label="Cost Variance" icon={<BarChart3 size={16} />} />
        )}
        {['accounts_supervisor', 'accounts_manager', 'ceo', 'procurement'].includes(role) && (
          <NavItem
            to="/payment-queue"
            label="Payment Queue"
            icon={<CreditCard size={16} />}
            badge={badges['payments']}
          />
        )}

        {/* ── Finance (Banking Officer only) ── */}
        {role === 'banking_finance_officer' && (
          <>
            <Divider />
            <SectionLabel label="Finance" />
            <NavItem
              to="/checks"
              label="Check Management"
              icon={<CreditCard size={16} />}
              badge={badges['checks']}
            />
          </>
        )}
        {role === 'accounts_supervisor' && (
          <NavItem to="/cash-receipts" label="Cash Receipts" icon={<Receipt size={16} />} />
        )}
        {['accounts_supervisor', 'accounts_manager', 'ceo'].includes(role) && (
          <NavItem to="/loan-ledger" label="Loan Ledger" icon={<BookOpen size={16} />} />
        )}
        {['accounts_supervisor', 'accounts_manager'].includes(role) && (
          <>
            <NavItem to="/wht-report" label="WHT Report" icon={<FileText size={16} />} />
            <NavItem to="/vat-report" label="VAT Report (PP.30)" icon={<FileText size={16} />} />
          </>
        )}
        {['ceo', 'accounts_supervisor'].includes(role) && (
          <NavItem to="/ceo-alerts" label="Alerts" icon={<Bell size={16} />} badge={badges['alerts']} />
        )}

      </nav>

      <div className="px-5 py-3 border-t border-white/10">
        <p className="text-white/20 text-[11px]">v2.0 · PSS 2026</p>
      </div>
    </aside>
  );
}
