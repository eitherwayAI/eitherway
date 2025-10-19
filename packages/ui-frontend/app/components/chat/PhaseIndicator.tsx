import { memo } from 'react';

interface PhaseIndicatorProps {
  phase: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;
  thinkingDuration?: number | null;
}

const phaseConfig = {
  pending: {
    label: 'Preparing',
    icon: 'i-ph:circle-dashed',
    color: 'text-gray-400',
  },
  thinking: {
    label: 'Working…',
    icon: 'i-ph:brain',
    color: 'text-blue-400',
  },
  reasoning: {
    label: 'Planning',
    icon: 'i-ph:lightbulb',
    color: 'text-yellow-400',
  },
  'code-writing': {
    label: 'Writing Code',
    icon: 'i-ph:code',
    color: 'text-green-400',
  },
  building: {
    label: 'Building',
    icon: 'i-ph:hammer',
    color: 'text-orange-400',
  },
  completed: {
    label: 'Completed',
    icon: 'i-ph:check-circle',
    color: 'text-green-500',
  },
};

export const PhaseIndicator = memo(({ phase, thinkingDuration }: PhaseIndicatorProps) => {
  if (!phase) return null;

  const config = phaseConfig[phase];

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm">
      <div className={`${config.icon} ${config.color} text-lg ${phase !== 'completed' ? 'animate-pulse' : ''}`} />
      <span className="text-white/90 font-medium">{config.label}</span>
      {phase === 'completed' && thinkingDuration !== null && thinkingDuration !== undefined && (
        <span className="text-white/50 text-xs ml-1">({thinkingDuration.toFixed(1)}s)</span>
      )}
    </div>
  );
});
