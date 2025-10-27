import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useAnimate } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useShortcuts, useSnapScroll } from '~/lib/hooks';
import { useBackendHistory } from '~/lib/persistence/useBackendHistory';
import { chatStore } from '~/lib/stores/chat';
import { authStore } from '~/lib/stores/auth';
import { brandKitStore } from '~/lib/stores/brandKit';
import { workbenchStore } from '~/lib/stores/workbench';
import { useWalletConnection } from '~/lib/web3/hooks';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger } from '~/utils/logger';
import { streamFromWebSocket, type StreamController } from '~/utils/websocketClient';
import { createSession, clearSession } from '~/utils/sessionManager';
import { syncFilesToWebContainer } from '~/utils/fileSync';
import { syncBrandAssetsToWebContainer } from '~/utils/brandAssetSync';
import { webcontainer } from '~/lib/webcontainer/index';
import { runDevServer } from '~/utils/webcontainerRunner';
import { BaseChat } from './BaseChat';
import { BACKEND_URL } from '~/config/api';
import { setActiveSession } from '~/lib/stores/sessionContext';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

/**
 * Helper: Generate session title from the user's full prompt
 * Uses the entire user message as the title, with smart truncation for long prompts
 */
function generateTitleFromPrompt(prompt: string): string {
  // Normalize whitespace: trim and collapse multiple spaces/newlines into single spaces
  let title = prompt.trim().replace(/\s+/g, ' ');

  // Truncate at 100 characters with ellipsis for readability
  if (title.length > 100) {
    // Try to break at a word boundary near the limit
    const truncated = title.substring(0, 100);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > 80) {
      // Break at word boundary if it's reasonably close to the limit
      title = truncated.substring(0, lastSpace) + '...';
    } else {
      // Otherwise just hard truncate
      title = truncated + '...';
    }
  }

  // Fallback if empty after processing
  return title.length > 0 ? title : 'New Chat';
}

/**
 * Helper: Sanitize filename by replacing spaces with hyphens and removing special characters
 */
function sanitizeFilename(filename: string): string {
  // Extract extension
  const lastDotIndex = filename.lastIndexOf('.');
  const name = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
  const ext = lastDotIndex > 0 ? filename.slice(lastDotIndex) : '';

  // Sanitize the name part:
  // - Replace spaces and underscores with hyphens
  // - Convert to lowercase
  // - Remove special characters except hyphens and alphanumeric
  const sanitizedName = name
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');

  return sanitizedName + ext.toLowerCase();
}

/**
 * Helper: Determine destination path for a brand asset based on its type
 */
function getAssetDestinationPath(asset: any): string {
  const kind = asset.metadata?.kind || asset.assetType;
  const fileName = sanitizeFilename(asset.fileName);

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
 * Helper: Convert ArrayBuffer to base64 string using FileReader
 * More reliable for binary data than manual string concatenation
 */
async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Data URL format: data:mime/type;base64,<base64data>
      // Extract just the base64 part
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Failed to convert ArrayBuffer to base64'));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * Update URL to reflect session ID without triggering page reload
 * Uses History API to avoid interrupting streaming
 * Follow-up messages will read sessionId from URL pathname directly
 */
function navigateToSession(sessionId: string) {
  const url = new URL(window.location.href);
  url.pathname = `/chat/${sessionId}`;
  window.history.replaceState({}, '', url);
  logger.debug('📍 URL updated to:', url.pathname);
}

/**
 * Ensure brand assets are synced to both client WebContainer and server session workspace
 * before starting a new streaming request
 */
async function ensureBrandAssetsSyncedBeforeStream(sessionId: string, userId: string | null) {
  let { pendingBrandKitId } = brandKitStore.get();

  // If no brand kit in store, try to fetch user's active brand kit
  if (!pendingBrandKitId && userId) {
    try {
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
    logger.info('🔄 Syncing brand kit assets to session:', sessionId, 'Brand Kit:', pendingBrandKitId);
    const res = await fetch(`/api/brand-kits/${pendingBrandKitId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch brand kit: ${res.statusText}`);
    }
    const data = await res.json();
    const assets = data?.brandKit?.assets ?? [];

    if (assets.length === 0) {
      logger.info('No assets to sync');
      return;
    }

    logger.info(`Found ${assets.length} brand assets to sync`);

    // 2) Sync into client WebContainer
    logger.info('⏳ Obtaining WebContainer instance...');
    const wc = await webcontainer;
    logger.info('✓ WebContainer instance obtained, starting asset sync...');

    const result = await syncBrandAssetsToWebContainer(wc, assets);
    logger.info(
      `✅ Client WebContainer sync complete: ${result.synced} synced, ${result.failed} failed, ${result.skipped} skipped`,
    );

    if (result.failed > 0) {
      logger.warn(`⚠️  ${result.failed} assets failed to sync to WebContainer`);
    }

    if (result.synced === 0 && assets.length > 0) {
      throw new Error('No assets were synced to WebContainer - files will not be available in preview');
    }

    // 3) Push to the server session workspace
    let serverSynced = 0;
    const serverFailed: string[] = [];

    for (const asset of assets) {
      try {
        const destPath = getAssetDestinationPath(asset);
        if (!destPath) {
          logger.debug(`Skipping asset (no destination): ${asset.fileName}`);
          continue;
        }

        logger.info(`🔄 Syncing asset to server: ${asset.fileName} → ${destPath}`);
        logger.debug(`Storage key: ${asset.storageKey}`);

        // Fetch asset bytes from storage with retry logic
        let assetBuffer: ArrayBuffer | null = null;
        let fetchError: Error | null = null;

        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            logger.debug(`Attempt ${attempt}/3: Fetching ${asset.storageKey}`);
            const assetRes = await fetch(
              `${BACKEND_URL}/api/brand-assets/download/${encodeURIComponent(asset.storageKey)}`,
            );

            if (!assetRes.ok) {
              throw new Error(`HTTP ${assetRes.status}: ${assetRes.statusText}`);
            }

            assetBuffer = await assetRes.arrayBuffer();
            logger.debug(`✓ Fetched ${assetBuffer.byteLength} bytes for ${asset.fileName}`);
            break; // Success, exit retry loop
          } catch (err: any) {
            fetchError = err;
            logger.warn(`Attempt ${attempt}/3 failed for ${asset.fileName}: ${err.message}`);
            if (attempt < 3) {
              // Wait before retry (exponential backoff)
              await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            }
          }
        }

        if (!assetBuffer) {
          throw new Error(`Failed to fetch asset after 3 attempts: ${fetchError?.message}`);
        }

        // Convert to base64 using FileReader (more reliable for binary data)
        const base64Content = await arrayBufferToBase64(assetBuffer);
        logger.debug(`Encoded to base64: ${base64Content.length} characters`);

        // Validate base64 encoding
        if (!base64Content || base64Content.length === 0) {
          throw new Error('Base64 encoding failed - empty result');
        }

        // Log first bytes of original for debugging
        const firstBytes = new Uint8Array(assetBuffer.slice(0, 16));
        logger.debug(`Original first bytes: ${Array.from(firstBytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

        // POST to server write-binary endpoint with validation
        logger.debug(`Writing to session workspace: ${destPath}`);
        logger.debug(`Writing asset to session ${sessionId} at path: ${destPath}`);
        const writeRes = await fetch(`/api/sessions/${sessionId}/files/write-binary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: destPath,
            content: base64Content,
            mimeType: asset.mimeType,
            encoding: 'base64',
          }),
        });

        logger.debug(`Write response status: ${writeRes.status}`);

        if (!writeRes.ok) {
          const errorData = await writeRes.json().catch(() => ({ error: writeRes.statusText }));
          throw new Error(`Failed to write to server: ${errorData.error || writeRes.statusText}`);
        }

        const writeResult = await writeRes.json();
        logger.info(`✅ Server synced: ${destPath} (${writeResult.size} bytes)`);

        // The file is written successfully, but may not be immediately readable
        // due to async database commit. The file will be available when the agent
        // needs it during code generation.

        serverSynced++;
      } catch (error: any) {
        logger.error(`❌ Failed to sync asset ${asset.fileName} to server:`, error);
        serverFailed.push(`${asset.fileName}: ${error.message}`);
        // Continue with other assets
      }
    }

    logger.info(`✓ Synced ${serverSynced}/${assets.length} assets to server workspace (session: ${sessionId})`);

    if (serverFailed.length > 0) {
      logger.error(`❌ Failed to sync ${serverFailed.length} assets:`, serverFailed);
      toast.error(`Some brand assets failed to sync: ${serverFailed[0]}`);
    }

    // 4) Create brand kit manifest with FULL METADATA for the agent
    // CRITICAL: The agent's buildBrandKitContext() filters assets by metadata.kind
    // Without this field, ALL assets are ignored and filtered out!
    // IMPORTANT: Write manifest if ANY assets synced successfully (colors are optional)
    const colors = data?.brandKit?.colors ?? [];
    const brandKitName = data?.brandKit?.name || 'Brand Kit';

    logger.info(`📝 Preparing brand kit manifest: ${assets.length} assets, ${colors.length} colors`);

    if (serverSynced > 0 || assets.length > 0) {
      const manifest = {
        brandKit: {
          id: pendingBrandKitId,
          name: brandKitName,
          // Map full color palette with all metadata
          colors: colors.map((c: any) => ({
            id: c.id,
            hex: c.hex,
            rgb: c.rgb,
            hsl: c.hsl,
            name: c.name,
            role: c.role,
            prominence: c.prominence,
            pixelPercentage: c.pixelPercentage,
          })),
          // Map assets with COMPLETE metadata including kind, variants, AI analysis
          // CRITICAL FIX: Use sanitizeFilename to match actual VFS filenames
          // DON'T include variants array - those files aren't synced to VFS!
          assets: assets.map((a: any) => ({
            id: a.id,
            fileName: sanitizeFilename(a.fileName), // Match actual synced filename
            assetType: a.assetType,
            mimeType: a.mimeType,
            // CRITICAL: metadata.kind is required for buildBrandKitContext() filtering!
            metadata: {
              kind: a.metadata?.kind || a.assetType, // Ensure kind is always present
              aspectRatio: a.metadata?.aspectRatio,
              hasAlpha: a.metadata?.hasAlpha,
              familyName: a.metadata?.familyName,
              weight: a.metadata?.weight,
              style: a.metadata?.style,
              // REMOVED: variants array causes agent to reference non-existent files
              // variants: a.metadata?.variants || [],
              aiAnalysis: a.metadata?.aiAnalysis || undefined,
            },
          })),
        },
      };

      const manifestJson = JSON.stringify(manifest, null, 2);

      try {
        // Write manifest to SERVER workspace (required for agent context injection)
        const manifestRes = await fetch(`/api/sessions/${sessionId}/files/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: 'brand-kit.json',
            content: manifestJson,
            mimeType: 'application/json',
          }),
        });

        if (manifestRes.ok) {
          logger.info(`✓ Server: Brand kit manifest created with ${assets.length} assets and ${colors.length} colors`);
          logger.info('✓ Server: Manifest includes full metadata: kind, variants, AI analysis');
        } else {
          logger.error(`Failed to write server manifest: ${manifestRes.status} ${manifestRes.statusText}`);
        }

        // Also write manifest to CLIENT WebContainer (for potential client-side access)
        const wc = await webcontainer;
        await wc.fs.writeFile('brand-kit.json', manifestJson);
        logger.info('✓ Client: Brand kit manifest written to WebContainer');

      } catch (error) {
        logger.error('Failed to write brand kit manifest:', error);
      }
    } else if (serverSynced === 0 && assets.length > 0) {
      logger.warn('⚠️  Skipping brand kit manifest creation - no assets synced successfully');
    }

    logger.info(`✅ Brand assets fully synced to session ${sessionId}`);

    // 5) Archive the brand kit and clear UI after successful sync
    // This ensures the brand kit doesn't persist across different app requests
    if (userId && pendingBrandKitId) {
      try {
        logger.info('🔄 Archiving brand kit after successful sync:', pendingBrandKitId);
        const archiveRes = await fetch(`/api/brand-kits/user/${encodeURIComponent(userId)}/archive-active`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        if (archiveRes.ok) {
          logger.info('✅ Brand kit archived successfully');
          // Clear frontend state
          brandKitStore.setKey('pendingBrandKitId', null);
          brandKitStore.setKey('uploadedAssets', []);
          logger.info('✅ Brand kit UI cleared');
        } else {
          logger.warn('Failed to archive brand kit:', archiveRes.status);
        }
      } catch (archiveError) {
        logger.warn('Failed to archive brand kit (non-critical):', archiveError);
        // Non-critical error - assets are already synced
      }
    }
  } catch (error) {
    logger.error('Failed to sync brand assets:', error);
    toast.error('Failed to sync brand assets. They may not be available in the workspace.');
  }
}

export function Chat() {
  const { ready, initialMessages, files, sessionTitle, sessionId, storeMessageHistory } = useBackendHistory();

  return (
    <>
      {ready && (
        <ChatImpl
          initialMessages={initialMessages}
          files={files}
          sessionTitle={sessionTitle}
          sessionId={sessionId}
          storeMessageHistory={storeMessageHistory}
        />
      )}
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
  const user = useStore(authStore.user);
  const { isConnected, address } = useWalletConnection();

  // Prioritize wallet address (email auth is mostly mock)
  const userId = (isConnected && address ? address : user?.email) || null;

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
  const backendMessageIdRef = useRef<string | null>(null);
  const metadataRef = useRef<ExtendedMessage['metadata']>({
    reasoningText: '',
    thinkingDuration: null,
    fileOperations: [],
    tokenUsage: null,
    phase: null,
  });

  // Phase 2: Enhanced streaming state (for current message only)
  const [currentPhase, setCurrentPhase] = useState<
    'pending' | 'thinking' | 'reasoning' | 'code-writing' | 'building' | 'completed' | null
  >(null);
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

          // CRITICAL: Fetch session details to get appId and initialize session context
          const sessionRes = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`);
          if (sessionRes.ok) {
            const sessionData = await sessionRes.json();
            const appId = sessionData.session.app_id;

            // Initialize session context before syncing files
            setActiveSession(sessionId, appId);
            logger.info(`✅ Session context initialized for history: ${sessionId}, app: ${appId}`);
          } else {
            logger.warn('Failed to fetch session details for context initialization');
          }

          // CRITICAL: Ensure brand assets are synced to both WC and server workspace
          // before loading files. This prevents 404 errors when the preview tries to
          await ensureBrandAssetsSyncedBeforeStream(sessionId, userId);
          logger.info('✅ Brand assets resynced for historical session');

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
  }, [files, sessionId, userId]);

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

  const sendMessage = async (_event: React.UIEvent, messageInput?: string, isSystemMessage = false) => {
    const _input = messageInput || input;

    if (_input.length === 0 || isLoading) {
      return;
    }

    chatStore.setKey('aborted', false);

    runAnimation();

    setCurrentPhase(null);
    chatStore.setKey('currentPhase', null); // Also reset global store
    setReasoningText('');
    setThinkingDuration(null);
    setFileOperations([]);
    setTokenUsage(null);
    backendMessageIdRef.current = null;
    metadataRef.current = {
      reasoningText: '',
      thinkingDuration: null,
      fileOperations: [],
      tokenUsage: null,
      phase: null,
    };

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: _input,
    };

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

    // Only add messages to UI if it's not a system message (like auto-fix)
    if (!isSystemMessage) {
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
    } else {
      // For system messages, only add the assistant message to receive the response
      setMessages((prev) => [...prev, assistantMessage]);
    }
    setInput('');
    setIsLoading(true);

    textareaRef.current?.blur();

    // IMPORTANT: Create new objects instead of mutating for React to detect changes
    const updateMessageMetadata = (updates: Partial<ExtendedMessage['metadata']>) => {
      // Update ref for immediate access in onComplete callback
      metadataRef.current = {
        ...metadataRef.current,
        ...updates,
      };

      setMessages((prev) => {
        const updated = prev.map((msg) => {
          // Find message by ID (not position) so it works even if new messages are added
          if (msg.id === assistantMessageId) {
            const newMetadata = {
              ...msg.metadata,
              ...updates,
            };
            // Removed noisy metadata logging - fires for every update
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

      // Ensure user is authenticated before creating session
      if (!userId) {
        toast.error('Please connect your wallet to start chatting');
        setIsLoading(false);
        return;
      }

      // CRITICAL FIX: Read sessionId from URL pathname for follow-up messages
      // This ensures follow-up messages use the correct session even if prop is stale
      const urlPath = window.location.pathname;
      const urlSessionId = urlPath.startsWith('/chat/') ? urlPath.split('/chat/')[1] : null;
      const activeSessionId = urlSessionId || sessionId;

      logger.debug('Session resolution:', { urlSessionId, propSessionId: sessionId, activeSessionId });

      let session: any;

      if (activeSessionId) {
        // Existing session - fetch from backend using the URL/prop sessionId
        logger.info(`Using existing session: ${activeSessionId}`);
        const response = await fetch(`${BACKEND_URL}/api/sessions/${activeSessionId}`);
        if (response.ok) {
          const data = await response.json();
          session = data.session;
          logger.info(`✅ Loaded session: ${session.id} - Title: ${session.title}`);
        } else {
          throw new Error(`Failed to load session ${activeSessionId}: ${response.statusText}`);
        }
      } else {
        // New conversation - create new session
        if (messages.length === 0 || !chatStarted) {
          clearSession();
          logger.info('🆕 Starting fresh session for new conversation');
        }

        const title = generateTitleFromPrompt(_input);
        session = await createSession(userId, title);
        logger.info(`✅ Created new session: ${session.id} - Title: ${title}`);

        // Update URL to reflect the new session (no page reload)
        navigateToSession(session.id);
      }

      // CRITICAL: Initialize session context immediately for file operations
      setActiveSession(session.id, session.app_id);
      logger.info(`✅ Session context initialized: ${session.id}, app: ${session.app_id}`);

      logger.debug('Using session:', session.id);
      console.log('💬 [Chat Message] Session ID for this message:', session.id);
      console.log('💬 [Chat Message] URL sessionId param:', sessionId);
      console.log('💬 [Chat Message] User ID:', userId);

      // Store session ID in chat store for export/deployment
      chatStore.setKey('sessionId', session.id);

      // CRITICAL: Ensure brand assets are synced to THIS session (the one we're about to use)
      // This must happen AFTER session is determined, not during upload
      logger.info(`🔄 Syncing brand assets to active session: ${session.id}`);
      await ensureBrandAssetsSyncedBeforeStream(session.id, userId);

      const controller = await streamFromWebSocket({
        prompt: _input,
        sessionId: session.id, // Use session ID from database
        messageRole: isSystemMessage ? 'system' : 'user', // Mark auto-fix messages as system
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
        onStreamStart: (messageId) => {
          logger.debug('Stream started, backend messageId:', messageId);
          backendMessageIdRef.current = messageId;
        },
        onComplete: async () => {
          // Persist metadata to database for historical message reconstruction
          if (backendMessageIdRef.current) {
            try {
              // Use metadataRef which has the latest values (not affected by closure)
              const metadataToPersist = metadataRef.current;

              logger.debug('Persisting metadata for message:', backendMessageIdRef.current, metadataToPersist);

              const response = await fetch(`${BACKEND_URL}/api/messages/${backendMessageIdRef.current}/metadata`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ metadata: metadataToPersist }),
              });

              if (!response.ok) {
                throw new Error(`Failed to persist metadata: ${response.statusText}`);
              }

              logger.info('✅ Message metadata persisted to database');
            } catch (error) {
              logger.error('Failed to persist message metadata:', error);
              // Non-critical error - don't show toast to avoid disrupting user
            }
          }

          setIsLoading(false);
          streamControllerRef.current = null;
          logger.debug('Streaming complete');
        },
        onError: (error) => {
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
          logger.info('Phase:', phase);
          setCurrentPhase(phase);
          chatStore.setKey('currentPhase', phase);

          updateMessageMetadata({ phase });

          // Auto-show workbench when agent starts writing code
          if (phase === 'code-writing') {
            workbenchStore.showWorkbench.set(true);
            logger.info('✨ Auto-showing workbench preview - agent started writing code');
          }
        },
        onReasoning: (text) => {
          // Removed noisy debug logging - fires for every reasoning chunk
          setReasoningText((prev) => {
            const newText = prev + text;
            updateMessageMetadata({ reasoningText: newText });
            return newText;
          });
        },
        onThinkingComplete: (duration) => {
          logger.debug('Thinking complete in', duration, 'seconds');
          setThinkingDuration(duration);
          updateMessageMetadata({ thinkingDuration: duration });
        },
        onFileOperation: (operation, filePath) => {
          logger.debug('File operation:', operation, filePath);
          setFileOperations((prev) => {
            const newOps = [...prev, { operation, filePath }];
            updateMessageMetadata({ fileOperations: newOps });
            return newOps;
          });
        },
        onFilesUpdated: async (files, sessionIdFromEvent) => {
          logger.debug('Files updated:', files.length, 'files', sessionIdFromEvent);

          // CRITICAL: Initialize session context before syncing files
          setActiveSession(session.id, session.app_id);
          logger.debug(`✅ Session context initialized for file sync: ${session.id}`);

          // Sync files to WebContainer
          try {
            const wc = await webcontainer;

            // CRITICAL: The files array from the agent may not include brand assets
            // that were uploaded before the stream started. Fetch complete file tree.
            logger.debug('Fetching complete file tree to ensure brand assets are included...');
            let completeFileTree = files;

            try {
              const treeRes = await fetch(`/api/sessions/${session.id}/files/tree?limit=1000`);
              if (treeRes.ok) {
                const treeData = await treeRes.json();
                if (treeData.files && treeData.files.length > 0) {
                  logger.info(
                    `✓ Fetched complete file tree: ${treeData.files.length} total files (agent provided ${files.length})`,
                  );

                  // Debug: Log all file paths in the tree
                  const flattenFiles = (nodes: any[], prefix = ''): string[] => {
                    const paths: string[] = [];
                    for (const node of nodes) {
                      const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
                      if (node.type === 'file') {
                        paths.push(fullPath);
                      }
                      if (node.type === 'directory' && node.children) {
                        paths.push(...flattenFiles(node.children, fullPath));
                      }
                    }
                    return paths;
                  };

                  const allPaths = flattenFiles(treeData.files);
                  logger.debug(`📁 File tree contains: ${allPaths.join(', ')}`);

                  const hasBrandAsset = allPaths.some((p) => p.includes('public/assets/') && p.endsWith('.png'));
                  if (!hasBrandAsset) {
                    logger.warn('⚠️  Brand asset NOT found in file tree! This will cause 404 errors.');
                    logger.warn('Files in tree:', allPaths);
                  } else {
                    logger.info('✓ Brand asset found in file tree');
                  }

                  completeFileTree = treeData.files;
                } else {
                  logger.warn('File tree fetch succeeded but returned empty - using agent files');
                }
              } else {
                logger.warn(`File tree fetch failed: ${treeRes.status} - using agent files`);
              }
            } catch (treeError) {
              logger.warn('Failed to fetch complete file tree, using agent files:', treeError);
            }

            await syncFilesToWebContainer(wc, completeFileTree, session.id);
            logger.info(`✅ Files synced to WebContainer: ${completeFileTree.length} files`);

            // After syncing, run dev server
            await runDevServer(wc, completeFileTree);
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

  // Listen for auto-fix requests from ErrorOverlay
  useEffect(() => {
    const handleAutoFix = (event: CustomEvent) => {
      const { prompt } = event.detail;
      logger.info('[Chat] Auto-fix request received, sending as system message');

      // Send the auto-fix prompt as a system message (hidden from UI)
      sendMessage(new UIEvent('submit'), prompt, true);
    };

    window.addEventListener('chat:send-auto-fix', handleAutoFix as EventListener);
    return () => window.removeEventListener('chat:send-auto-fix', handleAutoFix as EventListener);
  }, [sendMessage]);

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
