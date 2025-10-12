/**
 * Security Headers Middleware
 *
 * Adds security headers to all responses to protect against:
 * - XSS attacks
 * - Clickjacking
 * - MIME sniffing
 * - Protocol downgrade attacks
 * - Information leakage
 */

import { FastifyRequest, FastifyReply } from 'fastify';

export interface SecurityHeadersOptions {
  enableCSP?: boolean;
  enableHSTS?: boolean;
  hstsMaxAge?: number;
  enableFrameOptions?: boolean;
  frameOptions?: 'DENY' | 'SAMEORIGIN';
  enableContentTypeOptions?: boolean;
  enableXSSProtection?: boolean;
  enableReferrerPolicy?: boolean;
  referrerPolicy?: string;
  enablePermissionsPolicy?: boolean;
  customHeaders?: Record<string, string>;
}

const DEFAULT_OPTIONS: Required<SecurityHeadersOptions> = {
  enableCSP: true,
  enableHSTS: true,
  hstsMaxAge: 31536000, // 1 year
  enableFrameOptions: true,
  frameOptions: 'DENY',
  enableContentTypeOptions: true,
  enableXSSProtection: true,
  enableReferrerPolicy: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  enablePermissionsPolicy: true,
  customHeaders: {}
};

/**
 * Content Security Policy directives
 */
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for some frameworks (Remix, React)
    "'unsafe-eval'",   // Required for WebContainer
    'https://cdn.jsdelivr.net',
    'https://unpkg.com',
    'https://esm.sh'
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for inline styles
    'https://cdn.jsdelivr.net',
    'https://fonts.googleapis.com'
  ],
  'font-src': [
    "'self'",
    'data:',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net'
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https:', // Allow HTTPS images
    'http:' // Allow HTTP for local development
  ],
  'connect-src': [
    "'self'",
    'https://api.anthropic.com',
    'https://api.coingecko.com',
    'https://pro-api.coingecko.com',
    'wss:', // WebSocket connections
    'ws:',  // Local WebSocket
    'https:',
    'http:' // Local development
  ],
  'worker-src': [
    "'self'",
    'blob:'
  ],
  'child-src': [
    "'self'",
    'blob:'
  ],
  'frame-src': [
    "'self'",
    'blob:',
    'https://webcontainer.io' // For WebContainer previews
  ],
  'media-src': [
    "'self'",
    'data:',
    'blob:'
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': []
};

/**
 * Generate CSP header value
 */
function generateCSP(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

/**
 * Permissions Policy directives
 */
const PERMISSIONS_POLICY = {
  'camera': [],
  'microphone': [],
  'geolocation': [],
  'payment': [],
  'usb': [],
  'magnetometer': [],
  'gyroscope': [],
  'accelerometer': [],
  'ambient-light-sensor': [],
  'autoplay': ['self'],
  'encrypted-media': ['self'],
  'fullscreen': ['self'],
  'picture-in-picture': ['self']
};

/**
 * Generate Permissions Policy header value
 */
function generatePermissionsPolicy(): string {
  return Object.entries(PERMISSIONS_POLICY)
    .map(([directive, origins]) => {
      if (origins.length === 0) {
        return `${directive}=()`;
      }
      return `${directive}=(${origins.join(' ')})`;
    })
    .join(', ');
}

export function createSecurityHeaders(options: SecurityHeadersOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Content Security Policy
    if (opts.enableCSP) {
      const csp = generateCSP();
      reply.header('Content-Security-Policy', csp);
      reply.header('X-Content-Security-Policy', csp); // Legacy browsers
      reply.header('X-WebKit-CSP', csp); // Safari
    }

    // HTTP Strict Transport Security (HTTPS only)
    if (opts.enableHSTS && request.protocol === 'https') {
      reply.header(
        'Strict-Transport-Security',
        `max-age=${opts.hstsMaxAge}; includeSubDomains; preload`
      );
    }

    // X-Frame-Options (Clickjacking protection)
    if (opts.enableFrameOptions) {
      reply.header('X-Frame-Options', opts.frameOptions);
    }

    // X-Content-Type-Options (MIME sniffing protection)
    if (opts.enableContentTypeOptions) {
      reply.header('X-Content-Type-Options', 'nosniff');
    }

    // X-XSS-Protection (Legacy XSS filter for old browsers)
    if (opts.enableXSSProtection) {
      reply.header('X-XSS-Protection', '1; mode=block');
    }

    // Referrer-Policy (Control referrer information)
    if (opts.enableReferrerPolicy) {
      reply.header('Referrer-Policy', opts.referrerPolicy);
    }

    // Permissions-Policy (Feature control)
    if (opts.enablePermissionsPolicy) {
      reply.header('Permissions-Policy', generatePermissionsPolicy());
    }

    // Additional security headers
    reply.header('X-DNS-Prefetch-Control', 'off');
    reply.header('X-Download-Options', 'noopen');
    reply.header('X-Permitted-Cross-Domain-Policies', 'none');

    // Cross-Origin headers for isolation
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Cross-Origin-Embedder-Policy', 'require-corp');

    // Custom headers
    for (const [key, value] of Object.entries(opts.customHeaders)) {
      reply.header(key, value);
    }

    reply.removeHeader('X-Powered-By');
    reply.removeHeader('Server');
  };
}

export function createDevelopmentSecurityHeaders() {
  return createSecurityHeaders({
    enableCSP: false, // Disable strict CSP in dev
    enableHSTS: false, // No HTTPS enforcement in dev
    frameOptions: 'SAMEORIGIN',
    customHeaders: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
