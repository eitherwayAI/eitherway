/**
 * API Configuration
 * Determines the backend URL based on environment
 */

export function getBackendUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: use relative URLs
    return '';
  }

  // Client-side: check if we're on localhost development
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isDevPort = window.location.port === '5173' || window.location.port === '5174';

  if (isDevelopment && isDevPort) {
    // Local development: frontend on 5173/5174, backend on 3001
    return 'https://localhost:3001';
  }

  // Production or any other case: use relative URLs (nginx will proxy)
  return '';
}

export function getWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return 'wss://localhost:3001';
  }

  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isDevPort = window.location.port === '5173' || window.location.port === '5174';

  if (isDevelopment && isDevPort) {
    return 'wss://localhost:3001';
  }

  // Production: use current host with wss
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export const BACKEND_URL = getBackendUrl();
export const WEBSOCKET_URL = getWebSocketUrl();
