/**
 * Export Service
 *
 * Generates ZIP archives of application files for download.
 *
 * Features:
 * - Create ZIP archives from file store
 * - Support exclude patterns
 * - Track export history
 * - Calculate file sizes
 * - Stream ZIP to client
 */

import archiver from 'archiver';
import type { DatabaseClient } from '../client.js';
import type { PostgresFileStore } from './file-store.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ExportConfig {
  appId: string;
  userId: string;
  sessionId?: string;
  exportType?: 'zip' | 'tar';
  includeNodeModules?: boolean;
  includeGitHistory?: boolean;
  excludePatterns?: string[];
}

export interface ExportResult {
  id: string;
  status: 'success' | 'failed';
  fileCount?: number;
  totalSize?: number;
  compressedSize?: number;
  error?: string;
  duration: number;
}

export interface ExportStats {
  fileCount: number;
  totalSizeBytes: number;
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

export class ExportService {
  private db: DatabaseClient;
  private fileStore: PostgresFileStore;

  constructor(db: DatabaseClient, fileStore: PostgresFileStore) {
    this.db = db;
    this.fileStore = fileStore;
  }

  /**
   * Create ZIP export and return buffer
   */
  async createZipExport(config: ExportConfig): Promise<{ buffer: Buffer; exportId: string; stats: ExportStats }> {
    const startTime = Date.now();

    // Default exclude patterns
    const defaultExcludes = [
      '.git',
      '.DS_Store',
      'Thumbs.db',
      '.env',
      '.env.local',
      '.env.*.local',
      'node_modules'
    ];

    const excludePatterns = [
      ...defaultExcludes,
      ...(config.excludePatterns || [])
    ];

    // Remove node_modules from excludes if explicitly included
    if (config.includeNodeModules) {
      const index = excludePatterns.indexOf('node_modules');
      if (index > -1) excludePatterns.splice(index, 1);
    }

    // Remove .git from excludes if git history is included
    if (config.includeGitHistory) {
      const index = excludePatterns.indexOf('.git');
      if (index > -1) excludePatterns.splice(index, 1);
    }

    // Create export record
    const exportId = await this.createExport({
      app_id: config.appId,
      user_id: config.userId,
      session_id: config.sessionId,
      export_type: config.exportType || 'zip',
      include_node_modules: config.includeNodeModules || false,
      include_git_history: config.includeGitHistory || false,
      exclude_patterns: excludePatterns
    });

    try {
      // Update status to processing
      await this.updateExportStatus(exportId, 'processing');

      // Get all files from file store
      const fileTree = await this.fileStore.list(config.appId);

      // Flatten tree structure and extract only actual files (not directories)
      const flattenFiles = (nodes: any[]): any[] => {
        const result: any[] = [];
        for (const node of nodes) {
          if (node.type === 'file' && !node.isDirectory) {
            result.push(node);
          }
          if (node.children && node.children.length > 0) {
            result.push(...flattenFiles(node.children));
          }
        }
        return result;
      };

      const files = flattenFiles(fileTree);

      // Check if there are any files
      if (!files || files.length === 0) {
        throw new Error('No files found in the application workspace. Please create some files before exporting.');
      }

      // Filter files based on exclude patterns
      const filteredFiles = files.filter(file => {
        return !this.shouldExclude(file.path, excludePatterns);
      });

      // Check if any files remain after filtering
      if (filteredFiles.length === 0) {
        throw new Error('All files were excluded by filters. Try including more files or adjusting exclude patterns.');
      }

      // Calculate stats
      const stats: ExportStats = {
        fileCount: filteredFiles.length,
        totalSizeBytes: 0
      };

      // Create ZIP archive
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });

      // Collect all chunks into a buffer to prevent data loss
      const chunks: Buffer[] = [];
      let compressedSize = 0;

      archive.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        compressedSize += chunk.length;
      });

      // Add files to archive
      for (const file of filteredFiles) {
        try {
          const fileContent = await this.fileStore.read(config.appId, file.path);
          if (fileContent && fileContent.content) {
            let content: Buffer;

            if (typeof fileContent.content === 'string') {
              // Handle string content (text files)
              content = Buffer.from(fileContent.content, 'utf-8');
            } else if (fileContent.content instanceof Uint8Array) {
              // Handle Uint8Array (binary files from Postgres)
              content = Buffer.from(fileContent.content);
            } else {
              // Fallback: assume it's already a Buffer or can be converted
              content = Buffer.from(fileContent.content as any);
            }

            archive.append(content, { name: file.path });
            stats.totalSizeBytes += content.length;
          }
        } catch (error) {
          console.error(`[Export] Failed to add file ${file.path}:`, error);
          // Continue with other files
        }
      }

      // Finalize archive and wait for completion
      const finalizePromise = new Promise<void>((resolve, reject) => {
        archive.on('end', () => resolve());
        archive.on('error', (err: Error) => reject(err));
      });

      // Start finalization process
      await archive.finalize();

      // Wait for archive to finish writing all data
      await finalizePromise;

      // Combine all chunks into a single buffer
      const zipBuffer = Buffer.concat(chunks);

      // Calculate duration and update export record
      const duration = Date.now() - startTime;
      await this.updateExport(exportId, {
        status: 'success',
        file_count: stats.fileCount,
        total_size_bytes: stats.totalSizeBytes,
        compressed_size_bytes: compressedSize,
        started_at: new Date(startTime),
        completed_at: new Date(),
        duration_ms: duration
      });

      return {
        buffer: zipBuffer,
        exportId,
        stats
      };

    } catch (error: any) {
      // Update export record with error
      await this.updateExport(exportId, {
        status: 'failed',
        error_message: error.message,
        started_at: new Date(startTime),
        completed_at: new Date()
      });

      throw error;
    }
  }

  /**
   * Create export record
   */
  private async createExport(data: any): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO core.exports (
        app_id, user_id, session_id, export_type,
        include_node_modules, include_git_history, exclude_patterns
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        data.app_id,
        data.user_id,
        data.session_id || null,
        data.export_type,
        data.include_node_modules,
        data.include_git_history,
        data.exclude_patterns
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Update export status
   */
  private async updateExportStatus(exportId: string, status: 'pending' | 'processing' | 'success' | 'failed'): Promise<void> {
    await this.db.query(
      'UPDATE core.exports SET status = $1 WHERE id = $2',
      [status, exportId]
    );
  }

  /**
   * Update export record
   */
  private async updateExport(exportId: string, updates: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramIndex++}`);
      values.push(value);
    });

    values.push(exportId);
    await this.db.query(
      `UPDATE core.exports SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Track export download
   */
  async trackDownload(exportId: string): Promise<void> {
    await this.db.query(
      `UPDATE core.exports
       SET download_count = download_count + 1,
           last_downloaded_at = now()
       WHERE id = $1`,
      [exportId]
    );
  }

  /**
   * Check if path should be excluded
   */
  private shouldExclude(path: string, excludePatterns: string[]): boolean {
    for (const pattern of excludePatterns) {
      // Simple pattern matching (support * wildcard)
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$|/${regexPattern}/|/${regexPattern}$`);

      if (regex.test(path)) {
        return true;
      }

      // Also check if path starts with pattern (for directories)
      if (path.startsWith(pattern + '/') || path === pattern) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get export by ID
   */
  async getExport(exportId: string): Promise<any> {
    const result = await this.db.query(
      'SELECT * FROM core.exports WHERE id = $1',
      [exportId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get exports for an app
   */
  async getExportsByApp(appId: string, limit: number = 10): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.exports
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [appId, limit]
    );

    return result.rows;
  }

  /**
   * Get export statistics
   */
  async getExportStatistics(appId: string): Promise<any> {
    const result = await this.db.query(
      'SELECT * FROM core.export_statistics WHERE app_id = $1',
      [appId]
    );

    return result.rows[0] || null;
  }

  /**
   * Delete old exports (cleanup)
   */
  async cleanupOldExports(appId: string, keepCount: number = 50): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM core.exports
       WHERE id IN (
         SELECT id FROM core.exports
         WHERE app_id = $1
         ORDER BY created_at DESC
         OFFSET $2
       )`,
      [appId, keepCount]
    );

    return result.rowCount || 0;
  }
}
