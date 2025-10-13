import { DatabaseClient } from '../client.js';
import type { Event } from '../types.js';

export class EventsRepository {
  constructor(private db: DatabaseClient) {}

  async log(
    kind: string,
    payload: any,
    options: {
      sessionId?: string;
      appId?: string;
      actor?: string;
    } = {},
  ): Promise<Event> {
    const result = await this.db.query<Event>(
      `INSERT INTO core.events (session_id, app_id, actor, kind, payload)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [options.sessionId ?? null, options.appId ?? null, options.actor ?? null, kind, JSON.stringify(payload)],
    );
    return result.rows[0];
  }

  async findBySession(sessionId: string, limit = 100, offset = 0): Promise<Event[]> {
    const result = await this.db.query<Event>(
      `SELECT * FROM core.events
       WHERE session_id = $1
       ORDER BY id DESC
       LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset],
    );
    return result.rows;
  }

  async findByApp(appId: string, limit = 100, offset = 0): Promise<Event[]> {
    const result = await this.db.query<Event>(
      `SELECT * FROM core.events
       WHERE app_id = $1
       ORDER BY id DESC
       LIMIT $2 OFFSET $3`,
      [appId, limit, offset],
    );
    return result.rows;
  }

  async findByKind(kind: string, limit = 100, offset = 0): Promise<Event[]> {
    const result = await this.db.query<Event>(
      `SELECT * FROM core.events
       WHERE kind = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [kind, limit, offset],
    );
    return result.rows;
  }

  async findRecent(limit = 50): Promise<Event[]> {
    const result = await this.db.query<Event>(
      `SELECT * FROM core.events
       ORDER BY id DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }

  async deleteBySession(sessionId: string): Promise<void> {
    await this.db.query(`DELETE FROM core.events WHERE session_id = $1`, [sessionId]);
  }

  async deleteOlderThan(daysAgo: number): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM core.events
         WHERE created_at < now() - interval '1 day' * $1
         RETURNING id
       )
       SELECT COUNT(*) as count FROM deleted`,
      [daysAgo],
    );
    return parseInt(result.rows[0].count, 10);
  }
}
