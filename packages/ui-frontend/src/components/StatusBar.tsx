import { usePhase, useActiveTool, useFileOpsCount, useCurrentFile, usePhaseHistory, useStreamContext, getPhaseLabel, getPhaseColor } from '../state/streamStore';

/**
 * Compact status bar showing agent pipeline phases
 * Displays: pending → thinking → code-writing → building → completed
 */
export default function StatusBar() {
  const phase = usePhase();
  const activeTool = useActiveTool();
  const fileOpsCount = useFileOpsCount();
  const currentFile = useCurrentFile();
  const phaseHistory = usePhaseHistory();
  const { state } = useStreamContext();

  // Don't show bar when idle
  if (phase === 'idle') {
    return null;
  }

  const phaseColor = getPhaseColor(phase);
  const phaseLabel = getPhaseLabel(phase);

  // Helper to format duration in seconds
  const formatDuration = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  };

  // Get duration for a specific completed phase
  const getPhaseDuration = (phaseName: string): number | null => {
    const timing = phaseHistory.find(t => t.phase === phaseName && t.duration);
    return timing?.duration || null;
  };

  // Get file name from path
  const getFileName = (path: string): string => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  // Count edit tools in history
  const getEditCount = (): number => {
    return state.toolHistory.filter(t =>
      (t.toolName === 'either-line-replace' || t.toolName === 'either-write') &&
      t.status === 'completed'
    ).length;
  };

  // Get detailed status message
  const getStatusMessage = (): string => {
    if (phase === 'error') {
      return 'An error occurred';
    }

    // Show thinking duration when completed
    const thinkingDuration = getPhaseDuration('thinking');
    if (phase === 'code-writing' && thinkingDuration) {
      return `Thought for ${formatDuration(thinkingDuration)}`;
    }

    if (phase === 'completed') {
      const editCount = getEditCount();
      if (editCount > 0) {
        return `${editCount} ${editCount === 1 ? 'edit' : 'edits'} made • ${fileOpsCount} files changed`;
      }
      return fileOpsCount > 0 ? `${fileOpsCount} files changed` : 'Done';
    }

    // Show current file being edited/written
    if (phase === 'code-writing' && activeTool) {
      const toolLabel = getToolLabel(activeTool.toolName);
      if (currentFile) {
        return `${toolLabel} ${getFileName(currentFile)}`;
      }
      if (activeTool.filePath) {
        return `${toolLabel} ${getFileName(activeTool.filePath)}`;
      }
      return `${toolLabel}...`;
    }

    return phaseLabel;
  };

  return (
    <div className="status-bar">
      {/* Phase indicator pills */}
      <div className="phase-pills">
        <PhasePill name="Pending" active={phase === 'pending'} />
        <PhaseArrow />
        <PhasePill name="Thinking" active={phase === 'thinking'} />
        <PhaseArrow />
        <PhasePill name="Writing" active={phase === 'code-writing'} />
        <PhaseArrow />
        <PhasePill name="Building" active={phase === 'building'} />
        <PhaseArrow />
        <PhasePill
          name="Done"
          active={phase === 'completed'}
          color={phase === 'completed' ? '#21c352' : undefined}
        />
      </div>

      {/* Status message */}
      <div className="status-message" style={{ color: phaseColor }}>
        <span className="status-dot" style={{ background: phaseColor }} />
        {getStatusMessage()}
      </div>
    </div>
  );
}

interface PhasePillProps {
  name: string;
  active: boolean;
  color?: string;
}

function PhasePill({ name, active, color }: PhasePillProps) {
  const pillColor = color || (active ? 'var(--accent)' : 'var(--text-secondary)');

  return (
    <div
      className={`phase-pill ${active ? 'active' : ''}`}
      style={{
        borderColor: pillColor,
        color: pillColor,
      }}
    >
      <span className="phase-pill-dot" style={{ background: pillColor }} />
      {name}
    </div>
  );
}

function PhaseArrow() {
  return (
    <svg className="phase-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function getToolLabel(toolName: string): string {
  switch (toolName) {
    case 'either-view':
      return 'Reading files';
    case 'either-write':
      return 'Creating files';
    case 'either-line-replace':
      return 'Editing files';
    case 'either-search-files':
      return 'Searching files';
    case 'imagegen':
      return 'Generating image';
    default:
      return 'Working';
  }
}
