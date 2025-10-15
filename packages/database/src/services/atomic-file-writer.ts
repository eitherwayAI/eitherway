import { DatabaseClient } from '../client.js';
import type { File, FileVersion } from '../types.js';
import { createHash } from 'crypto';

export interface AtomicWriteResult {
  file: File;
  version: FileVersion;
  impactedFileIds: string[];
}

export class AtomicFileWriter {
  constructor(private db: DatabaseClient) {}

  async writeFile(
    appId: string,
    path: string,
    content: string | Buffer,
    userId?: string,
    mimeType?: string,
  ): Promise<AtomicWriteResult> {
    return this.db.transaction(async (client) => {
      const isBuffer = Buffer.isBuffer(content);
      const isBinary = isBuffer || mimeType?.startsWith('image/') || mimeType?.startsWith('application/');
      const bytes = isBuffer ? content : Buffer.from(content as string, 'utf-8');
      const sha256 = createHash('sha256').update(bytes).digest();
      const sizeBytes = bytes.length;

      const lockResult = await client.query<File>(
        `SELECT * FROM core.files
         WHERE app_id = $1 AND path = $2
         FOR UPDATE`,
        [appId, path],
      );

      const existingFile = lockResult.rows[0];

      let file: File;
      if (existingFile) {
        const updateResult = await client.query<File>(
          `UPDATE core.files
           SET is_binary = $3,
               mime_type = $4,
               size_bytes = $5,
               sha256 = $6,
               updated_at = now()
           WHERE id = $1 AND app_id = $2
           RETURNING *`,
          [existingFile.id, appId, isBinary, mimeType ?? null, sizeBytes, sha256],
        );
        file = updateResult.rows[0];
      } else {
        const insertResult = await client.query<File>(
          `INSERT INTO core.files (app_id, path, is_binary, mime_type, size_bytes, sha256)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [appId, path, isBinary, mimeType ?? null, sizeBytes, sha256],
        );
        file = insertResult.rows[0];
      }

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

      const impactResult = await client.query<{ dest_file_id: string }>(
        `WITH RECURSIVE impact AS (
          SELECT f.dest_file_id
          FROM core.file_references f
          WHERE f.app_id = $1 AND f.src_file_id = $2

          UNION

          SELECT f.dest_file_id
          FROM impact i
          JOIN core.file_references f ON f.app_id = $1 AND f.src_file_id = i.dest_file_id
          WHERE (SELECT COUNT(*) FROM impact) < 100
        )
        SELECT DISTINCT dest_file_id FROM impact`,
        [appId, file.id],
      );

      const impactedFileIds = impactResult.rows.map((r) => r.dest_file_id);

      return {
        file: { ...file, head_version_id: version.id },
        version,
        impactedFileIds,
      };
    });
  }

  async batchWrite(
    appId: string,
    files: Array<{ path: string; content: string | Buffer; mimeType?: string }>,
    userId?: string,
  ): Promise<AtomicWriteResult[]> {
    const results: AtomicWriteResult[] = [];

    for (const f of files) {
      const result = await this.writeFile(appId, f.path, f.content, userId, f.mimeType);
      results.push(result);
    }

    return results;
  }
}
