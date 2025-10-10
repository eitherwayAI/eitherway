/**
 * WebSocket client for EitherWay backend
 * Connects to ws://localhost:3001/api/agent and transforms events to match SSE format
 */

export interface StreamOptions {
  prompt: string;
  sessionId?: string;
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
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
 * Stream from WebSocket backend
 * Connects to /api/agent?sessionId=xxx with WebSocket
 */
export async function streamFromWebSocket(options: StreamOptions): Promise<StreamController> {
  const {
    prompt,
    sessionId = `session-${Date.now()}`,
    onChunk,
    onComplete,
    onError,
    onPhase,
    onReasoning,
    onThinkingComplete,
    onFileOperation,
    onFilesUpdated,
    onTokenUsage,
  } = options;

  let ws: WebSocket | null = null;
  let aborted = false;

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

  try {
    // Connect to WebSocket with sessionId
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

      // Add timeout
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
    });

    // Setup message handler
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
        onError('WebSocket error occurred');
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Connection closed');
      if (!aborted) {
        // Connection closed unexpectedly
        onError('Connection closed');
      }
    };

    // Send the prompt to start streaming
    console.log('[WebSocket] Sending prompt:', prompt);
    ws.send(
      JSON.stringify({
        type: 'prompt',
        prompt: prompt,
      }),
    );

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
