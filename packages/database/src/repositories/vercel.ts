/**
 * Vercel Integration Repositories
 *
 * Manages Vercel projects.
 */

import type { DatabaseClient } from '../client.js';

// TYPES

export interface VercelProject {
  id: string;
  user_id: string;
  app_id: string | null;
  session_id: string | null;
  vercel_project_id: string;
  project_name: string;
  framework: string | null;
  git_provider: string | null;
  git_repo: string | null;
  git_branch: string | null;
  production_url: string | null;
  deployment_url: string | null;
  team_id: string | null;
  build_command: string | null;
  output_directory: string;
  install_command: string | null;
  is_active: boolean;
  last_deploy_id: string | null;
  last_deploy_at: Date | null;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVercelProjectData {
  user_id: string;
  app_id?: string;
  session_id?: string;
  vercel_project_id: string;
  project_name: string;
  framework?: string;
  git_provider?: string;
  git_repo?: string;
  git_branch?: string;
  production_url?: string;
  deployment_url?: string;
  team_id?: string;
  build_command?: string;
  output_directory?: string;
  install_command?: string;
  metadata?: Record<string, any>;
}

// VERCEL PROJECTS REPOSITORY

export class VercelProjectsRepository {
  constructor(private db: DatabaseClient) {}

  async create(data: CreateVercelProjectData): Promise<VercelProject> {
    const result = await this.db.query<VercelProject>(
      `INSERT INTO core.vercel_projects (
        user_id, app_id, session_id, vercel_project_id,
        project_name, framework, git_provider, git_repo, git_branch,
        production_url, deployment_url, team_id,
        build_command, output_directory, install_command, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (user_id, vercel_project_id)
      DO UPDATE SET
        app_id = COALESCE($2, vercel_projects.app_id),
        session_id = COALESCE($3, vercel_projects.session_id),
        project_name = $5,
        framework = COALESCE($6, vercel_projects.framework),
        git_provider = COALESCE($7, vercel_projects.git_provider),
        git_repo = COALESCE($8, vercel_projects.git_repo),
        git_branch = COALESCE($9, vercel_projects.git_branch),
        production_url = COALESCE($10, vercel_projects.production_url),
        deployment_url = COALESCE($11, vercel_projects.deployment_url),
        team_id = COALESCE($12, vercel_projects.team_id),
        build_command = COALESCE($13, vercel_projects.build_command),
        output_directory = COALESCE($14, vercel_projects.output_directory),
        install_command = COALESCE($15, vercel_projects.install_command),
        metadata = COALESCE($16, vercel_projects.metadata),
        updated_at = now()
      RETURNING *`,
      [
        data.user_id,
        data.app_id || null,
        data.session_id || null,
        data.vercel_project_id,
        data.project_name,
        data.framework || null,
        data.git_provider || null,
        data.git_repo || null,
        data.git_branch || null,
        data.production_url || null,
        data.deployment_url || null,
        data.team_id || null,
        data.build_command || null,
        data.output_directory || 'dist',
        data.install_command || null,
        data.metadata || {}
      ]
    );

    return result.rows[0];
  }

  async getById(id: string): Promise<VercelProject | null> {
    const result = await this.db.query<VercelProject>(
      'SELECT * FROM core.vercel_projects WHERE id = $1',
      [id]
    );

    return result.rows[0] || null;
  }

  async getByVercelProjectId(userId: string, vercelProjectId: string): Promise<VercelProject | null> {
    const result = await this.db.query<VercelProject>(
      `SELECT * FROM core.vercel_projects
       WHERE user_id = $1 AND vercel_project_id = $2`,
      [userId, vercelProjectId]
    );

    return result.rows[0] || null;
  }

  async getByAppId(appId: string): Promise<VercelProject | null> {
    const result = await this.db.query<VercelProject>(
      `SELECT * FROM core.vercel_projects
       WHERE app_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [appId]
    );

    return result.rows[0] || null;
  }

  async getAllForUser(userId: string, limit: number = 50): Promise<VercelProject[]> {
    const result = await this.db.query<VercelProject>(
      `SELECT * FROM core.vercel_projects
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }

  async updateLastDeploy(id: string, deployId: string): Promise<void> {
    await this.db.query(
      `UPDATE core.vercel_projects
       SET last_deploy_id = $1, last_deploy_at = now()
       WHERE id = $2`,
      [deployId, id]
    );
  }

  /**
   * Update Git linkage for a project
   */
  async updateGitLinkage(
    id: string,
    gitProvider: string,
    gitRepo: string,
    gitBranch: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE core.vercel_projects
       SET git_provider = $1, git_repo = $2, git_branch = $3, updated_at = now()
       WHERE id = $4`,
      [gitProvider, gitRepo, gitBranch, id]
    );
  }

  /**
   * Update deployment URLs
   */
  async updateUrls(id: string, productionUrl?: string, deploymentUrl?: string): Promise<void> {
    await this.db.query(
      `UPDATE core.vercel_projects
       SET
         production_url = COALESCE($1, production_url),
         deployment_url = COALESCE($2, deployment_url),
         updated_at = now()
       WHERE id = $3`,
      [productionUrl || null, deploymentUrl || null, id]
    );
  }

  /**
   * Mark project as inactive
   */
  async markInactive(id: string): Promise<void> {
    await this.db.query(
      'UPDATE core.vercel_projects SET is_active = false WHERE id = $1',
      [id]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM core.vercel_projects WHERE id = $1',
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  async getWithStats(id: string): Promise<any> {
    const result = await this.db.query(
      `SELECT * FROM core.vercel_projects_with_stats WHERE id = $1`,
      [id]
    );

    return result.rows[0] || null;
  }
}
