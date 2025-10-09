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
    return (
      <div className="overflow-hidden w-full">
        {/* Streaming indicators - phase, reasoning, file operations, token usage */}
        <StreamingIndicators
          phase={phase}
          reasoningText={reasoningText}
          thinkingDuration={thinkingDuration}
          fileOperations={fileOperations}
          tokenUsage={tokenUsage}
          isStreaming={isStreaming}
        />

        {/* Main message content */}
        <Markdown html>{content}</Markdown>

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
