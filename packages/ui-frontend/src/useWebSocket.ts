import { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import toast from 'react-hot-toast';
import { useStreamContext } from './state/streamStore';
import { StreamService } from './services/StreamService';
import type { StreamEvent, AgentPhase } from './types/stream-events';
import {
  isStreamStartEvent,
  isDeltaEvent,
  isPhaseEvent,
  isThinkingCompleteEvent,
  isReasoningEvent,
  isFileOperationEvent,
  isToolEvent,
  isStreamEndEvent,
  isStatusEvent,
  isResponseEvent,
  isErrorEvent,
  isFilesUpdatedEvent,
} from './types/stream-events';

interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  error?: boolean;
  streaming?: boolean;
  phase?: AgentPhase;
  isReasoning?: boolean; // Flag for reasoning messages
  isThinking?: boolean; // Flag for thinking shimmer
  thinkingDuration?: number; // Thinking duration in seconds
  fileOperation?: {
    type: 'create' | 'edit';
    filePath: string;
    status?: 'in-progress' | 'completed';
  };
}

export function useWebSocket(url: string, sessionId: string | null) {
  const { actions, state } = useStreamContext();
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
          // Initialize streaming message with "Thinking..." after short delay for natural feel
          streamingMessageRef.current = {
            messageId: event.messageId,
            content: 'Thinking...',
            phase: undefined
          };

          // Delay before showing "Thinking..." (400ms for natural pacing)
          setTimeout(() => {
            setMessages(prev => [...prev, {
              id: event.messageId,
              role: 'assistant',
              content: 'Thinking...',
              streaming: true,
              isThinking: true
            }]);
          }, 400);

          actions.startStream(event.messageId);
        }

        else if (isDeltaEvent(event)) {
          // Append delta to streaming message
          if (streamingMessageRef.current) {
            streamingMessageRef.current.content += event.text;
            // Use flushSync to force immediate render for each delta (visible streaming)
            flushSync(() => {
              setMessages(prev => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                const lastMsg = newMessages[lastIdx];
                if (lastMsg && lastMsg.streaming) {
                  // Create new object to ensure React detects change
                  newMessages[lastIdx] = {
                    ...lastMsg,
                    content: streamingMessageRef.current!.content,
                    phase: streamingMessageRef.current!.phase
                  };
                }
                return newMessages;
              });
            });
            actions.appendToken(event.text);
          }
        }

        else if (isPhaseEvent(event)) {
          // Update phase - use flushSync for consistent ordering
          if (streamingMessageRef.current) {
            const previousPhase = streamingMessageRef.current.phase;
            streamingMessageRef.current.phase = event.name;

            // Seal current reasoning message before adding transition messages
            if (event.name === 'code-writing') {
              flushSync(() => {
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIdx = newMessages.length - 1;
                  const lastMsg = newMessages[lastIdx];

                  // Seal the reasoning message
                  if (lastMsg && lastMsg.streaming && lastMsg.isReasoning) {
                    newMessages[lastIdx] = {
                      ...lastMsg,
                      streaming: false
                    };
                  }

                  // Add code-writing transition message
                  if (previousPhase === 'reasoning') {
                    newMessages.push({
                      role: 'system',
                      content: 'Writing code...'
                    });
                  }

                  return newMessages;
                });
              });
            } else if (event.name === 'building') {
              // Don't add transition message - let summary speak for itself
              // Just prepare for new streaming message
            } else if (event.name === 'completed') {
              flushSync(() => {
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastIdx = newMessages.length - 1;
                  const lastMsg = newMessages[lastIdx];

                  // Seal the summary message
                  if (lastMsg && lastMsg.streaming) {
                    newMessages[lastIdx] = {
                      ...lastMsg,
                      streaming: false
                    };
                  }

                  // Add completion message
                  const filesMsg = state.fileOpsCount > 0
                    ? `${state.fileOpsCount} file${state.fileOpsCount !== 1 ? 's' : ''}`
                    : 'files';
                  newMessages.push({
                    role: 'system',
                    content: `✓ Done! Created ${filesMsg}.`
                  });

                  return newMessages;
                });
              });
            }

            actions.setPhase(event.name);
          }
        }

        else if (isThinkingCompleteEvent(event)) {
          // Thinking phase complete - replace "Thinking..." with duration
          actions.setThinkingDuration(event.durationSeconds);
          flushSync(() => {
            setMessages(prev => {
              const newMessages = [...prev];
              const lastIdx = newMessages.length - 1;
              const lastMsg = newMessages[lastIdx];

              // Replace "Thinking..." shimmer with sealed message
              if (lastMsg && lastMsg.isThinking) {
                newMessages[lastIdx] = {
                  ...lastMsg,
                  content: '',
                  isThinking: false,
                  streaming: true // Keep streaming for reasoning
                };
              }

              // Add duration message
              newMessages.push({
                role: 'system',
                content: `💭 Thought for ${event.durationSeconds} second${event.durationSeconds !== 1 ? 's' : ''}`,
                thinkingDuration: event.durationSeconds
              });

              return newMessages;
            });
          });
        }

        else if (isReasoningEvent(event)) {
          // Reasoning text - append smoothly with flushSync for immediate rendering
          console.log('[Reasoning Event]', new Date().toISOString(), 'text length:', event.text.length);
          actions.appendReasoning(event.text);

          // Use flushSync to force immediate rendering (prevents React batching)
          flushSync(() => {
            setMessages(prev => {
              const newMessages = [...prev];
              const lastIdx = newMessages.length - 1;
              const lastMsg = newMessages[lastIdx];

              if (lastMsg && lastMsg.role === 'assistant' && lastMsg.streaming) {
                // Append reasoning to existing content
                newMessages[lastIdx] = {
                  ...lastMsg,
                  content: (lastMsg.content || '') + event.text,
                  isReasoning: true
                };
              } else {
                // Create new reasoning message
                newMessages.push({
                  role: 'assistant',
                  content: event.text,
                  streaming: true,
                  isReasoning: true
                });
              }

              return newMessages;
            });
          });
        }

        else if (isFileOperationEvent(event)) {
          const { operation, filePath } = event;

          // Handle progressive file operation states
          if (operation === 'creating' || operation === 'editing') {
            // Add "Creating..." or "Editing..." message
            const icon = operation === 'creating' ? '📄' : '✏️';
            const verb = operation === 'creating' ? 'Creating' : 'Editing';
            setMessages(prev => [...prev, {
              role: 'system',
              content: `${icon} ${verb} ${filePath}...`,
              fileOperation: {
                type: operation === 'creating' ? 'create' : 'edit',
                filePath,
                status: 'in-progress'
              }
            }]);
          } else if (operation === 'created' || operation === 'edited') {
            // Update the previous message to "Created" or "Edited"
            const icon = operation === 'created' ? '📄' : '✏️';
            const verb = operation === 'created' ? 'Created' : 'Edited';
            setMessages(prev => {
              const newMessages = [...prev];
              // Find the last message for this file with in-progress status
              for (let i = newMessages.length - 1; i >= 0; i--) {
                const msg = newMessages[i];
                if (msg.fileOperation?.filePath === filePath && msg.fileOperation?.status === 'in-progress') {
                  newMessages[i] = {
                    ...msg,
                    content: `${icon} ${verb} ${filePath}`,
                    fileOperation: {
                      ...msg.fileOperation,
                      status: 'completed'
                    }
                  };
                  break;
                }
              }
              return newMessages;
            });

            // Track in state store
            const baseOperation = operation === 'created' ? 'create' : 'edit';
            actions.addFileOperation(baseOperation as 'create' | 'edit', filePath);
          }
        }

        else if (isToolEvent(event)) {
          // Tool start/end events (only for non-file operations now)
          if (event.event === 'start' && event.toolUseId && event.toolName) {
            actions.startTool(event.toolUseId, event.toolName, event.filePath);
            // File operations are handled by FileOperationEvent now
          } else if (event.event === 'end' && event.toolUseId) {
            actions.completeTool(event.toolUseId);
          }
        }

        else if (isStreamEndEvent(event)) {
          // Seal the streaming message
          if (streamingMessageRef.current) {
            const completedMessageId = streamingMessageRef.current.messageId;

            setMessages(prev => {
              const newMessages = [...prev];
              const lastIdx = newMessages.length - 1;
              const lastMsg = newMessages[lastIdx];
              if (lastMsg && lastMsg.streaming) {
                // Create new object to ensure React detects change
                const { phase, ...messageWithoutPhase } = lastMsg;
                newMessages[lastIdx] = {
                  ...messageWithoutPhase,
                  streaming: false
                };
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
          // Extra guard: ignore if there's an active streaming message
          if (streamingMessageRef.current) {
            return;
          }

          // Ignore if this messageId was already handled via streaming
          if (event.messageId && completedStreamIdsRef.current.has(event.messageId)) {
            // This is a duplicate of a streamed message, ignore it
            return;
          }

          setMessages(prev => [...prev, {
            id: event.messageId,
            role: 'assistant',
            content: event.content
          }]);
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
