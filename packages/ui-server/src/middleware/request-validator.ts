/**
 * Request Validation Middleware
 *
 * Validates and sanitizes all incoming requests to prevent:
 * - XSS attacks
 * - SQL injection
 * - Command injection
 * - Path traversal
 * - Malformed requests
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { InputSanitizer, SecurityAuditor, type SecurityEventContext } from '@eitherway/database';

export interface RequestValidatorOptions {
  sanitizeQueryParams?: boolean;
  sanitizeBody?: boolean;
  sanitizeParams?: boolean;
  validateContentType?: boolean;
  maxBodySize?: number;
  securityAuditor?: SecurityAuditor;
}

const DEFAULT_OPTIONS: Required<RequestValidatorOptions> = {
  sanitizeQueryParams: true,
  sanitizeBody: true,
  sanitizeParams: true,
  validateContentType: true,
  maxBodySize: 10 * 1024 * 1024, // 10MB
  securityAuditor: null as any
};

export function createRequestValidator(options: RequestValidatorOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const context: SecurityEventContext = {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      requestPath: request.url,
      requestMethod: request.method
    };

    try {
      if (opts.validateContentType && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const contentType = request.headers['content-type'];

        if (!contentType) {
          if (opts.securityAuditor) {
            await opts.securityAuditor.logEvent(
              'api.invalid_request',
              'warning',
              context,
              { reason: 'Missing Content-Type header' }
            );
          }
          return reply.code(400).send({
            error: 'Missing Content-Type header'
          });
        }

        // Allow common content types
        const allowedTypes = [
          'application/json',
          'multipart/form-data',
          'application/x-www-form-urlencoded',
          'text/plain'
        ];

        const isAllowed = allowedTypes.some(type => contentType.includes(type));
        if (!isAllowed) {
          if (opts.securityAuditor) {
            await opts.securityAuditor.logEvent(
              'api.invalid_request',
              'warning',
              context,
              { reason: 'Invalid Content-Type', contentType }
            );
          }
          return reply.code(415).send({
            error: 'Unsupported Media Type',
            allowedTypes
          });
        }
      }

      // Sanitize route params (UUIDs, etc.)
      if (opts.sanitizeParams && request.params) {
        const params = request.params as Record<string, any>;
        const sanitized: Record<string, any> = {};

        for (const [key, value] of Object.entries(params)) {
          if (typeof value === 'string') {
            if (value.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
              const result = InputSanitizer.validateUuid(value);
              if (result.valid) {
                sanitized[key] = result.sanitized;
              } else {
                return reply.code(400).send({
                  error: 'Invalid parameter',
                  parameter: key,
                  reason: 'Invalid UUID format'
                });
              }
            } else {
              // Sanitize as path/filename
              const result = InputSanitizer.sanitizeFilePath(value);

              if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
                if (opts.securityAuditor) {
                  await opts.securityAuditor.logEvent(
                    'injection.command_attempt',
                    'error',
                    context,
                    {
                      parameter: key,
                      value: value.substring(0, 100),
                      removedPatterns: result.removedPatterns
                    },
                    { riskScore: 90, isBlocked: true, detectionRules: ['path_traversal'] }
                  );
                }

                return reply.code(400).send({
                  error: 'Invalid parameter',
                  parameter: key,
                  reason: 'Potentially dangerous input detected'
                });
              }

              sanitized[key] = result.sanitized;
            }
          } else {
            sanitized[key] = value;
          }
        }

        // Replace params with sanitized versions
        request.params = sanitized;
      }

      // Sanitize query parameters
      if (opts.sanitizeQueryParams && request.query) {
        const query = request.query as Record<string, any>;
        const sanitized: Record<string, any> = {};

        for (const [key, value] of Object.entries(query)) {
          if (typeof value === 'string') {
            // Detect injection attempts
            const injection = InputSanitizer.sanitize(value, 'auto');

            if (injection.riskLevel === 'critical' || injection.riskLevel === 'high') {
              if (opts.securityAuditor) {
                const injectionType = injection.removedPatterns.some(p => p.includes('sql')) ? 'sql_attempt' :
                                      injection.removedPatterns.some(p => p.includes('xss')) ? 'xss_attempt' :
                                      'command_attempt';

                await opts.securityAuditor.logEvent(
                  `injection.${injectionType}` as any,
                  'error',
                  context,
                  {
                    queryParam: key,
                    value: value.substring(0, 100),
                    removedPatterns: injection.removedPatterns
                  },
                  { riskScore: 85, isBlocked: true, detectionRules: injection.removedPatterns }
                );
              }

              return reply.code(400).send({
                error: 'Invalid query parameter',
                parameter: key,
                reason: 'Potentially dangerous input detected'
              });
            }

            sanitized[key] = injection.sanitized;
          } else {
            sanitized[key] = value;
          }
        }

        // Replace query with sanitized versions
        request.query = sanitized;
      }

      // Sanitize request body
      if (opts.sanitizeBody && request.body && typeof request.body === 'object') {
        const body = request.body as Record<string, any>;
        const sanitized = sanitizeObjectRecursive(body, opts.securityAuditor, context);

        if (sanitized.blocked) {
          return reply.code(400).send({
            error: 'Invalid request body',
            reason: 'Potentially dangerous input detected',
            field: sanitized.field
          });
        }

        request.body = sanitized.result;
      }

    } catch (error: any) {
      console.error('[RequestValidator] Error:', error);

      if (opts.securityAuditor) {
        await opts.securityAuditor.logEvent(
          'api.invalid_request',
          'error',
          context,
          { error: error.message }
        );
      }

      return reply.code(500).send({
        error: 'Request validation failed'
      });
    }
  };
}

/**
 * Recursively sanitize object properties
 */
function sanitizeObjectRecursive(
  obj: any,
  auditor: SecurityAuditor | null,
  context: SecurityEventContext,
  path: string = ''
): { result: any; blocked: boolean; field?: string } {
  if (obj === null || obj === undefined) {
    return { result: obj, blocked: false };
  }

  if (typeof obj === 'string') {
    const result = InputSanitizer.sanitize(obj, 'auto');

    if (result.riskLevel === 'critical' || result.riskLevel === 'high') {
      if (auditor) {
        auditor.logEvent(
          'injection.xss_attempt',
          'error',
          context,
          {
            field: path,
            value: obj.substring(0, 100),
            removedPatterns: result.removedPatterns
          },
          { riskScore: 80, isBlocked: true }
        ).catch(console.error);
      }

      return { result: null, blocked: true, field: path };
    }

    return { result: result.sanitized, blocked: false };
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return { result: obj, blocked: false };
  }

  if (Array.isArray(obj)) {
    const sanitized: any[] = [];

    for (let i = 0; i < obj.length; i++) {
      const itemResult = sanitizeObjectRecursive(
        obj[i],
        auditor,
        context,
        `${path}[${i}]`
      );

      if (itemResult.blocked) {
        return itemResult;
      }

      sanitized.push(itemResult.result);
    }

    return { result: sanitized, blocked: false };
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = path ? `${path}.${key}` : key;
      const valueResult = sanitizeObjectRecursive(value, auditor, context, fieldPath);

      if (valueResult.blocked) {
        return valueResult;
      }

      sanitized[key] = valueResult.result;
    }

    return { result: sanitized, blocked: false };
  }

  return { result: obj, blocked: false };
}
