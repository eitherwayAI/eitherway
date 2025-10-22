/**
 * Vercel API Routes
 *
 * Endpoints:
 * - POST   /api/vercel/validate-token       - Validate Vercel token and save it
 * - POST   /api/vercel/deploy                - Deploy to Vercel
 * - GET    /api/vercel/integration           - Get user's Vercel integration
 * - DELETE /api/vercel/token                 - Remove Vercel integration
 */

import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@eitherway/database';
import {
  VercelService,
  PostgresFileStore,
  UserIntegrationsRepository,
  DeploymentsRepository,
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

export async function registerVercelRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient,
  workspaceDir: string
) {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.warn('[Vercel] ENCRYPTION_KEY not set - Vercel integration will not work');
    return;
  }

  const fileStore = new PostgresFileStore(db);
  const vercelService = new VercelService(db, fileStore, encryptionKey);
  const userIntegrations = new UserIntegrationsRepository(db, encryptionKey);
  const deployments = new DeploymentsRepository(db);

  // TOKEN MANAGEMENT

  /**
   * POST /api/vercel/validate-token
   * Validate and save Vercel token
   */
  fastify.post<{
    Body: {
      userId: string;
      token: string;
    };
  }>('/api/vercel/validate-token', async (request, reply) => {
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

      const result = await vercelService.saveUserToken(userId, token);

      if (!result.success) {
        return reply.code(401).send({
          success: false,
          error: result.error || 'Failed to validate token'
        });
      }

      const integration = await userIntegrations.get(userId, 'vercel');

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
      console.error('[Vercel] Error validating token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to validate token',
        message: error.message
      });
    }
  });

  fastify.get<{
    Querystring: { userId: string };
  }>('/api/vercel/integration', async (request, reply) => {
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      const integration = await userIntegrations.get(userId, 'vercel');

      if (!integration) {
        return reply.code(404).send({
          success: false,
          error: 'No Vercel integration found'
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
      console.error('[Vercel] Error fetching integration:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch integration',
        message: error.message
      });
    }
  });

  fastify.delete<{
    Body: { userId: string };
  }>('/api/vercel/token', async (request, reply) => {
    const { userId } = request.body;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      const deleted = await userIntegrations.delete(userId, 'vercel');

      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'No Vercel integration found'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Vercel integration removed successfully'
      });

    } catch (error: any) {
      console.error('[Vercel] Error removing token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to remove token',
        message: error.message
      });
    }
  });

  // DEPLOYMENT

  /**
   * POST /api/vercel/deploy
   * Deploy app to Vercel
   */
  fastify.post<{
    Body: {
      appId: string;
      userId: string;
      sessionId?: string;
      teamId?: string;
      projectName?: string;
      outputDir?: string;
    };
  }>('/api/vercel/deploy', async (request, reply) => {
    let {
      appId,
      userId,
      sessionId,
      teamId,
      projectName,
      outputDir
    } = request.body;

    if (!appId || !userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: appId, userId'
      });
    }

    try {
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      // Ensure app exists in database (same logic as Netlify)
      const sessionsRepo = new SessionsRepository(db);
      const appsRepo = new AppsRepository(db);

      let validatedAppId = appId;

      if (sessionId && sessionId === appId) {
        console.log(`[Vercel] appId matches sessionId, looking up session: ${sessionId}`);
        const session = await sessionsRepo.findById(sessionId);

        if (!session) {
          return reply.code(404).send({
            success: false,
            error: 'Session not found'
          });
        }

        if (session.app_id) {
          validatedAppId = session.app_id;
          console.log(`[Vercel] Using existing app_id from session: ${validatedAppId}`);
        } else {
          console.log(`[Vercel] Session has no app_id, creating one...`);
          const appTitle = session.title || 'Generated App';
          const app = await appsRepo.create(session.user_id, appTitle, 'private');
          validatedAppId = app.id;

          await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
          console.log(`[Vercel] Created app: ${validatedAppId} for session: ${sessionId}`);
        }
      } else {
        // Verify that the appId exists in the apps table
        console.log(`[Vercel] Verifying app exists: ${appId}`);
        try {
          const app = await appsRepo.findById(appId);
          if (!app) {
            // If app doesn't exist and we have a sessionId, try to look up via session
            if (sessionId) {
              console.log(`[Vercel] App not found, trying to get from session: ${sessionId}`);
              const session = await sessionsRepo.findById(sessionId);

              if (session?.app_id) {
                validatedAppId = session.app_id;
                console.log(`[Vercel] Using app_id from session: ${validatedAppId}`);
              } else if (session) {
                const appTitle = session.title || 'Generated App';
                const newApp = await appsRepo.create(session.user_id, appTitle, 'private');
                validatedAppId = newApp.id;
                await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
                console.log(`[Vercel] Created app: ${validatedAppId} for session: ${sessionId}`);
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
          console.error('[Vercel] Error verifying app:', error);
          return reply.code(400).send({
            success: false,
            error: `Invalid app ID: ${error.message}`
          });
        }
      }

      console.log(`[Vercel] Starting deployment for app ${validatedAppId}`);

      const result = await vercelService.deployStatic({
        appId: validatedAppId,
        userId,
        sessionId,
        teamId,
        projectName,
        outputDir
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error || 'Deployment failed'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Deployment initiated successfully',
        data: {
          deploymentId: result.deploymentId,
          deploymentUrl: result.deploymentUrl,
          inspectorUrl: result.inspectorUrl
        }
      });

    } catch (error: any) {
      console.error('[Vercel] Deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Deployment failed',
        message: error.message
      });
    }
  });

  /**
   * POST /api/vercel/deploy-github
   * Deploy to Vercel with GitHub integration
   */
  fastify.post<{
    Body: {
      appId: string;
      userId: string;
      sessionId?: string;
      githubToken: string;
      vercelToken: string;
      repoName: string;
      repoVisibility?: 'public' | 'private';
      teamId?: string;
    };
  }>('/api/vercel/deploy-github', async (request, reply) => {
    let {
      appId,
      userId,
      sessionId,
      githubToken,
      vercelToken,
      repoName,
      repoVisibility,
      teamId
    } = request.body;

    if (!appId || !userId || !githubToken || !vercelToken || !repoName) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: appId, userId, githubToken, vercelToken, repoName'
      });
    }

    try {
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      // App validation (same as regular deploy)
      const sessionsRepo = new SessionsRepository(db);
      const appsRepo = new AppsRepository(db);

      let validatedAppId = appId;

      if (sessionId && sessionId === appId) {
        console.log(`[Vercel-GitHub] appId matches sessionId, looking up session: ${sessionId}`);
        const session = await sessionsRepo.findById(sessionId);

        if (!session) {
          return reply.code(404).send({
            success: false,
            error: 'Session not found'
          });
        }

        if (session.app_id) {
          validatedAppId = session.app_id;
          console.log(`[Vercel-GitHub] Using existing app_id from session: ${validatedAppId}`);
        } else {
          console.log(`[Vercel-GitHub] Session has no app_id, creating one...`);
          const appTitle = session.title || 'Generated App';
          const app = await appsRepo.create(session.user_id, appTitle, 'private');
          validatedAppId = app.id;

          await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
          console.log(`[Vercel-GitHub] Created app: ${validatedAppId} for session: ${sessionId}`);
        }
      } else {
        console.log(`[Vercel-GitHub] Verifying app exists: ${appId}`);
        try {
          const app = await appsRepo.findById(appId);
          if (!app) {
            if (sessionId) {
              console.log(`[Vercel-GitHub] App not found, trying to get from session: ${sessionId}`);
              const session = await sessionsRepo.findById(sessionId);

              if (session?.app_id) {
                validatedAppId = session.app_id;
                console.log(`[Vercel-GitHub] Found app from session: ${validatedAppId}`);
              } else {
                console.log(`[Vercel-GitHub] Session exists but has no app, creating one...`);
                const appTitle = session?.title || 'Generated App';
                const newApp = await appsRepo.create(userId, appTitle, 'private');
                validatedAppId = newApp.id;

                await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
                console.log(`[Vercel-GitHub] Created app: ${validatedAppId} for session: ${sessionId}`);
              }
            } else {
              return reply.code(404).send({
                success: false,
                error: 'App not found and no session provided'
              });
            }
          }
        } catch (error: any) {
          console.error('[Vercel-GitHub] Error verifying app:', error);
          return reply.code(400).send({
            success: false,
            error: `Invalid app ID: ${error.message}`
          });
        }
      }

      console.log(`[Vercel-GitHub] Starting GitHub-integrated deployment for app ${validatedAppId}`);

      const result = await vercelService.deployWithGitHub({
        appId: validatedAppId,
        userId,
        sessionId,
        githubToken,
        vercelToken,
        repoName,
        repoVisibility,
        teamId
      });

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: result.error || 'Deployment failed'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'GitHub-integrated deployment successful',
        data: {
          repoUrl: result.repoUrl,
          repoFullName: result.repoFullName,
          projectId: result.projectId,
          projectName: result.projectName,
          deploymentUrl: result.deploymentUrl
        }
      });

    } catch (error: any) {
      console.error('[Vercel-GitHub] Deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Deployment failed',
        message: error.message
      });
    }
  });

  // DEPLOYMENT HISTORY

  fastify.get<{
    Params: { appId: string };
    Querystring: { limit?: string };
  }>('/api/vercel/deployments/:appId', async (request, reply) => {
    const { appId } = request.params;
    const limit = parseInt(request.query.limit || '20', 10);

    try {
      const allDeployments = await deployments.getByAppId(appId, limit);
      const vercelDeployments = allDeployments.filter(
        d => d.deployment_type === 'vercel'
      );

      return reply.code(200).send({
        success: true,
        deployments: vercelDeployments
      });

    } catch (error: any) {
      console.error('[Vercel] Error fetching deployments:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployments',
        message: error.message
      });
    }
  });

  console.log('[Vercel] Routes registered successfully');
}
