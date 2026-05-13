import { ReactNode, useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from '../ui/ErrorBoundary';
import NotifToast from '../ui/NotifToast';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Notification } from '../../types';

const HIGH_PRIORITY_TYPES: Array<Notification['type']> = ['warning', 'error', 'alert'];
const PAYMENT_QUEUE_ROLES = ['accounts_supervisor', 'accounts_manager', 'ceo', 'banking_finance_officer', 'procurement'];

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const { user, profile, loading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [releasedInvoiceCount, setReleasedInvoiceCount] = useState(0);
  const [toasts, setToasts] = useState<Notification[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadNotifications();

    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, payload => {
        const incoming = payload.new as Notification;
        setNotifications(prev => [incoming, ...prev]);
        if (HIGH_PRIORITY_TYPES.includes(incoming.type)) {
          setToasts(prev => [...prev, incoming]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (!profile) return;
    if (!PAYMENT_QUEUE_ROLES.includes(profile.role)) return;
    loadReleasedInvoiceCount();

    // Subscribe to both tables so the badge updates instantly as docs move through the pipeline
    const channel = supabase
      .channel('payment-queue-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_invoices' },
        () => { loadReleasedInvoiceCount(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_vouchers' },
        () => { loadReleasedInvoiceCount(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  async function loadNotifications() {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifications(data || []);
  }

  async function loadReleasedInvoiceCount() {
    if (!profile) return;
    let count = 0;

    if (profile.role === 'accounts_supervisor') {
      // Count released invoices that have no voucher yet (Supervisor's actionable queue)
      const { data: voucherIds } = await supabase
        .from('payment_vouchers')
        .select('vendor_invoice_id')
        .not('vendor_invoice_id', 'is', null);
      const alreadyVouchered = new Set((voucherIds || []).map((v: any) => v.vendor_invoice_id));
      const { data: released } = await supabase
        .from('vendor_invoices')
        .select('id')
        .eq('status', 'released');
      count = (released || []).filter(inv => !alreadyVouchered.has(inv.id)).length;

    } else if (profile.role === 'accounts_manager' || profile.role === 'ceo') {
      // Count vouchers awaiting Manager co-sign
      const { count: c } = await supabase
        .from('payment_vouchers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_manager');
      count = c ?? 0;

    } else if (profile.role === 'banking_finance_officer') {
      // Count approved vouchers awaiting check issuance
      const { count: c } = await supabase
        .from('payment_vouchers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');
      count = c ?? 0;

    } else {
      // Fallback: total released invoice count
      const { count: c } = await supabase
        .from('vendor_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'released');
      count = c ?? 0;
    }

    setReleasedInvoiceCount(count);
  }

  async function handleNotificationRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleMarkAllRead() {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F8F7] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  const pendingApprovals = notifications.filter(n => !n.is_read && n.related_entity_type === 'progress_report').length;
  const pendingPayments = releasedInvoiceCount;
  const ceoAlerts = notifications.filter(n => !n.is_read && n.type === 'alert').length;

  return (
    <div className="flex min-h-screen bg-[#F8F8F7]">
      <Sidebar
        role={profile.role}
        badges={{ approvals: pendingApprovals, payments: pendingPayments, alerts: ceoAlerts }}
      />
      <div className="flex-1 flex flex-col min-w-0 ml-[220px]">
        <Topbar
          notifications={notifications}
          onNotificationRead={handleNotificationRead}
          onMarkAllRead={handleMarkAllRead}
          title={title}
        />
        <main className="flex-1 p-6 overflow-auto">
          <ErrorBoundary label="Page failed to render">
            {children}
          </ErrorBoundary>
        </main>
      </div>

      {/* High-priority toast stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 items-end">
          {toasts.map(t => (
            <NotifToast key={t.id} notification={t} onDismiss={() => dismissToast(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
