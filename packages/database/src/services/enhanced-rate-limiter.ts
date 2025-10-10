/**
 * Enhanced Rate Limiter
 *
 * Multi-bucket rate limiting with different limits for different operations.
 * Supports both in-memory and database-backed tracking.
 *
 * Features:
 * - Multiple limit types (messages, files, plans, uploads, API calls)
 * - Sliding window algorithm
 * - User and IP-based limiting
 * - Automatic violation logging
 * - Warning thresholds
 */

import { DatabaseClient } from '../client.js';
import type { RateLimitType } from './security-auditor.js';

// ============================================================================
// TYPES
// ============================================================================

export interface RateLimitConfig {
  limit: number;           // Maximum requests
  windowMs: number;        // Time window in milliseconds
  warningThreshold?: number; // Warn at this percentage (e.g., 0.8 = 80%)
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  current: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds until reset
}

export interface RateLimitConfigs {
  message_sending: RateLimitConfig;
  file_operations: RateLimitConfig;
  plan_execution: RateLimitConfig;
  brand_kit_uploads: RateLimitConfig;
  api_requests: RateLimitConfig;
  auth_attempts: RateLimitConfig;
  session_creation: RateLimitConfig;
}

interface WindowRecord {
  count: number;
  windowStart: Date;
  windowEnd: Date;
}

// ============================================================================
// ENHANCED RATE LIMITER CLASS
// ============================================================================

export class EnhancedRateLimiter {
  private db: DatabaseClient | null;
  private inMemoryStore: Map<string, WindowRecord>;

  /**
   * Default rate limit configurations
   */
  private static readonly DEFAULT_CONFIGS: RateLimitConfigs = {
    message_sending: {
      limit: 100,
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      warningThreshold: 0.9
    },
    file_operations: {
      limit: 1000,
      windowMs: 60 * 60 * 1000, // 1 hour
      warningThreshold: 0.85
    },
    plan_execution: {
      limit: 50,
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      warningThreshold: 0.9
    },
    brand_kit_uploads: {
      limit: 20,
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      warningThreshold: 0.8
    },
    api_requests: {
      limit: 10000,
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      warningThreshold: 0.95
    },
    auth_attempts: {
      limit: 5,
      windowMs: 15 * 60 * 1000, // 15 minutes
      warningThreshold: 0.6
    },
    session_creation: {
      limit: 10,
      windowMs: 60 * 60 * 1000, // 1 hour
      warningThreshold: 0.8
    }
  };

  constructor(
    db?: DatabaseClient | null,
    private configs: Partial<RateLimitConfigs> = {}
  ) {
    this.db = db || null;
    this.inMemoryStore = new Map();

    // Merge default configs with custom configs
    this.configs = {
      ...EnhancedRateLimiter.DEFAULT_CONFIGS,
      ...configs
    };

    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check rate limit for a user/IP
   */
  async check(
    limitType: RateLimitType,
    identifier: string,
    identifierType: 'user_id' | 'ip_address' | 'session_id' = 'user_id'
  ): Promise<RateLimitResult> {
    const config = this.configs[limitType];
    if (!config) {
      throw new Error(`Unknown rate limit type: ${limitType}`);
    }

    const key = `${limitType}:${identifierType}:${identifier}`;

    // Use database if available, otherwise in-memory
    if (this.db) {
      return await this.checkDatabase(limitType, identifier, identifierType, config);
    } else {
      return this.checkInMemory(key, config);
    }
  }

  /**
   * Increment counter for a user/IP
   */
  async increment(
    limitType: RateLimitType,
    identifier: string,
    identifierType: 'user_id' | 'ip_address' | 'session_id' = 'user_id'
  ): Promise<RateLimitResult> {
    const config = this.configs[limitType];
    if (!config) {
      throw new Error(`Unknown rate limit type: ${limitType}`);
    }

    const key = `${limitType}:${identifierType}:${identifier}`;

    if (this.db) {
      return await this.incrementDatabase(limitType, identifier, identifierType, config);
    } else {
      return this.incrementInMemory(key, config);
    }
  }

  /**
   * Reset limit for a user/IP
   */
  async reset(
    limitType: RateLimitType,
    identifier: string,
    identifierType: 'user_id' | 'ip_address' | 'session_id' = 'user_id'
  ): Promise<void> {
    const key = `${limitType}:${identifierType}:${identifier}`;

    if (this.db) {
      // Delete from database
      await this.db.query(
        `DELETE FROM core.rate_limit_violations
         WHERE limit_type = $1 AND identifier = $2 AND identifier_type = $3
         AND window_end > now()`,
        [limitType, identifier, identifierType]
      );
    } else {
      this.inMemoryStore.delete(key);
    }
  }

  /**
   * Check rate limit using database
   */
  private async checkDatabase(
    limitType: RateLimitType,
    identifier: string,
    identifierType: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const windowStart = new Date(Date.now() - config.windowMs);

    // Count requests in current window
    const result = await this.db!.query(
      `SELECT COUNT(*) AS count
       FROM core.rate_limit_violations
       WHERE limit_type = $1
         AND identifier = $2
         AND identifier_type = $3
         AND window_start >= $4`,
      [limitType, identifier, identifierType, windowStart]
    );

    const current = parseInt(result.rows[0]?.count || '0', 10);
    const allowed = current < config.limit;
    const remaining = Math.max(0, config.limit - current);
    const resetAt = new Date(Date.now() + config.windowMs);

    return {
      allowed,
      limit: config.limit,
      current,
      remaining,
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil(config.windowMs / 1000)
    };
  }

  /**
   * Increment using database
   */
  private async incrementDatabase(
    limitType: RateLimitType,
    identifier: string,
    identifierType: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const result = await this.checkDatabase(limitType, identifier, identifierType, config);

    if (result.allowed) {
      // Record the request
      await this.db!.query(
        `INSERT INTO core.rate_limit_violations
         (limit_type, identifier, identifier_type, limit_value, current_count,
          window_start, window_end, action)
         VALUES ($1, $2, $3, $4, $5, now(), now() + interval '${config.windowMs} milliseconds', 'logged')`,
        [limitType, identifier, identifierType, config.limit, result.current + 1]
      );

      return {
        ...result,
        current: result.current + 1,
        remaining: result.remaining - 1
      };
    } else {
      // Log violation
      await this.db!.query(
        `INSERT INTO core.rate_limit_violations
         (limit_type, identifier, identifier_type, limit_value, current_count,
          window_start, window_end, action)
         VALUES ($1, $2, $3, $4, $5, now(), now() + interval '${config.windowMs} milliseconds', 'blocked')`,
        [limitType, identifier, identifierType, config.limit, result.current + 1]
      );

      return result;
    }
  }

  /**
   * Check rate limit using in-memory store
   */
  private checkInMemory(key: string, config: RateLimitConfig): RateLimitResult {
    const record = this.inMemoryStore.get(key);
    const now = Date.now();

    if (!record || now > record.windowEnd.getTime()) {
      // No record or window expired
      return {
        allowed: true,
        limit: config.limit,
        current: 0,
        remaining: config.limit,
        resetAt: new Date(now + config.windowMs)
      };
    }

    const allowed = record.count < config.limit;
    const remaining = Math.max(0, config.limit - record.count);

    return {
      allowed,
      limit: config.limit,
      current: record.count,
      remaining,
      resetAt: record.windowEnd,
      retryAfter: allowed ? undefined : Math.ceil((record.windowEnd.getTime() - now) / 1000)
    };
  }

  /**
   * Increment using in-memory store
   */
  private incrementInMemory(key: string, config: RateLimitConfig): RateLimitResult {
    const record = this.inMemoryStore.get(key);
    const now = Date.now();

    if (!record || now > record.windowEnd.getTime()) {
      // Create new window
      const newRecord: WindowRecord = {
        count: 1,
        windowStart: new Date(now),
        windowEnd: new Date(now + config.windowMs)
      };

      this.inMemoryStore.set(key, newRecord);

      return {
        allowed: true,
        limit: config.limit,
        current: 1,
        remaining: config.limit - 1,
        resetAt: newRecord.windowEnd
      };
    }

    // Increment existing window
    record.count++;

    const allowed = record.count <= config.limit;
    const remaining = Math.max(0, config.limit - record.count);

    return {
      allowed,
      limit: config.limit,
      current: record.count,
      remaining,
      resetAt: record.windowEnd,
      retryAfter: allowed ? undefined : Math.ceil((record.windowEnd.getTime() - now) / 1000)
    };
  }

  /**
   * Clean up expired entries from in-memory store
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.inMemoryStore.entries()) {
      if (now > record.windowEnd.getTime()) {
        this.inMemoryStore.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleaned up ${cleaned} expired entries`);
    }
  }

  /**
   * Get current status for all limit types for an identifier
   */
  async getStatus(
    identifier: string,
    identifierType: 'user_id' | 'ip_address' | 'session_id' = 'user_id'
  ): Promise<Record<RateLimitType, RateLimitResult>> {
    const limitTypes: RateLimitType[] = [
      'message_sending',
      'file_operations',
      'plan_execution',
      'brand_kit_uploads',
      'api_requests',
      'auth_attempts',
      'session_creation'
    ];

    const status: any = {};

    for (const limitType of limitTypes) {
      status[limitType] = await this.check(limitType, identifier, identifierType);
    }

    return status;
  }

  /**
   * Check if warning threshold is reached
   */
  shouldWarn(result: RateLimitResult, limitType: RateLimitType): boolean {
    const config = this.configs[limitType];
    if (!config || !config.warningThreshold) return false;

    const usage = result.current / result.limit;
    return usage >= config.warningThreshold && usage < 1.0;
  }
}
