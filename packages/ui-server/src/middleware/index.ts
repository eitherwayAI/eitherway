/**
 * Security Middleware Index
 *
 * Exports all security middleware for easy integration.
 */

export { createRequestValidator, type RequestValidatorOptions } from './request-validator.js';
export { createRateLimiter, createRouteBasedRateLimiter, type RateLimiterMiddlewareOptions } from './rate-limiter.js';
export { createSecurityHeaders, createDevelopmentSecurityHeaders, type SecurityHeadersOptions } from './security-headers.js';
export { createIpRiskBlocker, createCaptchaChallenge, type IpRiskBlockerOptions } from './ip-risk-blocker.js';

/**
 * Complete security middleware stack
 */
import { FastifyInstance } from 'fastify';
import {
  DatabaseClient,
  SecurityAuditor,
  EnhancedRateLimiter
} from '@eitherway/database';
import { createRequestValidator } from './request-validator.js';
import { createRouteBasedRateLimiter } from './rate-limiter.js';
import { createSecurityHeaders, createDevelopmentSecurityHeaders } from './security-headers.js';
import { createIpRiskBlocker } from './ip-risk-blocker.js';

export interface SecurityMiddlewareOptions {
  db: DatabaseClient;
  enableRequestValidation?: boolean;
  enableRateLimiting?: boolean;
  enableSecurityHeaders?: boolean;
  enableIpRiskBlocking?: boolean;
  isDevelopment?: boolean;
}

/**
 * Register all security middleware
 */
export async function registerSecurityMiddleware(
  fastify: FastifyInstance,
  options: SecurityMiddlewareOptions
) {
  const {
    db,
    enableRequestValidation = true,
    enableRateLimiting = true,
    enableSecurityHeaders = true,
    enableIpRiskBlocking = true,
    isDevelopment = process.env.NODE_ENV === 'development'
  } = options;

  const securityAuditor = new SecurityAuditor(db);
  const rateLimiter = new EnhancedRateLimiter(db);

  console.log('[Security] Initializing middleware stack...');

  // 1. Security Headers (always first)
  if (enableSecurityHeaders) {
    if (isDevelopment) {
      fastify.addHook('onRequest', createDevelopmentSecurityHeaders());
      console.log('[Security] Success: Development security headers enabled');
    } else {
      fastify.addHook('onRequest', createSecurityHeaders());
      console.log('[Security] Success: Production security headers enabled');
    }
  }

  // 2. IP Risk Blocking (before other checks)
  if (enableIpRiskBlocking && !isDevelopment) {
    fastify.addHook('onRequest', createIpRiskBlocker({
      securityAuditor,
      blockThreshold: 80,
      warnThreshold: 60,
      enableBlocking: true
    }));
    console.log('[Security] Success: IP risk blocking enabled (threshold: 80)');
  }

  // 3. Rate Limiting (before request validation)
  if (enableRateLimiting) {
    fastify.addHook('onRequest', createRouteBasedRateLimiter(
      rateLimiter,
      securityAuditor,
      // getUserId function - extract from request context
      (request) => {
        return null;
      },
      // getSessionId function - extract from query or headers
      (request) => {
        const query = request.query as { sessionId?: string };
        return query.sessionId || null;
      }
    ));
    console.log('[Security] Success: Multi-bucket rate limiting enabled');
  }

  // 4. Request Validation (last - validates sanitized input)
  if (enableRequestValidation) {
    fastify.addHook('onRequest', createRequestValidator({
      sanitizeQueryParams: true,
      sanitizeBody: true,
      sanitizeParams: true,
      validateContentType: true,
      maxBodySize: 10 * 1024 * 1024,
      securityAuditor
    }));
    console.log('[Security] Success: Request validation and sanitization enabled');
  }

  console.log('[Security] All middleware registered successfully\n');

  return {
    securityAuditor,
    rateLimiter
  };
}
