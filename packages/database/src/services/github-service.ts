/**
 * GitHub Service
 *
 * Service layer for interacting with GitHub API.
 * Handles token validation, repository creation, and file commits.
 *
 * Reference: https://docs.github.com/en/rest
 */

import type { DatabaseClient } from '../client.js';
import type { PostgresFileStore } from './file-store.js';
import { UserIntegrationsRepository } from '../repositories/netlify.js';
import nacl from 'tweetnacl';

// TYPES

export interface GitHubRepoConfig {
  appId: string;
  userId: string;
  owner?: string; // Defaults to authenticated user
  repo: string;
  visibility?: 'public' | 'private';
  description?: string;
  addCi?: boolean; // Whether to add CI workflow
  vercelToken?: string; // Optional Vercel token for CI secrets
}

export interface GitHubRepoResult {
  success: boolean;
  repoUrl?: string;
  htmlUrl?: string;
  cloneUrl?: string;
  defaultBranch?: string;
  error?: string;
}

export interface GitHubTokenValidationResult {
  valid: boolean;
  userId?: string;
  username?: string;
  email?: string;
  error?: string;
}

// GITHUB SERVICE

export class GitHubService {
  private fileStore: PostgresFileStore;
  private userIntegrations: UserIntegrationsRepository;

  constructor(
    _db: DatabaseClient,
    fileStore: PostgresFileStore,
    encryptionKey: string
  ) {
    this.fileStore = fileStore;
    this.userIntegrations = new UserIntegrationsRepository(_db, encryptionKey);
  }

  async validateToken(token: string): Promise<GitHubTokenValidationResult> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
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
        userId: data.id?.toString(),
        username: data.login,
        email: data.email
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
        service: 'github',
        token,
        service_user_id: validation.userId,
        service_email: validation.email,
        service_username: validation.username
      });

      // Mark as verified
      await this.userIntegrations.markVerified(userId, 'github');

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getUserToken(userId: string): Promise<string | null> {
    return await this.userIntegrations.getDecryptedToken(userId, 'github');
  }

  /**
   * Bootstrap a new GitHub repository with all workspace files
   * Uses Git Data API for efficient single-commit creation
   */
  async bootstrapRepository(config: GitHubRepoConfig): Promise<GitHubRepoResult> {
    try {
      const token = await this.getUserToken(config.userId);
      if (!token) {
        return {
          success: false,
          error: 'No GitHub token configured. Please add your token in settings.'
        };
      }

      console.log('[GitHubService] Starting repository bootstrap:', config.repo);

      // Get owner (default to authenticated user if not specified)
      let owner: string = config.owner || '';
      if (!owner) {
        const userResponse = await this.githubRequest(token, 'GET /user');
        if (!userResponse.ok) {
          return {
            success: false,
            error: 'Failed to get authenticated user information'
          };
        }
        const userData = await userResponse.json() as any;
        owner = userData.login;
      }

      // 1. Create repository with auto_init to avoid "empty repository" errors
      console.log('[GitHubService] Creating repository:', owner, '/', config.repo);
      const createRepoResponse = await this.githubRequest(token, 'POST /user/repos', {
        name: config.repo,
        private: config.visibility === 'private',
        description: config.description || 'Created via EitherWay',
        auto_init: true // Create initial commit to avoid empty repo errors
      });

      if (!createRepoResponse.ok) {
        const errorText = await createRepoResponse.text();
        return {
          success: false,
          error: `Failed to create repository: ${createRepoResponse.status} ${errorText}`
        };
      }

      const repoData = await createRepoResponse.json() as any;
      console.log('[GitHubService] Repository created:', repoData.html_url);

      // Wait for GitHub to initialize the repository
      console.log('[GitHubService] Waiting for GitHub to initialize repository...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Gather all files from workspace
      console.log('[GitHubService] Gathering files from workspace...');
      const fileTree = await this.fileStore.list(config.appId);
      const files = this.flattenFileTree(fileTree);

      // Exclude certain files
      const excludePatterns = ['.git', '.DS_Store', 'node_modules'];
      const filesToCommit = files.filter(f => !this.shouldExclude(f.path, excludePatterns));

      if (filesToCommit.length === 0) {
        return {
          success: false,
          error: 'No files found in workspace to commit'
        };
      }

      console.log('[GitHubService] Found', filesToCommit.length, 'files to commit');

      // 3. Get current branch and commit (from auto_init)
      const defaultBranch = repoData.default_branch || 'main';
      console.log('[GitHubService] Getting current branch:', defaultBranch);

      const refResponse = await this.githubRequest(token, `GET /repos/${owner}/${config.repo}/git/ref/heads/${defaultBranch}`);
      if (!refResponse.ok) {
        const errorText = await refResponse.text();
        return {
          success: false,
          error: `Failed to get branch reference: ${refResponse.status} ${errorText}`
        };
      }

      const refData = await refResponse.json() as any;
      const currentCommitSha = refData.object.sha;
      console.log('[GitHubService] Current commit SHA:', currentCommitSha);

      // 4. Get current commit to get base tree
      const commitResponse = await this.githubRequest(token, `GET /repos/${owner}/${config.repo}/git/commits/${currentCommitSha}`);
      if (!commitResponse.ok) {
        const errorText = await commitResponse.text();
        return {
          success: false,
          error: `Failed to get current commit: ${commitResponse.status} ${errorText}`
        };
      }

      const currentCommit = await commitResponse.json() as any;
      const baseTreeSha = currentCommit.tree.sha;
      console.log('[GitHubService] Base tree SHA:', baseTreeSha);

      // 5. Build tree entries with inline content
      console.log('[GitHubService] Preparing tree entries...');
      const treeEntries = await Promise.all(
        filesToCommit.map(async (file) => {
          const fileContent = await this.fileStore.read(config.appId, file.path);
          if (!fileContent || !fileContent.content) {
            console.error(`[GitHubService] Failed to read file ${file.path}: no content`);
            return null;
          }

          // Convert content to string for inline tree creation
          let contentString: string;
          if (typeof fileContent.content === 'string') {
            contentString = fileContent.content;
          } else {
            // For binary files, convert to base64 string
            const buffer = fileContent.content instanceof Uint8Array
              ? Buffer.from(fileContent.content)
              : Buffer.from(fileContent.content as any);
            contentString = buffer.toString('base64');
          }

          return {
            path: file.path,
            mode: '100644', // Regular file
            type: 'blob' as const,
            content: contentString // Inline content!
          };
        })
      );

      // Filter out any failed reads
      const validEntries = treeEntries.filter(e => e !== null) as Array<{
        path: string;
        mode: string;
        type: 'blob';
        content: string;
      }>;

      console.log('[GitHubService] Prepared', validEntries.length, 'tree entries');

      // 6. Create tree with inline content (based on existing tree)
      console.log('[GitHubService] Creating tree...');
      const treeResponse = await this.githubRequest(token, `POST /repos/${owner}/${config.repo}/git/trees`, {
        base_tree: baseTreeSha, // Build on existing tree from auto_init
        tree: validEntries
      });

      if (!treeResponse.ok) {
        const errorText = await treeResponse.text();
        return {
          success: false,
          error: `Failed to create tree: ${treeResponse.status} ${errorText}`
        };
      }

      const treeData = await treeResponse.json() as any;
      console.log('[GitHubService] Tree created:', treeData.sha);

      // 7. Create commit with parent
      console.log('[GitHubService] Creating commit...');
      const newCommitResponse = await this.githubRequest(token, `POST /repos/${owner}/${config.repo}/git/commits`, {
        message: 'Add application files from EitherWay',
        tree: treeData.sha,
        parents: [currentCommitSha] // Parent is the initial commit from auto_init
      });

      if (!newCommitResponse.ok) {
        const errorText = await newCommitResponse.text();
        return {
          success: false,
          error: `Failed to create commit: ${newCommitResponse.status} ${errorText}`
        };
      }

      const commitData = await newCommitResponse.json() as any;
      console.log('[GitHubService] Commit created:', commitData.sha);

      // 8. Update branch reference
      console.log('[GitHubService] Updating branch reference:', defaultBranch);

      const updateRefResponse = await this.githubRequest(token, `PATCH /repos/${owner}/${config.repo}/git/refs/heads/${defaultBranch}`, {
        sha: commitData.sha,
        force: false
      });

      if (!updateRefResponse.ok) {
        const errorText = await updateRefResponse.text();
        return {
          success: false,
          error: `Failed to update branch ref: ${updateRefResponse.status} ${errorText}`
        };
      }

      console.log('[GitHubService] Branch updated successfully');

      // 7. Optionally add CI workflow
      if (config.addCi && config.vercelToken) {
        console.log('[GitHubService] Adding CI workflow...');
        await this.addCiWorkflow(token, owner, config.repo, defaultBranch, config.vercelToken);
      }

      return {
        success: true,
        repoUrl: repoData.url,
        htmlUrl: repoData.html_url,
        cloneUrl: repoData.clone_url,
        defaultBranch
      };

    } catch (error: any) {
      console.error('[GitHubService] Bootstrap error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add CI workflow file and set Vercel token as secret
   */
  private async addCiWorkflow(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    vercelToken: string
  ): Promise<void> {
    try {
      // 1. Create workflow file content
      const workflowContent = `name: Deploy to Vercel

on:
  push:
    branches: [ ${branch} ]
  pull_request:
    branches: [ ${branch} ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to Vercel
        run: npx vercel --token \${{ secrets.VERCEL_TOKEN }} --prod --yes
        env:
          VERCEL_TOKEN: \${{ secrets.VERCEL_TOKEN }}
`;

      const workflowBase64 = Buffer.from(workflowContent, 'utf-8').toString('base64');

      // 2. Create workflow file using Contents API
      const workflowResponse = await this.githubRequest(token, `PUT /repos/${owner}/${repo}/contents/.github/workflows/deploy.yml`, {
        message: 'Add Vercel deployment workflow',
        content: workflowBase64,
        branch
      });

      if (!workflowResponse.ok) {
        console.error('[GitHubService] Failed to create workflow file:', await workflowResponse.text());
        return;
      }

      console.log('[GitHubService] Workflow file created');

      // 3. Get repository public key for secrets
      const keyResponse = await this.githubRequest(token, `GET /repos/${owner}/${repo}/actions/secrets/public-key`);

      if (!keyResponse.ok) {
        console.error('[GitHubService] Failed to get public key:', await keyResponse.text());
        return;
      }

      const keyData = await keyResponse.json() as any;

      // 4. Encrypt secret using libsodium (tweetnacl)
      console.log('[GitHubService] Encrypting Vercel token for Actions secret...');
      const encryptedValue = this.encryptSecret(vercelToken, keyData.key);

      // 5. Create the secret
      const secretResponse = await this.githubRequest(token, `PUT /repos/${owner}/${repo}/actions/secrets/VERCEL_TOKEN`, {
        encrypted_value: encryptedValue,
        key_id: keyData.key_id
      });

      if (!secretResponse.ok) {
        console.error('[GitHubService] Failed to create secret:', await secretResponse.text());
        console.warn('[GitHubService] To add the secret manually, go to:', `https://github.com/${owner}/${repo}/settings/secrets/actions`);
        console.warn('[GitHubService] Add secret VERCEL_TOKEN with your Vercel token value');
        return;
      }

      console.log('[GitHubService] Successfully created VERCEL_TOKEN secret');

    } catch (error: any) {
      console.error('[GitHubService] Failed to add CI workflow:', error);
    }
  }

  /**
   * Flatten file tree to simple array
   */
  private flattenFileTree(nodes: any[]): Array<{ path: string }> {
    const result: Array<{ path: string }> = [];
    for (const node of nodes) {
      if (node.type === 'file' && !node.isDirectory) {
        result.push({ path: node.path });
      }
      if (node.children && node.children.length > 0) {
        result.push(...this.flattenFileTree(node.children));
      }
    }
    return result;
  }

  private shouldExclude(path: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (path.startsWith(pattern + '/') || path === pattern) {
        return true;
      }
    }
    return false;
  }

  /**
   * Helper to make GitHub API requests
   */
  private async githubRequest(token: string, endpoint: string, body?: any): Promise<Response> {
    const [method, path] = endpoint.split(' ');

    const url = path.startsWith('http')
      ? path
      : `https://api.github.com${path}`;

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      }
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    return fetch(url, options);
  }

  /**
   * Encrypt a secret using libsodium sealed box (tweetnacl)
   * GitHub requires secrets to be encrypted with the repository's public key
   * Reference: https://docs.github.com/en/rest/actions/secrets#create-or-update-a-repository-secret
   */
  private encryptSecret(secret: string, publicKeyBase64: string): string {
    // Convert secret to Uint8Array
    const secretBytes = new TextEncoder().encode(secret);

    // Convert public key from base64 to Uint8Array
    const publicKeyBytes = Buffer.from(publicKeyBase64, 'base64');

    // Generate an ephemeral keypair for sealing
    const ephemeralKeyPair = nacl.box.keyPair();

    // Create a nonce (24 bytes of zeros for sealed box)
    const nonce = new Uint8Array(24);

    // Encrypt the secret
    const encrypted = nacl.box(secretBytes, nonce, publicKeyBytes, ephemeralKeyPair.secretKey);

    if (!encrypted) {
      throw new Error('Failed to encrypt secret');
    }

    // Concatenate ephemeral public key + encrypted message
    const sealedBox = new Uint8Array(ephemeralKeyPair.publicKey.length + encrypted.length);
    sealedBox.set(ephemeralKeyPair.publicKey, 0);
    sealedBox.set(encrypted, ephemeralKeyPair.publicKey.length);

    // Convert to base64
    return Buffer.from(sealedBox).toString('base64');
  }
}
