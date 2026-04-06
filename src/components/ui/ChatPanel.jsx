import { useCallback, useEffect, useRef, useState } from 'react';

const MESSAGES_TABLE = 'messages';
const CONVERSATIONS_TABLE = 'conversations';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

/**
 * ChatPanel — shared chat UI for admin and resident.
 *
 * Props:
 *  - supabase        Supabase client (admin or resident)
 *  - conversationId  UUID of the conversation (null if not yet created)
 *  - requestId       UUID of the linked request
 *  - barangayId      UUID of the barangay
 *  - senderRole      'admin' | 'resident'
 *  - senderId        auth.uid() of the current user
 *  - residentUserId  auth.uid() of the resident (for conversation creation)
 *  - onConversationCreated  callback(conversationId) when a new conversation is auto-created
 *  - onClose         callback to close the panel
 *  - residentName    display name of the resident (for admin header)
 *  - documentName    name of the document request (for header context)
 */
export default function ChatPanel({
  supabase,
  conversationId: initialConversationId,
  requestId,
  barangayId,
  senderRole,
  senderId,
  residentUserId,
  onConversationCreated,
  onClose,
  residentName = '',
  documentName = '',
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const channelRef = useRef(null);

  // Sync external conversationId changes
  useEffect(() => {
    setConversationId(initialConversationId);
  }, [initialConversationId]);

  const markAsRead = useCallback(async (convId) => {
    if (!convId || !senderId) return;
    const otherRole = senderRole === 'admin' ? 'resident' : 'admin';
    await supabase
      .from(MESSAGES_TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('sender_role', otherRole)
      .is('read_at', null);
  }, [supabase, senderId, senderRole]);

  // Load messages & subscribe to realtime
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let isActive = true;

    async function loadMessages() {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .select('id, sender_role, sender_id, content, created_at, read_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (!isActive) return;
      if (!error && data) {
        setMessages(data);
      }
      setLoading(false);
    }

    loadMessages();

    // Mark unread messages as read
    markAsRead(conversationId);

    // Realtime subscription
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: MESSAGES_TABLE,
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          // Mark as read if from the other party
          if (payload.new.sender_role !== senderRole) {
            markAsRead(conversationId);
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      isActive = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase, conversationId, senderRole, senderId, markAsRead]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function getOrCreateConversation() {
    if (conversationId) return conversationId;

    // Check if conversation already exists for this request
    const { data: existing } = await supabase
      .from(CONVERSATIONS_TABLE)
      .select('id')
      .eq('request_id', requestId)
      .maybeSingle();

    if (existing?.id) {
      setConversationId(existing.id);
      onConversationCreated?.(existing.id);
      return existing.id;
    }

    // Create new conversation
    const { data: created, error } = await supabase
      .from(CONVERSATIONS_TABLE)
      .insert({
        request_id: requestId,
        barangay_id: barangayId,
        resident_user_id: residentUserId || null,
      })
      .select('id')
      .single();

    if (error || !created) {
      return null;
    }

    setConversationId(created.id);
    onConversationCreated?.(created.id);
    return created.id;
  }

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    const convId = await getOrCreateConversation();
    if (!convId) {
      setSending(false);
      return;
    }

    const { error } = await supabase.from(MESSAGES_TABLE).insert({
      conversation_id: convId,
      sender_role: senderRole,
      sender_id: senderId,
      content: text,
    });

    if (!error) {
      setInput('');
      // Also bump conversation updated_at
      await supabase
        .from(CONVERSATIONS_TABLE)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', convId);
    }
    setSending(false);
    inputRef.current?.focus();
  }

  const headerTitle = senderRole === 'admin'
    ? residentName || 'Chat with resident'
    : 'Chat with Barangay';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900">{headerTitle}</p>
          {documentName && (
            <p className="truncate text-xs text-gray-500">Re: {documentName}</p>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="mt-2 text-sm text-gray-400">No messages yet</p>
            <p className="text-xs text-gray-400">Send a message to start the conversation.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_role === senderRole;
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                    isOwn
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                  <p className={`mt-1 text-right text-[10px] ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                    {formatTime(msg.created_at)}
                    {isOwn && msg.read_at && ' · Read'}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-gray-200 bg-white p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            {sending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
