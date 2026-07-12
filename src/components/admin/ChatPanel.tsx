import React from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Message, UserRole } from '../../types';

interface ChatPanelProps {
  messages: Message[];
  newMessageText: string;
  sessionId?: string;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  variant?: 'admin' | 'portal';
  fullWidth?: boolean;
  onNewMessageTextChange: (value: string) => void;
  onSendMessage: (e?: React.FormEvent<HTMLFormElement>) => void;
}

export function ChatPanel({
  messages,
  newMessageText,
  sessionId,
  chatBottomRef,
  variant = 'admin',
  fullWidth = false,
  onNewMessageTextChange,
  onSendMessage,
}: ChatPanelProps) {
  const isAdmin = variant === 'admin';

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newMessageText.trim()) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return (
    <div className={`flex flex-col shrink-0 overflow-hidden ${
      fullWidth ? 'flex-1 w-full' : 'w-full md:w-96'
    } ${isAdmin
        ? 'bg-[#131E35] border-t md:border-t-0 md:border-l border-brand-border-dark'
        : 'bg-white border-t md:border-t-0 md:border-l border-slate-200'
    }`}>
      <div className={`p-4 border-b flex items-center gap-2 shrink-0 ${
        isAdmin ? 'border-brand-border-dark' : 'border-slate-200'
      }`}>
        <MessageSquare className="w-4 h-4 text-brand-accent" />
        <span className={`font-bold text-xs uppercase tracking-wider ${
          isAdmin ? 'text-white' : 'text-slate-900'
        }`}>
          {isAdmin ? 'Communication Channel' : 'Support & Agency Chat'}
        </span>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${
        isAdmin ? 'bg-brand-dark/20' : 'bg-slate-50/50'
      }`}>
        {messages.length === 0 ? (
          <div className={`text-center py-12 text-xs ${isAdmin ? 'text-slate-500' : 'text-slate-400'}`}>
            {isAdmin
              ? 'No messages exchanged yet. Introduce yourself!'
              : 'No chat messages found. Text your account manager to check in!'}
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.sender_id === sessionId;
            return (
              <div
                key={m.id}
                className={`flex flex-col max-w-[85%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
              >
                <span className={`text-[10px] font-bold mb-0.5 ${
                  isAdmin ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  {m.sender_name} ({m.sender_role as UserRole})
                </span>
                <div className={`p-3 rounded-lg text-xs leading-relaxed border shadow-xs ${
                  isMe
                    ? 'bg-brand-accent text-white border-brand-accent rounded-br-none'
                    : isAdmin
                      ? 'bg-brand-dark text-slate-200 border-brand-border-dark rounded-bl-none'
                      : 'bg-white text-slate-800 border-slate-200 rounded-bl-none'
                }`}>
                  {m.content}
                </div>
                <span className={`text-[8px] font-mono mt-1 ${
                  isAdmin ? 'text-slate-500' : 'text-slate-400'
                }`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef}></div>
      </div>

      <form
        onSubmit={onSendMessage}
        className={`p-3 border-t flex gap-2 shrink-0 ${
          isAdmin ? 'border-brand-border-dark bg-[#131E35]' : 'border-slate-200 bg-white'
        }`}
      >
        <input
          type="text"
          required
          placeholder={isAdmin ? 'Type a message...' : 'Ask a question or send updates...'}
          value={newMessageText}
          onChange={(e) => onNewMessageTextChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          className={`flex-1 px-3 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent ${
            isAdmin
              ? 'bg-brand-dark border border-brand-border-dark text-white'
              : 'border border-slate-300 text-slate-900'
          }`}
        />
        <button
          type="submit"
          disabled={!newMessageText.trim()}
          className="p-1.5 bg-brand-accent hover:bg-brand-accent-hover disabled:opacity-50 text-white rounded cursor-pointer disabled:cursor-not-allowed flex items-center justify-center transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
