import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Agent streaming phases following the pipeline:
 * pending → thinking → code-writing → building → completed
 */
export type AgentPhase = 'idle' | 'pending' | 'thinking' | 'code-writing' | 'building' | 'completed' | 'error';

/**
 * Tool execution info
 */
export interface ToolExecution {
  toolUseId: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
  completedAt?: number;
  filePath?: string; // For file operation tools
}

/**
 * Phase timing info
 */
export interface PhaseTiming {
  phase: AgentPhase;
  startedAt: number;
  completedAt?: number;
  duration?: number; // in milliseconds
}

/**
 * Agent streaming state
 */
export interface StreamState {
  // Request tracking
  requestId: string | null;
  phase: AgentPhase;
  startedAt: number | null;

  // Content tracking
  tokenCount: number;
  accumulatedText: string;

  // Tool tracking
  activeTool: ToolExecution | null;
  toolHistory: ToolExecution[];
  fileOpsCount: number;

  // Phase tracking
  currentPhaseStartTime: number | null;
  phaseHistory: PhaseTiming[];

  // Current file operation
  currentFile: string | null;

  // Metadata
  error: string | null;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Actions to mutate stream state
 */
export interface StreamActions {
  startStream: (requestId: string) => void;
  setPhase: (phase: AgentPhase) => void;
  appendToken: (text: string) => void;
  startTool: (toolUseId: string, toolName: string, filePath?: string) => void;
  completeTool: (toolUseId: string) => void;
  setError: (error: string) => void;
  completeStream: (usage?: { inputTokens: number; outputTokens: number }) => void;
  resetStream: () => void;
  incrementFileOps: () => void;
  setCurrentFile: (filePath: string | null) => void;
}

/**
 * Combined context value
 */
export interface StreamContextValue {
  state: StreamState;
  actions: StreamActions;
}

const initialState: StreamState = {
  requestId: null,
  phase: 'idle',
  startedAt: null,
  tokenCount: 0,
  accumulatedText: '',
  activeTool: null,
  toolHistory: [],
  fileOpsCount: 0,
  currentPhaseStartTime: null,
  phaseHistory: [],
  currentFile: null,
  error: null,
};

const StreamContext = createContext<StreamContextValue | null>(null);

/**
 * Provider component
 */
export function StreamProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StreamState>(initialState);

  const startStream = useCallback((requestId: string) => {
    setState({
      ...initialState,
      requestId,
      phase: 'pending',
      startedAt: Date.now(),
    });
  }, []);

  const setPhase = useCallback((phase: AgentPhase) => {
    setState(prev => {
      const now = Date.now();

      // Complete previous phase timing
      let updatedPhaseHistory = prev.phaseHistory;
      if (prev.currentPhaseStartTime && prev.phase !== 'idle') {
        const duration = now - prev.currentPhaseStartTime;
        const phaseTiming: PhaseTiming = {
          phase: prev.phase,
          startedAt: prev.currentPhaseStartTime,
          completedAt: now,
          duration,
        };
        updatedPhaseHistory = [...prev.phaseHistory, phaseTiming];
      }

      return {
        ...prev,
        phase,
        currentPhaseStartTime: now,
        phaseHistory: updatedPhaseHistory,
      };
    });
  }, []);

  const appendToken = useCallback((text: string) => {
    setState(prev => ({
      ...prev,
      accumulatedText: prev.accumulatedText + text,
      tokenCount: prev.tokenCount + 1,
    }));
  }, []);

  const startTool = useCallback((toolUseId: string, toolName: string, filePath?: string) => {
    const toolExecution: ToolExecution = {
      toolUseId,
      toolName,
      status: 'running',
      startedAt: Date.now(),
      filePath,
    };

    setState(prev => ({
      ...prev,
      activeTool: toolExecution,
      toolHistory: [...prev.toolHistory, toolExecution],
      currentFile: filePath || prev.currentFile,
    }));
  }, []);

  const completeTool = useCallback((toolUseId: string) => {
    setState(prev => {
      const updatedHistory = prev.toolHistory.map(tool =>
        tool.toolUseId === toolUseId
          ? { ...tool, status: 'completed' as const, completedAt: Date.now() }
          : tool
      );

      return {
        ...prev,
        activeTool: null,
        toolHistory: updatedHistory,
      };
    });
  }, []);

  const setError = useCallback((error: string) => {
    setState(prev => ({
      ...prev,
      phase: 'error',
      error,
    }));
  }, []);

  const completeStream = useCallback((usage?: { inputTokens: number; outputTokens: number }) => {
    setState(prev => ({
      ...prev,
      phase: 'completed',
      usage,
    }));
  }, []);

  const resetStream = useCallback(() => {
    setState(initialState);
  }, []);

  const incrementFileOps = useCallback(() => {
    setState(prev => ({
      ...prev,
      fileOpsCount: prev.fileOpsCount + 1,
    }));
  }, []);

  const setCurrentFile = useCallback((filePath: string | null) => {
    setState(prev => ({
      ...prev,
      currentFile: filePath,
    }));
  }, []);

  const actions: StreamActions = {
    startStream,
    setPhase,
    appendToken,
    startTool,
    completeTool,
    setError,
    completeStream,
    resetStream,
    incrementFileOps,
    setCurrentFile,
  };

  return (
    <StreamContext.Provider value={{ state, actions }}>
      {children}
    </StreamContext.Provider>
  );
}

/**
 * Hook to access stream context
 */
export function useStreamContext(): StreamContextValue {
  const context = useContext(StreamContext);
  if (!context) {
    throw new Error('useStreamContext must be used within StreamProvider');
  }
  return context;
}

/**
 * Convenience hooks for specific state slices
 */
export function usePhase(): AgentPhase {
  const { state } = useStreamContext();
  return state.phase;
}

export function useActiveTool(): ToolExecution | null {
  const { state } = useStreamContext();
  return state.activeTool;
}

export function useFileOpsCount(): number {
  const { state } = useStreamContext();
  return state.fileOpsCount;
}

export function useCurrentFile(): string | null {
  const { state } = useStreamContext();
  return state.currentFile;
}

export function usePhaseHistory(): PhaseTiming[] {
  const { state } = useStreamContext();
  return state.phaseHistory;
}

/**
 * Helper to get phase label for UI
 */
export function getPhaseLabel(phase: AgentPhase): string {
  switch (phase) {
    case 'idle':
      return 'Ready';
    case 'pending':
      return 'Starting...';
    case 'thinking':
      return 'Thinking';
    case 'code-writing':
      return 'Writing code';
    case 'building':
      return 'Building';
    case 'completed':
      return 'Done';
    case 'error':
      return 'Error';
    default:
      return '';
  }
}

/**
 * Helper to get phase color
 */
export function getPhaseColor(phase: AgentPhase): string {
  switch (phase) {
    case 'idle':
      return 'var(--text-secondary)';
    case 'pending':
    case 'thinking':
      return '#ffc107'; // warning yellow
    case 'code-writing':
      return 'var(--accent)'; // blue
    case 'building':
      return '#ff9800'; // orange
    case 'completed':
      return '#21c352'; // success green
    case 'error':
      return '#ff5252'; // error red
    default:
      return 'var(--text-secondary)';
  }
}
