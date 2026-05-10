import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { EntityComment } from '../../types';

interface Props {
  entityType: string;
  entityId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

function dateDividerLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'd MMM yyyy');
}

function dayKey(dateStr: string): string {
  return dateStr.substring(0, 10);
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({ initials, isSelf }: { initials: string; isSelf: boolean }) {
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 select-none ${
        isSelf
          ? 'bg-[#1D9E75] text-white'
          : 'bg-gray-200 text-gray-600'
      }`}
    >
      {initials || '?'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble group
// A "group" = consecutive messages from the same sender within the same day
// ---------------------------------------------------------------------------

interface BubbleGroup {
  userId: string;
  name: string;
  initials: string;
  isSelf: boolean;
  messages: EntityComment[];
}

function buildGroups(comments: EntityComment[], selfId: string | undefined): BubbleGroup[] {
  const groups: BubbleGroup[] = [];
  for (const c of comments) {
    const isSelf = c.user_id === selfId;
    const name = c.user?.full_name ?? 'Unknown';
    const initials = c.user?.avatar_initials || getInitials(name);
    const last = groups[groups.length - 1];
    if (
      last &&
      last.userId === c.user_id &&
      dayKey(last.messages[last.messages.length - 1].created_at) === dayKey(c.created_at)
    ) {
      last.messages.push(c);
    } else {
      groups.push({ userId: c.user_id, name, initials, isSelf, messages: [c] });
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CommentThread({ entityType, entityId }: Props) {
  const { user, profile } = useAuth();

  const [comments, setComments] = useState<EntityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Scroll helpers
  // ---------------------------------------------------------------------------

  function isAtBottom() {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }

  // ---------------------------------------------------------------------------
  // Fetch existing comments + join user profiles
  // ---------------------------------------------------------------------------

  const fetchComments = useCallback(async () => {
    const { data: rows } = await supabase
      .from('entity_comments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });

    if (!rows || rows.length === 0) {
      setComments([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(rows.map((r: any) => r.user_id as string))];
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_initials')
      .in('id', userIds);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const enriched: EntityComment[] = rows.map((r: any) => ({
      ...r,
      user: profileMap.get(r.user_id)
        ? { full_name: profileMap.get(r.user_id).full_name, avatar_initials: profileMap.get(r.user_id).avatar_initials ?? '' }
        : undefined,
    }));

    setComments(enriched);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Scroll to bottom after initial load
  useEffect(() => {
    if (!loading) scrollToBottom('instant' as ScrollBehavior);
  }, [loading]);

  // ---------------------------------------------------------------------------
  // Append a new comment (from realtime) — with profile lookup
  // ---------------------------------------------------------------------------

  async function appendNewComment(raw: EntityComment) {
    const { data: p } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_initials')
      .eq('id', raw.user_id)
      .maybeSingle();

    const enriched: EntityComment = {
      ...raw,
      user: p ? { full_name: p.full_name, avatar_initials: p.avatar_initials ?? '' } : undefined,
    };

    setComments(prev => {
      // Deduplicate: realtime may fire for our own optimistic insert
      if (prev.some(c => c.id === enriched.id)) return prev;
      return [...prev, enriched];
    });
  }

  // ---------------------------------------------------------------------------
  // Realtime subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!entityId) return;

    const channel = supabase
      .channel(`comments_${entityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'entity_comments',
          filter: `entity_id=eq.${entityId}`,
        },
        (payload) => {
          appendNewComment(payload.new as EntityComment);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [entityId]);

  // Auto-scroll when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [comments]);

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  async function sendMessage() {
    const text = input.trim();
    if (!text || !user) return;

    setSending(true);
    setInput('');

    // Optimistic insert
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: EntityComment = {
      id: optimisticId,
      entity_type: entityType,
      entity_id: entityId,
      user_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      user: profile
        ? { full_name: profile.full_name, avatar_initials: profile.avatar_initials ?? getInitials(profile.full_name) }
        : undefined,
    };
    atBottomRef.current = true;
    setComments(prev => [...prev, optimistic]);

    const { data, error } = await supabase
      .from('entity_comments')
      .insert({ entity_type: entityType, entity_id: entityId, user_id: user.id, content: text })
      .select()
      .single();

    if (!error && data) {
      // Replace optimistic with confirmed row (realtime will also fire but dedupe handles it)
      setComments(prev => prev.map(c => c.id === optimisticId ? { ...optimistic, id: data.id } : c));
    } else {
      // Roll back optimistic on error
      setComments(prev => prev.filter(c => c.id !== optimisticId));
    }

    setSending(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleScroll() {
    atBottomRef.current = isAtBottom();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const groups = buildGroups(comments, user?.id);

  // Build a day-keyed set to know where to insert date dividers
  let lastDay = '';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
        <MessageSquare size={14} className="text-[#1D9E75]" />
        <span className="text-[12px] font-semibold text-gray-700">Discussion</span>
        {comments.length > 0 && (
          <span className="ml-auto text-[10px] text-gray-400">{comments.length} message{comments.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 min-h-0"
        style={{ scrollbarWidth: 'thin' }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-4 h-4 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <MessageSquare size={18} className="text-gray-400" />
            </div>
            <p className="text-[12px] font-semibold text-gray-500">No messages yet</p>
            <p className="text-[11px] text-gray-400 mt-1">Start the conversation below.</p>
          </div>
        ) : (
          groups.map((group, gi) => {
            const firstMsg = group.messages[0];
            const day = dayKey(firstMsg.created_at);
            const showDivider = day !== lastDay;
            lastDay = day;

            return (
              <div key={`group-${gi}`}>
                {/* Date divider */}
                {showDivider && (
                  <div className="flex items-center gap-3 my-3">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[10px] font-semibold text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full border border-gray-100">
                      {dateDividerLabel(firstMsg.created_at)}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}

                {/* Bubble group */}
                <div className={`flex gap-2 mt-2 ${group.isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar — only shown once per group */}
                  <div className="shrink-0 mt-0.5">
                    <Avatar initials={group.initials} isSelf={group.isSelf} />
                  </div>

                  {/* Bubbles */}
                  <div className={`flex flex-col gap-0.5 max-w-[78%] ${group.isSelf ? 'items-end' : 'items-start'}`}>
                    {/* Sender name — only on the first bubble of the group, for others */}
                    {!group.isSelf && (
                      <span className="text-[10px] font-semibold text-gray-500 px-1 mb-0.5">
                        {group.name}
                      </span>
                    )}

                    {group.messages.map((msg, mi) => {
                      const isLast = mi === group.messages.length - 1;
                      const isOptimistic = msg.id.startsWith('optimistic-');
                      return (
                        <div
                          key={msg.id}
                          className={`group/msg relative ${group.isSelf ? 'self-end' : 'self-start'}`}
                        >
                          <div
                            className={`px-3 py-2 rounded-2xl text-[12px] leading-relaxed break-words transition-opacity ${
                              isOptimistic ? 'opacity-60' : 'opacity-100'
                            } ${
                              group.isSelf
                                ? 'bg-[#1D9E75] text-white rounded-br-sm'
                                : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                            }`}
                          >
                            {msg.content}
                          </div>
                          {/* Timestamp shown on last bubble of the group, or on hover */}
                          {isLast && (
                            <p className={`text-[9px] text-gray-400 mt-0.5 px-1 ${group.isSelf ? 'text-right' : 'text-left'}`}>
                              {format(parseISO(msg.created_at), 'HH:mm')}
                              {isOptimistic && ' · sending…'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-100 px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send)"
            rows={1}
            className="flex-1 text-[12px] text-gray-800 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#1D9E75]/30 focus:border-[#1D9E75]/50 transition-colors leading-relaxed"
            style={{ minHeight: '36px', maxHeight: '96px', overflowY: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 96) + 'px';
            }}
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#1D9E75] text-white shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#179060] active:scale-95 transition-all"
          >
            <Send size={13} />
          </button>
        </div>
        <p className="text-[9px] text-gray-400 mt-1 px-1">Shift+Enter for new line</p>
      </div>
    </div>
  );
}
