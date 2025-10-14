import { memo } from 'react';
import { PhaseIndicator } from './PhaseIndicator';
import { FileOperationProgress } from './FileOperationProgress';
import { ReasoningPanel } from './ReasoningPanel';
import { TokenUsage } from './TokenUsage';

interface StreamingIndicatorsProps {
  phase: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;
  reasoningText: string;
  thinkingDuration: number | null;
  fileOperations: Array<{ operation: string; filePath: string }>;
  tokenUsage: { inputTokens: number; outputTokens: number } | null;
  isStreaming: boolean;
}

export const StreamingIndicators = memo(
  ({ phase, reasoningText, thinkingDuration, fileOperations, tokenUsage, isStreaming }: StreamingIndicatorsProps) => {
    // Don't show anything if not streaming and no content to display
    const hasAnyContent =
      !!reasoningText ||
      (fileOperations && fileOperations.length > 0) ||
      !!phase ||
      !!tokenUsage;

    if (!isStreaming && !hasAnyContent) return null;

    return (
      <div className="flex flex-col gap-2 mb-3">
        {/* Phase indicator - always show when streaming or phase exists */}
        {phase && <PhaseIndicator phase={phase} thinkingDuration={thinkingDuration} />}

        {/* Reasoning panel - show during reasoning phase or if there's reasoning text */}
        {reasoningText && <ReasoningPanel text={reasoningText} isActive={phase === 'reasoning'} />}

        {/* File operations - show when there are operations */}
        {fileOperations.length > 0 && <FileOperationProgress operations={fileOperations} />}

        {/* Token usage - show after streaming completes */}
        {tokenUsage && <TokenUsage inputTokens={tokenUsage.inputTokens} outputTokens={tokenUsage.outputTokens} />}
      </div>
    );
  },
);
