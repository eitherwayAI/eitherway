/**
 * Netlify API Routes
 *
 * Endpoints:
 * - POST   /api/netlify/validate-token       - Validate Netlify PAT and save it
 * - POST   /api/netlify/deploy                - Deploy to Netlify
 * - GET    /api/netlify/sites                 - Get user's Netlify sites
 * - GET    /api/netlify/sites/:siteId         - Get specific site details
 * - GET    /api/netlify/logs/token            - Get WebSocket access token for logs
 * - DELETE /api/netlify/token                 - Remove Netlify integration
 */

import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@eitherway/database';
import {
  NetlifyService,
  PostgresFileStore,
  UserIntegrationsRepository,
  NetlifySitesRepository,
  DeploymentsRepository,
  UsersRepository,
  SessionsRepository,
  AppsRepository
} from '@eitherway/database';

// Helper to validate UUID
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Helper to get or create demo user
async function getOrCreateDemoUser(db: DatabaseClient): Promise<string> {
  const usersRepo = new UsersRepository(db);

  // Try to find existing demo user
  const existingUser = await usersRepo.findByEmail('demo-user@eitherway.local');
  if (existingUser) {
    return existingUser.id;
  }

  // Create demo user
  const demoUser = await usersRepo.create('demo-user@eitherway.local', 'Demo User');
  return demoUser.id;
}

export async function registerNetlifyRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient,
  workspaceDir: string
) {
  // Get encryption key from environment
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.warn('[Netlify] ENCRYPTION_KEY not set - Netlify integration will not work');
    return;
  }

  const fileStore = new PostgresFileStore(db);
  const netlifyService = new NetlifyService(db, fileStore, encryptionKey);
  const userIntegrations = new UserIntegrationsRepository(db, encryptionKey);
  const netlifySites = new NetlifySitesRepository(db);
  const deployments = new DeploymentsRepository(db);

  // ==========================================================================
  // TOKEN MANAGEMENT
  // ==========================================================================

  /**
   * POST /api/netlify/validate-token
   * Validate and save Netlify PAT
   */
  fastify.post<{
    Body: {
      userId: string;
      token: string;
    };
  }>('/api/netlify/validate-token', async (request, reply) => {
    let { userId, token } = request.body;

    if (!userId || !token) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: userId, token'
      });
    }

    try {
      // Handle demo/non-UUID userIds
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      const result = await netlifyService.saveUserToken(userId, token);

      if (!result.success) {
        return reply.code(401).send({
          success: false,
          error: result.error || 'Failed to validate token'
        });
      }

      // Get the saved integration to return safe info
      const integration = await userIntegrations.get(userId, 'netlify');

      return reply.code(200).send({
        success: true,
        message: 'Token validated and saved successfully',
        integration: integration ? {
          id: integration.id,
          service: integration.service,
          token_last_4: integration.token_last_4,
          service_email: integration.service_email,
          is_verified: integration.is_verified,
          verified_at: integration.verified_at
        } : null
      });

    } catch (error: any) {
      console.error('[Netlify] Error validating token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to validate token',
        message: error.message
      });
    }
  });

  /**
   * GET /api/netlify/integration
   * Get user's Netlify integration status
   */
  fastify.get<{
    Querystring: { userId: string };
  }>('/api/netlify/integration', async (request, reply) => {
    const { userId } = request.query;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      const integration = await userIntegrations.get(userId, 'netlify');

      if (!integration) {
        return reply.code(404).send({
          success: false,
          error: 'No Netlify integration found'
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
      console.error('[Netlify] Error fetching integration:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch integration',
        message: error.message
      });
    }
  });

  /**
   * DELETE /api/netlify/token
   * Remove Netlify integration
   */
  fastify.delete<{
    Body: { userId: string };
  }>('/api/netlify/token', async (request, reply) => {
    const { userId } = request.body;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      const deleted = await userIntegrations.delete(userId, 'netlify');

      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'No Netlify integration found'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Netlify integration removed successfully'
      });

    } catch (error: any) {
      console.error('[Netlify] Error removing token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to remove token',
        message: error.message
      });
    }
  });

  // ==========================================================================
  // DEPLOYMENT
  // ==========================================================================

  /**
   * POST /api/netlify/deploy
   * Deploy app to Netlify
   */
  fastify.post<{
    Body: {
      appId: string;
      userId: string;
      sessionId?: string;
      siteName?: string;
      deployTitle?: string;
      includeNodeModules?: boolean;
    };
  }>('/api/netlify/deploy', async (request, reply) => {
    let {
      appId,
      userId,
      sessionId,
      siteName,
      deployTitle,
      includeNodeModules
    } = request.body;

    if (!appId || !userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: appId, userId'
      });
    }

    try {
      // Handle demo/non-UUID userIds
      if (userId === 'demo-user' || !isValidUUID(userId)) {
        userId = await getOrCreateDemoUser(db);
      }

      // CRITICAL FIX: Ensure app exists in database
      // If sessionId provided, look up the session and get/create app_id
      // This mirrors the logic from server.ts WebSocket agent (lines 528-554)
      const sessionsRepo = new SessionsRepository(db);
      const appsRepo = new AppsRepository(db);

      let validatedAppId = appId;

      // Check if the provided appId is actually a sessionId
      if (sessionId && sessionId === appId) {
        console.log(`[Netlify] appId matches sessionId, looking up session: ${sessionId}`);
        const session = await sessionsRepo.findById(sessionId);

        if (!session) {
          return reply.code(404).send({
            success: false,
            error: 'Session not found'
          });
        }

        // Get or create app_id from session
        if (session.app_id) {
          validatedAppId = session.app_id;
          console.log(`[Netlify] Using existing app_id from session: ${validatedAppId}`);
        } else {
          // Create app for this session
          console.log(`[Netlify] Session has no app_id, creating one...`);
          const appTitle = session.title || 'Generated App';
          const app = await appsRepo.create(session.user_id, appTitle, 'private');
          validatedAppId = app.id;

          // Update session with app_id
          await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
          console.log(`[Netlify] Created app: ${validatedAppId} for session: ${sessionId}`);
        }
      } else {
        // Verify that the appId exists in the apps table
        console.log(`[Netlify] Verifying app exists: ${appId}`);
        try {
          const app = await appsRepo.findById(appId);
          if (!app) {
            // If app doesn't exist and we have a sessionId, try to look up via session
            if (sessionId) {
              console.log(`[Netlify] App not found, trying to get from session: ${sessionId}`);
              const session = await sessionsRepo.findById(sessionId);

              if (session?.app_id) {
                validatedAppId = session.app_id;
                console.log(`[Netlify] Using app_id from session: ${validatedAppId}`);
              } else if (session) {
                // Create app for this session
                const appTitle = session.title || 'Generated App';
                const newApp = await appsRepo.create(session.user_id, appTitle, 'private');
                validatedAppId = newApp.id;
                await sessionsRepo.update(sessionId, { app_id: validatedAppId } as any);
                console.log(`[Netlify] Created app: ${validatedAppId} for session: ${sessionId}`);
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
          console.error('[Netlify] Error verifying app:', error);
          return reply.code(400).send({
            success: false,
            error: `Invalid app ID: ${error.message}`
          });
        }
      }

      console.log(`[Netlify] Starting deployment for app ${validatedAppId}`);

      const result = await netlifyService.deploy({
        appId: validatedAppId,
        userId,
        sessionId,
        siteName,
        deployTitle,
        includeNodeModules
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
          siteId: result.siteId,
          deployId: result.deployId,
          siteUrl: result.siteUrl,
          adminUrl: result.adminUrl,
          deployUrl: result.deployUrl
        }
      });

    } catch (error: any) {
      console.error('[Netlify] Deployment error:', error);
      return reply.code(500).send({
        success: false,
        error: 'Deployment failed',
        message: error.message
      });
    }
  });

  // ==========================================================================
  // SITES MANAGEMENT
  // ==========================================================================

  /**
   * GET /api/netlify/sites
   * Get user's Netlify sites
   */
  fastify.get<{
    Querystring: { userId: string; limit?: string };
  }>('/api/netlify/sites', async (request, reply) => {
    const { userId, limit } = request.query;

    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    try {
      const sites = await netlifySites.getAllForUser(
        userId,
        limit ? parseInt(limit, 10) : 50
      );

      return reply.code(200).send({
        success: true,
        sites
      });

    } catch (error: any) {
      console.error('[Netlify] Error fetching sites:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch sites',
        message: error.message
      });
    }
  });

  /**
   * GET /api/netlify/sites/:siteId
   * Get specific site with deployment stats
   */
  fastify.get<{
    Params: { siteId: string };
  }>('/api/netlify/sites/:siteId', async (request, reply) => {
    const { siteId } = request.params;

    try {
      const site = await netlifySites.getWithStats(siteId);

      if (!site) {
        return reply.code(404).send({
          success: false,
          error: 'Site not found'
        });
      }

      return reply.code(200).send({
        success: true,
        site
      });

    } catch (error: any) {
      console.error('[Netlify] Error fetching site:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch site',
        message: error.message
      });
    }
  });

  /**
   * GET /api/netlify/sites/app/:appId
   * Get Netlify site for a specific app
   */
  fastify.get<{
    Params: { appId: string };
  }>('/api/netlify/sites/app/:appId', async (request, reply) => {
    const { appId } = request.params;

    try {
      const site = await netlifySites.getByAppId(appId);

      if (!site) {
        return reply.code(404).send({
          success: false,
          error: 'No site found for this app'
        });
      }

      return reply.code(200).send({
        success: true,
        site
      });

    } catch (error: any) {
      console.error('[Netlify] Error fetching site by app:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch site',
        message: error.message
      });
    }
  });

  // ==========================================================================
  // DEPLOYMENT HISTORY
  // ==========================================================================

  /**
   * GET /api/netlify/deployments/:appId
   * Get deployment history for an app
   */
  fastify.get<{
    Params: { appId: string };
    Querystring: { limit?: string };
  }>('/api/netlify/deployments/:appId', async (request, reply) => {
    const { appId } = request.params;
    const limit = parseInt(request.query.limit || '20', 10);

    try {
      // Get deployments filtered by Netlify type
      const allDeployments = await deployments.getByAppId(appId, limit);
      const netlifyDeployments = allDeployments.filter(
        d => d.deployment_type === 'netlify'
      );

      return reply.code(200).send({
        success: true,
        deployments: netlifyDeployments
      });

    } catch (error: any) {
      console.error('[Netlify] Error fetching deployments:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployments',
        message: error.message
      });
    }
  });

  /**
   * GET /api/netlify/deployments/:appId/:deploymentId
   * Get specific deployment details
   */
  fastify.get<{
    Params: { appId: string; deploymentId: string };
  }>('/api/netlify/deployments/:appId/:deploymentId', async (request, reply) => {
    const { deploymentId } = request.params;

    try {
      const deployment = await deployments.getById(deploymentId);

      if (!deployment) {
        return reply.code(404).send({
          success: false,
          error: 'Deployment not found'
        });
      }

      return reply.code(200).send({
        success: true,
        deployment
      });

    } catch (error: any) {
      console.error('[Netlify] Error fetching deployment:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployment',
        message: error.message
      });
    }
  });

  // ==========================================================================
  // LOGS ACCESS
  // ==========================================================================

  /**
   * GET /api/netlify/logs/token
   * Get WebSocket access token for Netlify logs
   * (Requires server-level Netlify token)
   */
  fastify.get<{
    Querystring: {
      siteId: string;
      deployId: string;
    };
  }>('/api/netlify/logs/token', async (request, reply) => {
    const { siteId, deployId } = request.query;

    if (!siteId || !deployId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: siteId, deployId'
      });
    }

    try {
      const serverToken = process.env.NETLIFY_SERVER_TOKEN;
      const accessToken = await netlifyService.getLogsAccessToken(
        siteId,
        deployId,
        serverToken
      );

      if (!accessToken) {
        return reply.code(503).send({
          success: false,
          error: 'Logs access not configured. Please set NETLIFY_SERVER_TOKEN.'
        });
      }

      return reply.code(200).send({
        success: true,
        accessToken: accessToken.accessToken,
        siteId: accessToken.siteId,
        deployId: accessToken.deployId,
        websocketUrl: 'wss://socketeer.services.netlify.com/build/logs'
      });

    } catch (error: any) {
      console.error('[Netlify] Error getting logs token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get logs access token',
        message: error.message
      });
    }
  });

  console.log('[Netlify] Routes registered successfully');
}
