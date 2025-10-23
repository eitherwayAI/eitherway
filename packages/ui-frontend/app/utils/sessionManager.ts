/**
 * Session management utilities
 * Handles creating and managing chat sessions with the backend
 * Now with synchronous session switching for WebContainer isolation
 */

import { brandKitStore } from '~/lib/stores/brandKit';
import { BACKEND_URL } from '~/config/api';
import { sessionContext, setActiveSession, setTransitioning, clearSessionContext } from '~/lib/stores/sessionContext';
import { clearSessionFiles, syncFilesToWebContainer } from './fileSync';
import { resetServerState, stopDevServer } from './webcontainerRunner';
import { getWebContainerUnsafe } from '~/lib/webcontainer';
import { createScopedLogger } from './logger';

const logger = createScopedLogger('SessionManager');

interface Session {
  id: string;
  user_id: string;
  app_id: string;
  title: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

interface FileData {
  path: string;
  content: string | Uint8Array;
  mimeType?: string;
}

// Mutex lock for session switching
let sessionSwitchLock: Promise<void> | null = null;

export async function createSession(email: string, title: string): Promise<Session> {
  const response = await fetch(`${BACKEND_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, title }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  return response.json();
}

export async function getOrCreateSession(email: string, title: string = 'New Chat'): Promise<Session> {
  const storedSessionId = localStorage.getItem('currentSessionId');

  if (storedSessionId) {
    console.log('🔑 [Session Persistence] Found stored session ID:', storedSessionId);
    // Try to fetch the session to verify it still exists
    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions/${storedSessionId}`);
      if (response.ok) {
        const data = await response.json();
        console.log(
          '✅ [Session Persistence] Reusing existing session:',
          data.session.id,
          '- Title:',
          data.session.title,
        );
        return data.session;
      } else {
        console.warn(
          '⚠️ [Session Persistence] Stored session not found on server (status:',
          response.status,
          '), creating new one',
        );
      }
    } catch (error) {
      console.warn('⚠️ [Session Persistence] Error fetching stored session, creating new one:', error);
    }
  } else {
    console.log('🆕 [Session Persistence] No stored session found in localStorage');
  }

  console.log('🆕 [Session Persistence] Creating new session with title:', title);
  const session = await createSession(email, title);
  localStorage.setItem('currentSessionId', session.id);
  console.log('✅ [Session Persistence] New session created and stored:', session.id);
  return session;
}

/**
 * Switch to a new session with atomic cleanup and sync
 */
export async function switchSession(
  newSessionId: string,
  newAppId: string,
  files: FileData[],
): Promise<void> {
  // Wait for any in-progress switch to complete
  if (sessionSwitchLock) {
    logger.info('Waiting for previous session switch to complete');
    await sessionSwitchLock;
  }

  // Create new lock for this switch
  sessionSwitchLock = performSessionSwitch(newSessionId, newAppId, files);

  try {
    await sessionSwitchLock;
  } finally {
    sessionSwitchLock = null;
  }
}

/**
 * Internal function to perform the actual session switch
 */
async function performSessionSwitch(
  newSessionId: string,
  newAppId: string,
  files: FileData[],
): Promise<void> {
  const startTime = Date.now();
  const current = sessionContext.get();

  logger.info(`Starting session switch: ${current.currentSessionId} -> ${newSessionId}`);

  try {
    // Step 1: Mark as transitioning
    setTransitioning(true);

    // Step 2: Kill dev server from old session
    logger.info('Killing dev server');
    stopDevServer();
    resetServerState();

    // Step 3: Clear old session files
    if (current.currentSessionId) {
      logger.info(`Clearing old session: ${current.currentSessionId}`);
      await clearSessionFiles(current.currentSessionId);
    }

    // Step 4: Update session context
    logger.info(`Setting active session: ${newSessionId}`);
    setActiveSession(newSessionId, newAppId);

    // Step 5: Sync new session files
    logger.info(`Syncing ${files.length} files for new session`);
    const wc = await getWebContainerUnsafe();

    // Convert FileData to FileNode format expected by syncFilesToWebContainer
    const fileNodes = convertToFileNodes(files);
    await syncFilesToWebContainer(wc, fileNodes, newSessionId);

    // Step 6: Mark transition complete
    setTransitioning(false);

    const duration = Date.now() - startTime;
    logger.info(`Session switch complete in ${duration}ms`);
  } catch (error) {
    logger.error('Session switch failed:', error);
    setTransitioning(false);
    throw error;
  }
}

/**
 * Initialize session on first load
 */
export async function initializeSession(
  sessionId: string,
  appId: string,
  files: FileData[],
): Promise<void> {
  logger.info(`Initializing session: ${sessionId}`);

  // Ensure WebContainer is booted
  await getWebContainerUnsafe();

  // Set as active session
  setActiveSession(sessionId, appId);

  // Sync files
  const wc = await getWebContainerUnsafe();
  const fileNodes = convertToFileNodes(files);
  await syncFilesToWebContainer(wc, fileNodes, sessionId);

  logger.info('Session initialized');
}

/**
 * Cleanup on logout or full reset
 */
export async function cleanupAllSessions(): Promise<void> {
  logger.info('Cleaning up all sessions');

  try {
    // Kill dev server
    stopDevServer();
    resetServerState();

    // Clear WebContainer (all session directories)
    const wc = await getWebContainerUnsafe();
    const files = await wc.fs.readdir('.', { withFileTypes: true });

    for (const file of files) {
      if (file.isDirectory() && file.name.startsWith('__session_')) {
        logger.info(`Removing session directory: ${file.name}`);
        await wc.fs.rm(file.name, { recursive: true, force: true });
      }
    }

    // Clear context
    clearSessionContext();

    logger.info('All sessions cleaned up');
  } catch (error) {
    logger.error('Cleanup failed:', error);
  }
}

/**
 * Convert FileData array to FileNode array for syncFilesToWebContainer
 */
function convertToFileNodes(files: FileData[]): any[] {
  const fileTree: any[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    const fileName = parts.pop() || '';

    fileTree.push({
      name: fileName,
      path: file.path,
      type: 'file',
      content: file.content,
      mimeType: file.mimeType,
    });
  }

  return fileTree;
}

/**
 * Clear the current session from localStorage
 * Also resets server state and clears WebContainer files (without teardown to preserve port listeners)
 */
export function clearSession() {
  const currentSessionId = localStorage.getItem('currentSessionId');
  console.log('🧹 [Session Persistence] Clearing session:', currentSessionId || '(no session)');
  localStorage.removeItem('currentSessionId');
  console.log('🧹 [Session Persistence] Session cleared from localStorage');

  // Archive active brand kits on backend to prevent old assets from appearing in new session
  console.log('🧹 [Session Persistence] Archiving active brand kits...');
  const walletAddress = typeof window !== 'undefined' ? localStorage.getItem('walletAddress') : null;
  const userId = walletAddress || 'user@eitherway.app';

  if (userId) {
    fetch(`${BACKEND_URL}/api/brand-kits/user/${encodeURIComponent(userId)}/archive-active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((response) => {
        if (response.ok) {
          console.log('✅ [Session Persistence] Active brand kits archived for:', userId);
        } else {
          console.warn('⚠️ [Session Persistence] Failed to archive brand kits:', response.statusText);
        }
      })
      .catch((error) => {
        console.warn('⚠️ [Session Persistence] Error archiving brand kits:', error);
      });
  } else {
    console.warn('⚠️ [Session Persistence] No userId found (wallet or email), skipping brand kit archival');
  }

  // Clear brand kit state to prevent old assets from appearing in new session
  console.log('🧹 [Session Persistence] Clearing brand kit state...');
  brandKitStore.set({ pendingBrandKitId: null, dirty: false });
  console.log('✅ [Session Persistence] Brand kit state cleared');

  console.log('🔄 [Session Persistence] Resetting server state...');
  import('./webcontainerRunner')
    .then(({ resetServerState }) => {
      resetServerState();
      console.log('✅ [Session Persistence] Server state reset complete');
    })
    .catch((error) => {
      console.warn('❌ [Session Persistence] Could not reset server state:', error);
    });

  // Clear WebContainer files without tearing down (matches main branch behavior)
  // This preserves PreviewsStore port listeners while clearing workspace
  console.log('🔄 [Session Persistence] Clearing WebContainer files...');
  import('~/lib/webcontainer')
    .then(async ({ webcontainer }) => {
      try {
        const wc = await webcontainer;
        const files = await wc.fs.readdir('.', { withFileTypes: true });

        for (const file of files) {
          try {
            if (file.isDirectory()) {
              await wc.fs.rm(file.name, { recursive: true, force: true });
            } else {
              await wc.fs.rm(file.name, { force: true });
            }
            console.log('🗑️ [Session Persistence] Deleted:', file.name);
          } catch (err) {
            console.warn('⚠️ [Session Persistence] Could not delete:', file.name, err);
          }
        }
        console.log('✅ [Session Persistence] WebContainer files cleared');
      } catch (error) {
        console.warn('❌ [Session Persistence] Could not clear WebContainer files:', error);
      }
    })
    .catch((error) => {
      console.warn('❌ [Session Persistence] Could not import WebContainer module:', error);
    });
}
