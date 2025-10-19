import { memo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ReasoningPanelProps {
  text: string;
  isActive: boolean;
}

export const ReasoningPanel = memo(({ text, isActive }: ReasoningPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!text) return null;

  return (
    <div className="flex flex-col px-4 py-3 bg-black/40 border border-yellow-500/30 rounded-lg text-sm">
      <div className="flex items-center gap-2">
        <div className={`i-ph:lightbulb text-yellow-400 text-lg ${isActive ? 'animate-pulse' : ''}`} />
        <span className="text-yellow-400 font-medium">Reasoning</span>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="ml-auto text-yellow-400/60 hover:text-yellow-400 transition-colors bg-transparent border-0 p-1 cursor-pointer"
          aria-label={isExpanded ? 'Collapse reasoning' : 'Expand reasoning'}
          style={{ background: 'transparent' }}
        >
          <div
            className={`i-ph:caret-down text-lg transition-transform duration-300 ease-out ${isExpanded ? '' : '-rotate-90'}`}
          />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed">{text}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
