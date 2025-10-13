import { DatabaseClient } from '../client.js';
import type { DocEmbedding, EmbeddingScope } from '../types.js';

export class EmbeddingsRepository {
  constructor(private db: DatabaseClient) {}

  async create(
    appId: string,
    scope: EmbeddingScope,
    vector: number[],
    options: {
      refId?: string;
      chunkIdx?: number;
      contentPreview?: string;
      metadata?: any;
    } = {},
  ): Promise<DocEmbedding> {
    const result = await this.db.query<DocEmbedding>(
      `INSERT INTO core.doc_embeddings
       (app_id, scope, ref_id, chunk_idx, vector, content_preview, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        appId,
        scope,
        options.refId ?? null,
        options.chunkIdx ?? null,
        JSON.stringify(vector),
        options.contentPreview ?? null,
        options.metadata ? JSON.stringify(options.metadata) : null,
      ],
    );
    return result.rows[0];
  }

  async findByRef(refId: string, scope?: EmbeddingScope): Promise<DocEmbedding[]> {
    const query = scope
      ? `SELECT * FROM core.doc_embeddings WHERE ref_id = $1 AND scope = $2 ORDER BY chunk_idx ASC`
      : `SELECT * FROM core.doc_embeddings WHERE ref_id = $1 ORDER BY chunk_idx ASC`;

    const params = scope ? [refId, scope] : [refId];
    const result = await this.db.query<DocEmbedding>(query, params);
    return result.rows;
  }

  async semanticSearch(
    appId: string,
    queryVector: number[],
    options: {
      scope?: EmbeddingScope;
      limit?: number;
      minSimilarity?: number;
    } = {},
  ): Promise<Array<DocEmbedding & { similarity: number }>> {
    const limit = options.limit ?? 10;
    const minSimilarity = options.minSimilarity ?? 0.7;

    let query = `
      SELECT *,
        1 - (vector <=> $2::vector) AS similarity
      FROM core.doc_embeddings
      WHERE app_id = $1
    `;

    const params: any[] = [appId, JSON.stringify(queryVector)];

    if (options.scope) {
      query += ` AND scope = $${params.length + 1}`;
      params.push(options.scope);
    }

    query += `
      AND 1 - (vector <=> $2::vector) >= $${params.length + 1}
      ORDER BY vector <=> $2::vector
      LIMIT $${params.length + 2}
    `;

    params.push(minSimilarity, limit);

    const result = await this.db.query<DocEmbedding & { similarity: number }>(query, params);
    return result.rows;
  }

  async deleteByRef(refId: string, scope?: EmbeddingScope): Promise<void> {
    if (scope) {
      await this.db.query(`DELETE FROM core.doc_embeddings WHERE ref_id = $1 AND scope = $2`, [refId, scope]);
    } else {
      await this.db.query(`DELETE FROM core.doc_embeddings WHERE ref_id = $1`, [refId]);
    }
  }

  async upsertFileEmbeddings(
    appId: string,
    fileId: string,
    embeddings: Array<{
      vector: number[];
      chunkIdx: number;
      contentPreview: string;
      metadata?: any;
    }>,
  ): Promise<DocEmbedding[]> {
    return this.db.transaction(async (client) => {
      await client.query(`DELETE FROM core.doc_embeddings WHERE app_id = $1 AND ref_id = $2 AND scope = 'file'`, [
        appId,
        fileId,
      ]);

      const created: DocEmbedding[] = [];
      for (const emb of embeddings) {
        const result = await client.query<DocEmbedding>(
          `INSERT INTO core.doc_embeddings
           (app_id, scope, ref_id, chunk_idx, vector, content_preview, metadata)
           VALUES ($1, 'file', $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            appId,
            fileId,
            emb.chunkIdx,
            JSON.stringify(emb.vector),
            emb.contentPreview,
            emb.metadata ? JSON.stringify(emb.metadata) : null,
          ],
        );
        created.push(result.rows[0]);
      }

      return created;
    });
  }

  async countByApp(appId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM core.doc_embeddings WHERE app_id = $1`,
      [appId],
    );
    return parseInt(result.rows[0].count, 10);
  }
}
