/**
 * Preview API Routes
 *
 * Endpoints:
 * - GET    /api/apps/:appId/preview/config           - Get preview configs
 * - POST   /api/apps/:appId/preview/config           - Create preview config
 * - PUT    /api/apps/:appId/preview/config/:id       - Update preview config
 * - DELETE /api/apps/:appId/preview/config/:id       - Delete preview config
 *
 * - POST   /api/apps/:appId/preview/pwa/validate     - Trigger PWA validation
 * - GET    /api/apps/:appId/preview/pwa/validations  - Get validation history
 * - GET    /api/apps/:appId/preview/pwa/latest       - Get latest validation
 * - GET    /api/apps/:appId/preview/pwa/summary      - Get validation summary
 *
 * - POST   /api/apps/:appId/preview/session          - Create preview session
 * - GET    /api/apps/:appId/preview/sessions         - Get active sessions
 * - DELETE /api/apps/:appId/preview/session/:id      - Deactivate session
 * - POST   /api/apps/:appId/preview/session/:id/extend - Extend session
 */

import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@eitherway/database';
import {
  PreviewConfigsRepository,
  PWAValidationsRepository,
  PreviewSessionsRepository,
  PWAValidator,
  type CreatePreviewConfigInput,
  type CreatePreviewSessionInput
} from '@eitherway/database';

export async function registerPreviewRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const previewConfigs = new PreviewConfigsRepository(db);
  const pwaValidations = new PWAValidationsRepository(db);
  const previewSessions = new PreviewSessionsRepository(db);
  const pwaValidator = new PWAValidator();

  // PREVIEW CONFIG ROUTES

  fastify.get<{
    Params: { appId: string };
  }>('/api/apps/:appId/preview/config', async (request, reply) => {
    const { appId } = request.params;

    try {
      const configs = await previewConfigs.getByAppId(appId);

      return reply.code(200).send({
        success: true,
        configs
      });
    } catch (error: any) {
      console.error('[Preview] Error fetching configs:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch preview configs',
        message: error.message
      });
    }
  });

  /**
   * POST /api/apps/:appId/preview/config
   * Create a new preview config
   */
  fastify.post<{
    Params: { appId: string };
    Body: Omit<CreatePreviewConfigInput, 'app_id'>;
  }>('/api/apps/:appId/preview/config', async (request, reply) => {
    const { appId } = request.params;
    const input = request.body;

    try {
      const config = await previewConfigs.create({
        ...input,
        app_id: appId
      });

      return reply.code(201).send({
        success: true,
        config
      });
    } catch (error: any) {
      console.error('[Preview] Error creating config:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to create preview config',
        message: error.message
      });
    }
  });

  /**
   * PUT /api/apps/:appId/preview/config/:id
   * Update a preview config
   */
  fastify.put<{
    Params: { appId: string; id: string };
    Body: Partial<Omit<CreatePreviewConfigInput, 'app_id' | 'user_id'>>;
  }>('/api/apps/:appId/preview/config/:id', async (request, reply) => {
    const { id } = request.params;
    const updates = request.body;

    try {
      const config = await previewConfigs.update(id, updates);

      if (!config) {
        return reply.code(404).send({
          success: false,
          error: 'Preview config not found'
        });
      }

      return reply.code(200).send({
        success: true,
        config
      });
    } catch (error: any) {
      console.error('[Preview] Error updating config:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update preview config',
        message: error.message
      });
    }
  });

  fastify.delete<{
    Params: { appId: string; id: string };
  }>('/api/apps/:appId/preview/config/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const deleted = await previewConfigs.delete(id);

      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'Preview config not found'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Preview config deleted'
      });
    } catch (error: any) {
      console.error('[Preview] Error deleting config:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete preview config',
        message: error.message
      });
    }
  });

  // PWA VALIDATION ROUTES

  /**
   * POST /api/apps/:appId/preview/pwa/validate
   * Trigger a new PWA validation
   */
  fastify.post<{
    Params: { appId: string };
    Body: {
      userId: string;
      url: string;
    };
  }>('/api/apps/:appId/preview/pwa/validate', async (request, reply) => {
    const { appId } = request.params;
    const { userId, url } = request.body;

    if (!url) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: url'
      });
    }

    try {
      // Run PWA validation
      console.log(`[Preview] Running PWA validation for ${url}...`);
      const result = await pwaValidator.validate(url);

      // Store validation result
      const validation = await pwaValidations.create({
        app_id: appId,
        user_id: userId,
        validation_url: url,
        result
      });

      return reply.code(200).send({
        success: true,
        validation,
        report: PWAValidator.generateReport(result)
      });
    } catch (error: any) {
      console.error('[Preview] Error running PWA validation:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to run PWA validation',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
    Querystring: { limit?: string };
  }>('/api/apps/:appId/preview/pwa/validations', async (request, reply) => {
    const { appId } = request.params;
    const limit = parseInt(request.query.limit || '10', 10);

    try {
      const validations = await pwaValidations.getByAppId(appId, limit);

      return reply.code(200).send({
        success: true,
        validations
      });
    } catch (error: any) {
      console.error('[Preview] Error fetching validations:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch PWA validations',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
  }>('/api/apps/:appId/preview/pwa/latest', async (request, reply) => {
    const { appId } = request.params;

    try {
      const validation = await pwaValidations.getLatestByAppId(appId);

      if (!validation) {
        return reply.code(404).send({
          success: false,
          error: 'No PWA validations found for this app'
        });
      }

      return reply.code(200).send({
        success: true,
        validation
      });
    } catch (error: any) {
      console.error('[Preview] Error fetching latest validation:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch latest PWA validation',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
  }>('/api/apps/:appId/preview/pwa/summary', async (request, reply) => {
    const { appId } = request.params;

    try {
      const summary = await pwaValidations.getSummary(appId);

      if (!summary) {
        return reply.code(404).send({
          success: false,
          error: 'No PWA validation summary available'
        });
      }

      return reply.code(200).send({
        success: true,
        summary
      });
    } catch (error: any) {
      console.error('[Preview] Error fetching summary:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch PWA validation summary',
        message: error.message
      });
    }
  });

  // PREVIEW SESSION ROUTES

  /**
   * POST /api/apps/:appId/preview/session
   * Create a new preview session
   */
  fastify.post<{
    Params: { appId: string };
    Body: Omit<CreatePreviewSessionInput, 'app_id'>;
  }>('/api/apps/:appId/preview/session', async (request, reply) => {
    const { appId } = request.params;
    const input = request.body;

    try {
      const session = await previewSessions.create({
        ...input,
        app_id: appId
      });

      return reply.code(201).send({
        success: true,
        session
      });
    } catch (error: any) {
      console.error('[Preview] Error creating session:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to create preview session',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
  }>('/api/apps/:appId/preview/sessions', async (request, reply) => {
    const { appId } = request.params;

    try {
      const sessions = await previewSessions.getActiveByAppId(appId);

      return reply.code(200).send({
        success: true,
        sessions
      });
    } catch (error: any) {
      console.error('[Preview] Error fetching sessions:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch preview sessions',
        message: error.message
      });
    }
  });

  fastify.delete<{
    Params: { appId: string; id: string };
  }>('/api/apps/:appId/preview/session/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const deactivated = await previewSessions.deactivate(id);

      if (!deactivated) {
        return reply.code(404).send({
          success: false,
          error: 'Preview session not found'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Preview session deactivated'
      });
    } catch (error: any) {
      console.error('[Preview] Error deactivating session:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to deactivate preview session',
        message: error.message
      });
    }
  });

  /**
   * POST /api/apps/:appId/preview/session/:id/extend
   * Extend preview session expiration
   */
  fastify.post<{
    Params: { appId: string; id: string };
    Body: { hours?: number };
  }>('/api/apps/:appId/preview/session/:id/extend', async (request, reply) => {
    const { id } = request.params;
    const { hours = 24 } = request.body;

    try {
      const session = await previewSessions.extend(id, hours);

      if (!session) {
        return reply.code(404).send({
          success: false,
          error: 'Preview session not found'
        });
      }

      return reply.code(200).send({
        success: true,
        session,
        message: `Session extended by ${hours} hours`
      });
    } catch (error: any) {
      console.error('[Preview] Error extending session:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to extend preview session',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { token: string };
  }>('/api/preview/session/:token', async (request, reply) => {
    const { token } = request.params;

    try {
      const session = await previewSessions.getByToken(token);

      if (!session) {
        return reply.code(404).send({
          success: false,
          error: 'Preview session not found or expired'
        });
      }

      await previewSessions.trackAccess(token);

      return reply.code(200).send({
        success: true,
        session
      });
    } catch (error: any) {
      console.error('[Preview] Error fetching session by token:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch preview session',
        message: error.message
      });
    }
  });

  console.log('[Preview] Routes registered successfully');
}
