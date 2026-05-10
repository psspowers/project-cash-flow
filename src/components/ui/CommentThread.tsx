import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, MessageSquare, AtSign } from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { EntityComment } from '../../types';

interface UserProfile {
  id: string;
  full_name: string;
  avatar_initials: string;
  role: string;
}

interface Props {
  entityType: string;
  entityId: string;
  entityLabel?: string; // e.g. "PSS2024-115" for notification title
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

// Parse @FullName mentions from text, cross-referencing against known users.
// Returns the set of matched user IDs.
function parseMentionedIds(text: string, users: UserProfile[]): Set<string> {
  const ids = new Set<string>();
  for (const u of users) {
    if (text.includes(`@${u.full_name}`)) {
      ids.add(u.id);
    }
  }
  return ids;
}

// Render message content with @Name tokens highlighted.
function renderContent(text: string, users: UserProfile[], isSelf: boolean): React.ReactNode {
  if (!text.includes('@')) return text;

  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Build sorted list of mentions present in this text (longest names first to avoid partial-match issues)
  const matches = users
    .filter(u => remaining.includes(`@${u.full_name}`))
    .sort((a, b) => b.full_name.length - a.full_name.length);

  if (matches.length === 0) return text;

  // Simple tokeniser: find earliest @Name occurrence and split around it
  while (remaining.length > 0) {
    let earliestIdx = Infinity;
    let earliestUser: UserProfile | null = null;

    for (const u of matches) {
      const idx = remaining.indexOf(`@${u.full_name}`);
      if (idx !== -1 && idx < earliestIdx) {
        earliestIdx = idx;
        earliestUser = u;
      }
    }

    if (!earliestUser || earliestIdx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (earliestIdx > 0) {
      parts.push(remaining.substring(0, earliestIdx));
    }

    const token = `@${earliestUser.full_name}`;
    parts.push(
      <span
        key={key++}
        className={
          isSelf
            ? 'font-semibold underline decoration-white/60'
            : 'font-semibold text-[#1D9E75]'
        }
      >
        {token}
      </span>
    );
    remaining = remaining.substring(earliestIdx + token.length);
  }

  return <>{parts}</>;
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

export default function CommentThread({ entityType, entityId, entityLabel }: Props) {
  const { user, profile } = useAuth();

  const [comments, setComments] = useState<EntityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // All users for @mention autocomplete
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [mentionHighlight, setMentionHighlight] = useState(0);

  // Tracked mentioned user IDs for the current draft
  const mentionedIdsRef = useRef<Set<string>>(new Set());

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Filtered mention results
  // ---------------------------------------------------------------------------

  const mentionResults = mentionQuery !== null
    ? allUsers.filter(u =>
        u.id !== user?.id &&
        u.full_name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

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
  // Fetch all user profiles for @mention
  // ---------------------------------------------------------------------------

  useEffect(() => {
    supabase
      .from('user_profiles')
      .select('id, full_name, avatar_initials, role')
      .then(({ data }) => {
        if (data) setAllUsers(data as UserProfile[]);
      });
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch existing comments using PostgREST join
  // ---------------------------------------------------------------------------

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('entity_comments')
      .select('*, user:user_profiles(full_name, avatar_initials)')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CommentThread] fetchComments error:', error);
    }

    setComments((data as EntityComment[]) ?? []);
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
  // Append a new comment (from realtime) using PostgREST join
  // ---------------------------------------------------------------------------

  async function appendNewComment(raw: EntityComment) {
    const { data, error } = await supabase
      .from('entity_comments')
      .select('*, user:user_profiles(full_name, avatar_initials)')
      .eq('id', raw.id)
      .maybeSingle();

    if (error) {
      console.error('[CommentThread] appendNewComment fetch error:', error);
    }

    const enriched: EntityComment = (data as EntityComment) ?? raw;

    setComments(prev => {
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
  // Mention dropdown keyboard navigation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setMentionHighlight(0);
  }, [mentionQuery]);

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  async function sendMessage() {
    const text = input.trim();
    if (!text || !user) return;

    setSending(true);
    setInput('');
    setMentionQuery(null);

    // Snapshot mentioned IDs before clearing
    const mentionedIds = new Set(mentionedIdsRef.current);
    // Also parse from final text as safety net
    parseMentionedIds(text, allUsers).forEach(id => mentionedIds.add(id));
    // Remove sender
    mentionedIds.delete(user.id);
    mentionedIdsRef.current = new Set();

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
      .select('*, user:user_profiles(full_name, avatar_initials)')
      .single();

    if (error) {
      console.error('[CommentThread] insert error:', error);
      // Roll back optimistic on error
      setComments(prev => prev.filter(c => c.id !== optimisticId));
    } else if (data) {
      // Replace optimistic with confirmed row
      setComments(prev => prev.map(c => c.id === optimisticId ? (data as EntityComment) : c));

      // Dispatch notifications for mentioned users
      if (mentionedIds.size > 0) {
        const senderName = profile?.full_name ?? 'Someone';
        const preview = text.length > 60 ? text.substring(0, 60) + '…' : text;
        const label = entityLabel ?? entityId;

        const notifRows = Array.from(mentionedIds).map(uid => ({
          user_id: uid,
          title: `Mentioned in PO ${label}`,
          message: `${senderName} mentioned you: "${preview}"`,
          type: 'info' as const,
          is_read: false,
          related_entity_type: entityType,
          related_entity_id: entityId,
        }));

        supabase.from('notifications').insert(notifRows).then(({ error: notifErr }) => {
          if (notifErr) console.error('[CommentThread] notification insert error:', notifErr);
        });
      }
    }

    setSending(false);
    inputRef.current?.focus();
  }

  // ---------------------------------------------------------------------------
  // Input change — detect @mention trigger
  // ---------------------------------------------------------------------------

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);

    const pos = e.target.selectionStart ?? val.length;

    // Find the last @ before cursor that hasn't been followed by a space
    const textUpToCursor = val.substring(0, pos);
    const atMatch = textUpToCursor.match(/@([^\s@]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStart(atMatch.index!);
    } else {
      setMentionQuery(null);
      setMentionStart(-1);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Handle dropdown navigation first
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlight(h => Math.min(h + 1, mentionResults.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlight(h => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mentionResults[mentionHighlight]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function selectMention(u: UserProfile) {
    if (mentionStart === -1) return;

    const before = input.substring(0, mentionStart);
    const afterCursor = input.substring(inputRef.current?.selectionStart ?? input.length);
    const newInput = `${before}@${u.full_name} ${afterCursor}`;
    setInput(newInput);
    setMentionQuery(null);
    setMentionStart(-1);
    mentionedIdsRef.current.add(u.id);

    // Restore focus and move cursor after the inserted mention
    setTimeout(() => {
      if (inputRef.current) {
        const pos = before.length + u.full_name.length + 2; // +2 for @ and space
        inputRef.current.focus();
        inputRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  function handleScroll() {
    atBottomRef.current = isAtBottom();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const groups = buildGroups(comments, user?.id);
  let lastDay = '';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
        <MessageSquare size={14} className="text-[#1D9E75]" />
        <span className="text-[12px] font-semibold text-gray-700">{entityLabel ?? 'Discussion'}</span>
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
                  <div className="shrink-0 mt-0.5">
                    <Avatar initials={group.initials} isSelf={group.isSelf} />
                  </div>

                  <div className={`flex flex-col gap-0.5 max-w-[78%] ${group.isSelf ? 'items-end' : 'items-start'}`}>
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
                            {renderContent(msg.content, allUsers, group.isSelf)}
                          </div>
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
        <div className="relative flex items-end gap-2">
          {/* @Mention dropdown */}
          {mentionQuery !== null && mentionResults.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute bottom-full left-0 right-10 mb-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10"
            >
              <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-1.5">
                <AtSign size={10} className="text-[#1D9E75]" />
                <span className="text-[10px] font-semibold text-gray-500">Mention a team member</span>
              </div>
              {mentionResults.map((u, i) => (
                <button
                  key={u.id}
                  onMouseDown={e => { e.preventDefault(); selectMention(u); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    i === mentionHighlight ? 'bg-[#1D9E75]/8' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                    {u.avatar_initials || getInitials(u.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-gray-800 truncate">{u.full_name}</p>
                    <p className="text-[10px] text-gray-400 capitalize truncate">{u.role?.replace(/_/g, ' ')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (@ to mention)"
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
        <p className="text-[9px] text-gray-400 mt-1 px-1">Shift+Enter for new line · @ to mention</p>
      </div>
    </div>
  );
}
