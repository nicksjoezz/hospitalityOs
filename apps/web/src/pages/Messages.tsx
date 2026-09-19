import { useEffect, useState, useMemo, useRef } from 'react';
import { apiGet, apiWrite } from '../lib/api';
import { useAuth } from '../lib/auth';

interface ConversationItem {
  id: string;
  hotelId: string;
  channel: string;
  externalId: string;
  status: 'OPEN' | 'RESOLVED';
  lastMessageAt: string;
  guest: {
    id: string | null;
    name: string;
    phone: string;
    email?: string;
    vip?: boolean;
    loyaltyTier?: string;
    visitCount?: number;
    totalSpent?: number;
  };
  activeReservation?: {
    id: string;
    status: string;
    checkInDate: string;
    checkOutDate: string;
    room?: { id: string; number: string };
    roomType?: { id: string; name: string };
    quotedPrice: number;
    currency: string;
  };
  lastMessage?: {
    id: string;
    body: string;
    direction: 'IN' | 'OUT';
    aiGenerated: boolean;
    at: string;
  };
}

interface MessageDetail {
  id: string;
  conversationId: string;
  direction: 'IN' | 'OUT';
  body: string;
  mediaUrls: string[];
  templateName?: string;
  aiGenerated: boolean;
  at: string;
}

interface ConversationDetail extends ConversationItem {
  messages: MessageDetail[];
  isWindowOpen: boolean;
}

interface MessagingStats {
  total: number;
  open: number;
  resolved: number;
  aiDrafted: number;
  avgResponseMinutes: number;
}

const money = (minor: number, curr = 'NGN') =>
  (minor / 100).toLocaleString('en-US', { style: 'currency', currency: curr });

export function Messages() {
  const { hotel } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<ConversationDetail | null>(null);
  const [stats, setStats] = useState<MessagingStats | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'RESOLVED' | 'ALL'>('OPEN');
  const [search, setSearch] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [convLoading, setConvLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<{ suggestion: string; intent: string; confidence: number } | null>(null);
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newGuestName, setNewGuestName] = useState('');
  const [newChannel, setNewChannel] = useState('WHATSAPP');
  const [initialMsg, setInitialMsg] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations and stats
  const fetchConversations = async () => {
    try {
      const q = new URLSearchParams();
      if (channelFilter !== 'ALL') q.set('channel', channelFilter);
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (search.trim()) q.set('search', search.trim());

      const list = await apiGet<ConversationItem[]>(`/messaging/conversations?${q.toString()}`);
      setConversations(list);

      // Auto-select first if none selected or selected is no longer in list
      if (list.length > 0 && (!selectedId || !list.some((c) => c.id === selectedId))) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const s = await apiGet<MessagingStats>('/messaging/stats');
      setStats(s);
    } catch (err) {
      console.error('Failed to load messaging stats:', err);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchStats();
    const interval = setInterval(() => {
      fetchConversations();
    }, 12000);
    return () => clearInterval(interval);
  }, [channelFilter, statusFilter, search]);

  // Load active conversation details
  useEffect(() => {
    if (!selectedId) {
      setActiveConv(null);
      return;
    }
    setConvLoading(true);
    setAiDraft(null);
    apiGet<ConversationDetail>(`/messaging/conversations/${selectedId}`)
      .then((detail) => {
        setActiveConv(detail);
      })
      .catch((err) => {
        console.error('Failed to fetch conversation detail:', err);
      })
      .finally(() => setConvLoading(false));
  }, [selectedId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConv?.messages]);

  const handleSendMessage = async (textToSend?: string, isAi = false, template?: string) => {
    const body = textToSend || replyText;
    if (!body.trim() || !selectedId) return;

    try {
      await apiWrite('POST', `/messaging/conversations/${selectedId}/messages`, {
        body,
        templateName: template,
        aiGenerated: isAi,
      });
      setReplyText('');
      setAiDraft(null);
      // Refresh active thread
      const updated = await apiGet<ConversationDetail>(`/messaging/conversations/${selectedId}`);
      setActiveConv(updated);
      fetchConversations();
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Failed to deliver message. Check network connection.');
    }
  };

  const handleAiSuggest = async () => {
    if (!selectedId) return;
    setAiLoading(true);
    try {
      const res = await apiWrite<{ suggestion: string; confidence: number; intent: string }>(
        'POST',
        `/messaging/conversations/${selectedId}/ai-suggest`,
      );
      if (!res.queued && res.data) {
        setAiDraft(res.data);
      }
    } catch (err) {
      console.error('Failed to get AI suggestion:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!activeConv) return;
    const newStatus = activeConv.status === 'OPEN' ? 'RESOLVED' : 'OPEN';
    try {
      await apiWrite('PATCH', `/messaging/conversations/${activeConv.id}/status`, {
        status: newStatus,
      });
      setActiveConv({ ...activeConv, status: newStatus });
      fetchConversations();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleStartConversation = async () => {
    if (!newPhone.trim()) return;
    try {
      const res = await apiWrite<any>('POST', '/messaging/conversations', {
        channel: newChannel,
        externalId: newPhone.trim(),
        initialMessage: initialMsg.trim() || undefined,
      });
      setNewChatModalOpen(false);
      setNewPhone('');
      setNewGuestName('');
      setInitialMsg('');
      fetchConversations();
      if (!res.queued && res.data?.id) {
        setSelectedId(res.data.id);
      }
    } catch (err) {
      console.error('Failed to start conversation:', err);
      alert('Failed to initiate conversation.');
    }
  };

  const handleCopyMagicLink = (resId?: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/stay${resId ? `?ref=${resId}` : ''}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const quickTemplates = [
    {
      label: '📶 Wi-Fi Details',
      text: `Welcome to ${hotel?.name || 'our hotel'}! You can connect to our high-speed guest Wi-Fi "${hotel?.name || 'HospitalityOS'}-Guest". No password is required. Enjoy your stay!`,
    },
    {
      label: '✨ Early Check-In Ready',
      text: `Great news! Your room is prepared and ready for early check-in. You may proceed straight to the front desk or complete your contactless arrival check-in.`,
    },
    {
      label: '🧹 Housekeeping Dispatched',
      text: `We have notified our housekeeping supervisor right away. Fresh towels and amenities are being brought up to your room right now.`,
    },
    {
      label: '🍽️ Room Service Menu',
      text: `Our chef's curated 24/7 in-room dining menu is available on your guest stay portal. Simply order through the link and charges post automatically to your room folio.`,
    },
    {
      label: '💳 MagicLink Payment',
      text: `Here is your secure HospitalityOS guest folio & payment link: ${typeof window !== 'undefined' ? window.location.origin : ''}/stay${activeConv?.activeReservation?.id ? `?ref=${activeConv.activeReservation.id}` : ''}`,
    },
  ];

  const channelBadge = (channel: string) => {
    switch (channel.toUpperCase()) {
      case 'WHATSAPP':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            WhatsApp
          </span>
        );
      case 'AIRBNB':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-400">
            Airbnb
          </span>
        );
      case 'BOOKING_COM':
      case 'BOOKING':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400">
            Booking.com
          </span>
        );
      case 'SMS':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-400">
            SMS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-300">
            Direct
          </span>
        );
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Bar: Overview & Key Metrics */}
      <header className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 to-sky-500 text-white font-bold text-lg shadow-md shadow-indigo-500/20">
            💬
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">Guest Unified Messaging Hub</h1>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                🤖 Guest Assist AI Enabled
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Centralized OTA, WhatsApp & Direct Concierge Stream
            </p>
          </div>
        </div>

        {/* Live Metrics */}
        <div className="flex items-center gap-4 text-xs">
          <div className="hidden sm:flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5">
            <div className="text-center">
              <span className="block font-bold text-emerald-400">{stats?.open ?? 0}</span>
              <span className="text-[10px] text-slate-400">Open Threads</span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="text-center">
              <span className="block font-bold text-indigo-400">{stats?.aiDrafted ?? 0}</span>
              <span className="text-[10px] text-slate-400">AI Co-Piloted</span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="text-center">
              <span className="block font-bold text-sky-400">{stats?.avgResponseMinutes ?? 3.4}m</span>
              <span className="text-[10px] text-slate-400">Avg Speed</span>
            </div>
          </div>

          <button
            onClick={() => setNewChatModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-indigo-500 transition-colors"
          >
            <span>+</span> Start New Chat
          </button>
        </div>
      </header>

      {/* 3-Column Body Layout */}
      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        {/* ========================================================= */}
        {/* COLUMN 1: Conversation List (Width: 3 cols on large) */}
        {/* ========================================================= */}
        <section className="col-span-12 md:col-span-4 lg:col-span-3 flex flex-col border-r border-slate-800 bg-slate-900/40">
          {/* Filter & Search Controls */}
          <div className="p-3 border-b border-slate-800 space-y-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search guest, phone, message…"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 pl-8 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <span className="absolute left-2.5 top-2 text-xs text-slate-500">🔍</span>
            </div>

            {/* Status Tabs */}
            <div className="flex rounded-lg bg-slate-950 p-1 text-xs">
              {(['OPEN', 'RESOLVED', 'ALL'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 rounded py-1 text-center font-medium transition-all ${
                    statusFilter === s
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s === 'OPEN' ? 'Active' : s === 'RESOLVED' ? 'Resolved' : 'All'}
                </button>
              ))}
            </div>

            {/* Channel Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 text-[11px] scrollbar-none">
              {['ALL', 'WHATSAPP', 'BOOKING_COM', 'AIRBNB', 'SMS'].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 transition-colors ${
                    channelFilter === ch
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'bg-slate-900/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ch === 'ALL'
                    ? 'All Channels'
                    : ch === 'BOOKING_COM'
                    ? 'Booking.com'
                    : ch}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List Stream */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading conversations…</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <p>No messages match this filter.</p>
                <button
                  onClick={() => {
                    setChannelFilter('ALL');
                    setStatusFilter('ALL');
                    setSearch('');
                  }}
                  className="text-indigo-400 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = c.id === selectedId;
                const guestName = c.guest?.name || c.externalId;
                const roomNum = c.activeReservation?.room?.number;

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`cursor-pointer p-3 transition-colors ${
                      isSelected
                        ? 'bg-indigo-950/40 border-l-4 border-indigo-500'
                        : 'hover:bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-xs text-white truncate">
                          {guestName}
                        </span>
                        {c.guest?.vip && (
                          <span className="rounded bg-amber-500/20 px-1 py-0.2 text-[9px] font-bold text-amber-400 border border-amber-500/40">
                            VIP
                          </span>
                        )}
                        {roomNum && (
                          <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-300 font-mono">
                            Rm {roomNum}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {new Date(c.lastMessageAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-slate-400 truncate max-w-[200px]">
                        {c.lastMessage
                          ? `${c.lastMessage.direction === 'OUT' ? 'You: ' : ''}${c.lastMessage.body}`
                          : 'No messages yet'}
                      </p>
                      {channelBadge(c.channel)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ========================================================= */}
        {/* COLUMN 2: Live Chat & AI Guest Assist (Width: 6 cols) */}
        {/* ========================================================= */}
        <main className="col-span-12 md:col-span-8 lg:col-span-6 flex flex-col bg-slate-950">
          {!activeConv ? (
            <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
              Select a conversation to view and send messages.
            </div>
          ) : (
            <>
              {/* Active Conversation Top Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600/30 text-indigo-300 font-bold border border-indigo-500/30">
                    {(activeConv.guest?.name || activeConv.externalId).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white">
                        {activeConv.guest?.name || activeConv.externalId}
                      </h2>
                      {channelBadge(activeConv.channel)}
                      {activeConv.activeReservation?.room && (
                        <span className="rounded bg-sky-950/60 px-2 py-0.5 text-[10px] font-semibold text-sky-300 border border-sky-800">
                          Room {activeConv.activeReservation.room.number}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {activeConv.guest?.phone || activeConv.externalId} ·{' '}
                      {activeConv.isWindowOpen ? (
                        <span className="text-emerald-400">● 24h Free Reply Window Active</span>
                      ) : (
                        <span className="text-amber-400">Standard Template Window</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleStatus}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                      activeConv.status === 'OPEN'
                        ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50'
                        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {activeConv.status === 'OPEN' ? '✓ Mark Resolved' : '↺ Reopen Thread'}
                  </button>
                </div>
              </div>

              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
                {convLoading ? (
                  <div className="text-center text-xs text-slate-500 py-6">Loading messages…</div>
                ) : activeConv.messages.length === 0 ? (
                  <div className="text-center text-xs text-slate-500 py-8">
                    No messages yet in this conversation.
                  </div>
                ) : (
                  activeConv.messages.map((m) => {
                    const isStaff = m.direction === 'OUT';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {isStaff
                              ? m.aiGenerated
                                ? '🤖 Guest Assist AI'
                                : 'Front Desk'
                              : activeConv.guest?.name || 'Guest'}
                          </span>
                          <span className="text-[9px] text-slate-500">
                            {new Date(m.at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs shadow-sm leading-relaxed ${
                            isStaff
                              ? m.aiGenerated
                                ? 'bg-gradient-to-br from-indigo-700 to-indigo-900 text-white border border-indigo-500/40 rounded-tr-none'
                                : 'bg-slate-800 text-slate-100 border border-slate-700 rounded-tr-none'
                              : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          {m.templateName && (
                            <span className="mt-1.5 block text-[9px] text-indigo-300/80 font-mono">
                              Template: {m.templateName}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Guest Assist AI Co-Pilot Suggestion Box */}
              {aiDraft && (
                <div className="mx-4 mb-2 rounded-xl border border-indigo-500/40 bg-indigo-950/60 p-3 shadow-lg backdrop-blur">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🤖</span>
                      <span className="text-xs font-bold text-indigo-300">
                        Guest Assist AI Co-Pilot Recommendation
                      </span>
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[10px] text-indigo-300 font-mono">
                        {aiDraft.intent} · {Math.round(aiDraft.confidence * 100)}% match
                      </span>
                    </div>
                    <button
                      onClick={() => setAiDraft(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-slate-200 bg-slate-900/80 rounded-lg p-2.5 border border-indigo-800/40 mb-2 whitespace-pre-wrap">
                    {aiDraft.suggestion}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setReplyText(aiDraft.suggestion)}
                      className="rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      Use as Draft
                    </button>
                    <button
                      onClick={() => handleSendMessage(aiDraft.suggestion, true)}
                      className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 shadow transition-colors"
                    >
                      Approve & Send Now
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Action Template Bar */}
              <div className="border-t border-slate-800/80 bg-slate-900/50 px-4 py-2">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-400">
                    ⚡ Quick Concierge Templates:
                  </span>
                  <button
                    onClick={handleAiSuggest}
                    disabled={aiLoading}
                    className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                  >
                    <span>🤖</span> {aiLoading ? 'Drafting Suggestion…' : 'Suggest AI Reply'}
                  </button>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {quickTemplates.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => setReplyText(t.text)}
                      className="whitespace-nowrap rounded-md bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reply Input Bar */}
              <div className="border-t border-slate-800 bg-slate-900 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={`Reply to ${activeConv.guest?.name || activeConv.externalId} via ${activeConv.channel}… (Press Enter to send)`}
                    className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!replyText.trim()}
                    className="flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-4 font-semibold text-xs text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors shadow"
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

        {/* ========================================================= */}
        {/* COLUMN 3: 360° Guest & Stay Context (Width: 3 cols) */}
        {/* ========================================================= */}
        <aside className="hidden lg:flex col-span-3 flex-col border-l border-slate-800 bg-slate-900/40 overflow-y-auto p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Guest 360° Profile
          </h3>

          {!activeConv ? (
            <p className="text-xs text-slate-500">No active conversation.</p>
          ) : (
            <>
              {/* Guest Profile Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 text-white font-bold text-lg">
                    {(activeConv.guest?.name || activeConv.externalId).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {activeConv.guest?.name || 'Guest'}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-indigo-300">
                        {activeConv.guest?.loyaltyTier || 'STANDARD'} Tier
                      </span>
                      {activeConv.guest?.vip && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-400">
                          VIP
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-950 p-2">
                    <span className="block text-[10px] text-slate-400">Total Visits</span>
                    <span className="font-bold text-white">
                      {activeConv.guest?.visitCount ?? 1} stays
                    </span>
                  </div>
                  <div className="rounded-lg bg-slate-950 p-2">
                    <span className="block text-[10px] text-slate-400">Lifetime Spend</span>
                    <span className="font-bold text-emerald-400">
                      {money(activeConv.guest?.totalSpent ?? 0)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-slate-300 pt-1 border-t border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone:</span>
                    <span className="font-mono">{activeConv.guest?.phone || activeConv.externalId}</span>
                  </div>
                  {activeConv.guest?.email && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Email:</span>
                      <span className="truncate max-w-[150px]">{activeConv.guest.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Reservation Details */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Current Stay
                  </h4>
                  {activeConv.activeReservation && (
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      {activeConv.activeReservation.status}
                    </span>
                  )}
                </div>

                {activeConv.activeReservation ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center rounded-lg bg-slate-950 p-2.5">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Room</span>
                        <span className="font-bold text-white text-sm">
                          {activeConv.activeReservation.room?.number || 'Unassigned'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Category</span>
                        <span className="text-slate-300 font-medium">
                          {activeConv.activeReservation.roomType?.name || 'Standard Room'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-slate-950 p-2">
                        <span className="block text-[10px] text-slate-400">Check-In</span>
                        <span className="font-medium text-slate-200">
                          {activeConv.activeReservation.checkInDate.slice(0, 10)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-950 p-2">
                        <span className="block text-[10px] text-slate-400">Check-Out</span>
                        <span className="font-medium text-slate-200">
                          {activeConv.activeReservation.checkOutDate.slice(0, 10)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                      <span className="text-slate-400">Booking Total:</span>
                      <span className="font-bold text-white">
                        {money(
                          activeConv.activeReservation.quotedPrice,
                          activeConv.activeReservation.currency,
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 py-2">
                    No active stay reservation found for this phone number.
                  </p>
                )}
              </div>

              {/* Fast Operational Actions */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">
                  Front Desk Actions
                </h4>

                <button
                  onClick={() => handleCopyMagicLink(activeConv.activeReservation?.id)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-indigo-700/60 bg-indigo-950/40 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-900/50 transition-colors"
                >
                  🔗 {copiedLink ? 'Copied to Clipboard!' : 'Copy Guest MagicLink'}
                </button>

                <button
                  onClick={() => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    const link = `${origin}/stay${activeConv.activeReservation?.id ? `?ref=${activeConv.activeReservation.id}` : ''}`;
                    setReplyText(`Here is your HospitalityOS guest stay & check-in portal link: ${link}`);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  📱 Send MagicLink via {activeConv.channel}
                </button>

                {activeConv.guest?.phone && (
                  <a
                    href={`tel:${activeConv.guest.phone}`}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    📞 Call Guest Directly
                  </a>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* New Conversation Modal */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Start New Guest Conversation</h3>
              <button
                onClick={() => setNewChatModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Communication Channel</label>
                <select
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="SMS">Direct SMS</option>
                  <option value="BOOKING_COM">Booking.com Messaging</option>
                  <option value="AIRBNB">Airbnb Inbox</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Guest Phone or External ID</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+234 801 234 5678"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Initial Outbound Message (Optional)</label>
                <textarea
                  rows={3}
                  value={initialMsg}
                  onChange={(e) => setInitialMsg(e.target.value)}
                  placeholder="Hello! Reaching out from HospitalityOS regarding your upcoming stay..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setNewChatModalOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleStartConversation}
                disabled={!newPhone.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                Initiate Conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
