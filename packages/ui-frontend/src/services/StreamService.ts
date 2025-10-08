/**
 * StreamService - Centralized WebSocket event handling and stream management
 *
 * Abstracts WebSocket connection and provides typed event handlers
 * for testing, debugging, and observability
 */

import type { StreamEvent } from '../types/stream-events';

export type StreamEventHandler = (event: StreamEvent) => void;

export interface StreamServiceConfig {
  url: string;
  sessionId?: string;
  onEvent?: StreamEventHandler;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export class StreamService {
  private ws: WebSocket | null = null;
  private config: StreamServiceConfig;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private eventHandlers: StreamEventHandler[] = [];

  // Event log for debugging
  private eventLog: Array<{ timestamp: number; event: StreamEvent }> = [];
  private readonly MAX_LOG_SIZE = 100;

  constructor(config: StreamServiceConfig) {
    this.config = config;
    if (config.onEvent) {
      this.eventHandlers.push(config.onEvent);
    }
  }

  /**
   * Connect to WebSocket
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.warn('[StreamService] Already connected');
      return;
    }

    const { url, sessionId } = this.config;
    const wsUrl = sessionId ? `${url}?sessionId=${sessionId}` : url;

    console.log('[StreamService] Connecting to:', wsUrl);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[StreamService] Connected');
      this.config.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        this.handleEvent(data);
      } catch (error) {
        console.error('[StreamService] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[StreamService] WebSocket error:', error);
      this.config.onError?.(error);
    };

    this.ws.onclose = () => {
      console.log('[StreamService] Disconnected');
      this.config.onDisconnect?.();
      this.ws = null;

      // Auto-reconnect if not explicitly closed
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          console.log('[StreamService] Attempting reconnect...');
          this.connect();
        }, 2000);
      }
    };
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a prompt to the agent
   */
  sendPrompt(prompt: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('[StreamService] Not connected');
    }

    this.ws.send(JSON.stringify({
      type: 'prompt',
      prompt
    }));
  }

  /**
   * Add event handler
   */
  on(handler: StreamEventHandler): () => void {
    this.eventHandlers.push(handler);

    // Return unsubscribe function
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Get connection state
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get event log for debugging
   */
  getEventLog(limit?: number): Array<{ timestamp: number; event: StreamEvent }> {
    return limit ? this.eventLog.slice(-limit) : [...this.eventLog];
  }

  /**
   * Clear event log
   */
  clearEventLog(): void {
    this.eventLog.length = 0;
  }

  /**
   * Export event log as JSON
   */
  exportEventLog(): string {
    return JSON.stringify(this.eventLog, null, 2);
  }

  /**
   * Handle incoming event
   */
  private handleEvent(event: StreamEvent): void {
    // Log event
    this.eventLog.push({
      timestamp: Date.now(),
      event
    });

    // Keep log bounded
    if (this.eventLog.length > this.MAX_LOG_SIZE) {
      this.eventLog.shift();
    }

    // Console log in development
    if (import.meta.env.DEV) {
      console.log('[Stream ←]', event.kind, event);
    }

    // Notify all handlers
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[StreamService] Handler error:', error);
      }
    }
  }
}

/**
 * Create a stream service instance
 */
export function createStreamService(config: StreamServiceConfig): StreamService {
  return new StreamService(config);
}
