import { memo } from 'react';

interface TokenUsageProps {
  inputTokens: number;
  outputTokens: number;
}

export const TokenUsage = memo(({ inputTokens, outputTokens }: TokenUsageProps) => {
  const totalTokens = inputTokens + outputTokens;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-xs">
      <div className="flex items-center gap-1.5">
        <div className="i-ph:arrow-down text-blue-400" />
        <span className="text-white/60">Input:</span>
        <span className="text-white/90 font-medium">{inputTokens.toLocaleString()}</span>
      </div>
      <div className="h-3 w-px bg-white/20" />
      <div className="flex items-center gap-1.5">
        <div className="i-ph:arrow-up text-green-400" />
        <span className="text-white/60">Output:</span>
        <span className="text-white/90 font-medium">{outputTokens.toLocaleString()}</span>
      </div>
      <div className="h-3 w-px bg-white/20" />
      <div className="flex items-center gap-1.5">
        <div className="i-ph:sigma text-purple-400" />
        <span className="text-white/60">Total:</span>
        <span className="text-white/90 font-medium">{totalTokens.toLocaleString()}</span>
      </div>
    </div>
  );
});
