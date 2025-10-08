import { useEffect, useRef } from 'react';
import { useStreamContext } from '../state/streamStore';

/**
 * Stream event types from WebSocket
 */
type StreamEvent = {
  type: 'stream_start' | 'delta' | 'phase' | 'tool' | 'stream_end' | 'status' | 'response' | 'error' | 'files_updated';
  messageId?: string;
  text?: string;
  name?: 'thinking' | 'code-writing' | 'building' | 'completed';
  event?: 'start' | 'end';
  toolName?: string;
  toolUseId?: string;
  usage?: { inputTokens: number; outputTokens: number };
  message?: string;
  content?: string;
  files?: any[];
  sessionId?: string;
};

/**
 * Hook to integrate WebSocket events with streaming state store
 *
 * This hook listens to the WebSocket and updates the global stream state
 * based on incoming events, creating a cohesive pipeline visualization.
 */
export function useAgentStream(websocket: WebSocket | null, onFilesUpdated?: (files: any[]) => void) {
  const { actions } = useStreamContext();
  const currentRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (!websocket) return;

    const handleMessage = (event: MessageEvent) => {
      const data: StreamEvent = JSON.parse(event.data);

      switch (data.type) {
        case 'stream_start':
          if (data.messageId) {
            currentRequestId.current = data.messageId;
            actions.startStream(data.messageId);
          }
          break;

        case 'delta':
          if (data.text) {
            actions.appendToken(data.text);
          }
          break;

        case 'phase':
          if (data.name) {
            actions.setPhase(data.name);
          }
          break;

        case 'tool':
          if (data.event === 'start' && data.toolUseId && data.toolName) {
            actions.startTool(data.toolUseId, data.toolName);

            // Increment file ops count for write/edit tools
            if (data.toolName === 'either-write' || data.toolName === 'either-line-replace') {
              actions.incrementFileOps();
            }
          } else if (data.event === 'end' && data.toolUseId) {
            actions.completeTool(data.toolUseId);
          }
          break;

        case 'stream_end':
          if (data.usage) {
            actions.completeStream(data.usage);
          } else {
            actions.completeStream();
          }
          break;

        case 'error':
          if (data.message) {
            actions.setError(data.message);
          }
          break;

        case 'files_updated':
          if (data.files && onFilesUpdated) {
            onFilesUpdated(data.files);
          }
          break;

        // Legacy events - ignore but don't error
        case 'status':
        case 'response':
          break;
      }
    };

    websocket.addEventListener('message', handleMessage);

    return () => {
      websocket.removeEventListener('message', handleMessage);
    };
  }, [websocket, actions, onFilesUpdated]);

  return {
    requestId: currentRequestId.current,
  };
}
