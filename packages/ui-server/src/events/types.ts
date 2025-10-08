import { z } from 'zod';

/**
 * Shared streaming protocol types
 * These types define the contract between server and client for real-time streaming
 */

// Base event with common fields
const BaseEventSchema = z.object({
  ts: z.number(), // Timestamp in ms
  requestId: z.string().optional(), // Request correlation ID
});

// Stream lifecycle events
const StreamStartEventSchema = BaseEventSchema.extend({
  kind: z.literal('stream_start'),
  messageId: z.string(),
});

const StreamEndEventSchema = BaseEventSchema.extend({
  kind: z.literal('stream_end'),
  messageId: z.string(),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number(),
  }).optional(),
});

// Content delta event
const DeltaEventSchema = BaseEventSchema.extend({
  kind: z.literal('delta'),
  messageId: z.string(),
  text: z.string(),
});

// Phase transition event
const PhaseEventSchema = BaseEventSchema.extend({
  kind: z.literal('phase'),
  messageId: z.string(),
  name: z.enum(['pending', 'thinking', 'code-writing', 'building', 'completed']),
});

// Tool execution event
const ToolEventSchema = BaseEventSchema.extend({
  kind: z.literal('tool'),
  event: z.enum(['start', 'end']),
  toolName: z.string(),
  toolUseId: z.string().optional(),
  messageId: z.string().optional(),
  filePath: z.string().optional(), // File being operated on
});

// Files updated event
const FilesUpdatedEventSchema = BaseEventSchema.extend({
  kind: z.literal('files_updated'),
  files: z.array(z.any()),
  sessionId: z.string().optional(),
});

// Error event
const ErrorEventSchema = BaseEventSchema.extend({
  kind: z.literal('error'),
  message: z.string(),
  code: z.string().optional(),
  details: z.any().optional(),
});

// Status event (legacy compatibility)
const StatusEventSchema = BaseEventSchema.extend({
  kind: z.literal('status'),
  message: z.string(),
});

// Response event (legacy compatibility)
const ResponseEventSchema = BaseEventSchema.extend({
  kind: z.literal('response'),
  content: z.string(),
  messageId: z.string().optional(),
});

// Union of all stream events
export const StreamEventSchema = z.discriminatedUnion('kind', [
  StreamStartEventSchema,
  DeltaEventSchema,
  PhaseEventSchema,
  ToolEventSchema,
  StreamEndEventSchema,
  FilesUpdatedEventSchema,
  ErrorEventSchema,
  StatusEventSchema,
  ResponseEventSchema,
]);

// TypeScript types derived from schemas
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type StreamStartEvent = z.infer<typeof StreamStartEventSchema>;
export type DeltaEvent = z.infer<typeof DeltaEventSchema>;
export type PhaseEvent = z.infer<typeof PhaseEventSchema>;
export type ToolEvent = z.infer<typeof ToolEventSchema>;
export type StreamEndEvent = z.infer<typeof StreamEndEventSchema>;
export type FilesUpdatedEvent = z.infer<typeof FilesUpdatedEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type StatusEvent = z.infer<typeof StatusEventSchema>;
export type ResponseEvent = z.infer<typeof ResponseEventSchema>;

/**
 * Validate and parse a stream event
 * @throws {z.ZodError} if validation fails
 */
export function validateStreamEvent(data: unknown): StreamEvent {
  return StreamEventSchema.parse(data);
}

/**
 * Safe validation that returns a result
 */
export function safeValidateStreamEvent(data: unknown): { success: true; data: StreamEvent } | { success: false; error: z.ZodError } {
  const result = StreamEventSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Event builder helpers for type safety
 */
export const StreamEvents = {
  streamStart(messageId: string, requestId?: string): StreamStartEvent {
    return {
      kind: 'stream_start',
      messageId,
      ts: Date.now(),
      requestId,
    };
  },

  delta(messageId: string, text: string, requestId?: string): DeltaEvent {
    return {
      kind: 'delta',
      messageId,
      text,
      ts: Date.now(),
      requestId,
    };
  },

  phase(messageId: string, name: PhaseEvent['name'], requestId?: string): PhaseEvent {
    return {
      kind: 'phase',
      messageId,
      name,
      ts: Date.now(),
      requestId,
    };
  },

  toolStart(toolName: string, toolUseId?: string, messageId?: string, filePath?: string, requestId?: string): ToolEvent {
    return {
      kind: 'tool',
      event: 'start',
      toolName,
      toolUseId,
      messageId,
      filePath,
      ts: Date.now(),
      requestId,
    };
  },

  toolEnd(toolName: string, toolUseId?: string, messageId?: string, filePath?: string, requestId?: string): ToolEvent {
    return {
      kind: 'tool',
      event: 'end',
      toolName,
      toolUseId,
      messageId,
      filePath,
      ts: Date.now(),
      requestId,
    };
  },

  streamEnd(messageId: string, usage?: { inputTokens: number; outputTokens: number }, requestId?: string): StreamEndEvent {
    return {
      kind: 'stream_end',
      messageId,
      usage,
      ts: Date.now(),
      requestId,
    };
  },

  filesUpdated(files: any[], sessionId?: string, requestId?: string): FilesUpdatedEvent {
    return {
      kind: 'files_updated',
      files,
      sessionId,
      ts: Date.now(),
      requestId,
    };
  },

  error(message: string, code?: string, details?: any, requestId?: string): ErrorEvent {
    return {
      kind: 'error',
      message,
      code,
      details,
      ts: Date.now(),
      requestId,
    };
  },

  status(message: string, requestId?: string): StatusEvent {
    return {
      kind: 'status',
      message,
      ts: Date.now(),
      requestId,
    };
  },

  response(content: string, messageId?: string, requestId?: string): ResponseEvent {
    return {
      kind: 'response',
      content,
      messageId,
      ts: Date.now(),
      requestId,
    };
  },
};
