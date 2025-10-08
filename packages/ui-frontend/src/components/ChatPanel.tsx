import { useState, useRef, useEffect } from 'react';
import type { AgentPhase } from '../types/stream-events';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  error?: boolean;
  streaming?: boolean;
  phase?: AgentPhase;
  isReasoning?: boolean;
  isThinking?: boolean;
  thinkingDuration?: number;
  fileOperation?: {
    type: 'create' | 'edit';
    filePath: string;
    status?: 'in-progress' | 'completed';
  };
}

// Helper to get phase display text
function getPhaseLabel(phase?: AgentPhase): string {
  switch (phase) {
    case 'pending':
      return 'Starting...';
    case 'thinking':
      return 'Thinking...';
    case 'reasoning':
      return 'Planning...';
    case 'code-writing':
      return 'Writing code...';
    case 'building':
      return 'Building...';
    case 'completed':
      return 'Done';
    default:
      return '';
  }
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export default function ChatPanel({ messages, onSendMessage, disabled }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldStickRef = useRef(true);

  const scrollToBottom = () => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = listRef.current;
    // Stick to bottom if within 64px of the bottom
    shouldStickRef.current = (scrollHeight - scrollTop - clientHeight) < 64;
  };

  useEffect(() => {
    // Only auto-scroll if user is near the bottom (opt-in scroll)
    if (shouldStickRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <>
      <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
        {messages.length === 0 && (
          <div className="chat-message system">
            Start by describing the app you want to build...
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={msg.id ?? idx}
            className={`chat-message ${msg.role} ${msg.error ? 'error' : ''} ${msg.streaming ? 'streaming' : ''} ${msg.phase || ''} ${msg.fileOperation ? 'file-operation' : ''} ${msg.isReasoning ? 'reasoning' : ''} ${msg.thinkingDuration !== undefined ? 'thinking-complete' : ''} ${msg.isThinking ? 'thinking-shimmer' : ''}`}
            data-phase={msg.phase}
          >
            {msg.phase && msg.streaming && !msg.isThinking && (
              <div className="phase-indicator">
                <span className="phase-label">{getPhaseLabel(msg.phase)}</span>
              </div>
            )}
            <div className="message-content">
              {msg.content}
              {msg.streaming && msg.content.length > 0 && msg.isReasoning && <span className="typing-cursor animate-pulse">▋</span>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-container">
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the app you want to build..."
            rows={3}
            disabled={disabled}
          />
        </div>
        <button
          type="submit"
          className="chat-send-btn"
          disabled={disabled || !input.trim()}
        >
          Send
        </button>
      </form>
    </>
  );
}
