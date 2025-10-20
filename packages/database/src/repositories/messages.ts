import { DatabaseClient } from '../client.js';
import type { Message, MessageRole } from '../types.js';

export class MessagesRepository {
  constructor(private db: DatabaseClient) {}

  async create(
    sessionId: string,
    role: MessageRole,
    content: any,
    model?: string,
    tokenCount?: number,
  ): Promise<Message> {
    const result = await this.db.query<Message>(
      `INSERT INTO core.messages (session_id, role, content, model, token_count)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [sessionId, role, JSON.stringify(content), model ?? null, tokenCount ?? null],
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<Message | null> {
    const result = await this.db.query<Message>(`SELECT * FROM core.messages WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async findBySession(sessionId: string, limit = 100, offset = 0): Promise<Message[]> {
    const result = await this.db.query<Message>(
      `SELECT * FROM core.messages
       WHERE session_id = $1
       ORDER BY id ASC
       LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset],
    );
    return result.rows;
  }

  async findRecentBySession(sessionId: string, limit = 10): Promise<Message[]> {
    const result = await this.db.query<Message>(
      `SELECT * FROM core.messages
       WHERE session_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [sessionId, limit],
    );
    return result.rows.reverse();
  }

  /**
   * P1: Find messages after a specific message ID (for bounded history based on last_compacted_message_id)
   */
  async findAfterMessageId(sessionId: string, afterMessageId: string, limit = 10): Promise<Message[]> {
    const result = await this.db.query<Message>(
      `SELECT * FROM core.messages
       WHERE session_id = $1 AND id > $2
       ORDER BY id ASC
       LIMIT $3`,
      [sessionId, afterMessageId, limit],
    );
    return result.rows;
  }

  async countBySession(sessionId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM core.messages WHERE session_id = $1`,
      [sessionId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  async searchContent(sessionId: string, searchTerm: string, limit = 20): Promise<Message[]> {
    const result = await this.db.query<Message>(
      `SELECT * FROM core.messages
       WHERE session_id = $1
         AND content::text ILIKE $2
       ORDER BY id DESC
       LIMIT $3`,
      [sessionId, `%${searchTerm}%`, limit],
    );
    return result.rows;
  }

  async deleteBySession(sessionId: string): Promise<void> {
    await this.db.query(`DELETE FROM core.messages WHERE session_id = $1`, [sessionId]);
  }

  async updateMetadata(messageId: string, metadata: any): Promise<Message | null> {
    const result = await this.db.query<Message>(
      `UPDATE core.messages
       SET metadata = $1
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(metadata), messageId],
    );
    return result.rows[0] ?? null;
  }

  async updateContent(messageId: string, content: any, tokenCount?: number): Promise<Message | null> {
    const result = await this.db.query<Message>(
      `UPDATE core.messages
       SET content = $1, token_count = $2
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(content), tokenCount ?? null, messageId],
    );
    return result.rows[0] ?? null;
  }
}
