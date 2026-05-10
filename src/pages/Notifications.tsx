import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';
import { NotifTypeIcon, typeAccent, notifHref } from '../components/Layout/Topbar';

type FilterTab = 'all' | 'unread' | 'high_priority';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'high_priority', label: 'High Priority' },
];

const HIGH_PRIORITY: Array<Notification['type']> = ['warning', 'error', 'alert'];

function groupByDate(items: Notification[]): { label: string; items: Notification[] }[] {
  const groups: Record<string, Notification[]> = {};
  for (const n of items) {
    const key = n.created_at ? format(parseISO(n.created_at), 'yyyy-MM-dd') : 'Unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({
      label: formatGroupLabel(key),
      items,
    }));
}

function formatGroupLabel(dateKey: string): string {
  try {
    const d = parseISO(dateKey);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) return 'Today';
    if (format(d, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) return 'Yesterday';
    return format(d, 'EEEE, d MMMM yyyy');
  } catch {
    return dateKey;
  }
}

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 40;

  const loadNotifications = useCallback(async (pageIndex = 0) => {
    if (!user) return;
    setLoading(true);
    const from = pageIndex * PAGE_SIZE;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE);

    const results = data || [];
    if (pageIndex === 0) {
      setNotifications(results);
    } else {
      setNotifications(prev => [...prev, ...results]);
    }
    setHasMore(results.length === PAGE_SIZE + 1);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setPage(0);
    loadNotifications(0);
  }, [loadNotifications]);

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  function handleClick(n: Notification) {
    if (!n.is_read) markRead(n.id);
    const href = notifHref(n.related_entity_type, n.related_entity_id);
    if (href) navigate(href);
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'high_priority') return HIGH_PRIORITY.includes(n.type);
    return true;
  });

  const groups = groupByDate(filtered);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Your activity feed and system alerts</p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-[12px] text-[#378ADD] hover:text-blue-700 font-medium transition-colors border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 bg-blue-50/50"
          >
            <CheckCheck size={13} />
            Mark all read ({unreadCount})
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-5 bg-gray-100/70 rounded-lg p-1 w-fit">
        <Filter size={13} className="text-gray-400 ml-1.5 mr-0.5 shrink-0" />
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
              filter === tab.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.key === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 bg-[#E24B4A] text-white text-[9px] font-bold rounded-full px-1 py-0.5">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="py-20 text-center">
          <Bell size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-[13px] font-medium text-gray-400">No notifications</p>
          <p className="text-[12px] text-gray-300 mt-1">
            {filter !== 'all' ? 'Try switching to "All" to see everything.' : 'You are all caught up.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.label}>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2 px-1">
                {group.label}
              </p>
              <div className="bg-white border border-black/[0.07] rounded-xl overflow-hidden divide-y divide-gray-50">
                {group.items.map(n => {
                  const href = notifHref(n.related_entity_type, n.related_entity_id);
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`flex items-start gap-3 px-4 py-3.5 border-l-[3px] ${typeAccent[n.type]} transition-colors ${
                        href ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                      } ${!n.is_read ? 'bg-blue-50/25' : ''}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <NotifTypeIcon type={n.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] leading-snug ${!n.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">
                          {n.created_at ? formatDistanceToNow(parseISO(n.created_at), { addSuffix: true }) : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        {!n.is_read && (
                          <button
                            onClick={e => { e.stopPropagation(); markRead(n.id); }}
                            className="text-[10px] text-[#378ADD] hover:underline whitespace-nowrap"
                          >
                            Mark read
                          </button>
                        )}
                        {!n.is_read && <div className="w-2 h-2 bg-[#378ADD] rounded-full" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2 pb-4">
              <button
                onClick={() => {
                  const next = page + 1;
                  setPage(next);
                  loadNotifications(next);
                }}
                disabled={loading}
                className="text-[12px] font-medium text-[#378ADD] hover:text-blue-700 border border-blue-200 hover:border-blue-300 rounded-lg px-4 py-2 bg-blue-50/50 transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
