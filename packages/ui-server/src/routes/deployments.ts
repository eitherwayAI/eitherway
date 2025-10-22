/**
 * Deployment & Export API Routes
 *
 * Endpoints:
 * - POST   /api/apps/:appId/deploy/github-pages     - Deploy to GitHub Pages
 * - GET    /api/apps/:appId/deploy/history          - Get deployment history
 * - GET    /api/apps/:appId/deploy/:id              - Get deployment details
 * - GET    /api/apps/:appId/deploy/:id/logs         - Get deployment logs
 * - DELETE /api/apps/:appId/deploy/:id              - Cancel deployment
 *
 * - POST   /api/apps/:appId/export                  - Create ZIP export
 * - GET    /api/apps/:appId/export/history          - Get export history
 * - GET    /api/apps/:appId/export/:id/download     - Download export
 */

import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@eitherway/database';
import {
  DeploymentsRepository,
  ExportsRepository,
  DeploymentService,
  ExportService,
  PostgresFileStore,
  type DeploymentConfig,
  type ExportConfig
} from '@eitherway/database';
import { join } from 'path';

export async function registerDeploymentRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient,
  workspaceDir: string
) {
  const deploymentsRepo = new DeploymentsRepository(db);
  const exportsRepo = new ExportsRepository(db);
  const deploymentService = new DeploymentService(db);
  const fileStore = new PostgresFileStore(db);
  const exportService = new ExportService(db, fileStore);

  // DEPLOYMENT ROUTES

  /**
   * POST /api/apps/:appId/deploy/github-pages
   * Deploy app to GitHub Pages
   */
  fastify.post<{
    Params: { appId: string };
    Body: {
      userId: string;
      sessionId?: string;
      repositoryUrl: string;
      branch?: string;
      buildCommand?: string;
      outputDirectory?: string;
      environmentVars?: Record<string, string>;
    };
  }>('/api/apps/:appId/deploy/github-pages', async (request, reply) => {
    const { appId } = request.params;
    const {
      userId,
      sessionId,
      repositoryUrl,
      branch,
      buildCommand,
      outputDirectory,
      environmentVars
    } = request.body;

    if (!repositoryUrl) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required field: repositoryUrl'
      });
    }

    try {
      const config: DeploymentConfig = {
        appId,
        userId,
        sessionId,
        repositoryUrl,
        branch,
        buildCommand,
        outputDirectory,
        environmentVars
      };

      // Start deployment in background
      deploymentService.deployToGitHubPages(config, join(workspaceDir, appId))
        .then(result => {
          console.log(`[Deployment] ${result.status} for app ${appId}:`, result.deploymentUrl || result.error);
        })
        .catch(error => {
          console.error(`[Deployment] Error for app ${appId}:`, error);
        });

      return reply.code(202).send({
        success: true,
        message: 'Deployment started',
        appId
      });

    } catch (error: any) {
      console.error('[Deployment] Error starting deployment:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to start deployment',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
    Querystring: { limit?: string };
  }>('/api/apps/:appId/deploy/history', async (request, reply) => {
    const { appId } = request.params;
    const limit = parseInt(request.query.limit || '20', 10);

    try {
      const deployments = await deploymentsRepo.getByAppId(appId, limit);

      return reply.code(200).send({
        success: true,
        deployments
      });
    } catch (error: any) {
      console.error('[Deployment] Error fetching history:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployment history',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string; id: string };
  }>('/api/apps/:appId/deploy/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const deployment = await deploymentsRepo.getById(id);

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
      console.error('[Deployment] Error fetching deployment:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployment',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string; id: string };
  }>('/api/apps/:appId/deploy/:id/logs', async (request, reply) => {
    const { id } = request.params;

    try {
      const logs = await deploymentsRepo.getLogs(id);

      return reply.code(200).send({
        success: true,
        logs
      });
    } catch (error: any) {
      console.error('[Deployment] Error fetching logs:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployment logs',
        message: error.message
      });
    }
  });

  fastify.delete<{
    Params: { appId: string; id: string };
  }>('/api/apps/:appId/deploy/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const cancelled = await deploymentsRepo.cancel(id);

      if (!cancelled) {
        return reply.code(404).send({
          success: false,
          error: 'Deployment not found or already completed'
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Deployment cancelled'
      });
    } catch (error: any) {
      console.error('[Deployment] Error cancelling deployment:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to cancel deployment',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
  }>('/api/apps/:appId/deploy/summary', async (request, reply) => {
    const { appId } = request.params;

    try {
      const summary = await deploymentsRepo.getSummary(appId);

      if (!summary) {
        return reply.code(404).send({
          success: false,
          error: 'No deployment summary available'
        });
      }

      return reply.code(200).send({
        success: true,
        summary
      });
    } catch (error: any) {
      console.error('[Deployment] Error fetching summary:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployment summary',
        message: error.message
      });
    }
  });

  /**
   * GET /api/apps/:appId/deploy/status
   * Get latest deployment status for each provider (netlify, vercel, github)
   */
  fastify.get<{
    Params: { appId: string };
  }>('/api/apps/:appId/deploy/status', async (request, reply) => {
    const { appId } = request.params;

    try {
      const deployments = await deploymentsRepo.getLatestByType(appId);

      return reply.code(200).send({
        success: true,
        deployments: {
          netlify: deployments.netlify ? {
            id: deployments.netlify.id,
            status: deployments.netlify.status,
            deploymentUrl: deployments.netlify.deployment_url,
            repositoryUrl: deployments.netlify.repository_url,
            createdAt: deployments.netlify.created_at,
            completedAt: deployments.netlify.completed_at
          } : null,
          vercel: deployments.vercel ? {
            id: deployments.vercel.id,
            status: deployments.vercel.status,
            deploymentUrl: deployments.vercel.deployment_url,
            createdAt: deployments.vercel.created_at,
            completedAt: deployments.vercel.completed_at
          } : null,
          github: deployments.github ? {
            id: deployments.github.id,
            status: deployments.github.status,
            deploymentUrl: deployments.github.deployment_url,
            repositoryUrl: deployments.github.repository_url,
            branch: deployments.github.branch,
            createdAt: deployments.github.created_at,
            completedAt: deployments.github.completed_at
          } : null
        }
      });
    } catch (error: any) {
      console.error('[Deployment] Error fetching status:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch deployment status',
        message: error.message
      });
    }
  });

  // EXPORT ROUTES

  /**
   * POST /api/apps/:appId/export
   * Create ZIP export (appId can be sessionId or actual appId)
   */
  fastify.post<{
    Params: { appId: string };
    Body: {
      userId: string;
      sessionId?: string;
      includeNodeModules?: boolean;
      includeGitHistory?: boolean;
      excludePatterns?: string[];
    };
  }>('/api/apps/:appId/export', async (request, reply) => {
    let { appId } = request.params;
    const {
      userId,
      sessionId,
      includeNodeModules,
      includeGitHistory,
      excludePatterns
    } = request.body;

    try {
      // If appId looks like a session ID or doesn't exist, get it from session
      const { SessionsRepository } = await import('@eitherway/database');
      const sessionsRepo = new SessionsRepository(db);

      const sessionToUse = sessionId || appId;
      const session = await sessionsRepo.findById(sessionToUse);

      let actualUserId = userId;

      if (session && session.app_id) {
        appId = session.app_id;
        // Use the session's user_id if available (it's a proper UUID)
        if (session.user_id) {
          actualUserId = session.user_id;
        }
        console.log(`[Export] Using app_id ${appId} from session ${sessionToUse}`);
      } else if (!session) {
        // Try to use appId directly if it's an actual app ID
        console.log(`[Export] Using appId ${appId} directly`);
      } else {
        return reply.code(400).send({
          success: false,
          error: 'No files found',
          message: 'Session has no associated app or files'
        });
      }

      const config: ExportConfig = {
        appId,
        userId: actualUserId,
        sessionId: sessionToUse,
        exportType: 'zip',
        includeNodeModules,
        includeGitHistory,
        excludePatterns
      };

      const { buffer, exportId, stats } = await exportService.createZipExport(config);

      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', `attachment; filename="app-${appId}-${Date.now()}.zip"`);
      reply.header('Content-Length', buffer.length.toString());
      reply.header('X-Export-Id', exportId);
      reply.header('X-File-Count', stats.fileCount.toString());
      reply.header('X-Total-Size', stats.totalSizeBytes.toString());

      await exportsRepo.trackDownload(exportId);

      return reply.send(buffer);

    } catch (error: any) {
      console.error('[Export] Error creating export:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to create export',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
    Querystring: { limit?: string };
  }>('/api/apps/:appId/export/history', async (request, reply) => {
    const { appId } = request.params;
    const limit = parseInt(request.query.limit || '20', 10);

    try {
      const exports = await exportsRepo.getByAppId(appId, limit);

      return reply.code(200).send({
        success: true,
        exports
      });
    } catch (error: any) {
      console.error('[Export] Error fetching history:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch export history',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { appId: string };
  }>('/api/apps/:appId/export/statistics', async (request, reply) => {
    const { appId } = request.params;

    try {
      const statistics = await exportsRepo.getStatistics(appId);

      if (!statistics) {
        return reply.code(404).send({
          success: false,
          error: 'No export statistics available'
        });
      }

      return reply.code(200).send({
        success: true,
        statistics
      });
    } catch (error: any) {
      console.error('[Export] Error fetching statistics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch export statistics',
        message: error.message
      });
    }
  });

  console.log('[Deployment] Routes registered successfully');
}
