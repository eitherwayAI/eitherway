/**
 * Session Context Store
 *
 * Tracks the currently active session in the WebContainer.
 * Ensures all WebContainer operations are scoped to the correct session.
 */

import { atom } from 'nanostores';

export interface SessionContextState {
  currentSessionId: string | null;
  currentAppId: string | null;
  isTransitioning: boolean;
  previousSessionId: string | null;
}

const initialState: SessionContextState = {
  currentSessionId: null,
  currentAppId: null,
  isTransitioning: false,
  previousSessionId: null,
};

export const sessionContext = atom<SessionContextState>(initialState);

/**
 * Set the active session in the WebContainer
 */
export function setActiveSession(sessionId: string, appId: string) {
  const current = sessionContext.get();
  sessionContext.set({
    currentSessionId: sessionId,
    currentAppId: appId,
    isTransitioning: false,
    previousSessionId: current.currentSessionId,
  });
}

/**
 * Mark session as transitioning (prevents concurrent operations)
 */
export function setTransitioning(isTransitioning: boolean) {
  const current = sessionContext.get();
  sessionContext.set({
    ...current,
    isTransitioning,
  });
}

/**
 * Clear session context (on logout or full reset)
 */
export function clearSessionContext() {
  sessionContext.set(initialState);
}

/**
 * Get session-namespaced path for WebContainer operations
 */
export function getSessionPath(relativePath: string): string {
  const { currentSessionId } = sessionContext.get();
  if (!currentSessionId) {
    throw new Error('No active session - cannot get session path');
  }
  // Normalize path (remove leading slash if present)
  const normalizedPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `__session_${currentSessionId}__/${normalizedPath}`;
}

/**
 * Get session-namespaced root directory
 */
export function getSessionRoot(): string {
  const { currentSessionId } = sessionContext.get();
  if (!currentSessionId) {
    throw new Error('No active session - cannot get session root');
  }
  return `__session_${currentSessionId}__`;
}

/**
 * Validate that an operation can proceed (not transitioning, has active session)
 */
export function validateSessionOperation(operationName: string) {
  const { currentSessionId, isTransitioning } = sessionContext.get();

  if (isTransitioning) {
    throw new Error(`Cannot ${operationName}: session is transitioning`);
  }

  if (!currentSessionId) {
    throw new Error(`Cannot ${operationName}: no active session`);
  }
}
