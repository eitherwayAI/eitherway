import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useStreamContext } from './state/streamStore';
import { StreamService } from './services/StreamService';
import type { StreamEvent, AgentPhase } from './types/stream-events';
import {
  isStreamStartEvent,
  isDeltaEvent,
  isPhaseEvent,
  isToolEvent,
  isStreamEndEvent,
  isStatusEvent,
  isResponseEvent,
  isErrorEvent,
  isFilesUpdatedEvent,
} from './types/stream-events';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  error?: boolean;
  streaming?: boolean;
  phase?: AgentPhase;
}

export function useWebSocket(url: string, sessionId: string | null) {
  const { actions } = useStreamContext();
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const streamServiceRef = useRef<StreamService | null>(null);
  const streamingMessageRef = useRef<{ messageId: string; content: string; phase?: AgentPhase } | null>(null);
  const completedStreamIdsRef = useRef<Set<string>>(new Set());

  const clearMessages = useCallback((newMessages: ChatMessage[] = []) => {
    setMessages(newMessages);
    streamingMessageRef.current = null;
    completedStreamIdsRef.current.clear();
  }, []);

  useEffect(() => {
    // Immediately clear files when session changes to prevent stale data
    setFiles([]);

    const fetchFiles = async () => {
      if (!sessionId) {
        return;
      }

      try {
        console.log('[useWebSocket] Fetching files for session:', sessionId);
        const response = await fetch(`/api/sessions/${sessionId}/files/tree`);
        const data = await response.json();
        if (data.files) {
          console.log('[useWebSocket] Received', data.files.length, 'files for session:', sessionId);
          setFiles(data.files);
        }
      } catch (error) {
        console.error('Failed to fetch initial files:', error);
      }
    };

    fetchFiles();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setConnected(false);
      return;
    }

    // Create StreamService instance
    const streamService = new StreamService({
      url,
      sessionId,
      onConnect: () => {
        console.log('✅ WebSocket connected successfully for session:', sessionId);
        setConnected(true);
      },
      onDisconnect: () => {
        console.log('⚠️ WebSocket disconnected');
        setConnected(false);
      },
      onError: (error) => {
        console.error('❌ WebSocket error:', error);
      },
      onEvent: (event: StreamEvent) => {
        // Handle events using type guards
        if (isStreamStartEvent(event)) {
          // Initialize streaming message
          streamingMessageRef.current = {
            messageId: event.messageId,
            content: '',
            phase: undefined
          };
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '',
            streaming: true
          }]);
          actions.startStream(event.messageId);
        }

        else if (isDeltaEvent(event)) {
          // Append delta to streaming message
          if (streamingMessageRef.current) {
            streamingMessageRef.current.content += event.text;
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg && lastMsg.streaming) {
                lastMsg.content = streamingMessageRef.current!.content;
                lastMsg.phase = streamingMessageRef.current!.phase;
              }
              return newMessages;
            });
            actions.appendToken(event.text);
          }
        }

        else if (isPhaseEvent(event)) {
          // Update phase
          if (streamingMessageRef.current) {
            streamingMessageRef.current.phase = event.name;
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg && lastMsg.streaming) {
                lastMsg.phase = event.name;
              }
              return newMessages;
            });
            actions.setPhase(event.name);
          }
        }

        else if (isToolEvent(event)) {
          // Tool start/end events
          if (event.event === 'start' && event.toolUseId && event.toolName) {
            actions.startTool(event.toolUseId, event.toolName, event.filePath);
            if (event.toolName === 'either-write' || event.toolName === 'either-line-replace') {
              actions.incrementFileOps();
            }
            // Set current file if present
            if (event.filePath) {
              actions.setCurrentFile(event.filePath);
            }
          } else if (event.event === 'end' && event.toolUseId) {
            actions.completeTool(event.toolUseId);
            // Clear current file after completion
            actions.setCurrentFile(null);
          }
        }

        else if (isStreamEndEvent(event)) {
          // Seal the streaming message
          if (streamingMessageRef.current) {
            const completedMessageId = streamingMessageRef.current.messageId;

            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg && lastMsg.streaming) {
                lastMsg.streaming = false;
                delete lastMsg.phase;
              }
              return newMessages;
            });

            // Track completed stream to ignore duplicate response events
            completedStreamIdsRef.current.add(completedMessageId);
            streamingMessageRef.current = null;

            if (event.usage) {
              actions.completeStream(event.usage);
            } else {
              actions.completeStream();
            }
          }
        }

        else if (isStatusEvent(event)) {
          setMessages(prev => [...prev, {
            role: 'system',
            content: event.message
          }]);
        }

        else if (isResponseEvent(event)) {
          // Backward compatibility: if we get a final response without streaming
          // Ignore if this messageId was already handled via streaming
          if (event.messageId && completedStreamIdsRef.current.has(event.messageId)) {
            // This is a duplicate of a streamed message, ignore it
            return;
          }

          if (!streamingMessageRef.current) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: event.content
            }]);
          }
        }

        else if (isErrorEvent(event)) {
          // Show toast notification for rate limit errors
          if (event.message.toLowerCase().includes('rate limit')) {
            toast.error(event.message);
          }
          setMessages(prev => [...prev, {
            role: 'system',
            content: `Error: ${event.message}`,
            error: true
          }]);
          actions.setError(event.message);
        }

        else if (isFilesUpdatedEvent(event)) {
          setFiles(event.files);
        }
      }
    });

    streamServiceRef.current = streamService;
    streamService.connect();

    return () => {
      streamService.disconnect();
    };
  }, [url, sessionId]);

  const sendMessage = useCallback((prompt: string) => {
    if (streamServiceRef.current?.isConnected) {
      // Add user message to chat
      setMessages(prev => [...prev, {
        role: 'user',
        content: prompt
      }]);

      // Send to backend
      streamServiceRef.current.sendPrompt(prompt);
    }
  }, []);

  return {
    connected,
    messages,
    files,
    sendMessage,
    clearMessages,
    streamService: streamServiceRef.current
  };
}
