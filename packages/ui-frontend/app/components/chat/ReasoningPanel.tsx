import { memo } from 'react';

interface ReasoningPanelProps {
  text: string;
  isActive: boolean;
}

export const ReasoningPanel = memo(({ text, isActive }: ReasoningPanelProps) => {
  if (!text) return null;

  return (
    <div className="flex flex-col gap-2 px-4 py-3 bg-black/40 border border-yellow-500/30 rounded-lg text-sm max-h-48 overflow-y-auto">
      <div className="flex items-center gap-2">
        <div className={`i-ph:lightbulb text-yellow-400 text-lg ${isActive ? 'animate-pulse' : ''}`} />
        <span className="text-yellow-400 font-medium">Reasoning</span>
      </div>
      <div className="text-white/80 text-xs whitespace-pre-wrap leading-relaxed">{text}</div>
    </div>
  );
});
