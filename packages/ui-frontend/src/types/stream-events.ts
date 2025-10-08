/**
 * Streaming protocol types (frontend mirror of backend types)
 * These should match the zod schemas defined in ui-server/src/events/types.ts
 */

// Base event with common fields
export interface BaseEvent {
  ts: number;
  requestId?: string;
}

// Stream lifecycle events
export interface StreamStartEvent extends BaseEvent {
  kind: 'stream_start';
  messageId: string;
}

export interface StreamEndEvent extends BaseEvent {
  kind: 'stream_end';
  messageId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Content delta event
export interface DeltaEvent extends BaseEvent {
  kind: 'delta';
  messageId: string;
  text: string;
}

// Phase transition event
export type AgentPhase = 'pending' | 'thinking' | 'code-writing' | 'building' | 'completed';

export interface PhaseEvent extends BaseEvent {
  kind: 'phase';
  messageId: string;
  name: AgentPhase;
}

// Tool execution event
export interface ToolEvent extends BaseEvent {
  kind: 'tool';
  event: 'start' | 'end';
  toolName: string;
  toolUseId?: string;
  messageId?: string;
  filePath?: string;
}

// Files updated event
export interface FilesUpdatedEvent extends BaseEvent {
  kind: 'files_updated';
  files: any[];
  sessionId?: string;
}

// Error event
export interface ErrorEvent extends BaseEvent {
  kind: 'error';
  message: string;
  code?: string;
  details?: any;
}

// Legacy compatibility events
export interface StatusEvent extends BaseEvent {
  kind: 'status';
  message: string;
}

export interface ResponseEvent extends BaseEvent {
  kind: 'response';
  content: string;
  messageId?: string;
}

// Union of all stream events
export type StreamEvent =
  | StreamStartEvent
  | DeltaEvent
  | PhaseEvent
  | ToolEvent
  | StreamEndEvent
  | FilesUpdatedEvent
  | ErrorEvent
  | StatusEvent
  | ResponseEvent;

/**
 * Type guards for event discrimination
 */
export function isStreamStartEvent(event: StreamEvent): event is StreamStartEvent {
  return event.kind === 'stream_start';
}

export function isDeltaEvent(event: StreamEvent): event is DeltaEvent {
  return event.kind === 'delta';
}

export function isPhaseEvent(event: StreamEvent): event is PhaseEvent {
  return event.kind === 'phase';
}

export function isToolEvent(event: StreamEvent): event is ToolEvent {
  return event.kind === 'tool';
}

export function isStreamEndEvent(event: StreamEvent): event is StreamEndEvent {
  return event.kind === 'stream_end';
}

export function isFilesUpdatedEvent(event: StreamEvent): event is FilesUpdatedEvent {
  return event.kind === 'files_updated';
}

export function isErrorEvent(event: StreamEvent): event is ErrorEvent {
  return event.kind === 'error';
}

export function isStatusEvent(event: StreamEvent): event is StatusEvent {
  return event.kind === 'status';
}

export function isResponseEvent(event: StreamEvent): event is ResponseEvent {
  return event.kind === 'response';
}
