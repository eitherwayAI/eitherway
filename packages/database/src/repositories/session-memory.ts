import { DatabaseClient } from '../client.js';
import type { SessionMemory, WorkingSetItem } from '../types.js';

export class SessionMemoryRepository {
  constructor(private db: DatabaseClient) {}

  async upsert(
    sessionId: string,
    data: {
      rollingSummary?: string;
      facts?: any;
      lastCompactedMessageId?: string;
    }
  ): Promise<SessionMemory> {
    const result = await this.db.query<SessionMemory>(
      `INSERT INTO core.session_memory
       (session_id, rolling_summary, facts, last_compacted_message_id, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (session_id)
       DO UPDATE SET
         rolling_summary = COALESCE($2, session_memory.rolling_summary),
         facts = COALESCE($3, session_memory.facts),
         last_compacted_message_id = COALESCE($4, session_memory.last_compacted_message_id),
         updated_at = now()
       RETURNING *`,
      [
        sessionId,
        data.rollingSummary ?? null,
        data.facts ? JSON.stringify(data.facts) : null,
        data.lastCompactedMessageId ?? null
      ]
    );
    return result.rows[0];
  }

  async findBySession(sessionId: string): Promise<SessionMemory | null> {
    const result = await this.db.query<SessionMemory>(
      `SELECT * FROM core.session_memory WHERE session_id = $1`,
      [sessionId]
    );
    return result.rows[0] ?? null;
  }

  async updateSummary(sessionId: string, summary: string, lastMessageId: string): Promise<SessionMemory> {
    return this.upsert(sessionId, {
      rollingSummary: summary,
      lastCompactedMessageId: lastMessageId
    });
  }

  async updateFacts(sessionId: string, facts: any): Promise<SessionMemory> {
    return this.upsert(sessionId, { facts });
  }

  async addFact(sessionId: string, key: string, value: any): Promise<SessionMemory> {
    const existing = await this.findBySession(sessionId);
    const currentFacts = existing?.facts || {};
    const updatedFacts = { ...currentFacts, [key]: value };
    return this.upsert(sessionId, { facts: updatedFacts });
  }

  async delete(sessionId: string): Promise<void> {
    await this.db.query(`DELETE FROM core.session_memory WHERE session_id = $1`, [sessionId]);
  }
}

export class WorkingSetRepository {
  constructor(private db: DatabaseClient) {}

  async add(
    sessionId: string,
    appId: string,
    fileId: string,
    reason?: string,
    pinnedBy: 'agent' | 'user' = 'agent'
  ): Promise<WorkingSetItem> {
    const result = await this.db.query<WorkingSetItem>(
      `INSERT INTO core.working_set
       (session_id, app_id, file_id, reason, pinned_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (session_id, file_id) DO UPDATE
       SET reason = COALESCE($4, working_set.reason),
           pinned_by = $5
       RETURNING *`,
      [sessionId, appId, fileId, reason ?? null, pinnedBy]
    );
    return result.rows[0];
  }

  async findBySession(sessionId: string): Promise<WorkingSetItem[]> {
    const result = await this.db.query<WorkingSetItem>(
      `SELECT * FROM core.working_set
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async findBySessionWithFiles(sessionId: string): Promise<Array<WorkingSetItem & { file_path: string }>> {
    const result = await this.db.query<WorkingSetItem & { file_path: string }>(
      `SELECT ws.*, f.path as file_path
       FROM core.working_set ws
       JOIN core.files f ON ws.file_id = f.id
       WHERE ws.session_id = $1
       ORDER BY ws.created_at ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async remove(sessionId: string, fileId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM core.working_set WHERE session_id = $1 AND file_id = $2`,
      [sessionId, fileId]
    );
  }

  async clear(sessionId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM core.working_set WHERE session_id = $1`,
      [sessionId]
    );
  }

  async countBySession(sessionId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM core.working_set WHERE session_id = $1`,
      [sessionId]
    );
    return parseInt(result.rows[0].count, 10);
  }
}
