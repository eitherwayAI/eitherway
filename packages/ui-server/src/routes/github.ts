/**
 * GitHub API Routes
 *
 * Endpoints:
 * - POST   /api/github/validate-token       - Validate GitHub token and save it
 * - POST   /api/github/create-repo          - Create GitHub repository with workspace files
 * - GET    /api/github/integration          - Get user's GitHub integration
 * - DELETE /api/github/token                - Remove GitHub integration
 */

import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@eitherway/database';
import {
  GitHubService,
  PostgresFileStore,
  UserIntegrationsRepository,
  UsersRepository,
  SessionsRepository,
  AppsRepository
} from '@eitherway/database';

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function getOrCreateDemoUser(db: DatabaseClient): Promise<string> {
  const usersRepo = new UsersRepository(db);

  // Try to find existing demo user
  const existingUser = await usersRepo.findByEmail('demo-user@eitherway.local');
  if (existingUser) {
    return existingUser.id;
  }

  const demoUser = await usersRepo.create('demo-user@eitherway.local', 'Demo User');
  return demoUser.id;
}

export async function registerGithubRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient,
  workspaceDir: string
) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.warn('[GitHub] ENCRYPTION_KEY not set - GitHub integration will not work');
    return;
  }

  const fileStore = new PostgresFileStore(db);
  const githubService = new GitHubService(db, fileStore, encryptionKey);
  const userIntegrations = new UserIntegrationsRepository(db, encryptionKey);

  // TOKEN MANAGEMENT

  /**
   * POST /api/github/validate-token
   * Validate and save GitHub token
   */
  fastify.post<{
    Body: {
      userId: string;
      token: string;
    };
  }>('/api/github/validate-token', async (request, reply) => {
    let { userId, token } = request.body;

    if (!userId || !token) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: userId, token'
      });
    }

    try {
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      const result = await githubService.saveUserToken(userId, token);

      if (!result.success) {
        return reply.code(401).send({
          success: false,
          error: result.error || 'Failed to validate token'
        });
      }

      const integration = await userIntegrations.get(userId, 'github');

      return reply.code(200).send({
        success: true,
        message: 'Token validated and saved successfully',
        integration: integration ? {
          id: integration.id,
          service: integration.service,
          token_last_4: integration.token_last_4,
          service_email: integration.service_email,
          service_username: integration.service_username,
          is_verified: integration.is_verified,
          verified_at: integration.verified_at
        } : null
      });

    } catch (error: any) {
      console.error('[GitHub] Error validating token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to validate token',
        message: error.message
      });
    }
  });

  fastify.get<{
    Querystring: { userId: string };
  }>('/api/github/integration', async (request, reply) => {
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      const integration = await userIntegrations.get(userId, 'github');

      if (!integration) {
        return reply.code(404).send({
          success: false,
          error: 'No GitHub integration found'
        });
      }

      return reply.code(200).send({
        success: true,
        integration: {
          id: integration.id,
          service: integration.service,
          token_last_4: integration.token_last_4,
          service_email: integration.service_email,
          service_username: integration.service_username,
          is_verified: integration.is_verified,
          verified_at: integration.verified_at,
          last_used_at: integration.last_used_at
        }
      });

    } catch (error: any) {
      console.error('[GitHub] Error fetching integration:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch integration',
        message: error.message
      });
    }
  });

  fastify.delete<{
    Body: { userId: string };
  }>('/api/github/token', async (request, reply) => {
    const { userId } = request.body;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      const deleted = await userIntegrations.delete(userId, 'github');

      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'No GitHub integration found'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'GitHub integration removed successfully'
      });

    } catch (error: any) {
      console.error('[GitHub] Error removing token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to remove token',
        message: error.message
      });
    }
  });

  // REPOSITORY CREATION

  /**
   * POST /api/github/create-repo
   * Create GitHub repository and push all workspace files
   */
  fastify.post<{
    Body: {
      appId: string;
      userId: string;
      sessionId?: string;
      owner?: string;
      repo: string;
      visibility?: 'public' | 'private';
      description?: string;
      addCi?: boolean;
      vercelToken?: string;
    };
  }>('/api/github/create-repo', async (request, reply) => {
    let {
      appId,
      userId,
      sessionId,
      owner,
      repo,
      visibility,
      description,
      addCi,
      vercelToken
    } = request.body;

    if (!appId || !userId || !repo) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: appId, userId, repo'
      });
    }

    try {
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      // Ensure app exists in database (same logic as other services)
      const sessionsRepo = new SessionsRepository(db);
      const appsRepo = new AppsRepository(db);

      let validatedAppId = appId;

      if (sessionId && sessionId === appId) {
        console.log(`[GitHub] appId matches sessionId, looking up session: ${sessionId}`);
        const session = await sessionsRepo.findById(sessionId);

        if (!session) {
          return reply.code(404).send({
            success: false,
            error: 'Session not found'
          });
        }

        if (session.app_id) {
          validatedAppId = session.app_id;
          console.log(`[GitHub] Using existing app_id from session: ${validatedAppId}`);
        } else {
          console.log(`[GitHub] Session has no app_id, creating one...`);
          const appTitle = session.title || 'Generated App';
          const app = await appsRepo.create(session.user_id, appTitle, 'private');
          validatedAppId = app.id;

          await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
          console.log(`[GitHub] Created app: ${validatedAppId} for session: ${sessionId}`);
        }
      } else {
        // Verify that the appId exists in the apps table
        console.log(`[GitHub] Verifying app exists: ${appId}`);
        try {
          const app = await appsRepo.findById(appId);
          if (!app) {
            // If app doesn't exist and we have a sessionId, try to look up via session
            if (sessionId) {
              console.log(`[GitHub] App not found, trying to get from session: ${sessionId}`);
              const session = await sessionsRepo.findById(sessionId);

              if (session?.app_id) {
                validatedAppId = session.app_id;
                console.log(`[GitHub] Using app_id from session: ${validatedAppId}`);
              } else if (session) {
                const appTitle = session.title || 'Generated App';
                const newApp = await appsRepo.create(session.user_id, appTitle, 'private');
                validatedAppId = newApp.id;
                await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
                console.log(`[GitHub] Created app: ${validatedAppId} for session: ${sessionId}`);
              } else {
                return reply.code(404).send({
                  success: false,
                  error: 'Session not found'
                });
              }
            } else {
              return reply.code(404).send({
                success: false,
                error: 'App not found and no session provided to create one'
              });
            }
          }
        } catch (error: any) {
          console.error('[GitHub] Error verifying app:', error);
          return reply.code(400).send({
            success: false,
            error: `Invalid app ID: ${error.message}`
          });
        }
      }

      console.log(`[GitHub] Starting repository creation for app ${validatedAppId}`);

      const result = await githubService.bootstrapRepository({
        appId: validatedAppId,
        userId,
        owner,
        repo,
        visibility: visibility || 'private',
        description,
        addCi,
        vercelToken
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error || 'Repository creation failed'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Repository created successfully',
        data: {
          repoUrl: result.repoUrl,
          htmlUrl: result.htmlUrl,
          cloneUrl: result.cloneUrl,
          defaultBranch: result.defaultBranch
        }
      });

    } catch (error: any) {
      console.error('[GitHub] Repository creation error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Repository creation failed',
        message: error.message
      });
    }
  });

  console.log('[GitHub] Routes registered successfully');
}
