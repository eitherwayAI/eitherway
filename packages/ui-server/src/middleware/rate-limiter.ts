/**
 * Rate Limiting Middleware
 *
 * Applies configurable rate limits to API endpoints.
 * Tracks by user ID (if authenticated) or IP address.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { EnhancedRateLimiter, SecurityAuditor, type RateLimitType, type SecurityEventContext } from '@eitherway/database';

export interface RateLimiterMiddlewareOptions {
  rateLimiter: EnhancedRateLimiter;
  securityAuditor?: SecurityAuditor;
  limitType: RateLimitType;
  identifierType?: 'user_id' | 'ip_address' | 'session_id';
  getUserId?: (request: FastifyRequest) => string | null;
  getSessionId?: (request: FastifyRequest) => string | null;
  onLimitExceeded?: (request: FastifyRequest, reply: FastifyReply) => void;
}

/**
 * Create rate limiting middleware
 */
export function createRateLimiter(options: RateLimiterMiddlewareOptions) {
  const {
    rateLimiter,
    securityAuditor,
    limitType,
    identifierType = 'ip_address',
    getUserId,
    getSessionId,
    onLimitExceeded
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Determine identifier
    let identifier: string | null = null;
    let actualType: 'user_id' | 'ip_address' | 'session_id' = identifierType;

    if (identifierType === 'user_id' && getUserId) {
      identifier = getUserId(request);
    } else if (identifierType === 'session_id' && getSessionId) {
      identifier = getSessionId(request);
    }

    // Fallback to IP if no user/session
    if (!identifier) {
      identifier = request.ip;
      actualType = 'ip_address';
    }

    try {
      // Increment rate limit counter
      const result = await rateLimiter.increment(limitType, identifier, actualType);

      // Add rate limit headers
      reply.header('X-RateLimit-Limit', result.limit.toString());
      reply.header('X-RateLimit-Remaining', result.remaining.toString());
      reply.header('X-RateLimit-Reset', result.resetAt.toISOString());

      if (!result.allowed) {
        // Rate limit exceeded
        const context: SecurityEventContext = {
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          requestPath: request.url,
          requestMethod: request.method,
          userId: actualType === 'user_id' ? identifier : undefined,
          sessionId: actualType === 'session_id' ? identifier : undefined
        };

        // Log violation
        if (securityAuditor) {
          await securityAuditor.logRateLimitViolation(
            {
              limit_type: limitType,
              identifier,
              identifier_type: actualType,
              limit_value: result.limit,
              current_count: result.current,
              action: 'blocked'
            },
            context,
            {
              windowStart: new Date(result.resetAt.getTime() - 3600000), // Approximation
              windowEnd: result.resetAt
            }
          );
        }

        // Custom handler or default response
        if (onLimitExceeded) {
          onLimitExceeded(request, reply);
        } else {
          reply.code(429).send({
            error: 'Rate limit exceeded',
            message: `Too many requests. Please try again after ${result.retryAfter} seconds.`,
            limit: result.limit,
            current: result.current,
            resetAt: result.resetAt.toISOString(),
            retryAfter: result.retryAfter
          });
        }

        return;
      }

      // Check warning threshold
      const shouldWarn = rateLimiter.shouldWarn(result, limitType);
      if (shouldWarn) {
        reply.header('X-RateLimit-Warning', 'Approaching rate limit');

        if (securityAuditor) {
          const context: SecurityEventContext = {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            requestPath: request.url,
            requestMethod: request.method,
            userId: actualType === 'user_id' ? identifier : undefined,
            sessionId: actualType === 'session_id' ? identifier : undefined
          };

          await securityAuditor.logEvent(
            'rate_limit.warning',
            'warning',
            context,
            {
              limitType,
              limit: result.limit,
              current: result.current,
              remaining: result.remaining
            },
            { riskScore: 50 }
          );
        }
      }

    } catch (error: any) {
      console.error('[RateLimiter] Error:', error);
      // On error, allow the request (fail open)
    }
  };
}

/**
 * Create rate limiter for specific route patterns
 */
export function createRouteBasedRateLimiter(
  rateLimiter: EnhancedRateLimiter,
  securityAuditor?: SecurityAuditor,
  getUserId?: (request: FastifyRequest) => string | null,
  getSessionId?: (request: FastifyRequest) => string | null
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Determine limit type based on route
    let limitType: RateLimitType = 'api_requests';

    if (request.url.includes('/api/agent') || request.url.includes('/api/chat')) {
      limitType = 'message_sending';
    } else if (request.url.includes('/api/projects/apply-plan')) {
      limitType = 'plan_execution';
    } else if (request.url.includes('/api/brand-kits') && request.method === 'POST') {
      if (request.url.includes('/assets')) {
        limitType = 'brand_kit_uploads';
      }
    } else if (request.url.includes('/api/sessions/:id/files')) {
      limitType = 'file_operations';
    } else if (request.url.includes('/api/auth') || request.url.includes('/api/login')) {
      limitType = 'auth_attempts';
    } else if (request.url.includes('/api/sessions') && request.method === 'POST') {
      limitType = 'session_creation';
    }

    // Apply the determined rate limit
    const middleware = createRateLimiter({
      rateLimiter,
      securityAuditor,
      limitType,
      getUserId,
      getSessionId
    });

    await middleware(request, reply);
  };
}
