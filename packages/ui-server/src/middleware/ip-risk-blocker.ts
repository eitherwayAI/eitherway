/**
 * IP Risk Assessment Middleware
 *
 * Blocks requests from high-risk IP addresses based on:
 * - Historical security events
 * - Recent violation patterns
 * - Risk score calculations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { SecurityAuditor, type SecurityEventContext } from '@eitherway/database';

export interface IpRiskBlockerOptions {
  securityAuditor: SecurityAuditor;
  blockThreshold?: number;      // Block if risk score >= this value (default: 80)
  warnThreshold?: number;        // Warn if risk score >= this value (default: 60)
  enableBlocking?: boolean;      // Actually block requests (default: true)
  enableWarning?: boolean;       // Add warning headers (default: true)
  whitelistedIps?: string[];     // IPs to always allow
  onBlocked?: (request: FastifyRequest, reply: FastifyReply, riskScore: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<IpRiskBlockerOptions, 'securityAuditor' | 'onBlocked'>> = {
  blockThreshold: 80,
  warnThreshold: 60,
  enableBlocking: true,
  enableWarning: true,
  whitelistedIps: [
    '127.0.0.1',
    '::1',
    'localhost'
  ]
};

/**
 * Create IP risk assessment middleware
 */
export function createIpRiskBlocker(options: IpRiskBlockerOptions) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { securityAuditor, onBlocked } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ipAddress = request.ip;

    // Check whitelist
    if (opts.whitelistedIps.includes(ipAddress)) {
      return; // Allow whitelisted IPs
    }

    try {
      // Assess IP risk
      const assessment = await securityAuditor.assessIpRisk(ipAddress);

      // Add risk score header for debugging
      if (process.env.NODE_ENV === 'development') {
        reply.header('X-Risk-Score', assessment.riskScore.toString());
        reply.header('X-Risk-Recommendation', assessment.recommendation);
      }

      // Block high-risk IPs
      if (opts.enableBlocking && assessment.riskScore >= opts.blockThreshold) {
        const context: SecurityEventContext = {
          ipAddress,
          userAgent: request.headers['user-agent'],
          requestPath: request.url,
          requestMethod: request.method
        };

        // Log blocked attempt
        await securityAuditor.logEvent(
          'access.forbidden',
          'critical',
          context,
          {
            reason: 'High risk IP address',
            riskScore: assessment.riskScore,
            recentEvents: assessment.recentEvents,
            blockedRequests: assessment.blockedRequests,
            criticalEvents: assessment.criticalEvents
          },
          {
            riskScore: assessment.riskScore,
            isBlocked: true,
            detectionRules: ['ip_risk_score_threshold']
          }
        );

        // Custom blocked handler or default response
        if (onBlocked) {
          onBlocked(request, reply, assessment.riskScore);
        } else {
          reply.code(403).send({
            error: 'Access Forbidden',
            message: 'Your IP address has been blocked due to suspicious activity',
            riskScore: assessment.riskScore,
            recommendation: 'Please contact support if you believe this is an error'
          });
        }

        return;
      }

      // Warn for medium-risk IPs
      if (opts.enableWarning && assessment.riskScore >= opts.warnThreshold) {
        reply.header('X-Risk-Warning', 'Medium risk IP detected');

        const context: SecurityEventContext = {
          ipAddress,
          userAgent: request.headers['user-agent'],
          requestPath: request.url,
          requestMethod: request.method
        };

        // Log warning (non-blocking)
        await securityAuditor.logEvent(
          'access.unauthorized',
          'warning',
          context,
          {
            reason: 'Medium risk IP address',
            riskScore: assessment.riskScore,
            recentEvents: assessment.recentEvents
          },
          {
            riskScore: assessment.riskScore,
            isBlocked: false
          }
        );
      }

    } catch (error: any) {
      console.error('[IpRiskBlocker] Error:', error);
      // On error, allow the request (fail open)
    }
  };
}

/**
 * Create IP-based CAPTCHA challenge middleware
 * (For future implementation - returns 429 with CAPTCHA challenge)
 */
export function createCaptchaChallenge(securityAuditor: SecurityAuditor) {
  return createIpRiskBlocker({
    securityAuditor,
    blockThreshold: 70, // Lower threshold for CAPTCHA
    enableBlocking: true,
    onBlocked: async (request, reply, riskScore) => {
      reply.code(429).send({
        error: 'Verification Required',
        message: 'Please complete CAPTCHA verification to continue',
        riskScore,
        challengeRequired: true,
        // Future: Include CAPTCHA challenge token
        challenge: {
          type: 'captcha',
          provider: 'hcaptcha', // or 'recaptcha'
          siteKey: process.env.CAPTCHA_SITE_KEY || ''
        }
      });
    }
  });
}
