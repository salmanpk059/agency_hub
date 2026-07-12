import React, { useState, useEffect } from 'react';
import { MessageSquare, Search, Send, Users, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Client, Message } from '../../types';

interface ChatClient {
  id: string;
  name: string;
  email?: string;
  status: string;
  lastMessage: {
    content: string;
    created_at: string;
    sender_name: string;
    sender_role: string;
  } | null;
  unreadCount: number;
}

interface ChatCommandCenterProps {
  sessionId?: string;
  messages: Message[];
  newMessageText: string;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  selectedClient: Client | null;
  clients: Client[];
  onSelectClient: (client: Client) => void;
  onNewMessageTextChange: (value: string) => void;
  onSendMessage: (e?: React.FormEvent<HTMLFormElement>) => void;
}

export function ChatCommandCenter({
  sessionId,
  messages,
  newMessageText,
  chatBottomRef,
  selectedClient,
  clients,
  onSelectClient,
  onNewMessageTextChange,
  onSendMessage,
}: ChatCommandCenterProps) {
  const [chatClients, setChatClients] = useState<ChatClient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadChatClients();
  }, [clients]);

  const loadChatClients = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const storedToken = localStorage.getItem('supabase_access_token');
      const storedUserId = localStorage.getItem('agencyhub_user_id');

      if (storedToken) {
        headers.Authorization = `Bearer ${storedToken}`;
      }
      if (sessionId || storedUserId) {
        headers['x-user-id'] = sessionId || storedUserId || '';
      }

      const res = await fetch('/api/chat/overview', {
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setChatClients(data.clients || []);
      }
    } catch (e) {
      console.error('Failed to load chat overview:', e);
    }
  };

  // Subscribe to realtime changes — update client list without full re-fetch
  useEffect(() => {
    if (!supabase) return;
    const activeSupabase = supabase;

    const channel = activeSupabase
      .channel('chat-messages-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: any) => {
          const newMsg = payload.new;
          if (!newMsg || !newMsg.client_id) return;

          // Fetch sender profile to get name/role
          let senderName = 'Unknown';
          let senderRole = 'staff';
          try {
            const { data: profile } = await activeSupabase
              .from('profiles')
              .select('full_name, role')
              .eq('id', newMsg.sender_id)
              .single();
            if (profile) {
              senderName = profile.full_name || 'Unknown';
              senderRole = profile.role || 'staff';
            }
          } catch (e) {}

          setChatClients(prev => prev.map(cc => {
            if (cc.id !== newMsg.client_id) return cc;
            return {
              ...cc,
              unreadCount: cc.id !== selectedClient?.id ? (cc.unreadCount || 0) + 1 : 0,
              lastMessage: {
                content: newMsg.content,
                created_at: newMsg.created_at,
                sender_name: senderName,
                sender_role: senderRole,
              }
            };
          }));
        }
      )
      .subscribe();

    return () => {
      activeSupabase?.removeChannel(channel);
    };
  }, [selectedClient?.id]);

  const filteredClients = chatClients.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedChatClient = selectedClient
    ? chatClients.find((c) => c.id === selectedClient.id) || null
    : null;

  const activeChatClient = selectedChatClient || (selectedClient ? {
    id: selectedClient.id,
    name: selectedClient.name,
    email: '',
    status: selectedClient.status,
    lastMessage: null,
    unreadCount: 0,
  } : null);

  const handleClientClick = (chatClient: ChatClient) => {
    const client = clients.find((c) => c.id === chatClient.id);
    if (client) {
      onSelectClient(client);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newMessageText.trim()) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-brand-light-bg">
      {/* Left Panel: Client List */}
      <aside className="w-full md:w-80 bg-[#0B1220] border-r border-brand-border-dark flex flex-col shrink-0">
        <div className="p-4 border-b border-brand-border-dark shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className="w-4 h-4 text-brand-accent" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Chat Command Center</h3>
          </div>
          <p className="text-[10px] text-slate-400 mb-3">Select a client to review their conversation.</p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-brand-dark border border-brand-border-dark rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredClients.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No clients found.</p>
          ) : (
            filteredClients.map((cc) => {
              const isSelected = selectedClient?.id === cc.id;
              const timeStr = cc.lastMessage
                ? new Date(cc.lastMessage.created_at).toLocaleDateString()
                : '';
              return (
                <button
                  key={cc.id}
                  onClick={() => handleClientClick(cc)}
                  className={`w-full text-left p-3 border-b border-brand-border-dark/50 flex items-start gap-3 cursor-pointer transition hover:bg-brand-dark/40 ${
                    isSelected ? 'bg-brand-accent/15 border-l-2 border-l-brand-accent' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-brand-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Users className="w-4 h-4 text-brand-accent" />
                  </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-white truncate">{cc.name}</p>
                        <span className="text-[9px] text-slate-500 whitespace-nowrap">{timeStr}</span>
                      </div>
                      {cc.email && (
                        <p className="text-[9px] text-slate-500 truncate">{cc.email}</p>
                      )}
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {cc.lastMessage ? (
                        <>
                          <span className="font-semibold text-slate-300">{cc.lastMessage.sender_name}: </span>
                          {cc.lastMessage.content}
                        </>
                      ) : (
                        <span className="italic">No messages yet</span>
                      )}
                    </p>
                  </div>
                  {cc.unreadCount > 0 && (
                    <span className="shrink-0 bg-brand-accent text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-tight">
                      {cc.unreadCount > 99 ? '99+' : cc.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Center Panel: Message Thread */}
      <main className="flex-1 bg-brand-light-bg flex flex-col overflow-hidden">
        {activeChatClient ? (
          <>
            <div className="px-5 py-4 border-b border-slate-200 shrink-0 bg-white">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-brand-accent" />
                      {activeChatClient.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {activeChatClient.email ? (
                        <p className="text-[11px] text-slate-500">{activeChatClient.email}</p>
                      ) : (
                        <p className="text-[11px] text-slate-400">Client email loading...</p>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        activeChatClient.status === 'suspended'
                          ? 'bg-rose-500/10 text-rose-600 border-rose-200'
                          : activeChatClient.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200'
                          : 'bg-amber-500/10 text-amber-700 border-amber-200'
                      }`}>
                        {activeChatClient.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-brand-light-bg">
              {messages.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs bg-white rounded-xl border border-slate-200 shadow-sm">
                  No messages exchanged yet. Start the conversation!
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_id === sessionId;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col max-w-[80%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                    >
                      <span className="text-[10px] text-slate-500 font-bold mb-0.5">
                        {m.sender_name} ({m.sender_role})
                      </span>
                      <div className={`p-3 rounded-lg text-xs leading-relaxed border shadow-xs ${
                        isMe
                          ? 'bg-brand-accent text-white border-brand-accent rounded-br-none'
                          : 'bg-white text-slate-800 border-slate-200 rounded-bl-none'
                      }`}>
                        {m.content}
                      </div>
                      <span className="text-[8px] text-slate-400 font-mono mt-1">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef}></div>
            </div>

            <form onSubmit={onSendMessage} className="p-3 border-t border-slate-200 flex gap-2 shrink-0 bg-white">
              <input
                type="text"
                required
                placeholder="Type a message..."
                value={newMessageText}
                onChange={(e) => onNewMessageTextChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
              <button
                type="submit"
                disabled={!newMessageText.trim()}
                className="p-1.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white rounded cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center py-20 text-slate-500">
            <MessageSquare className="w-12 h-12 mb-3 text-brand-accent animate-pulse" />
            <p className="text-sm font-semibold">Select a client from the left panel to start chatting.</p>
          </div>
        )}
      </main>
    </div>
  );
}
