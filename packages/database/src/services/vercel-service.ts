/**
 * Vercel Service
 *
 * Service layer for interacting with Vercel Deployment API.
 * Handles token validation, static deployments, and project management.
 *
 * Reference: https://vercel.com/docs/rest-api
 */

import type { DatabaseClient } from '../client.js';
import type { PostgresFileStore } from './file-store.js';
import { UserIntegrationsRepository } from '../repositories/netlify.js';
import { DeploymentsRepository } from '../repositories/deployments.js';
import { mkdir, writeFile, rm, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// TYPES

export interface VercelDeployConfig {
  appId: string;
  userId: string;
  sessionId?: string;
  teamId?: string;
  projectName?: string;
  outputDir?: string; // 'dist' or 'build', defaults to 'dist'
}

export interface VercelGitHubDeployConfig {
  appId: string;
  userId: string;
  sessionId?: string;
  githubToken: string;
  vercelToken: string;
  repoName: string;
  repoVisibility?: 'public' | 'private';
  teamId?: string;
}

export interface VercelDeployResult {
  success: boolean;
  deploymentId?: string;
  deploymentUrl?: string;
  inspectorUrl?: string;
  error?: string;
}

export interface VercelGitHubDeployResult {
  success: boolean;
  repoUrl?: string;
  repoFullName?: string;
  projectId?: string;
  projectName?: string;
  deploymentUrl?: string;
  error?: string;
  partialSuccess?: boolean;  // Indicates repo was created but Vercel project failed
}

export interface VercelTokenValidationResult {
  valid: boolean;
  userId?: string;
  email?: string;
  username?: string;
  error?: string;
}

// VERCEL SERVICE

export class VercelService {
  private db: DatabaseClient;
  private fileStore: PostgresFileStore;
  private userIntegrations: UserIntegrationsRepository;
  private deployments: DeploymentsRepository;

  constructor(
    db: DatabaseClient,
    fileStore: PostgresFileStore,
    encryptionKey: string
  ) {
    this.db = db;
    this.fileStore = fileStore;
    this.userIntegrations = new UserIntegrationsRepository(db, encryptionKey);
    this.deployments = new DeploymentsRepository(db);
  }

  async validateToken(token: string): Promise<VercelTokenValidationResult> {
    try {
      const response = await fetch('https://api.vercel.com/v5/user/tokens/current', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        return {
          valid: false,
          error: `Invalid token: ${response.status} ${response.statusText}`
        };
      }

      const data = await response.json() as any;

      return {
        valid: true,
        userId: data.id,
        email: data.email,
        username: data.username || data.name
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async saveUserToken(
    userId: string,
    token: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const validation = await this.validateToken(token);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      await this.userIntegrations.upsert({
        user_id: userId,
        service: 'vercel',
        token,
        service_user_id: validation.userId,
        service_email: validation.email,
        service_username: validation.username
      });

      // Mark as verified
      await this.userIntegrations.markVerified(userId, 'vercel');

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getUserToken(userId: string): Promise<string | null> {
    return await this.userIntegrations.getDecryptedToken(userId, 'vercel');
  }

  /**
   * Deploy static site to Vercel using sourceless deployment
   */
  async deployStatic(config: VercelDeployConfig): Promise<VercelDeployResult> {
    try {
      const token = await this.getUserToken(config.userId);
      if (!token) {
        return {
          success: false,
          error: 'No Vercel token configured. Please add your token in settings.'
        };
      }

      console.log('[VercelService] Starting static deployment for app:', config.appId);

      const deploymentId = await this.createDeploymentRecord(config);
      console.log('[VercelService] Created deployment record:', deploymentId);

      await this.deployments.updateStatus(deploymentId, 'building');

      // Export source files and let Vercel build
      console.log('[VercelService] Exporting source files for Vercel build...');
      const excludePatterns = ['.git', '.DS_Store', '.env', '.env.local', 'node_modules', 'dist', 'build'];
      const tempDir = await this.exportFilesToTemp(config.appId, excludePatterns);

      try {
        // Collect all source files
        const files = await this.collectFilesForDeployment(tempDir);

        if (files.length === 0) {
          throw new Error('No files found to deploy.');
        }

        console.log('[VercelService] Collected', files.length, 'source files for deployment');
        console.log('[VercelService] Sample files:', files.slice(0, 5).map(f => f.file).join(', '));

        // Deploy to Vercel using Create Deployment API
        // Vercel will auto-detect the framework and build it
        const projectName = config.projectName || `eitherway-${config.appId.slice(0, 8)}`;
        const deployUrl = config.teamId
          ? `https://api.vercel.com/v13/deployments?teamId=${config.teamId}&skipAutoDetectionConfirmation=1`
          : 'https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1';

        console.log('[VercelService] Deploying to Vercel (Vercel will auto-detect framework)...');
        const deployResponse = await fetch(deployUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: projectName,
            files,
            target: 'production'
            // Let Vercel auto-detect framework and build
          })
        });

        if (!deployResponse.ok) {
          const errorText = await deployResponse.text();
          console.error('[VercelService] Vercel API error:', {
            status: deployResponse.status,
            statusText: deployResponse.statusText,
            errorText
          });
          await this.updateDeploymentError(deploymentId, `Deploy failed: ${errorText}`);
          return {
            success: false,
            error: `Vercel deployment failed: ${deployResponse.status} ${deployResponse.statusText} - ${errorText}`
          };
        }

        const deployData = await deployResponse.json() as any;

        await this.updateDeploymentSuccess(deploymentId, deployData);

        // Cleanup temp directory
        if (tempDir) {
          await rm(tempDir, { recursive: true, force: true });
        }

        return {
          success: true,
          deploymentId: deployData.id,
          deploymentUrl: deployData.url ? `https://${deployData.url}` : undefined,
          inspectorUrl: deployData.inspectorUrl
        };

      } catch (error) {
        // Cleanup on error
        if (tempDir) {
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
        throw error;
      }

    } catch (error: any) {
      console.error('[VercelService] Deploy error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Deploy to Vercel using GitHub integration
   * Creates GitHub repo, pushes code, and links to Vercel project
   */
  async deployWithGitHub(config: VercelGitHubDeployConfig): Promise<VercelGitHubDeployResult> {
    try {
      console.log('[VercelService] Starting GitHub-integrated deployment');

      // Import GitHubService dynamically to avoid circular dependency
      const { GitHubService } = await import('./github-service.js');
      const githubService = new GitHubService(this.db, this.fileStore, process.env.ENCRYPTION_KEY || '');

      // Step 1: Validate and save GitHub token
      const githubValidation = await githubService.validateToken(config.githubToken);
      if (!githubValidation.valid) {
        return {
          success: false,
          error: `GitHub token validation failed: ${githubValidation.error}`
        };
      }

      // Save GitHub token to database so bootstrapRepository can retrieve it
      const saveResult = await githubService.saveUserToken(config.userId, config.githubToken);
      if (!saveResult.success) {
        return {
          success: false,
          error: `Failed to save GitHub token: ${saveResult.error}`
        };
      }

      // Step 2: Validate and save Vercel token
      const vercelValidation = await this.validateToken(config.vercelToken);
      if (!vercelValidation.valid) {
        return {
          success: false,
          error: `Vercel token validation failed: ${vercelValidation.error}`
        };
      }

      // Save Vercel token so deployStatic can retrieve it
      await this.userIntegrations.upsert({
        user_id: config.userId,
        service: 'vercel',
        token: config.vercelToken,
        service_user_id: vercelValidation.userId,
        service_email: vercelValidation.email,
        service_username: vercelValidation.username
      });

      console.log('[VercelService] Both tokens validated and saved successfully');

      // Step 3: Create GitHub repository and push code
      console.log('[VercelService] Creating GitHub repository:', config.repoName);
      const repoResult = await githubService.bootstrapRepository({
        appId: config.appId,
        userId: config.userId,
        repo: config.repoName,
        visibility: config.repoVisibility || 'public',
        description: `EitherWay App - ${config.repoName}`
      });

      if (!repoResult.success || !repoResult.htmlUrl) {
        return {
          success: false,
          error: `Failed to create GitHub repository: ${repoResult.error}`
        };
      }

      console.log('[VercelService] GitHub repository created:', repoResult.htmlUrl);

      // Step 4: Deploy directly to Vercel (static deployment)
      // This avoids the GitHub OAuth connection requirement
      const projectName = config.repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const owner = githubValidation.username;
      const repo = config.repoName;

      console.log('[VercelService] Creating static deployment to Vercel...');

      // Use the existing deployStatic method to upload files directly
      const deployResult = await this.deployStatic({
        appId: config.appId,
        userId: config.userId,
        sessionId: config.sessionId,
        projectName,
        teamId: config.teamId
      });

      if (!deployResult.success) {
        // Deployment failed, but GitHub repo was created
        return {
          success: false,
          error: `GitHub repository created at ${repoResult.htmlUrl}, but Vercel deployment failed: ${deployResult.error}`,
          repoUrl: repoResult.htmlUrl,
          repoFullName: `${owner}/${repo}`,
          partialSuccess: true
        };
      }

      console.log('[VercelService] Deployment successful:', deployResult.deploymentUrl);

      return {
        success: true,
        repoUrl: repoResult.htmlUrl,
        repoFullName: `${owner}/${repo}`,
        projectId: deployResult.deploymentId,  // Use deployment ID as project ID
        projectName,
        deploymentUrl: deployResult.deploymentUrl
      };

    } catch (error: any) {
      console.error('[VercelService] GitHub deployment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export all files to a temporary directory
   */
  private async exportFilesToTemp(appId: string, excludePatterns: string[]): Promise<string> {
    const tempDir = join(tmpdir(), `eitherway-vercel-${appId}-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    console.log('[VercelService] Exporting files to:', tempDir);

    const fileTree = await this.fileStore.list(appId);
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

    for (const file of files) {
      if (this.shouldExclude(file.path, excludePatterns)) {
        continue;
      }

      try {
        const fileContent = await this.fileStore.read(appId, file.path);
        if (fileContent && fileContent.content) {
          const fullPath = join(tempDir, file.path);
          const dirPath = join(fullPath, '..');

          await mkdir(dirPath, { recursive: true });

          // Handle both text and binary files correctly
          if (typeof fileContent.content === 'string') {
            // Text file - write as UTF-8 string
            await writeFile(fullPath, fileContent.content, 'utf-8');
          } else {
            // Binary file - write as Buffer without encoding
            const buffer = fileContent.content instanceof Uint8Array
              ? Buffer.from(fileContent.content)
              : Buffer.from(fileContent.content as any);
            await writeFile(fullPath, buffer);
          }
        }
      } catch (error) {
        console.error(`[VercelService] Failed to export file ${file.path}:`, error);
      }
    }

    console.log('[VercelService] Files exported to:', tempDir);
    return tempDir;
  }

  /**
   * Collect all files recursively for deployment
   * Returns files in Vercel's inline format: { file: 'path', data: 'base64...', encoding: 'base64' }
   */
  private async collectFilesForDeployment(dir: string, baseDir: string = dir): Promise<Array<{ file: string; data: string; encoding: string }>> {
    const files: Array<{ file: string; data: string; encoding: string }> = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.collectFilesForDeployment(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const relativePath = fullPath.substring(baseDir.length + 1);
        const content = await readFile(fullPath);
        const base64 = content.toString('base64');

        files.push({
          file: relativePath,
          data: base64,
          encoding: 'base64'
        });
      }
    }

    return files;
  }

  private shouldExclude(path: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (path.startsWith(pattern + '/') || path === pattern) {
        return true;
      }
    }
    return false;
  }

  private async createDeploymentRecord(config: VercelDeployConfig): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO core.deployments (
        app_id, user_id, session_id, deployment_type,
        deploy_title, status, started_at
      )
      VALUES ($1, $2, $3, 'vercel', $4, 'pending', now())
      RETURNING id`,
      [
        config.appId,
        config.userId,
        config.sessionId || null,
        `Vercel Deploy - ${new Date().toISOString()}`
      ]
    );

    return result.rows[0].id;
  }

  private async updateDeploymentSuccess(
    deploymentId: string,
    deployData: any
  ): Promise<void> {
    await this.db.query(
      `UPDATE core.deployments
       SET status = 'success',
           deployment_url = $1,
           completed_at = now()
       WHERE id = $2`,
      [
        deployData.url ? `https://${deployData.url}` : null,
        deploymentId
      ]
    );
  }

  private async updateDeploymentError(deploymentId: string, error: string): Promise<void> {
    await this.db.query(
      `UPDATE core.deployments
       SET status = 'failed',
           error_message = $1,
           completed_at = now()
       WHERE id = $2`,
      [error, deploymentId]
    );
  }
}
