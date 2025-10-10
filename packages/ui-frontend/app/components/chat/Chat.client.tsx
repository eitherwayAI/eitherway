import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useAnimate } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useShortcuts, useSnapScroll } from '~/lib/hooks';
import { useBackendHistory } from '~/lib/persistence/useBackendHistory';
import { chatStore } from '~/lib/stores/chat';
import { brandKitStore } from '~/lib/stores/brandKit';
import { workbenchStore } from '~/lib/stores/workbench';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger } from '~/utils/logger';
import { streamFromWebSocket, type StreamController } from '~/utils/websocketClient';
import { getOrCreateSession, clearSession } from '~/utils/sessionManager';
import { syncFilesToWebContainer } from '~/utils/fileSync';
import { syncBrandAssetsToWebContainer } from '~/utils/brandAssetSync';
import { webcontainer } from '~/lib/webcontainer/index';
import { runDevServer } from '~/utils/webcontainerRunner';
import { BaseChat } from './BaseChat';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

/**
 * Helper: Determine destination path for a brand asset based on its type
 */
function getAssetDestinationPath(asset: any): string {
  const kind = asset.metadata?.kind || asset.assetType;
  const fileName = asset.fileName;

  switch (kind) {
    case 'icon':
      return `public/${fileName}`;
    case 'logo':
    case 'image':
      return `public/assets/${fileName}`;
    case 'font':
      return `public/fonts/${fileName}`;
    case 'video':
      return `public/videos/${fileName}`;
    case 'brand_zip':
      return ''; // Skip ZIPs
    default:
      return `public/brand/${fileName}`;
  }
}

/**
 * Helper: Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Ensure brand assets are synced to both client WebContainer and server session workspace
 * before starting a new streaming request
 */
async function ensureBrandAssetsSyncedBeforeStream(sessionId: string) {
  // Get brand kit ID from store (persisted in localStorage)
  let { pendingBrandKitId } = brandKitStore.get();

  // If no brand kit in store, try to fetch user's active brand kit
  if (!pendingBrandKitId) {
    try {
      // Try wallet address first, fallback to default user
      const walletAddress = localStorage.getItem('walletAddress');
      const userId = walletAddress || 'user@eitherway.app';

      logger.debug('Fetching active brand kit for user:', userId);
      const response = await fetch(`/api/brand-kits/user/${encodeURIComponent(userId)}/active`);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.brandKit) {
          pendingBrandKitId = data.brandKit.id;
          brandKitStore.setKey('pendingBrandKitId', pendingBrandKitId);
          logger.info('Fetched and set user active brand kit:', pendingBrandKitId);
        }
      } else if (response.status !== 404) {
        logger.debug('No active brand kit found for user');
      }
    } catch (error) {
      logger.debug('Error fetching active brand kit:', error);
    }
  }

  // If still no brand kit, nothing to sync
  if (!pendingBrandKitId) {
    logger.debug('No brand kit to sync');
    return;
  }

  try {
    // 1) Fetch the latest kit with assets (from UI server)
    logger.info('Syncing brand kit assets before stream:', pendingBrandKitId);
    const res = await fetch(`/api/brand-kits/${pendingBrandKitId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch brand kit: ${res.statusText}`);
    }
    const data = await res.json();
    const assets = data?.brandKit?.assets ?? [];

    if (assets.length === 0) {
      logger.info('No assets to sync');
      brandKitStore.setKey('dirty', false);
      return;
    }

    // 2) Sync into client WebContainer
    const wc = await webcontainer;
    const result = await syncBrandAssetsToWebContainer(wc, assets);
    logger.info(`✓ Synced ${result.synced} assets to client WebContainer`);

    // 3) Push to the server session workspace
    let serverSynced = 0;
    const BACKEND_URL = 'https://localhost:3001';

    for (const asset of assets) {
      try {
        const destPath = getAssetDestinationPath(asset);
        if (!destPath) {
          logger.debug(`Skipping asset (no destination): ${asset.fileName}`);
          continue;
        }

        // Fetch asset bytes from storage
        const assetRes = await fetch(`${BACKEND_URL}/api/brand-assets/download/${encodeURIComponent(asset.storageKey)}`);
        if (!assetRes.ok) {
          throw new Error(`Failed to fetch asset: ${assetRes.statusText}`);
        }
        const assetBuffer = await assetRes.arrayBuffer();

        // Convert to base64
        const base64Content = arrayBufferToBase64(assetBuffer);

        // POST to server write-binary endpoint
        const writeRes = await fetch(`/api/sessions/${sessionId}/files/write-binary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: destPath,
            contentBase64: base64Content,
            mimeType: asset.mimeType
          })
        });

        if (!writeRes.ok) {
          const errorData = await writeRes.json().catch(() => ({ error: writeRes.statusText }));
          throw new Error(`Failed to write to server: ${errorData.error || writeRes.statusText}`);
        }

        logger.debug(`✓ Server synced: ${destPath}`);
        serverSynced++;
      } catch (error) {
        logger.error(`Failed to sync asset ${asset.fileName} to server:`, error);
        // Continue with other assets
      }
    }

    logger.info(`✓ Synced ${serverSynced} assets to server workspace`);

    // 4) Create brand kit manifest with color palette for the agent
    const colors = data?.brandKit?.colors ?? [];
    if (colors.length > 0) {
      const manifest = {
        brandKit: {
          id: pendingBrandKitId,
          colors: colors.map((c: any) => ({
            hex: c.hex,
            name: c.name,
            role: c.role,
            prominence: c.prominence
          })),
          assets: assets.map((a: any) => ({
            fileName: a.fileName,
            type: a.assetType,
            path: getAssetDestinationPath(a)
          }))
        }
      };

      const manifestJson = JSON.stringify(manifest, null, 2);

      try {
        const manifestRes = await fetch(`/api/sessions/${sessionId}/files/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'brand-kit.json',
            content: manifestJson,
            mimeType: 'application/json'
          })
        });

        if (manifestRes.ok) {
          logger.info('✓ Brand kit manifest created with color palette');
        }
      } catch (error) {
        logger.error('Failed to write brand kit manifest:', error);
      }
    }

    brandKitStore.setKey('dirty', false);
  } catch (error) {
    logger.error('Failed to sync brand assets:', error);
    toast.error('Failed to sync brand assets. They may not be available in the workspace.');
  }
}

export function Chat() {

  const { ready, initialMessages, files, sessionTitle, sessionId, storeMessageHistory } = useBackendHistory();

  return (
    <>
      {ready && <ChatImpl initialMessages={initialMessages} files={files} sessionTitle={sessionTitle} sessionId={sessionId} storeMessageHistory={storeMessageHistory} />}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-eitherway-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-eitherway-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
      />
    </>
  );
}

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileNode[];
}

interface ChatProps {
  initialMessages: Message[];
  files: FileNode[];
  sessionTitle: string;
  sessionId: string | null;
  storeMessageHistory: (messages: Message[]) => Promise<void>;
}

export const ChatImpl = memo(({ initialMessages, files, sessionTitle, sessionId, storeMessageHistory }: ChatProps) => {
  useShortcuts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);

  const { showChat } = useStore(chatStore);

  useEffect(() => {
    console.log('Chat.client - setting chatStarted to:', chatStarted);
    chatStore.setKey('started', chatStarted);
  }, [chatStarted]);

  const [animationScope, animate] = useAnimate();

  // Extended Message type with metadata
  interface ExtendedMessage extends Message {
    metadata?: {
      reasoningText?: string;
      thinkingDuration?: number | null;
      fileOperations?: Array<{ operation: string; filePath: string }>;
      tokenUsage?: { inputTokens: number; outputTokens: number } | null;
      phase?: 'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null;
    };
  }

  // Local state for messages (replaces useChat)
  const [messages, setMessages] = useState<ExtendedMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');
  const streamControllerRef = useRef<StreamController | null>(null);

  // Phase 2: Enhanced streaming state (for current message only)
  const [currentPhase, setCurrentPhase] = useState<'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null>(null);
  const [reasoningText, setReasoningText] = useState('');
  const [thinkingDuration, setThinkingDuration] = useState<number | null>(null);
  const [fileOperations, setFileOperations] = useState<Array<{ operation: string; filePath: string }>>([]);
  const [tokenUsage, setTokenUsage] = useState<{ inputTokens: number; outputTokens: number } | null>(null);

  const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

  useEffect(() => {
    chatStore.setKey('started', initialMessages.length > 0);
    if (sessionId) {
      chatStore.setKey('sessionId', sessionId);
    }
  }, [sessionId]);

  // Keep messages in sync with initialMessages when loading from backend
  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      console.log('📥 [Chat] Loading', initialMessages.length, 'messages from backend history');
      setMessages(initialMessages);
      setChatStarted(true);
    }
  }, [initialMessages]);

  // Load files into WebContainer when opening session from history
  useEffect(() => {
    if (files.length > 0 && sessionId) {
      console.log('📁 [Chat] Syncing', files.length, 'files to WebContainer for session:', sessionId);

      // Auto-show workbench when loading from history
      workbenchStore.showWorkbench.set(true);
      logger.info('✨ Auto-showing workbench for historical session');

      // Async function to sync files and start dev server
      (async () => {
        try {
          const wc = await webcontainer;
          await syncFilesToWebContainer(wc, files, sessionId);
          logger.info('✅ Files synced to WebContainer from history');

          // Start dev server with the loaded files
          await runDevServer(wc, files);
          logger.info('✅ Dev server started for historical session');
        } catch (error) {
          logger.error('❌ Failed to load files from history:', error);
          toast.error('Failed to load workspace files');
        }
      })();
    }
  }, [files, sessionId]);

  useEffect(() => {
    // Store message history when messages change (no-op for backend, kept for compatibility)
    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  }, [messages, storeMessageHistory, initialMessages.length]);

  const scrollTextArea = () => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  };

  const abort = () => {
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
      streamControllerRef.current = null;
    }

    // Save metadata to current message before aborting (create new object!)
    setMessages((prev) => {
      return prev.map((msg, idx) => {
        if (idx === prev.length - 1 && msg.role === 'assistant') {
          return {
            ...msg,
            metadata: {
              reasoningText,
              thinkingDuration,
              fileOperations,
              tokenUsage,
              phase: currentPhase,
            },
          };
        }
        return msg;
      });
    });

    setIsLoading(false);
    chatStore.setKey('aborted', true);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  useEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = 'auto';

      const scrollHeight = textarea.scrollHeight;

      textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
      textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    }
  }, [input, textareaRef, TEXTAREA_MAX_HEIGHT]);

  const runAnimation = async () => {
    if (chatStarted) {
      return;
    }

    console.log('Chat.client - runAnimation called, setting chatStarted to true');

    await Promise.all([
      animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
      animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
    ]);

    chatStore.setKey('started', true);
    setChatStarted(true);
  };

  const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
    const _input = messageInput || input;

    if (_input.length === 0 || isLoading) {
      return;
    }

    chatStore.setKey('aborted', false);

    runAnimation();

    // Reset Phase 2 state for new message
    console.log('🔄 [New Message] Resetting streaming state. Current messages count:', messages.length);
    console.log('🔄 [New Message] Previous messages metadata:', messages.map((m, i) => ({
      index: i,
      role: m.role,
      hasMetadata: !!(m as ExtendedMessage).metadata,
      reasoningLength: ((m as ExtendedMessage).metadata?.reasoningText?.length || 0)
    })));

    setCurrentPhase(null);
    chatStore.setKey('currentPhase', null); // Also reset global store
    setReasoningText('');
    setThinkingDuration(null);
    setFileOperations([]);
    setTokenUsage(null);

    // Add user message immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: _input,
    };

    // Add empty assistant message placeholder with empty metadata
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ExtendedMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      metadata: {
        reasoningText: '',
        thinkingDuration: null,
        fileOperations: [],
        tokenUsage: null,
        phase: null,
      },
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    textareaRef.current?.blur();

    // Helper function to update current message metadata in real-time
    // IMPORTANT: Create new objects instead of mutating for React to detect changes
    const updateMessageMetadata = (updates: Partial<ExtendedMessage['metadata']>) => {
      setMessages((prev) => {
        const updated = prev.map((msg) => {
          // Find message by ID (not position) so it works even if new messages are added
          if (msg.id === assistantMessageId) {
            const newMetadata = {
              ...msg.metadata,
              ...updates,
            };
            console.log('✅ [Metadata Saved] Msg ID:', assistantMessageId.substring(0, 20), 'Reasoning length:', newMetadata.reasoningText?.length || 0);
            return {
              ...msg,
              metadata: newMetadata,
            };
          }
          return msg;
        });
        return updated;
      });
    };

    // Stream response from WebSocket backend
    try {
      // MATCH MAIN BRANCH BEHAVIOR: Clear session for first message to start fresh
      // This ensures each new app request gets a clean workspace
      if (messages.length === 0 || !chatStarted) {
        clearSession();
        console.log('🆕 [Chat] Starting fresh session for new conversation');
      }

      const session = await getOrCreateSession('user@eitherway.app', 'EitherWay Chat');
      logger.debug('Using session:', session.id);
      console.log('💬 [Chat Message] Session ID for this message:', session.id);
      console.log('💬 [Chat Message] localStorage currentSessionId:', localStorage.getItem('currentSessionId'));

      // Store session ID in chat store for export/deployment
      chatStore.setKey('sessionId', session.id);

      // Ensure brand assets are synced before starting stream
      await ensureBrandAssetsSyncedBeforeStream(session.id);

      const controller = await streamFromWebSocket({
        prompt: _input,
        sessionId: session.id, // Use session ID from database
        onChunk: (chunk) => {
          setMessages((prev) => {
            return prev.map((msg) => {
              if (msg.id === assistantMessageId) {
                return {
                  ...msg,
                  content: msg.content + chunk,
                };
              }
              return msg;
            });
          });
        },
        onComplete: () => {
          // Metadata is already saved in real-time by updateMessageMetadata in each callback
          // No need to save here - closures would capture empty state values anyway
          console.log('✅ [onComplete] Streaming finished - metadata already persisted via updateMessageMetadata');

          setIsLoading(false);
          streamControllerRef.current = null;
          logger.debug('Streaming complete');
        },
        onError: (error) => {
          // Save metadata even on error (create new object!)
          setMessages((prev) => {
            return prev.map((msg) => {
              if (msg.id === assistantMessageId) {
                return {
                  ...msg,
                  content: `[Error: ${error}]`,
                  metadata: {
                    reasoningText,
                    thinkingDuration,
                    fileOperations,
                    tokenUsage,
                    phase: currentPhase,
                  },
                };
              }
              return msg;
            });
          });
          setIsLoading(false);
          streamControllerRef.current = null;
          toast.error(`Streaming error: ${error}`);
          logger.error('Streaming error:', error);
        },
        // Phase 2: Enhanced callbacks
        onPhase: (phase) => {
          console.log('📍 [PHASE CHANGE]:', phase);
          logger.debug('Phase:', phase);
          setCurrentPhase(phase);
          // Update global chat store so Preview can access it
          chatStore.setKey('currentPhase', phase);
          console.log('📍 [chatStore updated] currentPhase:', chatStore.get().currentPhase);

          // Update metadata immediately
          updateMessageMetadata({ phase });

          // Auto-show workbench when agent starts writing code
          if (phase === 'code-writing') {
            workbenchStore.showWorkbench.set(true);
            logger.info('✨ Auto-showing workbench preview - agent started writing code');
          }
        },
        onReasoning: (text) => {
          logger.debug('Reasoning:', text);
          setReasoningText((prev) => {
            const newText = prev + text;
            console.log('🧠 [Reasoning] Updating metadata with:', newText.substring(0, 50) + '...');
            // Update metadata immediately with accumulated reasoning
            updateMessageMetadata({ reasoningText: newText });
            return newText;
          });
        },
        onThinkingComplete: (duration) => {
          logger.debug('Thinking complete in', duration, 'seconds');
          setThinkingDuration(duration);
          // Update metadata immediately
          updateMessageMetadata({ thinkingDuration: duration });
        },
        onFileOperation: (operation, filePath) => {
          logger.debug('File operation:', operation, filePath);
          setFileOperations((prev) => {
            const newOps = [...prev, { operation, filePath }];
            // Update metadata immediately with accumulated operations
            updateMessageMetadata({ fileOperations: newOps });
            return newOps;
          });
        },
        onFilesUpdated: async (files, sessionIdFromEvent) => {
          logger.debug('Files updated:', files.length, 'files', sessionIdFromEvent);

          // Sync files to WebContainer
          try {
            const wc = await webcontainer;
            await syncFilesToWebContainer(wc, files, session.id);
            logger.info('Files synced to WebContainer successfully');

            // After syncing, run dev server
            await runDevServer(wc, files);
            logger.info('Dev server started in WebContainer');
          } catch (error) {
            logger.error('Failed to sync files or start dev server:', error);
            toast.error('Failed to load files into workspace');
          }
        },
        onTokenUsage: (inputTokens, outputTokens) => {
          logger.debug('Token usage:', inputTokens, 'input,', outputTokens, 'output');
          const usage = { inputTokens, outputTokens };
          setTokenUsage(usage);
          // Update metadata immediately
          updateMessageMetadata({ tokenUsage: usage });
        },
      });

      streamControllerRef.current = controller;
    } catch (error) {
      setMessages((prev) => {
        return prev.map((msg) => {
          if (msg.id === assistantMessageId) {
            return {
              ...msg,
              content: `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
            };
          }
          return msg;
        });
      });
      setIsLoading(false);
      toast.error('Failed to start streaming');
      logger.error('Failed to start streaming:', error);
    }
  };

  const [messageRef, scrollRef] = useSnapScroll();

  return (
    <BaseChat
      ref={animationScope}
      textareaRef={textareaRef}
      input={input}
      showChat={showChat}
      chatStarted={chatStarted}
      isStreaming={isLoading}
      sendMessage={sendMessage}
      messageRef={messageRef}
      scrollRef={scrollRef}
      handleInputChange={handleInputChange}
      handleStop={abort}
      minTextareaHeight={131}
      messages={messages}
      currentPhase={currentPhase}
      reasoningText={reasoningText}
      thinkingDuration={thinkingDuration}
      fileOperations={fileOperations}
      tokenUsage={tokenUsage}
    />
  );
});
