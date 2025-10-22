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
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

      // Check if this is a Vite project
      const isVite = await this.isViteProject(config.appId);
      console.log('[VercelService] Project type:', isVite ? 'Vite/React (will build)' : 'Static (direct deploy)');

      let distDir: string;
      let tempDir: string | null = null;

      try {
        if (isVite) {
          // VITE/REMIX PROJECT PATH: Build and deploy output (dist/ or build/client/)
          tempDir = await this.exportFilesToTemp(config.appId, ['.git', '.DS_Store', '.env', '.env.local', 'node_modules']);
          distDir = await this.buildProject(tempDir);
          console.log('[VercelService] Using build output directory:', distDir);
        } else {
          // STATIC PROJECT PATH: Export and deploy directly
          const excludePatterns = ['.git', '.DS_Store', '.env', '.env.local', 'node_modules'];
          tempDir = await this.exportFilesToTemp(config.appId, excludePatterns);
          distDir = tempDir;
        }

        // Collect all files from the dist directory
        const files = await this.collectFilesForDeployment(distDir);

        if (files.length === 0) {
          throw new Error('No files found to deploy. Please ensure the build output exists.');
        }

        console.log('[VercelService] Collected', files.length, 'files for deployment');
        console.log('[VercelService] Sample files:', files.slice(0, 5).map(f => f.file).join(', '));

        // Check if index.html exists - required for static deployment
        let hasIndexHtml = files.some(f => f.file === 'index.html');
        if (hasIndexHtml) {
          console.log('[VercelService] Adding vercel.json for SPA routing');
          const vercelConfig = {
            rewrites: [
              {
                source: '/(.*)',
                destination: '/index.html'
              }
            ]
          };
          const configJson = JSON.stringify(vercelConfig, null, 2);
          const configBase64 = Buffer.from(configJson, 'utf-8').toString('base64');
          files.push({
            file: 'vercel.json',
            data: configBase64
          });
          console.log('[VercelService] Added vercel.json with rewrites configuration');
        }

        // Deploy to Vercel using Create Deployment API
        const projectName = config.projectName || `eitherway-${config.appId.slice(0, 8)}`;
        const deployUrl = config.teamId
          ? `https://api.vercel.com/v13/deployments?teamId=${config.teamId}`
          : 'https://api.vercel.com/v13/deployments';

        const deployResponse = await fetch(deployUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: projectName,
            files,
            target: 'production',
            projectSettings: {
              framework: null // Static deployment
            }
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

      // Step 1: Validate GitHub token
      const githubValidation = await githubService.validateToken(config.githubToken);
      if (!githubValidation.valid) {
        return {
          success: false,
          error: `GitHub token validation failed: ${githubValidation.error}`
        };
      }

      // Step 2: Validate Vercel token
      const vercelValidation = await this.validateToken(config.vercelToken);
      if (!vercelValidation.valid) {
        return {
          success: false,
          error: `Vercel token validation failed: ${vercelValidation.error}`
        };
      }

      console.log('[VercelService] Both tokens validated successfully');

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

      // Step 4: Create Vercel project linked to GitHub repo
      const projectName = config.repoName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const owner = githubValidation.username;
      const repo = config.repoName;

      console.log('[VercelService] Creating Vercel project linked to', `${owner}/${repo}`);

      const projectUrl = config.teamId
        ? `https://api.vercel.com/v9/projects?teamId=${config.teamId}`
        : 'https://api.vercel.com/v9/projects';

      const projectResponse = await fetch(projectUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.vercelToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: projectName,
          framework: 'vite',
          gitRepository: {
            type: 'github',
            repo: `${owner}/${repo}`
          }
        })
      });

      if (!projectResponse.ok) {
        const errorText = await projectResponse.text();
        console.error('[VercelService] Vercel project creation failed:', errorText);
        return {
          success: false,
          error: `Failed to create Vercel project: ${projectResponse.status} ${projectResponse.statusText} - ${errorText}`,
          repoUrl: repoResult.htmlUrl,
          repoFullName: `${owner}/${repo}`
        };
      }

      const projectData = await projectResponse.json() as any;
      console.log('[VercelService] Vercel project created:', projectData.id);

      // The project creation triggers an automatic deployment
      // We can optionally poll for the first deployment
      const deploymentUrl = projectData.targets?.production?.url
        ? `https://${projectData.targets.production.url}`
        : `https://${projectName}.vercel.app`;

      return {
        success: true,
        repoUrl: repoResult.htmlUrl,
        repoFullName: `${owner}/${repo}`,
        projectId: projectData.id,
        projectName: projectData.name,
        deploymentUrl
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
   * Check if project is a Vite/React/Remix project that needs building
   */
  private async isViteProject(appId: string): Promise<boolean> {
    try {
      const packageJsonContent = await this.fileStore.read(appId, 'package.json');
      if (!packageJsonContent || !packageJsonContent.content) {
        return false;
      }

      const packageJson = JSON.parse(packageJsonContent.content as string);

      // Check if vite, Remix, or React is in dependencies or devDependencies
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      return Boolean(
        deps?.vite ||
        deps?.['@vitejs/plugin-react'] ||
        deps?.['@remix-run/dev'] ||
        deps?.['@remix-run/react']
      );
    } catch (error) {
      console.log('[VercelService] Could not detect Vite/Remix project:', error);
      return false;
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
   * Build Vite/Remix project and return the output directory
   * Supports: Remix (build/client/), Vite (dist/), and other build tools
   */
  private async buildProject(tempDir: string): Promise<string> {
    console.log('[VercelService] Installing dependencies...');

    try {
      // Verify package.json exists
      const packageJsonPath = join(tempDir, 'package.json');
      try {
        await readFile(packageJsonPath, 'utf-8');
        console.log('[VercelService] package.json found');
      } catch (err) {
        throw new Error(`package.json not found in temp directory: ${tempDir}`);
      }

      // Install dependencies
      console.log('[VercelService] Running: npm install --production=false');
      const { stderr: installErr } = await execAsync('npm install --production=false', {
        cwd: tempDir,
        timeout: 180000, // 3 minutes timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      console.log('[VercelService] npm install completed');
      if (installErr && installErr.toLowerCase().includes('error') && !installErr.toLowerCase().includes('npm warn')) {
        throw new Error(`npm install failed: ${installErr.substring(0, 1000)}`);
      }

      console.log('[VercelService] Building project (running npm run build)...');

      // Build the project
      const { stderr: buildErr } = await execAsync('npm run build', {
        cwd: tempDir,
        timeout: 180000, // 3 minutes timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (buildErr && buildErr.toLowerCase().includes('error') && !buildErr.toLowerCase().includes('warn')) {
        throw new Error(`Build failed: ${buildErr.substring(0, 1000)}`);
      }

      console.log('[VercelService] Build completed successfully');

      // Check for build output directory (Remix uses build/client, Vite uses dist)
      const possibleOutputs = [
        join(tempDir, 'build', 'client'),  // Remix default
        join(tempDir, 'dist'),              // Vite default
        join(tempDir, 'build'),             // Alternative build output
      ];

      let distPath: string | null = null;
      for (const outputPath of possibleOutputs) {
        try {
          await readdir(outputPath);
          distPath = outputPath;
          console.log('[VercelService] Found build output at:', distPath);
          break;
        } catch (err) {
          // Try next path
          continue;
        }
      }

      if (!distPath) {
        throw new Error(`Build succeeded but no output directory found. Checked: ${possibleOutputs.join(', ')}`);
      }

      return distPath;
    } catch (error: any) {
      console.error('[VercelService] Build failed:', error);
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  /**
   * Collect all files recursively for deployment
   * Returns files in Vercel's inline format: { file: 'path', data: 'base64...' }
   */
  private async collectFilesForDeployment(dir: string, baseDir: string = dir): Promise<Array<{ file: string; data: string }>> {
    const files: Array<{ file: string; data: string }> = [];
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
          data: base64
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
