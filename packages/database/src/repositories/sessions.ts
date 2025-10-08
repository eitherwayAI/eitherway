import { DatabaseClient } from '../client.js';
import type { Session } from '../types.js';

export class SessionsRepository {
  constructor(private db: DatabaseClient) {}

  async create(userId: string, title: string, appId?: string): Promise<Session> {
    const result = await this.db.query<Session>(
      `INSERT INTO core.sessions (user_id, title, app_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, title, appId ?? null]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<Session | null> {
    const result = await this.db.query<Session>(
      `SELECT * FROM core.sessions WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByUser(userId: string, limit = 50, offset = 0): Promise<Session[]> {
    const result = await this.db.query<Session>(
      `SELECT * FROM core.sessions
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  async findByApp(appId: string, limit = 50, offset = 0): Promise<Session[]> {
    const result = await this.db.query<Session>(
      `SELECT * FROM core.sessions
       WHERE app_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [appId, limit, offset]
    );
    return result.rows;
  }

  async update(id: string, data: {
    title?: string;
    status?: 'active' | 'archived';
    last_message_at?: Date;
  }): Promise<Session> {
    const result = await this.db.query<Session>(
      `UPDATE core.sessions
       SET title = COALESCE($2, title),
           status = COALESCE($3, status),
           last_message_at = COALESCE($4, last_message_at)
       WHERE id = $1
       RETURNING *`,
      [id, data.title ?? null, data.status ?? null, data.last_message_at ?? null]
    );
    return result.rows[0];
  }

  async archive(id: string): Promise<Session> {
    return this.update(id, { status: 'archived' });
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM core.sessions WHERE id = $1`, [id]);
  }

  async touchLastMessage(id: string): Promise<void> {
    await this.db.query(
      `UPDATE core.sessions SET last_message_at = now() WHERE id = $1`,
      [id]
    );
  }
}
