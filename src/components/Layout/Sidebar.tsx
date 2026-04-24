import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, ShoppingCart, CheckCircle,
  CreditCard, Receipt, BookOpen, FileText, Bell, CalendarRange,
  BarChart3, Zap,
} from 'lucide-react';
import { UserRole } from '../../types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
  badgeKey?: string;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, roles: ['cost_controller','construction_manager','evp','accounts_supervisor','accounts_manager','ceo'] },
  { to: '/cash-flow-planner', label: 'Cash Flow Planner', icon: <CalendarRange size={16} />, roles: ['cost_controller','accounts_supervisor','evp','ceo'] },
  { to: '/projects', label: 'All Projects', icon: <FolderKanban size={16} />, roles: ['cost_controller','construction_manager','evp','ceo'] },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: <ShoppingCart size={16} />, roles: ['cost_controller'] },
  { to: '/approvals', label: 'Approvals', icon: <CheckCircle size={16} />, roles: ['cost_controller','construction_manager','evp'], badgeKey: 'approvals' },
  { to: '/variance', label: 'Cost Variance', icon: <BarChart3 size={16} />, roles: ['evp','ceo'] },
  { to: '/payment-queue', label: 'Payment Queue', icon: <CreditCard size={16} />, roles: ['accounts_supervisor','accounts_manager','ceo'], badgeKey: 'payments' },
  { to: '/cash-receipts', label: 'Cash Receipts', icon: <Receipt size={16} />, roles: ['accounts_supervisor'] },
  { to: '/loan-ledger', label: 'Loan Ledger', icon: <BookOpen size={16} />, roles: ['accounts_supervisor','accounts_manager','ceo'] },
  { to: '/wht-report', label: 'WHT Report', icon: <FileText size={16} />, roles: ['accounts_supervisor','accounts_manager'] },
  { to: '/vat-report', label: 'VAT Report (PP.30)', icon: <FileText size={16} />, roles: ['accounts_supervisor','accounts_manager'] },
  { to: '/ceo-alerts', label: 'Alerts', icon: <Bell size={16} />, roles: ['ceo'], badgeKey: 'alerts' },
];

interface SidebarProps {
  role: UserRole;
  badges?: Record<string, number>;
}

export default function Sidebar({ role, badges = {} }: SidebarProps) {
  const visible = navItems.filter(item => item.roles.includes(role));

  return (
    <aside className="w-[220px] min-h-screen bg-[#0f1923] flex flex-col shrink-0 border-r border-white/5">
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

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visible.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 px-3 py-2.5 rounded-md text-[13px] transition-colors ${
                isActive
                  ? 'bg-[#1D9E75]/15 text-[#1D9E75] font-medium'
                  : 'text-white/50 hover:text-white/90 hover:bg-white/5'
              }`
            }
          >
            {item.icon}
            <span className="flex-1">{item.label}</span>
            {item.badgeKey && badges[item.badgeKey] > 0 && (
              <span className="bg-[#E24B4A] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {badges[item.badgeKey] > 99 ? '99+' : badges[item.badgeKey]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-3 border-t border-white/10">
        <p className="text-white/20 text-[11px]">v2.0 · PSS 2026</p>
      </div>
    </aside>
  );
}
