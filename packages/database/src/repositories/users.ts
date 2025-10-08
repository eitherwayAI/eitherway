import { DatabaseClient } from '../client.js';
import type { User } from '../types.js';

export class UsersRepository {
  constructor(private db: DatabaseClient) {}

  async create(email: string, displayName?: string): Promise<User> {
    const result = await this.db.query<User>(
      `INSERT INTO core.users (email, display_name)
       VALUES ($1, $2)
       RETURNING *`,
      [email, displayName ?? null]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.db.query<User>(
      `SELECT * FROM core.users WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.query<User>(
      `SELECT * FROM core.users WHERE email = $1`,
      [email]
    );
    return result.rows[0] ?? null;
  }

  async findOrCreate(email: string, displayName?: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) return existing;
    return this.create(email, displayName);
  }

  async update(id: string, data: { displayName?: string }): Promise<User> {
    const result = await this.db.query<User>(
      `UPDATE core.users
       SET display_name = COALESCE($2, display_name)
       WHERE id = $1
       RETURNING *`,
      [id, data.displayName ?? null]
    );
    return result.rows[0];
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM core.users WHERE id = $1`, [id]);
  }
}
