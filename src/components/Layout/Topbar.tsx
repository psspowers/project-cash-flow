import { useState, useRef, useEffect } from 'react';
import { Bell, LogOut, CheckCheck, CheckCircle, AlertTriangle, XCircle, Info, BellRing, ArrowRight } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Notification, ROLE_LABELS } from '../../types';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface TopbarProps {
  notifications: Notification[];
  onNotificationRead: (id: string) => void;
  onMarkAllRead: () => void;
  title?: string;
}

const TEST_ROLES = [
  { value: 'reset', label: 'Reset to Actual Role', email: null },
  { value: 'ceo', label: 'CEO', email: 'sam@psspowers.com' },
  { value: 'evp', label: 'EVP', email: 'nakkarin@psspowers.com' },
  { value: 'construction_manager', label: 'Construction Manager', email: 'suraphol@psspowers.com' },
  { value: 'cost_controller', label: 'Cost Controller', email: 'niramon@psspowers.com' },
  { value: 'procurement', label: 'Procurement', email: 'kanokthip@psspowers.com' },
  { value: 'accounts_supervisor', label: 'Accounts Supervisor', email: 'nareerat@psspowers.com' },
  { value: 'accounts_manager', label: 'Accounts Manager', email: 'chudapak@psspowers.com' },
  { value: 'banking_finance_officer', label: 'Banking/Finance Exec', email: 'pawitchaya@psspowers.com' },
];

const TEST_PASSWORD = 'PSS@2025';

export function notifHref(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  role?: string | null,
): string | null {
  if (!entityType) return null;

  // CEO has a dedicated approvals page — route all approval-type notifications there
  if (role === 'ceo') {
    if (entityType === 'project' && entityId) return `/projects/${entityId}?tab=costing`;
    if (entityType === 'project_costing' && entityId) return `/projects/${entityId}?tab=costing`;
    if (entityType === 'purchase_order') return '/approvals?section=purchase_orders';
    if (entityType === 'loan') return '/treasury';
    if (entityType === 'check') return '/checks';
    // Everything else actionable for the CEO lives on the CEO approvals page
    return '/ceo-alerts';
  }

  if (entityType === 'project' && entityId) return `/projects/${entityId}?tab=costing`;
  if (entityType === 'project_costing' && entityId) return `/projects/${entityId}?tab=costing`;
  if (entityType === 'purchase_order') return '/approvals?section=purchase_orders';
  if (entityType === 'vendor_invoice') return '/approvals?section=invoices';
  if (entityType === 'project_cash_transfer') return '/approvals?section=transfers';
  if (entityType === 'progress_report') return '/approvals?section=progress_reports';
  if (entityType === 'payment_voucher') return '/payment-queue';
  if (entityType === 'loan') return '/treasury';
  if (entityType === 'check') return '/checks';
  return null;
}

export function NotifTypeIcon({ type }: { type: Notification['type'] }) {
  switch (type) {
    case 'success':
      return <CheckCircle size={15} className="text-emerald-500 shrink-0" />;
    case 'warning':
      return <AlertTriangle size={15} className="text-amber-500 shrink-0" />;
    case 'error':
      return <XCircle size={15} className="text-red-500 shrink-0" />;
    case 'alert':
      return <BellRing size={15} className="text-orange-500 shrink-0" />;
    default:
      return <Info size={15} className="text-blue-400 shrink-0" />;
  }
}

export const typeAccent: Record<Notification['type'], string> = {
  success: 'border-l-emerald-400',
  warning: 'border-l-amber-400',
  error: 'border-l-red-400',
  alert: 'border-l-orange-400',
  info: 'border-l-blue-300',
};

export default function Topbar({ notifications, onNotificationRead, onMarkAllRead, title }: TopbarProps) {
  const { profile, signIn, signOut } = useAuth();
  const navigate = useNavigate();
  const [showNotifs, setShowNotifs] = useState(false);
  const [switching, setSwitching] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter(n => !n.is_read).length;
  const badgeLabel = unread > 9 ? '9+' : String(unread);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRoleSwitch = async (newRole: string) => {
    if (switching) return;
    setSwitching(true);

    let email: string | null = null;

    if (newRole === 'reset') {
      email = sessionStorage.getItem('dev_original_email');
      sessionStorage.removeItem('dev_original_email');
    } else {
      if (!sessionStorage.getItem('dev_original_email') && profile?.email) {
        sessionStorage.setItem('dev_original_email', profile.email);
      }
      email = TEST_ROLES.find(r => r.value === newRole)?.email ?? null;
    }

    if (email) {
      await signIn(email, TEST_PASSWORD);
      navigate('/');
    }

    setSwitching(false);
  };

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const dropdownItems = notifications.slice(0, 15);

  return (
    <header className="h-14 bg-white border-b border-black/[0.08] flex items-center justify-between px-6 shrink-0 z-30 sticky top-0">
      <div className="flex items-center gap-3">
        {title && <h1 className="text-[15px] font-semibold text-gray-800">{title}</h1>}
      </div>

      <div className="flex items-center gap-3">
        {/* Dev/Test Role Switcher */}
        <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200">
          <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
            {switching ? 'Switching…' : 'Test Mode'}
          </span>
          <select
            value={profile?.role ?? 'reset'}
            onChange={e => handleRoleSwitch(e.target.value)}
            disabled={switching}
            className="text-xs bg-transparent border-none text-amber-900 font-medium focus:ring-0 cursor-pointer outline-none disabled:opacity-50 disabled:cursor-wait"
          >
            {TEST_ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(v => !v)}
            className="relative w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <Bell size={17} className="text-gray-500" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#E24B4A] rounded-full flex items-center justify-center px-1">
                <span className="text-white text-[9px] font-bold leading-none">{badgeLabel}</span>
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute right-0 top-11 w-96 bg-white border border-black/[0.08] rounded-xl shadow-xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-gray-800">Notifications</span>
                  {unread > 0 && (
                    <span className="bg-[#E24B4A] text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">{unread}</span>
                  )}
                </div>
                {unread > 0 && (
                  <button onClick={onMarkAllRead} className="text-[11px] text-[#378ADD] hover:underline flex items-center gap-1">
                    <CheckCheck size={12} />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
                {dropdownItems.length === 0 ? (
                  <div className="py-10 text-center">
                    <Bell size={24} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-[12px] text-gray-400">No notifications</p>
                  </div>
                ) : dropdownItems.map(n => {
                  const href = notifHref(n.related_entity_type, n.related_entity_id, profile?.role);
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        onNotificationRead(n.id);
                        setShowNotifs(false);
                        if (href) navigate(href);
                      }}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-l-2 ${typeAccent[n.type]} ${!n.is_read ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5">
                          <NotifTypeIcon type={n.type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 leading-tight">{n.title}</p>
                          {n.message && <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>}
                          <p className="text-[10px] text-gray-400 mt-1">
                            {n.created_at ? formatDistanceToNow(parseISO(n.created_at), { addSuffix: true }) : ''}
                          </p>
                        </div>
                        {!n.is_read && <div className="w-2 h-2 bg-[#378ADD] rounded-full shrink-0 mt-1.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-4 py-2.5">
                <Link
                  to="/notifications"
                  onClick={() => setShowNotifs(false)}
                  className="flex items-center justify-center gap-1.5 text-[12px] text-[#378ADD] hover:text-blue-700 font-medium transition-colors"
                >
                  View all notifications
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="text-right hidden sm:block">
            <p className="text-[12px] font-semibold text-gray-800 leading-tight">{profile?.full_name}</p>
            <p className="text-[11px] text-gray-400">{profile ? ROLE_LABELS[profile.role] : ''}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#0f1923] flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-semibold">{initials}</span>
          </div>
          <button
            onClick={signOut}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
