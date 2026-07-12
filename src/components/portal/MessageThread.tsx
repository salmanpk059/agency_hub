import React from 'react';
import { Message } from '../../types';
import { ChatPanel } from '../admin/ChatPanel';

interface MessageThreadProps {
  messages: Message[];
  newMessageText: string;
  sessionId?: string;
  chatBottomRef: React.RefObject<HTMLDivElement | null>;
  fullWidth?: boolean;
  onNewMessageTextChange: (value: string) => void;
  onSendMessage: (e?: React.FormEvent<HTMLFormElement>) => void;
}

export function MessageThread({
  messages,
  newMessageText,
  sessionId,
  chatBottomRef,
  fullWidth = false,
  onNewMessageTextChange,
  onSendMessage,
}: MessageThreadProps) {
  return (
    <ChatPanel
      messages={messages}
      newMessageText={newMessageText}
      sessionId={sessionId}
      chatBottomRef={chatBottomRef}
      variant="portal"
      fullWidth={fullWidth}
      onNewMessageTextChange={onNewMessageTextChange}
      onSendMessage={onSendMessage}
    />
  );
}
