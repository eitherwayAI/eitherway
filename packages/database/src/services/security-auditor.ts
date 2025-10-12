/**
 * Security Auditor
 *
 * Centralized security event logging and risk analysis.
 * Tracks suspicious activity, calculates risk scores, and supports forensic analysis.
 */

import { DatabaseClient } from '../client.js';

// TYPES

export type SecurityEventType =
  | 'auth.login_attempt'
  | 'auth.login_success'
  | 'auth.login_failure'
  | 'auth.logout'
  | 'auth.session_expired'
  | 'validation.plan_rejected'
  | 'validation.input_sanitized'
  | 'validation.file_blocked'
  | 'rate_limit.exceeded'
  | 'rate_limit.warning'
  | 'access.unauthorized'
  | 'access.forbidden'
  | 'injection.sql_attempt'
  | 'injection.xss_attempt'
  | 'injection.command_attempt'
  | 'upload.malicious_file'
  | 'upload.size_exceeded'
  | 'api.abuse_detected'
  | 'api.invalid_request'
  | 'system.config_changed'
  | 'system.admin_action';

export type EventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export type RateLimitType =
  | 'message_sending'
  | 'file_operations'
  | 'plan_execution'
  | 'brand_kit_uploads'
  | 'api_requests'
  | 'auth_attempts'
  | 'session_creation';

export interface SecurityEventContext {
  userId?: string;
  sessionId?: string;
  appId?: string;
  ipAddress?: string;
  userAgent?: string;
  requestPath?: string;
  requestMethod?: string;
}

export interface SecurityEventData {
  [key: string]: any;
}

export interface SecurityEvent {
  id: string;
  event_type: SecurityEventType;
  severity: EventSeverity;
  user_id: string | null;
  session_id: string | null;
  app_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_path: string | null;
  request_method: string | null;
  event_data: SecurityEventData;
  risk_score: number | null;
  is_blocked: boolean;
  detection_rules: string[];
  occurred_at: Date;
  created_at: Date;
}

export interface RateLimitViolation {
  limit_type: RateLimitType;
  identifier: string;
  identifier_type: 'user_id' | 'ip_address' | 'session_id' | 'api_key';
  limit_value: number;
  current_count: number;
  action: 'blocked' | 'throttled' | 'logged' | 'warned';
}

export interface RiskAssessment {
  ipAddress: string;
  riskScore: number;
  shouldBlock: boolean;
  recentEvents: number;
  blockedRequests: number;
  criticalEvents: number;
  recommendation: 'allow' | 'warn' | 'block' | 'ban';
}

// SECURITY AUDITOR CLASS

export class SecurityAuditor {
  constructor(private db: DatabaseClient) {}

  /**
   * Log a security event
   */
  async logEvent(
    eventType: SecurityEventType,
    severity: EventSeverity,
    context: SecurityEventContext,
    eventData: SecurityEventData = {},
    options: {
      riskScore?: number;
      isBlocked?: boolean;
      detectionRules?: string[];
    } = {}
  ): Promise<string> {
    const { riskScore, isBlocked = false, detectionRules = [] } = options;

    const result = await this.db.query(
      `INSERT INTO core.security_events
       (event_type, severity, user_id, session_id, app_id, ip_address, user_agent,
        request_path, request_method, event_data, risk_score, is_blocked, detection_rules)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        eventType,
        severity,
        context.userId || null,
        context.sessionId || null,
        context.appId || null,
        context.ipAddress || null,
        context.userAgent || null,
        context.requestPath || null,
        context.requestMethod || null,
        JSON.stringify(eventData),
        riskScore || null,
        isBlocked,
        detectionRules
      ]
    );

    const eventId = result.rows[0].id;

    const logLevel = severity === 'critical' || severity === 'error' ? 'error' : 'warn';
    console[logLevel](`[Security] ${eventType} [${severity}]`, {
      eventId,
      ...context,
      riskScore,
      isBlocked
    });

    return eventId;
  }

  /**
   * Log rate limit violation
   */
  async logRateLimitViolation(
    violation: RateLimitViolation,
    context: SecurityEventContext,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO core.rate_limit_violations
       (limit_type, identifier, identifier_type, limit_value, current_count,
        window_start, window_end, user_id, session_id, ip_address,
        request_path, request_method, user_agent, action, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        violation.limit_type,
        violation.identifier,
        violation.identifier_type,
        violation.limit_value,
        violation.current_count,
        metadata.windowStart || new Date(),
        metadata.windowEnd || new Date(Date.now() + 3600000), // 1 hour default
        context.userId || null,
        context.sessionId || null,
        context.ipAddress || null,
        context.requestPath || null,
        context.requestMethod || null,
        context.userAgent || null,
        violation.action,
        JSON.stringify(metadata)
      ]
    );

    // Also log as security event
    await this.logEvent(
      'rate_limit.exceeded',
      violation.action === 'blocked' ? 'error' : 'warning',
      context,
      {
        limitType: violation.limit_type,
        limitValue: violation.limit_value,
        currentCount: violation.current_count,
        action: violation.action
      },
      {
        riskScore: Math.min(100, (violation.current_count / violation.limit_value) * 50),
        isBlocked: violation.action === 'blocked'
      }
    );
  }

  /**
   * Assess risk for an IP address
   */
  async assessIpRisk(ipAddress: string): Promise<RiskAssessment> {
    const scoreResult = await this.db.query(
      `SELECT calculate_ip_risk_score($1::inet) AS risk_score`,
      [ipAddress]
    );
    const riskScore = scoreResult.rows[0]?.risk_score || 0;

    const blockResult = await this.db.query(
      `SELECT should_block_ip($1::inet) AS should_block`,
      [ipAddress]
    );
    const shouldBlock = blockResult.rows[0]?.should_block || false;

    const statsResult = await this.db.query(
      `SELECT
         COUNT(*) AS recent_events,
         COUNT(*) FILTER (WHERE is_blocked) AS blocked_requests,
         COUNT(*) FILTER (WHERE severity IN ('error', 'critical')) AS critical_events
       FROM core.security_events
       WHERE ip_address = $1::inet
         AND occurred_at >= now() - interval '1 hour'`,
      [ipAddress]
    );

    const stats = statsResult.rows[0] || {
      recent_events: 0,
      blocked_requests: 0,
      critical_events: 0
    };

    // Determine recommendation
    let recommendation: RiskAssessment['recommendation'];
    if (shouldBlock || riskScore >= 80) {
      recommendation = 'block';
    } else if (riskScore >= 60) {
      recommendation = 'warn';
    } else if (riskScore >= 40) {
      recommendation = 'warn';
    } else {
      recommendation = 'allow';
    }

    return {
      ipAddress,
      riskScore,
      shouldBlock,
      recentEvents: parseInt(stats.recent_events, 10),
      blockedRequests: parseInt(stats.blocked_requests, 10),
      criticalEvents: parseInt(stats.critical_events, 10),
      recommendation
    };
  }

  async getRecentEvents(
    filters: {
      eventType?: SecurityEventType;
      severity?: EventSeverity;
      userId?: string;
      ipAddress?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<SecurityEvent[]> {
    const { eventType, severity, userId, ipAddress, limit = 100, offset = 0 } = filters;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (eventType) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(eventType);
    }

    if (severity) {
      conditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (ipAddress) {
      conditions.push(`ip_address = $${paramIndex++}::inet`);
      params.push(ipAddress);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);

    const result = await this.db.query(
      `SELECT * FROM core.security_events
       ${whereClause}
       ORDER BY occurred_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    return result.rows;
  }

  async getMetricsSummary(hours: number = 24): Promise<{
    totalEvents: number;
    criticalEvents: number;
    blockedRequests: number;
    uniqueUsers: number;
    uniqueIps: number;
    avgRiskScore: number;
    topEventTypes: Array<{ eventType: string; count: number }>;
  }> {
    const result = await this.db.query(
      `SELECT
         COUNT(*) AS total_events,
         COUNT(*) FILTER (WHERE severity IN ('error', 'critical')) AS critical_events,
         COUNT(*) FILTER (WHERE is_blocked) AS blocked_requests,
         COUNT(DISTINCT user_id) AS unique_users,
         COUNT(DISTINCT ip_address) AS unique_ips,
         AVG(risk_score) FILTER (WHERE risk_score IS NOT NULL) AS avg_risk_score
       FROM core.security_events
       WHERE occurred_at >= now() - interval '${hours} hours'`
    );

    const summary = result.rows[0];

    const topEventsResult = await this.db.query(
      `SELECT event_type, COUNT(*) AS count
       FROM core.security_events
       WHERE occurred_at >= now() - interval '${hours} hours'
       GROUP BY event_type
       ORDER BY count DESC
       LIMIT 10`
    );

    return {
      totalEvents: parseInt(summary.total_events, 10) || 0,
      criticalEvents: parseInt(summary.critical_events, 10) || 0,
      blockedRequests: parseInt(summary.blocked_requests, 10) || 0,
      uniqueUsers: parseInt(summary.unique_users, 10) || 0,
      uniqueIps: parseInt(summary.unique_ips, 10) || 0,
      avgRiskScore: parseFloat(summary.avg_risk_score) || 0,
      topEventTypes: topEventsResult.rows.map(row => ({
        eventType: row.event_type,
        count: parseInt(row.count, 10)
      }))
    };
  }

  async getHighRiskUsers(): Promise<Array<{
    userId: string;
    email: string;
    totalEvents: number;
    criticalEvents: number;
    blockedAttempts: number;
    avgRiskScore: number;
    eventTypes: string[];
  }>> {
    const result = await this.db.query(
      `SELECT * FROM core.high_risk_users LIMIT 100`
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      email: row.email,
      totalEvents: parseInt(row.total_security_events, 10),
      criticalEvents: parseInt(row.critical_events, 10),
      blockedAttempts: parseInt(row.blocked_attempts, 10),
      avgRiskScore: parseFloat(row.avg_risk_score) || 0,
      eventTypes: row.event_types || []
    }));
  }

  async getSuspiciousIps(): Promise<Array<{
    ipAddress: string;
    totalEvents: number;
    criticalEvents: number;
    blockedRequests: number;
    uniqueUsers: number;
    avgRiskScore: number;
    eventTypes: string[];
    lastSeen: Date;
  }>> {
    const result = await this.db.query(
      `SELECT * FROM core.suspicious_ips LIMIT 100`
    );

    return result.rows.map(row => ({
      ipAddress: row.ip_address,
      totalEvents: parseInt(row.total_events, 10),
      criticalEvents: parseInt(row.critical_events, 10),
      blockedRequests: parseInt(row.blocked_requests, 10),
      uniqueUsers: parseInt(row.unique_users, 10),
      avgRiskScore: parseFloat(row.avg_risk_score) || 0,
      eventTypes: row.event_types || [],
      lastSeen: row.last_seen
    }));
  }

  /**
   * Detect injection attempts in input
   */
  detectInjectionAttempt(input: string): {
    detected: boolean;
    type: 'sql' | 'xss' | 'command' | null;
    patterns: string[];
  } {
    const patterns = {
      sql: [
        /(\bunion\b.*\bselect\b)|(\bselect\b.*\bfrom\b.*\bwhere\b)/i,
        /(\bdrop\b.*\btable\b)|(\binsert\b.*\binto\b)|(\bdelete\b.*\bfrom\b)/i,
        /(;.*--|\/\*.*\*\/|xp_cmdshell)/i
      ],
      xss: [
        /<script[^>]*>.*<\/script>/i,
        /javascript:/i,
        /on\w+\s*=\s*["'].*["']/i,
        /<iframe|<embed|<object/i
      ],
      command: [
        /(`.*`|\$\(.*\)|&&|\|\||;)/,
        /(rm\s+-rf|wget|curl.*\||nc\s+-)/i,
        /(eval|exec|system)\s*\(/i
      ]
    };

    const detected: string[] = [];

    for (const [type, regexList] of Object.entries(patterns)) {
      for (const regex of regexList) {
        if (regex.test(input)) {
          detected.push(type);
          break;
        }
      }
    }

    return {
      detected: detected.length > 0,
      type: detected.length > 0 ? (detected[0] as any) : null,
      patterns: detected
    };
  }
}
