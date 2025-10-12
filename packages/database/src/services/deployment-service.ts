/**
 * Deployment Service
 *
 * Handles GitHub Pages deployment with build execution and status tracking.
 * Uses `gh` CLI for GitHub integration.
 *
 * Features:
 * - Execute build commands (npm run build, etc.)
 * - Deploy to GitHub Pages (gh-pages branch)
 * - Track deployment status and logs
 * - Store deployment URLs
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { DatabaseClient } from '../client.js';

// TYPES

export interface DeploymentConfig {
  appId: string;
  userId: string;
  sessionId?: string;
  repositoryUrl: string;
  branch?: string;
  buildCommand?: string;
  outputDirectory?: string;
  environmentVars?: Record<string, string>;
}

export interface DeploymentResult {
  id: string;
  status: 'success' | 'failed';
  deploymentUrl?: string;
  error?: string;
  duration: number;
  logs: DeploymentLogEntry[];
}

export interface DeploymentLogEntry {
  level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details?: any;
  stepName?: string;
  stepIndex?: number;
  timestamp: Date;
}

export type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'success' | 'failed' | 'cancelled';

// DEPLOYMENT SERVICE

export class DeploymentService {
  private db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Deploy app to GitHub Pages
   */
  async deployToGitHubPages(config: DeploymentConfig, workingDir: string): Promise<DeploymentResult> {
    const startTime = Date.now();
    const logs: DeploymentLogEntry[] = [];

    const repoInfo = this.parseGitHubUrl(config.repositoryUrl);
    if (!repoInfo) {
      throw new Error('Invalid GitHub repository URL');
    }

    const deploymentId = await this.createDeployment({
      app_id: config.appId,
      user_id: config.userId,
      session_id: config.sessionId,
      deployment_type: 'github_pages',
      repository_url: config.repositoryUrl,
      repository_owner: repoInfo.owner,
      repository_name: repoInfo.name,
      branch: config.branch || 'gh-pages',
      build_command: config.buildCommand || 'npm run build',
      output_directory: config.outputDirectory || 'dist',
      environment_vars: config.environmentVars || {}
    });

    try {
      await this.updateDeploymentStatus(deploymentId, 'building');
      this.addLog(logs, 'info', 'Starting deployment process', {}, 'initialize', 0);

      // Step 1: Install dependencies (if needed)
      const hasPackageJson = await this.fileExists(join(workingDir, 'package.json'));
      if (hasPackageJson) {
        this.addLog(logs, 'info', 'Installing dependencies...', {}, 'install', 1);
        await this.runCommand('npm', ['install'], workingDir, logs);
      }

      // Step 2: Run build command
      if (config.buildCommand) {
        this.addLog(logs, 'info', `Running build command: ${config.buildCommand}`, {}, 'build', 2);
        const [command, ...args] = config.buildCommand.split(' ');
        await this.runCommand(command, args, workingDir, logs, config.environmentVars);
      }

      // Step 3: Verify build output
      const outputDir = join(workingDir, config.outputDirectory || 'dist');
      const outputExists = await this.fileExists(outputDir);
      if (!outputExists) {
        throw new Error(`Build output directory not found: ${config.outputDirectory}`);
      }
      this.addLog(logs, 'info', 'Build completed successfully', { outputDir }, 'build', 2);

      // Step 4: Initialize Git repository (if needed)
      await this.updateDeploymentStatus(deploymentId, 'deploying');
      const hasGit = await this.fileExists(join(workingDir, '.git'));
      if (!hasGit) {
        this.addLog(logs, 'info', 'Initializing Git repository...', {}, 'git', 3);
        await this.runCommand('git', ['init'], workingDir, logs);
        await this.runCommand('git', ['remote', 'add', 'origin', config.repositoryUrl], workingDir, logs);
      }

      // Step 5: Create gh-pages branch and commit
      this.addLog(logs, 'info', 'Preparing gh-pages deployment...', {}, 'deploy', 4);

      await this.runCommand('git', ['checkout', '--orphan', config.branch || 'gh-pages'], workingDir, logs);

      // Copy build output to root
      await this.runCommand('cp', ['-r', `${outputDir}/*`, '.'], workingDir, logs);

      // Commit changes
      await this.runCommand('git', ['add', '.'], workingDir, logs);
      await this.runCommand('git', ['commit', '-m', 'Deploy to GitHub Pages'], workingDir, logs);

      // Step 6: Push to GitHub
      this.addLog(logs, 'info', 'Pushing to GitHub...', {}, 'deploy', 4);
      await this.runCommand('git', ['push', '-f', 'origin', config.branch || 'gh-pages'], workingDir, logs);

      // Step 7: Get deployment URL
      const deploymentUrl = `https://${repoInfo.owner}.github.io/${repoInfo.name}/`;
      this.addLog(logs, 'info', `Deployment successful: ${deploymentUrl}`, { deploymentUrl }, 'complete', 5);

      await this.updateDeployment(deploymentId, {
        status: 'success',
        deployment_url: deploymentUrl,
        started_at: new Date(startTime),
        completed_at: new Date()
      });

      // Store logs
      await this.storeLogs(deploymentId, logs);

      const duration = Date.now() - startTime;

      return {
        id: deploymentId,
        status: 'success',
        deploymentUrl,
        duration,
        logs
      };

    } catch (error: any) {
      this.addLog(logs, 'error', `Deployment failed: ${error.message}`, { error: error.stack }, 'error', -1);

      await this.updateDeployment(deploymentId, {
        status: 'failed',
        error_message: error.message,
        error_stack: error.stack,
        started_at: new Date(startTime),
        completed_at: new Date()
      });

      // Store logs
      await this.storeLogs(deploymentId, logs);

      const duration = Date.now() - startTime;

      return {
        id: deploymentId,
        status: 'failed',
        error: error.message,
        duration,
        logs
      };
    }
  }

  private async createDeployment(data: any): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO core.deployments (
        app_id, user_id, session_id, deployment_type,
        repository_url, repository_owner, repository_name,
        branch, build_command, output_directory, environment_vars
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id`,
      [
        data.app_id,
        data.user_id,
        data.session_id || null,
        data.deployment_type,
        data.repository_url,
        data.repository_owner,
        data.repository_name,
        data.branch,
        data.build_command,
        data.output_directory,
        JSON.stringify(data.environment_vars)
      ]
    );

    return result.rows[0].id;
  }

  private async updateDeploymentStatus(deploymentId: string, status: DeploymentStatus): Promise<void> {
    await this.db.query(
      'UPDATE core.deployments SET status = $1 WHERE id = $2',
      [status, deploymentId]
    );
  }

  private async updateDeployment(deploymentId: string, updates: any): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      fields.push(`${key} = $${paramIndex++}`);
      values.push(value);
    });

    values.push(deploymentId);
    await this.db.query(
      `UPDATE core.deployments SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Store deployment logs
   */
  private async storeLogs(deploymentId: string, logs: DeploymentLogEntry[]): Promise<void> {
    for (const log of logs) {
      await this.db.query(
        `INSERT INTO core.deployment_logs (
          deployment_id, log_level, message, details, step_name, step_index
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          deploymentId,
          log.level,
          log.message,
          log.details ? JSON.stringify(log.details) : null,
          log.stepName || null,
          log.stepIndex || null
        ]
      );
    }
  }

  /**
   * Run shell command and capture output
   */
  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    logs: DeploymentLogEntry[],
    env?: Record<string, string>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        shell: true
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.addLog(logs, 'debug', output.trim(), {}, undefined, undefined);
      });

      proc.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        this.addLog(logs, 'warning', output.trim(), {}, undefined, undefined);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}: ${command} ${args.join(' ')}\n${stderr}`));
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Add log entry
   */
  private addLog(
    logs: DeploymentLogEntry[],
    level: DeploymentLogEntry['level'],
    message: string,
    details?: any,
    stepName?: string,
    stepIndex?: number
  ): void {
    // Skip empty messages
    if (!message || message.trim() === '') return;

    logs.push({
      level,
      message,
      details,
      stepName,
      stepIndex,
      timestamp: new Date()
    });
  }

  /**
   * Parse GitHub repository URL
   */
  private parseGitHubUrl(url: string): { owner: string; name: string } | null {
    // Support both HTTPS and SSH URLs
    const httpsPattern = /github\.com\/([^\/]+)\/([^\/\.]+)/;
    const sshPattern = /git@github\.com:([^\/]+)\/([^\/\.]+)/;

    let match = url.match(httpsPattern) || url.match(sshPattern);
    if (!match) return null;

    return {
      owner: match[1],
      name: match[2].replace(/\.git$/, '')
    };
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async getDeployment(deploymentId: string): Promise<any> {
    const result = await this.db.query(
      'SELECT * FROM core.deployments WHERE id = $1',
      [deploymentId]
    );

    return result.rows[0] || null;
  }

  async getDeploymentLogs(deploymentId: string): Promise<DeploymentLogEntry[]> {
    const result = await this.db.query<any>(
      `SELECT log_level, message, details, step_name, step_index, created_at
       FROM core.deployment_logs
       WHERE deployment_id = $1
       ORDER BY created_at ASC`,
      [deploymentId]
    );

    return result.rows.map(row => ({
      level: row.log_level,
      message: row.message,
      details: row.details,
      stepName: row.step_name,
      stepIndex: row.step_index,
      timestamp: row.created_at
    }));
  }

  async getDeploymentsByApp(appId: string, limit: number = 10): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.deployments
       WHERE app_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [appId, limit]
    );

    return result.rows;
  }

  async getLatestSuccessfulDeployment(appId: string): Promise<any> {
    const result = await this.db.query(
      `SELECT * FROM core.deployments
       WHERE app_id = $1 AND status = 'success'
       ORDER BY created_at DESC
       LIMIT 1`,
      [appId]
    );

    return result.rows[0] || null;
  }

  /**
   * Cancel deployment
   */
  async cancelDeployment(deploymentId: string): Promise<void> {
    await this.updateDeployment(deploymentId, {
      status: 'cancelled',
      completed_at: new Date()
    });
  }
}
