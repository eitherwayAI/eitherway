import { DatabaseClient } from '../client.js';
import type { UserDailyLimit, SessionDailyLimit } from '../types.js';

const MAX_SESSIONS_PER_DAY = 5;
const MAX_MESSAGES_PER_SESSION_PER_DAY = 5;

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  resetsAt: Date;
}

export class RateLimiter {
  constructor(private db: DatabaseClient) {}

  /**
   * Get current UTC date as a string (YYYY-MM-DD)
   */
  private getCurrentUtcDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Get the UTC midnight timestamp for the next day
   */
  private getNextUtcMidnight(): Date {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
    return tomorrow;
  }

  /**
   * Check if a user can create a new session
   * @returns RateLimitResult with allowed status and current count
   */
  async checkSessionCreation(userId: string): Promise<RateLimitResult> {
    const currentDate = this.getCurrentUtcDate();

    const result = await this.db.query<UserDailyLimit>(
      `SELECT user_id, limit_date, sessions_created
       FROM core.user_daily_limits
       WHERE user_id = $1 AND limit_date = $2`,
      [userId, currentDate],
    );

    const current = result.rows.length > 0 ? result.rows[0].sessions_created : 0;
    const allowed = current < MAX_SESSIONS_PER_DAY;

    return {
      allowed,
      current,
      limit: MAX_SESSIONS_PER_DAY,
      resetsAt: this.getNextUtcMidnight(),
    };
  }

  /**
   * Increment the session creation count for a user
   * Should be called after successfully creating a session
   */
  async incrementSessionCount(userId: string): Promise<void> {
    const currentDate = this.getCurrentUtcDate();

    await this.db.query(
      `INSERT INTO core.user_daily_limits (user_id, limit_date, sessions_created)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, limit_date)
       DO UPDATE SET sessions_created = core.user_daily_limits.sessions_created + 1`,
      [userId, currentDate],
    );
  }

  /**
   * Check if a session can send a new message
   * @returns RateLimitResult with allowed status and current count
   */
  async checkMessageSending(sessionId: string): Promise<RateLimitResult> {
    const currentDate = this.getCurrentUtcDate();

    const result = await this.db.query<SessionDailyLimit>(
      `SELECT session_id, limit_date, messages_sent
       FROM core.session_daily_limits
       WHERE session_id = $1 AND limit_date = $2`,
      [sessionId, currentDate],
    );

    const current = result.rows.length > 0 ? result.rows[0].messages_sent : 0;
    const allowed = current < MAX_MESSAGES_PER_SESSION_PER_DAY;

    return {
      allowed,
      current,
      limit: MAX_MESSAGES_PER_SESSION_PER_DAY,
      resetsAt: this.getNextUtcMidnight(),
    };
  }

  /**
   * Increment the message count for a session
   * Should be called after successfully creating a message
   */
  async incrementMessageCount(sessionId: string): Promise<void> {
    const currentDate = this.getCurrentUtcDate();

    await this.db.query(
      `INSERT INTO core.session_daily_limits (session_id, limit_date, messages_sent)
       VALUES ($1, $2, 1)
       ON CONFLICT (session_id, limit_date)
       DO UPDATE SET messages_sent = core.session_daily_limits.messages_sent + 1`,
      [sessionId, currentDate],
    );
  }

  /**
   * Get the current session count for a user (for display purposes)
   */
  async getUserSessionCount(userId: string): Promise<number> {
    const currentDate = this.getCurrentUtcDate();

    const result = await this.db.query<UserDailyLimit>(
      `SELECT sessions_created
       FROM core.user_daily_limits
       WHERE user_id = $1 AND limit_date = $2`,
      [userId, currentDate],
    );

    return result.rows.length > 0 ? result.rows[0].sessions_created : 0;
  }

  /**
   * Get the current message count for a session (for display purposes)
   */
  async getSessionMessageCount(sessionId: string): Promise<number> {
    const currentDate = this.getCurrentUtcDate();

    const result = await this.db.query<SessionDailyLimit>(
      `SELECT messages_sent
       FROM core.session_daily_limits
       WHERE session_id = $1 AND limit_date = $2`,
      [sessionId, currentDate],
    );

    return result.rows.length > 0 ? result.rows[0].messages_sent : 0;
  }
}
