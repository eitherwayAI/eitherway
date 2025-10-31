import { memo } from 'react';
import { Markdown } from './Markdown';
import { StreamingIndicators } from './StreamingIndicators';

interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
  phase?: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;
  reasoningText?: string;
  thinkingDuration?: number | null;
  fileOperations?: Array<{ operation: string; filePath: string }>;
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;
}

export const AssistantMessage = memo(
  ({
    content,
    isStreaming = false,
    phase = null,
    reasoningText = '',
    thinkingDuration = null,
    fileOperations = [],
    tokenUsage = null,
  }: AssistantMessageProps) => {
    // Check if content is empty (waiting for first chunk from AI)
    const hasNoContent = !content || content.trim().length === 0;
    // Show thinking loader only when streaming, no content, and no phase yet (before "Working..." appears)
    const showThinkingLoader = isStreaming && hasNoContent && !phase;

    return (
      <div className={`overflow-hidden w-full relative `}>
        {/* Thinking message - show when streaming but no content yet */}
        {showThinkingLoader && (
          <div className="flex items-center gap-2 px-3 py-2 mb-3 bg-black/30 border border-white/10 rounded-lg text-sm">
            <div className="i-ph:plug text-blue-400 text-lg animate-pulse" />
            <span className="text-white/90 font-medium">Connecting...</span>
          </div>
        )}

        {/* Streaming indicators - phase, reasoning, file operations, token usage - hide when showing connecting */}
        {!showThinkingLoader && (
          <StreamingIndicators
            phase={phase}
            reasoningText={reasoningText}
            thinkingDuration={thinkingDuration}
            fileOperations={fileOperations}
            tokenUsage={tokenUsage}
            isStreaming={isStreaming}
          />
        )}

        {/* Main message content */}
        {!showThinkingLoader && <Markdown html>{content}</Markdown>}

        {/* Streaming progress bar */}
        {isStreaming && (
          <div className="absolute bottom-0 left-0 right-0 h-2 overflow-hidden rounded-b-lg">
            <div
              className="w-[200%] h-full animate-barbershop"
              style={{
                background:
                  'linear-gradient(45deg, #0D00FF -15%, #FFFFFF 0%, #429BFF 15%, #0D00FF 30%, #FFFFFF 50%, #87CEEB 70%, #0D00FF 85%, #FFFFFF 100%, #429BFF 115%)',
              }}
            />
          </div>
        )}
      </div>
    );
  },
);
