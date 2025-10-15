/**
 * SSRF (Server-Side Request Forgery) Protection
 * Domain allow-list based validation for proxy requests
 */

/**
 * Allow-listed domains for CDN and API proxying
 * Extensible via PROXY_ALLOWED_DOMAINS environment variable (comma-separated)
 */
export const ALLOWED_DOMAINS = [
  // CDN providers
  'unpkg.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'esm.sh',
  'cdn.skypack.dev',

  // Google services
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'ajax.googleapis.com',

  // APIs
  'api.coingecko.com',
  'pro-api.coingecko.com',
  'api.coincap.io',
  'api.openweathermap.org',
  'api.github.com',

  // Image/asset CDNs
  'images.unsplash.com',
  'cdn.pixabay.com',
  'raw.githubusercontent.com',

  // Add custom domains from environment variable
  ...(process.env.PROXY_ALLOWED_DOMAINS?.split(',')
    .map((d) => d.trim())
    .filter(Boolean) || []),
];

export interface SecurityCheckResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Validate URL against SSRF protection rules
 *
 * Blocks:
 * - Non-HTTP(S) protocols
 * - Localhost and loopback addresses (127.0.0.1, ::1)
 * - Private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * - Link-local addresses (169.254.0.0/16, fe80::/10)
 * - Domains not in allow-list
 */
export function isSecureUrl(url: URL): SecurityCheckResult {
  // Protocol check
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      valid: false,
      errorCode: 'INVALID_PROTOCOL',
      errorMessage: 'Only HTTP and HTTPS protocols are allowed',
    };
  }

  const hostname = url.hostname.toLowerCase();

  // Localhost checks (IPv4 and IPv6)
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname === '::'
  ) {
    return {
      valid: false,
      errorCode: 'LOCALHOST_BLOCKED',
      errorMessage: 'Local addresses are not allowed',
    };
  }

  // Private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (hostname.match(/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./)) {
    return {
      valid: false,
      errorCode: 'PRIVATE_IP_BLOCKED',
      errorMessage: 'Private IP ranges are not allowed',
    };
  }

  // Link-local IPv4 (169.254.0.0/16) and IPv6 (fe80::/10, fc00::/7)
  if (hostname.match(/^169\.254\.|^fe80:|^fc00:|^fd/)) {
    return {
      valid: false,
      errorCode: 'LINK_LOCAL_BLOCKED',
      errorMessage: 'Link-local addresses are not allowed',
    };
  }

  // Domain allow-list check
  const isAllowed = ALLOWED_DOMAINS.some((allowedDomain) => {
    // Exact match or subdomain match
    return hostname === allowedDomain || hostname.endsWith('.' + allowedDomain);
  });

  if (!isAllowed) {
    return {
      valid: false,
      errorCode: 'DOMAIN_NOT_ALLOWED',
      errorMessage: `Domain '${hostname}' is not in the allow-list. Add to PROXY_ALLOWED_DOMAINS env var if needed.`,
    };
  }

  return { valid: true };
}
