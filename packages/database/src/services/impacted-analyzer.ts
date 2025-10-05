import { DatabaseClient } from '../client.js';
import type { File } from '../types.js';

export interface ImpactAnalysisResult {
  sourceFile: File;
  impactedFiles: File[];
  impactPaths: Array<{
    from: string;
    to: string;
    refType: string;
  }>;
  depth: number;
}

export class ImpactedFilesAnalyzer {
  constructor(private db: DatabaseClient) {}

  async analyzeImpact(
    appId: string,
    fileId: string,
    maxDepth = 10
  ): Promise<ImpactAnalysisResult> {
    const sourceFile = await this.getFile(fileId);

    const result = await this.db.query<{
      src_file_id: string;
      src_path: string;
      ref_type: string;
      depth: number;
    }>(
      `WITH RECURSIVE impact AS (
        SELECT
          f.src_file_id,
          files.path as src_path,
          f.ref_type::text,
          1 as depth
        FROM core.file_references f
        JOIN core.files files ON f.src_file_id = files.id
        WHERE f.app_id = $1 AND f.dest_file_id = $2

        UNION

        SELECT
          f.src_file_id,
          files.path as src_path,
          f.ref_type::text,
          i.depth + 1
        FROM impact i
        JOIN core.file_references f ON f.app_id = $1 AND f.dest_file_id = i.src_file_id
        JOIN core.files files ON f.src_file_id = files.id
        WHERE i.depth < $3
      )
      SELECT DISTINCT
        src_file_id,
        src_path,
        ref_type,
        MIN(depth) as depth
      FROM impact
      GROUP BY src_file_id, src_path, ref_type
      ORDER BY depth, src_path`,
      [appId, fileId, maxDepth]
    );

    const impactedFileIds = [...new Set(result.rows.map(r => r.src_file_id))];
    const impactedFiles = await this.getFiles(impactedFileIds);

    const impactPaths = result.rows.map(row => ({
      from: row.src_path,
      to: sourceFile.path,
      refType: row.ref_type
    }));

    return {
      sourceFile,
      impactedFiles,
      impactPaths,
      depth: Math.max(...result.rows.map(r => r.depth), 0)
    };
  }

  async findDependencies(
    appId: string,
    fileId: string,
    maxDepth = 10
  ): Promise<File[]> {
    const result = await this.db.query<{ src_file_id: string }>(
      `WITH RECURSIVE deps AS (
        SELECT f.src_file_id
        FROM core.file_references f
        WHERE f.app_id = $1 AND f.dest_file_id = $2

        UNION

        SELECT f.src_file_id
        FROM deps d
        JOIN core.file_references f ON f.app_id = $1 AND f.dest_file_id = d.src_file_id
        WHERE (SELECT COUNT(*) FROM deps) < $3
      )
      SELECT DISTINCT src_file_id FROM deps`,
      [appId, fileId, maxDepth * 100]
    );

    const fileIds = result.rows.map(r => r.src_file_id);
    return this.getFiles(fileIds);
  }

  async getImpactSummary(appId: string, fileId: string): Promise<{
    directImpacts: number;
    totalImpacts: number;
    affectedTypes: Record<string, number>;
  }> {
    const result = await this.db.query<{
      depth: number;
      ref_type: string;
      count: string;
    }>(
      `WITH RECURSIVE impact AS (
        SELECT f.src_file_id, f.ref_type::text, 1 as depth
        FROM core.file_references f
        WHERE f.app_id = $1 AND f.dest_file_id = $2

        UNION

        SELECT f.src_file_id, f.ref_type::text, i.depth + 1
        FROM impact i
        JOIN core.file_references f ON f.app_id = $1 AND f.dest_file_id = i.src_file_id
        WHERE i.depth < 10
      )
      SELECT depth, ref_type, COUNT(DISTINCT src_file_id)::text as count
      FROM impact
      GROUP BY depth, ref_type`,
      [appId, fileId]
    );

    const directImpacts = result.rows
      .filter(r => r.depth === 1)
      .reduce((sum, r) => sum + parseInt(r.count, 10), 0);

    const totalImpacts = result.rows
      .reduce((sum, r) => sum + parseInt(r.count, 10), 0);

    const affectedTypes: Record<string, number> = {};
    result.rows.forEach(r => {
      affectedTypes[r.ref_type] = (affectedTypes[r.ref_type] || 0) + parseInt(r.count, 10);
    });

    return { directImpacts, totalImpacts, affectedTypes };
  }

  private async getFile(fileId: string): Promise<File> {
    const result = await this.db.query<File>(
      `SELECT * FROM core.files WHERE id = $1`,
      [fileId]
    );
    if (!result.rows[0]) {
      throw new Error(`File ${fileId} not found`);
    }
    return result.rows[0];
  }

  private async getFiles(fileIds: string[]): Promise<File[]> {
    if (fileIds.length === 0) return [];

    const result = await this.db.query<File>(
      `SELECT * FROM core.files WHERE id = ANY($1::uuid[]) ORDER BY path`,
      [fileIds]
    );
    return result.rows;
  }
}
