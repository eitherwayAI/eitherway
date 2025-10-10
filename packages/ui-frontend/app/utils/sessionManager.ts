/**
 * Session management utilities
 * Handles creating and managing chat sessions with the backend
 */

const BACKEND_URL = typeof window !== 'undefined' ? 'https://localhost:3001' : 'https://localhost:3001';

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

/**
 * Create a new session
 */
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

/**
 * Get or create a session for the current user
 * Uses localStorage to persist the session across page reloads
 */
export async function getOrCreateSession(email: string, title: string = 'New Chat'): Promise<Session> {
  // Check if we have a session in localStorage
  const storedSessionId = localStorage.getItem('currentSessionId');

  if (storedSessionId) {
    console.log('🔑 [Session Persistence] Found stored session ID:', storedSessionId);
    // Try to fetch the session to verify it still exists
    try {
      const response = await fetch(`${BACKEND_URL}/api/sessions/${storedSessionId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('✅ [Session Persistence] Reusing existing session:', data.session.id, '- Title:', data.session.title);
        return data.session;
      } else {
        console.warn('⚠️ [Session Persistence] Stored session not found on server (status:', response.status, '), creating new one');
      }
    } catch (error) {
      console.warn('⚠️ [Session Persistence] Error fetching stored session, creating new one:', error);
    }
  } else {
    console.log('🆕 [Session Persistence] No stored session found in localStorage');
  }

  // Create a new session
  console.log('🆕 [Session Persistence] Creating new session with title:', title);
  const session = await createSession(email, title);
  localStorage.setItem('currentSessionId', session.id);
  console.log('✅ [Session Persistence] New session created and stored:', session.id);
  return session;
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

  // Reset server state so new conversation can start fresh server
  console.log('🔄 [Session Persistence] Resetting server state...');
  import('./webcontainerRunner').then(({ resetServerState }) => {
    resetServerState();
    console.log('✅ [Session Persistence] Server state reset complete');
  }).catch((error) => {
    console.warn('❌ [Session Persistence] Could not reset server state:', error);
  });

  // Clear WebContainer files without tearing down (matches main branch behavior)
  // This preserves PreviewsStore port listeners while clearing workspace
  console.log('🔄 [Session Persistence] Clearing WebContainer files...');
  import('~/lib/webcontainer').then(async ({ webcontainer }) => {
    try {
      const wc = await webcontainer;
      const files = await wc.fs.readdir('.', { withFileTypes: true });

      // Delete all files and directories in workspace
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
  }).catch((error) => {
    console.warn('❌ [Session Persistence] Could not import WebContainer module:', error);
  });
}
