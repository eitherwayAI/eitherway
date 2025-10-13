/**
 * Netlify Service
 *
 * Service layer for interacting with Netlify Build API.
 * Handles site creation, deployments, and log streaming.
 *
 * Reference: https://docs.netlify.com/api/get-started/
 */

import type { DatabaseClient } from '../client.js';
import type { PostgresFileStore } from './file-store.js';
import { UserIntegrationsRepository, NetlifySitesRepository } from '../repositories/netlify.js';
import { DeploymentsRepository } from '../repositories/deployments.js';
import archiver from 'archiver';
import FormData from 'form-data';
import { mkdir, writeFile, rm, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// TYPES

export interface NetlifyDeployConfig {
  appId: string;
  userId: string;
  sessionId?: string;
  siteName?: string;
  deployTitle?: string;
  includeNodeModules?: boolean;
}

export interface NetlifyDeployResult {
  success: boolean;
  siteId?: string;
  deployId?: string;
  siteUrl?: string;
  adminUrl?: string;
  deployUrl?: string;
  error?: string;
}

export interface NetlifyTokenValidationResult {
  valid: boolean;
  userId?: string;
  email?: string;
  fullName?: string;
  error?: string;
}

export interface NetlifyLogsAccessToken {
  accessToken: string;
  siteId: string;
  deployId: string;
}

// NETLIFY SERVICE

export class NetlifyService {
  private db: DatabaseClient;
  private fileStore: PostgresFileStore;
  private userIntegrations: UserIntegrationsRepository;
  private netlifySites: NetlifySitesRepository;
  private deployments: DeploymentsRepository;

  constructor(
    db: DatabaseClient,
    fileStore: PostgresFileStore,
    encryptionKey: string
  ) {
    this.db = db;
    this.fileStore = fileStore;
    this.userIntegrations = new UserIntegrationsRepository(db, encryptionKey);
    this.netlifySites = new NetlifySitesRepository(db);
    this.deployments = new DeploymentsRepository(db);
  }

  async validateToken(token: string): Promise<NetlifyTokenValidationResult> {
    try {
      const response = await fetch('https://api.netlify.com/api/v1/user', {
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
        fullName: data.full_name || data.name
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
        service: 'netlify',
        token,
        service_user_id: validation.userId,
        service_email: validation.email,
        service_username: validation.fullName
      });

      // Mark as verified
      await this.userIntegrations.markVerified(userId, 'netlify');

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getUserToken(userId: string): Promise<string | null> {
    return await this.userIntegrations.getDecryptedToken(userId, 'netlify');
  }

  /**
   * Ensure Netlify site exists (create if needed)
   */
  async ensureSite(
    userId: string,
    appId: string,
    siteName?: string,
    sessionId?: string
  ): Promise<{ siteId: string; url: string; adminUrl: string; netlifyId: string }> {
    const existingSite = await this.netlifySites.getByAppId(appId);
    if (existingSite) {
      return {
        siteId: existingSite.id,
        url: existingSite.url,
        adminUrl: existingSite.admin_url || '',
        netlifyId: existingSite.netlify_site_id
      };
    }

    const token = await this.getUserToken(userId);
    if (!token) {
      throw new Error('No Netlify token found for user');
    }

    const requestBody: any = {
      created_via: 'eitherway'
    };

    if (sessionId) {
      requestBody.session_id = sessionId;
    }

    if (siteName) {
      requestBody.name = siteName;
    }

    const response = await fetch('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create Netlify site: ${response.status} ${error}`);
    }

    const siteData = await response.json() as any;

    const site = await this.netlifySites.create({
      user_id: userId,
      app_id: appId,
      session_id: sessionId,
      netlify_site_id: siteData.id,
      site_name: siteData.name,
      url: siteData.url || `https://${siteData.name}.netlify.app`,
      admin_url: siteData.admin_url,
      ssl_url: siteData.ssl_url
    });

    return {
      siteId: site.id,
      url: site.url,
      adminUrl: site.admin_url || '',
      netlifyId: site.netlify_site_id
    };
  }

  /**
   * Deploy to Netlify using Build API (ZIP upload)
   */
  async deploy(config: NetlifyDeployConfig): Promise<NetlifyDeployResult> {
    try {
      const token = await this.getUserToken(config.userId);
      if (!token) {
        return {
          success: false,
          error: 'No Netlify token configured. Please add your token in settings.'
        };
      }

      // Ensure site exists
      console.log('[NetlifyService] Ensuring Netlify site exists for app:', config.appId);
      const site = await this.ensureSite(
        config.userId,
        config.appId,
        config.siteName,
        config.sessionId
      );
      console.log('[NetlifyService] Site ready:', {
        siteId: site.siteId,
        netlifyId: site.netlifyId,
        url: site.url
      });

      const deploymentId = await this.createDeploymentRecord(config, site.siteId);
      console.log('[NetlifyService] Created deployment record:', deploymentId);

      await this.deployments.updateStatus(deploymentId, 'building');

      console.log('[NetlifyService] Creating ZIP buffer for app:', config.appId);
      const zipBuffer = await this.createZipBuffer(config);
      console.log('[NetlifyService] ZIP buffer created:', {
        size: zipBuffer.length,
        sizeKB: (zipBuffer.length / 1024).toFixed(2)
      });

      if (zipBuffer.length < 100) {
        const errorMsg = 'ZIP file is empty or too small. No files found in the application workspace. Please ensure files have been created first.';
        console.error('[NetlifyService]', errorMsg);
        await this.updateDeploymentError(deploymentId, errorMsg);
        return {
          success: false,
          error: errorMsg
        };
      }

      // Upload to Netlify Build API
      const deployTitle = config.deployTitle || `Deploy from EitherWay - ${new Date().toISOString()}`;

      const formData = new FormData();
      formData.append('title', deployTitle);
      formData.append('zip', zipBuffer, {
        filename: 'site.zip',
        contentType: 'application/zip'
      });

      console.log('[NetlifyService] Uploading to Netlify Deploy API:', {
        url: `https://api.netlify.com/api/v1/sites/${site.netlifyId}/deploys`,
        title: deployTitle,
        siteId: site.netlifyId,
        zipSize: zipBuffer.length
      });

      // Netlify Deploy API expects the ZIP as the request body, not as multipart form-data
      // Deploy title goes in a header
      const deployResponse = await fetch(
        `https://api.netlify.com/api/v1/sites/${site.netlifyId}/deploys`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/zip',
            'Content-Length': zipBuffer.length.toString()
          },
          body: zipBuffer
        }
      );

      console.log('[NetlifyService] Netlify API response:', {
        status: deployResponse.status,
        statusText: deployResponse.statusText,
        ok: deployResponse.ok
      });

      if (!deployResponse.ok) {
        const errorText = await deployResponse.text();
        console.error('[NetlifyService] Netlify API error:', {
          status: deployResponse.status,
          statusText: deployResponse.statusText,
          errorText,
          headers: Object.fromEntries(deployResponse.headers.entries())
        });
        await this.updateDeploymentError(deploymentId, `Deploy failed: ${errorText}`);
        return {
          success: false,
          error: `Netlify deployment failed: ${deployResponse.status} ${deployResponse.statusText} - ${errorText}`
        };
      }

      const deployData = await deployResponse.json() as any;

      await this.updateDeploymentSuccess(deploymentId, site, deployData);

      await this.netlifySites.updateLastDeploy(site.siteId, deployData.deploy_id || deployData.id);

      return {
        success: true,
        siteId: site.siteId,
        deployId: deployData.deploy_id || deployData.id,
        siteUrl: site.url,
        adminUrl: site.adminUrl,
        deployUrl: deployData.deploy_url || site.url
      };

    } catch (error: any) {
      console.error('[NetlifyService] Deploy error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getLogsAccessToken(
    siteId: string,
    deployId: string,
    serverToken?: string
  ): Promise<NetlifyLogsAccessToken | null> {
    if (!serverToken) {
      console.warn('[NetlifyService] Server token not configured for logs access');
      return null;
    }

    try {
      const response = await fetch(
        `https://app.netlify.com/access-control/generate-access-control-token?deploy_id=${deployId}&site_id=${siteId}`,
        {
          headers: {
            'Authorization': `Bearer ${serverToken}`
          }
        }
      );

      if (!response.ok) {
        console.error('[NetlifyService] Failed to get logs access token:', response.status);
        return null;
      }

      const data = await response.json() as any;

      return {
        accessToken: data.access_token,
        siteId,
        deployId
      };
    } catch (error) {
      console.error('[NetlifyService] Error getting logs access token:', error);
      return null;
    }
  }

  /**
   * Check if project is a Vite/React project
   */
  private async isViteProject(appId: string): Promise<boolean> {
    try {
      const packageJsonContent = await this.fileStore.read(appId, 'package.json');
      if (!packageJsonContent || !packageJsonContent.content) {
        return false;
      }

      const packageJson = JSON.parse(packageJsonContent.content as string);

      // Check if vite is in dependencies or devDependencies
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      return Boolean(deps?.vite || deps?.['@vitejs/plugin-react']);
    } catch (error) {
      console.log('[NetlifyService] Could not detect Vite project:', error);
      return false;
    }
  }

  /**
   * Export all files to a temporary directory
   */
  private async exportFilesToTemp(appId: string, excludePatterns: string[]): Promise<string> {
    const tempDir = join(tmpdir(), `eitherway-deploy-${appId}-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    console.log('[NetlifyService] Exporting files to:', tempDir);

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
        console.error(`[NetlifyService] Failed to export file ${file.path}:`, error);
      }
    }

    console.log('[NetlifyService] Files exported to:', tempDir);
    return tempDir;
  }

  /**
   * Build Vite project
   */
  private async buildViteProject(tempDir: string): Promise<string> {
    console.log('[NetlifyService] Installing dependencies...');
    console.log('[NetlifyService] NODE_ENV:', process.env.NODE_ENV || 'undefined');
    console.log('[NetlifyService] Temp directory:', tempDir);

    try {
      // Verify package.json exists
      const packageJsonPath = join(tempDir, 'package.json');
      try {
        const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
        console.log('[NetlifyService] package.json found:', packageJsonContent.substring(0, 200));
      } catch (err) {
        throw new Error(`package.json not found in temp directory: ${tempDir}`);
      }

      // List files in temp dir for debugging
      const files = await readdir(tempDir);
      console.log('[NetlifyService] Files in temp dir:', files.join(', '));

      // Install dependencies - Use --production=false to force install of devDependencies
      // In production, NODE_ENV=production causes npm to skip devDependencies by default
      // But we need build tools like vite, which are typically in devDependencies
      console.log('[NetlifyService] Running: npm install --production=false');
      const { stdout: installOut, stderr: installErr } = await execAsync('npm install --production=false', {
        cwd: tempDir,
        timeout: 180000, // 3 minutes timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      console.log('[NetlifyService] npm install completed');
      if (installOut) {
        console.log('[NetlifyService] npm install output:', installOut.substring(0, 500));
      }
      if (installErr) {
        // Log all stderr, even warnings
        console.log('[NetlifyService] npm install stderr:', installErr.substring(0, 500));
        // Throw if stderr contains actual errors (not just warnings)
        if (installErr.toLowerCase().includes('error') && !installErr.toLowerCase().includes('npm warn')) {
          throw new Error(`npm install failed: ${installErr.substring(0, 1000)}`);
        }
      }

      // Verify vite is installed by checking if the module exists
      console.log('[NetlifyService] Verifying vite installation...');
      const viteModulePath = join(tempDir, 'node_modules', 'vite');
      try {
        await readdir(viteModulePath);
        console.log('[NetlifyService] Vite module found at:', viteModulePath);
      } catch (err) {
        throw new Error(`Vite not installed. node_modules/vite does not exist. npm install may have failed.`);
      }

      console.log('[NetlifyService] Building Vite project...');

      // Build the project
      const { stdout: buildOut, stderr: buildErr } = await execAsync('npm run build', {
        cwd: tempDir,
        timeout: 180000, // 3 minutes timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (buildOut) {
        console.log('[NetlifyService] npm run build output:', buildOut.substring(0, 500));
      }
      if (buildErr) {
        console.log('[NetlifyService] npm run build stderr:', buildErr.substring(0, 500));
        // Throw if build actually failed (not just warnings)
        if (buildErr.toLowerCase().includes('error') && !buildErr.toLowerCase().includes('warn')) {
          throw new Error(`Build failed: ${buildErr.substring(0, 1000)}`);
        }
      }

      console.log('[NetlifyService] Build completed successfully');

      // Verify dist folder exists
      const distPath = join(tempDir, 'dist');
      try {
        await readdir(distPath);
        console.log('[NetlifyService] Verified dist folder exists:', distPath);
      } catch (err) {
        throw new Error(`Build succeeded but dist folder not found at: ${distPath}`);
      }

      return distPath;
    } catch (error: any) {
      console.error('[NetlifyService] Build failed:', error);
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  /**
   * Create ZIP from a directory
   */
  private async createZipFromDirectory(sourceDir: string): Promise<Buffer> {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));

    const files = await this.getFilesRecursive(sourceDir);

    console.log('[NetlifyService] Adding', files.length, 'files to ZIP');

    for (const { relativePath, fullPath } of files) {
      archive.file(fullPath, { name: relativePath });
    }

    // Add Netlify configuration for SPA routing
    const netlifyToml = `[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
    archive.append(netlifyToml, { name: 'netlify.toml' });

    const finalizePromise = new Promise<void>((resolve, reject) => {
      archive.on('end', () => resolve());
      archive.on('error', (err: Error) => reject(err));
    });

    await archive.finalize();
    await finalizePromise;

    return Buffer.concat(chunks);
  }

  /**
   * Get all files recursively from a directory
   */
  private async getFilesRecursive(dir: string, baseDir: string = dir): Promise<Array<{ relativePath: string; fullPath: string }>> {
    const files: Array<{ relativePath: string; fullPath: string }> = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await this.getFilesRecursive(fullPath, baseDir);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const relativePath = fullPath.substring(baseDir.length + 1);
        files.push({ relativePath, fullPath });
      }
    }

    return files;
  }

  private async createZipBuffer(config: NetlifyDeployConfig): Promise<Buffer> {
    // Check if this is a Vite project
    const isVite = await this.isViteProject(config.appId);
    console.log('[NetlifyService] Project type:', isVite ? 'Vite/React (will build)' : 'Static (direct deploy)');

    // Default excludes
    const excludePatterns = ['.git', '.DS_Store', '.env', '.env.local'];
    if (!config.includeNodeModules) {
      excludePatterns.push('node_modules');
    }

    if (isVite) {
      // VITE PROJECT PATH: Build and deploy dist/
      let tempDir: string | null = null;
      let distDir: string | null = null;

      try {
        // Export files to temp directory
        tempDir = await this.exportFilesToTemp(config.appId, excludePatterns);

        // Build the project
        distDir = await this.buildViteProject(tempDir);

        // Create ZIP from dist directory
        const zipBuffer = await this.createZipFromDirectory(distDir);

        // Cleanup
        await rm(tempDir, { recursive: true, force: true });

        return zipBuffer;
      } catch (error) {
        // Cleanup on error
        console.error('[NetlifyService] Build failed, cleaning up temp dir:', tempDir);
        if (tempDir) {
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
        throw error;
      }
    } else {
      // STATIC PROJECT PATH: Direct deploy
      const archive = archiver('zip', { zlib: { level: 9 } });

      // Collect all chunks
      const chunks: Buffer[] = [];
      archive.on('data', (chunk: Buffer) => chunks.push(chunk));

      console.log('[NetlifyService] Fetching file tree for app:', config.appId);
      const fileTree = await this.fileStore.list(config.appId);
      console.log('[NetlifyService] File tree nodes:', fileTree.length);

      // Flatten tree
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
      console.log('[NetlifyService] Total files to zip:', files.length);
      if (files.length === 0) {
        console.warn('[NetlifyService] WARNING: No files found in app! ZIP will be empty!');
      } else {
        console.log('[NetlifyService] Files:', files.slice(0, 10).map(f => f.path).join(', '), files.length > 10 ? `... and ${files.length - 10} more` : '');
      }

      // Filter and add files
      for (const file of files) {
        // Skip excluded files
        if (this.shouldExclude(file.path, excludePatterns)) {
          continue;
        }

        try {
          const fileContent = await this.fileStore.read(config.appId, file.path);
          if (fileContent && fileContent.content) {
            let content: Buffer;

            if (typeof fileContent.content === 'string') {
              content = Buffer.from(fileContent.content, 'utf-8');
            } else if (fileContent.content instanceof Uint8Array) {
              content = Buffer.from(fileContent.content);
            } else {
              content = Buffer.from(fileContent.content as any);
            }

            archive.append(content, { name: file.path });
          }
        } catch (error) {
          console.error(`[NetlifyService] Failed to add file ${file.path}:`, error);
        }
      }

      // Add Netlify configuration for SPA routing (if index.html exists)
      const hasIndexHtml = files.some(f => f.path === 'index.html');
      if (hasIndexHtml) {
        const netlifyToml = `[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
        archive.append(netlifyToml, { name: 'netlify.toml' });
      }

      // Finalize and wait for completion
      const finalizePromise = new Promise<void>((resolve, reject) => {
        archive.on('end', () => resolve());
        archive.on('error', (err: Error) => reject(err));
      });

      await archive.finalize();
      await finalizePromise;

      return Buffer.concat(chunks);
    }
  }

  private shouldExclude(path: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (path.startsWith(pattern + '/') || path === pattern) {
        return true;
      }
    }
    return false;
  }

  private async createDeploymentRecord(
    config: NetlifyDeployConfig,
    netlifySiteId: string
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `INSERT INTO core.deployments (
        app_id, user_id, session_id, deployment_type,
        netlify_site_id, deploy_title, status, started_at
      )
      VALUES ($1, $2, $3, 'netlify', $4, $5, 'pending', now())
      RETURNING id`,
      [
        config.appId,
        config.userId,
        config.sessionId || null,
        netlifySiteId,
        config.deployTitle || `Deploy - ${new Date().toISOString()}`
      ]
    );

    return result.rows[0].id;
  }

  private async updateDeploymentSuccess(
    deploymentId: string,
    site: any,
    deployData: any
  ): Promise<void> {
    await this.db.query(
      `UPDATE core.deployments
       SET status = 'success',
           netlify_deploy_id = $1,
           deployment_url = $2,
           completed_at = now()
       WHERE id = $3`,
      [
        deployData.deploy_id || deployData.id,
        site.url,
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
