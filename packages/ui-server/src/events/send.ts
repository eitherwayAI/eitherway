import type { WebSocket } from 'ws';
import { safeValidateStreamEvent, type StreamEvent } from './types.js';
import { logStreamEvent } from './logger.js';

/**
 * Centralized event sender with validation and logging
 */
export function sendStreamEvent(socket: WebSocket, event: StreamEvent, options?: {
  skipValidation?: boolean;
  skipLogging?: boolean;
}): boolean {
  const { skipValidation = false, skipLogging = false } = options || {};

  // Validate event schema
  if (!skipValidation) {
    const validation = safeValidateStreamEvent(event);
    if (!validation.success) {
      console.error('[StreamEvent] Validation failed:', {
        event,
        errors: validation.error.errors,
      });
      return false;
    }
  }

  // Check socket state
  if (socket.readyState !== 1) { // WebSocket.OPEN
    console.warn('[StreamEvent] Socket not open, cannot send event:', event.kind);
    return false;
  }

  // Log event (for observability)
  if (!skipLogging) {
    logStreamEvent('outbound', event);
  }

  // Send event
  try {
    socket.send(JSON.stringify(event));
    return true;
  } catch (error) {
    console.error('[StreamEvent] Failed to send:', error);
    return false;
  }
}

/**
 * Batch send multiple events
 */
export function sendStreamEvents(socket: WebSocket, events: StreamEvent[]): number {
  let sent = 0;
  for (const event of events) {
    if (sendStreamEvent(socket, event)) {
      sent++;
    }
  }
  return sent;
}

/**
 * Create a scoped sender for a specific connection/request
 */
export function createEventSender(socket: WebSocket, requestId?: string) {
  return {
    send(event: StreamEvent) {
      // Inject requestId if provided
      const eventWithId = requestId ? { ...event, requestId } : event;
      return sendStreamEvent(socket, eventWithId);
    },
    sendRaw(event: StreamEvent) {
      return sendStreamEvent(socket, event, { skipValidation: true, skipLogging: true });
    },
  };
}
