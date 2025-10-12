/**
 * Session management utilities
 * Handles creating and managing chat sessions with the backend
 */

import { brandKitStore } from '~/lib/stores/brandKit';
import { BACKEND_URL } from '~/config/api';

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

  // Archive active brand kits on backend to prevent old assets from appearing in new session
  console.log('🧹 [Session Persistence] Archiving active brand kits...');
  const walletAddress = typeof window !== 'undefined' ? localStorage.getItem('walletAddress') : null;
  const userId = walletAddress || 'user@eitherway.app';

  if (userId) {
    fetch(`${BACKEND_URL}/api/brand-kits/user/${encodeURIComponent(userId)}/archive-active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
      .then(response => {
        if (response.ok) {
          console.log('✅ [Session Persistence] Active brand kits archived for:', userId);
        } else {
          console.warn('⚠️ [Session Persistence] Failed to archive brand kits:', response.statusText);
        }
      })
      .catch(error => {
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
