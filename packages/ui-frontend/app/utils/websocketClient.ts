/**
 * WebSocket client for EitherWay backend
 * Connects to ws://localhost:3001/api/agent and transforms events to match SSE format
 */

export interface StreamOptions {
  prompt: string;
  sessionId?: string;
  messageRole?: 'user' | 'system';
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  onStreamStart?: (messageId: string) => void;
  onPhase?: (phase: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed') => void;
  onReasoning?: (text: string) => void;
  onThinkingComplete?: (duration: number) => void;
  onFileOperation?: (operation: 'creating' | 'editing' | 'created' | 'edited', filePath: string) => void;
  onFilesUpdated?: (files: any[], sessionId?: string) => void;
  onTokenUsage?: (inputTokens: number, outputTokens: number) => void;
}

export interface StreamController {
  abort: () => void;
  send: (message: any) => void;
}

import { WEBSOCKET_URL } from '~/config/api';

const BACKEND_URL = WEBSOCKET_URL;

/**
 * Stream from WebSocket backend with automatic reconnection
 * Connects to /api/agent?sessionId=xxx with WebSocket
 */
export async function streamFromWebSocket(options: StreamOptions): Promise<StreamController> {
  const {
    prompt,
    sessionId = `session-${Date.now()}`,
    messageRole = 'user', // Default to 'user' if not specified
    onChunk,
    onComplete,
    onError,
    onStreamStart,
    onPhase,
    onReasoning,
    onThinkingComplete,
    onFileOperation,
    onFilesUpdated,
    onTokenUsage,
  } = options;

  let ws: WebSocket | null = null;
  let aborted = false;
  let reconnectAttempts = 0;
  let isCompleted = false;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const BASE_RECONNECT_DELAY = 1000; // Start with 1 second

  const abort = () => {
    aborted = true;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };

  const send = (message: any) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  // Reconnection logic with exponential backoff
  const attemptReconnect = async (): Promise<boolean> => {
    if (aborted || isCompleted) {
      console.log('[WebSocket] Skipping reconnect - stream aborted or completed');
      return false;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[WebSocket] Max reconnection attempts reached');
      onError('Connection lost - maximum retry attempts exceeded');
      return false;
    }

    reconnectAttempts++;
    const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
    console.log(`[WebSocket] Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await connectWebSocket();
      console.log('[WebSocket] Reconnected successfully');
      reconnectAttempts = 0; // Reset on successful reconnect
      return true;
    } catch (error) {
      console.error('[WebSocket] Reconnection failed:', error);
      return attemptReconnect(); // Try again
    }
  };

  // WebSocket connection setup
  const connectWebSocket = async (): Promise<void> => {
    const wsUrl = `${BACKEND_URL}/api/agent?sessionId=${sessionId}`;
    console.log('[WebSocket] Connecting to:', wsUrl);

    ws = new WebSocket(wsUrl);

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      if (!ws) return reject(new Error('WebSocket not initialized'));

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        resolve();
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Connection error:', event);
        reject(new Error('WebSocket connection failed'));
      };

      setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
    });

    ws.onmessage = (event) => {
      if (aborted) return;

      try {
        const data = JSON.parse(event.data);
        // Only log important events, not every chunk/reasoning delta
        if (!['delta', 'reasoning'].includes(data.kind)) {
          console.log('[WebSocket] Received:', data.kind);
        }

        switch (data.kind) {
          case 'stream_start':
            // Message streaming started
            console.log('[WebSocket] Stream started, messageId:', data.messageId);
            if (onStreamStart && data.messageId) {
              onStreamStart(data.messageId);
            }
            break;

          case 'delta':
            // Text delta - map to chunk for compatibility
            if (data.text) {
              onChunk(data.text);
            }
            break;

          case 'reasoning':
            // Reasoning text during planning phase
            if (onReasoning && data.text) {
              onReasoning(data.text);
            }
            break;

          case 'phase':
            // Phase change (thinking, reasoning, code-writing, building, completed)
            if (onPhase && data.name) {
              onPhase(data.name);
            }
            break;

          case 'thinking_complete':
            // Thinking phase completed with duration
            if (onThinkingComplete && data.durationSeconds !== undefined) {
              onThinkingComplete(data.durationSeconds);
            }
            break;

          case 'file_operation':
            // File operation progress (creating, created, editing, edited)
            if (onFileOperation && data.operation && data.filePath) {
              onFileOperation(data.operation, data.filePath);
            }
            break;

          case 'tool':
            // Tool execution started/ended
            if (data.event === 'start') {
              console.log('[WebSocket] Tool started:', data.toolName, data.filePath);
            } else if (data.event === 'end') {
              console.log('[WebSocket] Tool ended:', data.toolName, data.filePath);
            }
            break;

          case 'files_updated':
            // Files were updated (backend sent updated file list)
            if (onFilesUpdated && data.files) {
              onFilesUpdated(data.files, data.sessionId);
            }
            break;

          case 'stream_end':
            // Stream completed
            console.log('[WebSocket] Stream ended, usage:', data.usage);
            isCompleted = true;
            if (onTokenUsage && data.usage) {
              onTokenUsage(data.usage.inputTokens, data.usage.outputTokens);
            }
            onComplete();
            break;

          case 'response':
            // Final response (backward compatibility)
            console.log('[WebSocket] Got final response');
            break;

          case 'error':
            // Error occurred
            console.error('[WebSocket] Error:', data.message);
            onError(data.message || 'Unknown error');
            break;

          default:
            console.log('[WebSocket] Unknown event kind:', data.kind);
        }
      } catch (parseError) {
        console.error('[WebSocket] Failed to parse message:', parseError);
      }
    };

    ws.onerror = (event) => {
      if (!aborted) {
        console.error('[WebSocket] Error:', event);
        // Don't call onError here - let onclose handle reconnection
      }
    };

    ws.onclose = async () => {
      console.log('[WebSocket] Connection closed');
      if (!aborted && !isCompleted) {
        // Connection closed unexpectedly - attempt reconnection
        console.log('[WebSocket] Unexpected close - attempting reconnection...');
        const reconnected = await attemptReconnect();
        if (!reconnected) {
          onError('Connection lost - unable to reconnect');
        }
      }
    };
  };

  try {
    // Initial connection
    await connectWebSocket();

    console.log('[WebSocket] Sending prompt:', prompt, 'Role:', messageRole);
    if (ws) {
      ws.send(
        JSON.stringify({
          type: 'prompt',
          prompt: prompt,
          role: messageRole, // Pass role to backend for proper message storage
        }),
      );
    }

    return { abort, send };
  } catch (error) {
    if (!aborted) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[WebSocket] Error:', errorMessage);
      onError(errorMessage);
    }

    return { abort, send };
  }
}
