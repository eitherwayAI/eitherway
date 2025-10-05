import { DatabaseClient } from '../client.js';
import type { Message, File, Session } from '../types.js';

export class PreparedQueries {
  constructor(private db: DatabaseClient) {}

  async getRecentMessages(sessionId: string, limit = 10): Promise<Message[]> {
    const result = await this.db.query<Message>(
      `SELECT id, session_id, role, content, model, token_count, created_at
       FROM core.messages
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows.reverse();
  }

  async getSessionWithMemory(sessionId: string): Promise<{
    session: Session;
    recentMessages: Message[];
    memory: any;
  } | null> {
    const sessionResult = await this.db.query<Session>(
      `SELECT * FROM core.sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) return null;

    const [messages, memoryResult] = await Promise.all([
      this.getRecentMessages(sessionId, 10),
      this.db.query(
        `SELECT * FROM core.session_memory WHERE session_id = $1`,
        [sessionId]
      )
    ]);

    return {
      session: sessionResult.rows[0],
      recentMessages: messages,
      memory: memoryResult.rows[0] || null
    };
  }

  async getAppFiles(appId: string, limit = 1000): Promise<File[]> {
    const result = await this.db.query<File>(
      `SELECT id, app_id, path, is_binary, mime_type, size_bytes, sha256,
              head_version_id, created_at, updated_at
       FROM core.files
       WHERE app_id = $1
       ORDER BY path ASC
       LIMIT $2`,
      [appId, limit]
    );
    return result.rows;
  }

  async getFilesByPaths(appId: string, paths: string[]): Promise<Map<string, File>> {
    if (paths.length === 0) return new Map();

    const result = await this.db.query<File>(
      `SELECT * FROM core.files
       WHERE app_id = $1 AND path = ANY($2::text[])`,
      [appId, paths]
    );

    const map = new Map<string, File>();
    result.rows.forEach(file => {
      map.set(file.path, file);
    });

    return map;
  }

  async getWorkingSetWithFiles(sessionId: string): Promise<Array<any>> {
    const result = await this.db.query(
      `SELECT session_id, app_id, file_id, reason, pinned_by, created_at,
              file_path, is_binary, mime_type, size_bytes, file_updated_at
       FROM core.working_set_enriched
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async bulkInsertMessages(
    messages: Array<{
      sessionId: string;
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: any;
      model?: string;
      tokenCount?: number;
    }>
  ): Promise<Message[]> {
    if (messages.length === 0) return [];

    const values = messages.map((_m, i) => {
      const base = i * 5;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    }).join(', ');

    const params: any[] = [];
    messages.forEach(m => {
      params.push(
        m.sessionId,
        m.role,
        JSON.stringify(m.content),
        m.model ?? null,
        m.tokenCount ?? null
      );
    });

    const result = await this.db.query<Message>(
      `INSERT INTO core.messages (session_id, role, content, model, token_count)
       VALUES ${values}
       RETURNING *`,
      params
    );

    return result.rows;
  }
}
