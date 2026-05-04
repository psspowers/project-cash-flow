import { ReactNode, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from '../ui/ErrorBoundary';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Notification } from '../../types';

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AppLayout({ children, title }: AppLayoutProps) {
  const { user, profile, loading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

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
        setNotifications(prev => [payload.new as Notification, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

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
  const pendingPayments = notifications.filter(n => !n.is_read && n.related_entity_type === 'payment_voucher').length;
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
    </div>
  );
}
