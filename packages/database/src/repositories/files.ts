import { DatabaseClient } from '../client.js';
import type { File, FileVersion, FileReference, ReferenceType } from '../types.js';
import { createHash } from 'crypto';

export class FilesRepository {
  constructor(private db: DatabaseClient) {}

  async upsertFile(
    appId: string,
    path: string,
    content: string | Buffer,
    userId?: string,
    mimeType?: string,
  ): Promise<File> {
    return this.db.transaction(async (client) => {
      const isBuffer = Buffer.isBuffer(content);
      // Ensure isBinary is always a boolean, never null/undefined
      const isBinary = !!(
        isBuffer ||
        (mimeType?.startsWith('image/') ?? false) ||
        (mimeType?.startsWith('application/') ?? false)
      );
      const bytes = isBuffer ? content : Buffer.from(content as string, 'utf-8');
      const sha256 = createHash('sha256').update(bytes).digest();
      const sizeBytes = bytes.length;

      const fileResult = await client.query<File>(
        `INSERT INTO core.files (app_id, path, is_binary, mime_type, size_bytes, sha256)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (app_id, path)
         DO UPDATE SET
           is_binary = EXCLUDED.is_binary,
           mime_type = EXCLUDED.mime_type,
           size_bytes = EXCLUDED.size_bytes,
           sha256 = EXCLUDED.sha256,
           updated_at = now()
         RETURNING *`,
        [appId, path, isBinary, mimeType ?? null, sizeBytes, sha256],
      );
      const file = fileResult.rows[0];

      const versionCountResult = await client.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM core.file_versions WHERE file_id = $1`,
        [file.id],
      );
      const nextVersion = parseInt(versionCountResult.rows[0].count, 10) + 1;

      const contentText = isBinary ? null : Buffer.isBuffer(content) ? content.toString('utf-8') : content;
      const contentBytes = isBinary ? bytes : null;

      const versionResult = await client.query<FileVersion>(
        `INSERT INTO core.file_versions
         (file_id, version, parent_version_id, content_text, content_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [file.id, nextVersion, file.head_version_id, contentText, contentBytes, userId ?? null],
      );
      const version = versionResult.rows[0];

      await client.query(`UPDATE core.files SET head_version_id = $1 WHERE id = $2`, [version.id, file.id]);

      return { ...file, head_version_id: version.id };
    });
  }

  async findById(id: string): Promise<File | null> {
    const result = await this.db.query<File>(`SELECT * FROM core.files WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async findByAppAndPath(appId: string, path: string): Promise<File | null> {
    const result = await this.db.query<File>(`SELECT * FROM core.files WHERE app_id = $1 AND path = $2`, [appId, path]);
    return result.rows[0] ?? null;
  }

  async findByApp(appId: string, limit = 1000): Promise<File[]> {
    const result = await this.db.query<File>(
      `SELECT * FROM core.files
       WHERE app_id = $1
       ORDER BY path ASC
       LIMIT $2`,
      [appId, limit],
    );
    return result.rows;
  }

  async searchByPath(appId: string, pathPattern: string, limit = 100): Promise<File[]> {
    const result = await this.db.query<File>(
      `SELECT * FROM core.files
       WHERE app_id = $1 AND path ILIKE $2
       ORDER BY path ASC
       LIMIT $3`,
      [appId, `%${pathPattern}%`, limit],
    );
    return result.rows;
  }

  async delete(id: string): Promise<void> {
    await this.db.query(`DELETE FROM core.files WHERE id = $1`, [id]);
  }

  async getHeadVersion(fileId: string): Promise<FileVersion | null> {
    const result = await this.db.query<FileVersion>(
      `SELECT fv.*
       FROM core.file_versions fv
       JOIN core.files f ON f.head_version_id = fv.id
       WHERE f.id = $1`,
      [fileId],
    );
    return result.rows[0] ?? null;
  }

  async getVersionHistory(fileId: string, limit = 50): Promise<FileVersion[]> {
    const result = await this.db.query<FileVersion>(
      `SELECT * FROM core.file_versions
       WHERE file_id = $1
       ORDER BY version DESC
       LIMIT $2`,
      [fileId, limit],
    );
    return result.rows;
  }

  async getVersion(fileId: string, version: number): Promise<FileVersion | null> {
    const result = await this.db.query<FileVersion>(
      `SELECT * FROM core.file_versions
       WHERE file_id = $1 AND version = $2`,
      [fileId, version],
    );
    return result.rows[0] ?? null;
  }
}

export class FileReferencesRepository {
  constructor(private db: DatabaseClient) {}

  async create(
    appId: string,
    srcFileId: string,
    refType: ReferenceType,
    options: {
      destFileId?: string;
      rawTarget?: string;
      symbol?: string;
    } = {},
  ): Promise<FileReference> {
    const result = await this.db.query<FileReference>(
      `INSERT INTO core.file_references
       (app_id, src_file_id, dest_file_id, raw_target, symbol, ref_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [appId, srcFileId, options.destFileId ?? null, options.rawTarget ?? null, options.symbol ?? null, refType],
    );
    return result.rows[0];
  }

  async findBySourceFile(srcFileId: string): Promise<FileReference[]> {
    const result = await this.db.query<FileReference>(
      `SELECT * FROM core.file_references
       WHERE src_file_id = $1
       ORDER BY created_at ASC`,
      [srcFileId],
    );
    return result.rows;
  }

  async findByDestFile(destFileId: string): Promise<FileReference[]> {
    const result = await this.db.query<FileReference>(
      `SELECT * FROM core.file_references
       WHERE dest_file_id = $1
       ORDER BY created_at ASC`,
      [destFileId],
    );
    return result.rows;
  }

  async findByApp(appId: string, limit = 10000): Promise<FileReference[]> {
    const result = await this.db.query<FileReference>(
      `SELECT * FROM core.file_references
       WHERE app_id = $1
       LIMIT $2`,
      [appId, limit],
    );
    return result.rows;
  }

  async deleteBySourceFile(srcFileId: string): Promise<void> {
    await this.db.query(`DELETE FROM core.file_references WHERE src_file_id = $1`, [srcFileId]);
  }

  async rebuildReferencesForFile(
    appId: string,
    srcFileId: string,
    references: Array<{
      refType: ReferenceType;
      destFileId?: string;
      rawTarget?: string;
      symbol?: string;
    }>,
  ): Promise<FileReference[]> {
    return this.db.transaction(async (client) => {
      await client.query(`DELETE FROM core.file_references WHERE src_file_id = $1`, [srcFileId]);

      const created: FileReference[] = [];
      for (const ref of references) {
        const result = await client.query<FileReference>(
          `INSERT INTO core.file_references
           (app_id, src_file_id, dest_file_id, raw_target, symbol, ref_type)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [appId, srcFileId, ref.destFileId ?? null, ref.rawTarget ?? null, ref.symbol ?? null, ref.refType],
        );
        created.push(result.rows[0]);
      }

      return created;
    });
  }
}
