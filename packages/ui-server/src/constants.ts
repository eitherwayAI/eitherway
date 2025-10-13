/**
 * Server and Proxy Configuration Constants
 */

/**
 * Cache time-to-live for proxied API responses (milliseconds)
 * 30 seconds balances freshness with reduced upstream requests
 */
export const API_CACHE_TTL_MS = 30_000;

/**
 * Cache-Control max-age for CDN resources (seconds)
 * 24 hours is appropriate for immutable CDN assets
 */
export const CDN_CACHE_MAX_AGE_SECONDS = 86400;

/**
 * Default HTTP port for the server
 */
export const DEFAULT_SERVER_PORT = 3001;

/**
 * Default HTTPS port for the server
 */
export const DEFAULT_HTTPS_PORT = 3002;
