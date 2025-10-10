/**
 * API Configuration
 * Determines the backend URL based on environment
 */

/**
 * Get the backend API base URL
 * - In production (deployed): uses relative URLs so nginx can proxy
 * - In development (localhost:5173): uses localhost:3001 directly
 */
export function getBackendUrl(): string {
  // Check if we're in browser
  if (typeof window === 'undefined') {
    // Server-side: use relative URLs
    return '';
  }

  // Client-side: check if we're on localhost development
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isDevelopment && window.location.port === '5173') {
    // Local development: frontend on 5173, backend on 3001
    return 'https://localhost:3001';
  }

  // Production or any other case: use relative URLs (nginx will proxy)
  return '';
}

/**
 * Get WebSocket URL for agent communication
 * - In production: uses wss:// with current host
 * - In development: uses wss://localhost:3001
 */
export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'wss://localhost:3001';
  }

  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isDevelopment && window.location.port === '5173') {
    return 'wss://localhost:3001';
  }

  // Production: use current host with wss
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export const BACKEND_URL = getBackendUrl();
export const WEBSOCKET_URL = getWebSocketUrl();
