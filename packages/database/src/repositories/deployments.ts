/**
 * Deployment & Export Repositories
 *
 * Manages deployment history and export records.
 */

import type { DatabaseClient } from '../client.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Deployment {
  id: string;
  app_id: string;
  user_id: string;
  session_id: string | null;
  deployment_type: 'github_pages' | 'netlify' | 'vercel' | 'custom';
  status: 'pending' | 'building' | 'deploying' | 'success' | 'failed' | 'cancelled';
  repository_url: string | null;
  repository_owner: string | null;
  repository_name: string | null;
  branch: string | null;
  commit_sha: string | null;
  deployment_url: string | null;
  preview_url: string | null;
  build_command: string | null;
  output_directory: string | null;
  environment_vars: Record<string, string>;
  started_at: Date | null;
  completed_at: Date | null;
  duration_ms: number | null;
  error_message: string | null;
  error_stack: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Export {
  id: string;
  app_id: string;
  user_id: string;
  session_id: string | null;
  export_type: 'zip' | 'tar' | 'git_bundle';
  status: 'pending' | 'processing' | 'success' | 'failed';
  file_count: number | null;
  total_size_bytes: number | null;
  compressed_size_bytes: number | null;
  file_path: string | null;
  include_node_modules: boolean;
  include_git_history: boolean;
  exclude_patterns: string[];
  started_at: Date | null;
  completed_at: Date | null;
  duration_ms: number | null;
  download_count: number;
  last_downloaded_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

export interface DeploymentLog {
  id: string;
  deployment_id: string;
  log_level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details: any;
  step_name: string | null;
  step_index: number | null;
  created_at: Date;
}

// ============================================================================
// DEPLOYMENTS REPOSITORY
// ============================================================================

export class DeploymentsRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Get deployment by ID
   */
  async getById(id: string): Promise<Deployment | null> {
    const result = await this.db.query<Deployment>(
      'SELECT * FROM core.deployments WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all deployments for an app
   */
  async getByAppId(appId: string, limit: number = 20): Promise<Deployment[]> {
    const result = await this.db.query<Deployment>(
      `SELECT * FROM core.deployments
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [appId, limit]
    );

    return result.rows;
  }

  /**
   * Get latest successful deployment
   */
  async getLatestSuccessful(appId: string): Promise<Deployment | null> {
    const result = await this.db.query<Deployment>(
      `SELECT * FROM core.deployments
       WHERE app_id = $1 AND status = 'success'
       ORDER BY created_at DESC
       LIMIT 1`,
      [appId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get deployment summary for an app
   */
  async getSummary(appId: string): Promise<{
    total_deployments: number;
    successful_deployments: number;
    failed_deployments: number;
    in_progress_deployments: number;
    avg_build_time_ms: number;
    last_successful_deployment: Date;
    success_rate: number;
  } | null> {
    const result = await this.db.query(
      'SELECT * FROM core.deployment_summary WHERE app_id = $1',
      [appId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get deployment logs
   */
  async getLogs(deploymentId: string): Promise<DeploymentLog[]> {
    const result = await this.db.query<DeploymentLog>(
      `SELECT * FROM core.deployment_logs
       WHERE deployment_id = $1
       ORDER BY created_at ASC`,
      [deploymentId]
    );

    return result.rows;
  }

  /**
   * Get recent deployments across all apps
   */
  async getRecent(limit: number = 100): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.recent_deployments LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Update deployment status
   */
  async updateStatus(id: string, status: Deployment['status']): Promise<void> {
    await this.db.query(
      'UPDATE core.deployments SET status = $1 WHERE id = $2',
      [status, id]
    );
  }

  /**
   * Cancel deployment
   */
  async cancel(id: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE core.deployments
       SET status = 'cancelled', completed_at = now()
       WHERE id = $1 AND status IN ('pending', 'building', 'deploying')`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Cleanup old failed deployments
   */
  async cleanupFailed(appId: string): Promise<number> {
    const result = await this.db.query<{ cleaned: number }>(
      'SELECT cleanup_old_failed_deployments($1) as cleaned',
      [appId]
    );

    return result.rows[0]?.cleaned || 0;
  }
}

// ============================================================================
// EXPORTS REPOSITORY
// ============================================================================

export class ExportsRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Get export by ID
   */
  async getById(id: string): Promise<Export | null> {
    const result = await this.db.query<Export>(
      'SELECT * FROM core.exports WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all exports for an app
   */
  async getByAppId(appId: string, limit: number = 20): Promise<Export[]> {
    const result = await this.db.query<Export>(
      `SELECT * FROM core.exports
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [appId, limit]
    );

    return result.rows;
  }

  /**
   * Get export statistics for an app
   */
  async getStatistics(appId: string): Promise<{
    total_exports: number;
    successful_exports: number;
    total_downloads: number;
    avg_export_size_bytes: number;
    last_export_at: Date;
  } | null> {
    const result = await this.db.query(
      'SELECT * FROM core.export_statistics WHERE app_id = $1',
      [appId]
    );

    return result.rows[0] || null;
  }

  /**
   * Track download
   */
  async trackDownload(id: string): Promise<void> {
    await this.db.query(
      `UPDATE core.exports
       SET download_count = download_count + 1,
           last_downloaded_at = now()
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Cleanup old exports
   */
  async cleanup(appId: string, keepCount: number = 50): Promise<number> {
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
