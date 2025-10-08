import { DatabaseClient } from '../client.js';
import type { ImageJob, ImageAsset, ImageJobState } from '../types.js';

export class ImageJobsRepository {
  constructor(private db: DatabaseClient) {}

  async create(
    prompt: string,
    model: string,
    options: {
      sessionId?: string;
      appId?: string;
      size?: string;
      n?: number;
    } = {}
  ): Promise<ImageJob> {
    const result = await this.db.query<ImageJob>(
      `INSERT INTO core.image_jobs
       (session_id, app_id, prompt, model, size, n, state)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued')
       RETURNING *`,
      [
        options.sessionId ?? null,
        options.appId ?? null,
        prompt,
        model,
        options.size ?? null,
        options.n ?? 1
      ]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<ImageJob | null> {
    const result = await this.db.query<ImageJob>(
      `SELECT * FROM core.image_jobs WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findBySession(sessionId: string, limit = 50): Promise<ImageJob[]> {
    const result = await this.db.query<ImageJob>(
      `SELECT * FROM core.image_jobs
       WHERE session_id = $1
       ORDER BY requested_at DESC
       LIMIT $2`,
      [sessionId, limit]
    );
    return result.rows;
  }

  async findByState(state: ImageJobState, limit = 100): Promise<ImageJob[]> {
    const result = await this.db.query<ImageJob>(
      `SELECT * FROM core.image_jobs
       WHERE state = $1
       ORDER BY requested_at ASC
       LIMIT $2`,
      [state, limit]
    );
    return result.rows;
  }

  async updateState(
    id: string,
    state: ImageJobState,
    error?: any
  ): Promise<ImageJob> {
    const now = new Date();
    const startedAt = state === 'generating' ? now : undefined;
    const finishedAt = ['succeeded', 'failed', 'canceled'].includes(state) ? now : undefined;

    const result = await this.db.query<ImageJob>(
      `UPDATE core.image_jobs
       SET state = $2,
           started_at = COALESCE($3, started_at),
           finished_at = COALESCE($4, finished_at),
           error = COALESCE($5, error)
       WHERE id = $1
       RETURNING *`,
      [id, state, startedAt ?? null, finishedAt ?? null, error ? JSON.stringify(error) : null]
    );
    return result.rows[0];
  }

  async markStarted(id: string): Promise<ImageJob> {
    return this.updateState(id, 'generating');
  }

  async markSucceeded(id: string): Promise<ImageJob> {
    return this.updateState(id, 'succeeded');
  }

  async markFailed(id: string, error: any): Promise<ImageJob> {
    return this.updateState(id, 'failed', error);
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM core.image_jobs WHERE id = $1`, [id]);
  }
}

export class ImageAssetsRepository {
  constructor(private db: DatabaseClient) {}

  async create(
    jobId: string,
    position: number,
    mimeType: string,
    bytes: Buffer,
    options: {
      storageUrl?: string;
      checksum?: Buffer;
      width?: number;
      height?: number;
    } = {}
  ): Promise<ImageAsset> {
    const result = await this.db.query<ImageAsset>(
      `INSERT INTO core.image_assets
       (job_id, position, mime_type, bytes, storage_url, checksum, width, height)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        jobId,
        position,
        mimeType,
        bytes,
        options.storageUrl ?? null,
        options.checksum ?? null,
        options.width ?? null,
        options.height ?? null
      ]
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<ImageAsset | null> {
    const result = await this.db.query<ImageAsset>(
      `SELECT * FROM core.image_assets WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByJob(jobId: string): Promise<ImageAsset[]> {
    const result = await this.db.query<ImageAsset>(
      `SELECT * FROM core.image_assets
       WHERE job_id = $1
       ORDER BY position ASC`,
      [jobId]
    );
    return result.rows;
  }

  async findByJobWithoutBytes(jobId: string): Promise<Omit<ImageAsset, 'bytes'>[]> {
    const result = await this.db.query<Omit<ImageAsset, 'bytes'>>(
      `SELECT id, job_id, position, mime_type, storage_url, checksum, width, height, created_at
       FROM core.image_assets
       WHERE job_id = $1
       ORDER BY position ASC`,
      [jobId]
    );
    return result.rows;
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM core.image_assets WHERE id = $1`, [id]);
  }
}
