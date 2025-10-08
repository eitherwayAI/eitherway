import { DatabaseClient } from '../client.js';
import type { App } from '../types.js';

export class AppsRepository {
  constructor(private db: DatabaseClient) {}

  async create(
    ownerId: string,
    name: string,
    visibility: 'private' | 'team' | 'public' = 'private'
  ): Promise<App> {
    const result = await this.db.query<App>(
      `INSERT INTO core.apps (owner_id, name, visibility)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [ownerId, name, visibility]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<App | null> {
    const result = await this.db.query<App>(
      `SELECT * FROM core.apps WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByOwner(
    ownerId: string,
    limit = 50,
    offset = 0
  ): Promise<App[]> {
    const result = await this.db.query<App>(
      `SELECT * FROM core.apps
       WHERE owner_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [ownerId, limit, offset]
    );
    return result.rows;
  }

  async update(id: string, data: {
    name?: string;
    visibility?: 'private' | 'team' | 'public';
    default_session_id?: string | null;
  }): Promise<App> {
    const result = await this.db.query<App>(
      `UPDATE core.apps
       SET name = COALESCE($2, name),
           visibility = COALESCE($3, visibility),
           default_session_id = COALESCE($4, default_session_id)
       WHERE id = $1
       RETURNING *`,
      [id, data.name ?? null, data.visibility ?? null, data.default_session_id ?? null]
    );
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM core.apps WHERE id = $1`, [id]);
  }
}
