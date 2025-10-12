/**
 * Plan Execution API Routes
 *
 * Endpoints:
 * - POST /api/projects/apply-plan - Execute a validated plan
 * - GET /api/projects/plans/:planId - Get plan execution status
 */

import { FastifyInstance } from 'fastify';
import {
  DatabaseClient,
  SessionsRepository,
  AppsRepository,
  EventsRepository,
  PlanValidator,
  PlanExecutor
} from '@eitherway/database';

export async function registerPlanRoutes(
  fastify: FastifyInstance,
  db: DatabaseClient
) {
  const validator = new PlanValidator();
  const executor = new PlanExecutor(db);
  const sessionsRepo = new SessionsRepository(db);
  const appsRepo = new AppsRepository(db);
  const eventsRepo = new EventsRepository(db);

  /**
   * POST /api/projects/apply-plan
   *
   * Execute a validated plan with security checks and progress tracking
   */
  fastify.post<{
    Body: {
      planId: string;
      sessionId: string;
      operations: any[];
    };
  }>('/api/projects/apply-plan', async (request, reply) => {
    const { planId, sessionId, operations } = request.body;

    console.log(`[Plan API] Received plan execution request: ${planId} with ${operations?.length || 0} operations`);

    if (!planId || !sessionId || !operations) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: ['planId, sessionId, and operations are required']
      });
    }

    // Phase 1: Validate plan structure and security
    const validation = validator.validate({ planId, sessionId, operations });

    if (!validation.success) {
      console.log(`[Plan API] Validation failed for plan ${planId}:`, validation.errors);

      await eventsRepo.log('plan.validation_failed', {
        planId,
        errors: validation.errors
      }, { sessionId, appId: undefined, actor: 'user' });

      return reply.code(400).send({
        error: 'Invalid plan',
        details: validation.errors
      });
    }

    const plan = validation.plan;

    // Phase 2: Get or create session and app
    const session = await sessionsRepo.findById(sessionId);

    if (!session) {
      console.log(`[Plan API] Session not found: ${sessionId}`);
      return reply.code(404).send({ error: 'Session not found' });
    }

    let appId = session.app_id;

    // Auto-create app if needed (same pattern as session-files.ts)
    if (!appId) {
      console.log('[Plan API] No app_id found, creating new app for session:', sessionId);

      try {
        const app = await appsRepo.create(
          session.user_id,
          session.title || 'Generated App',
          'private'
        );
        appId = app.id;

        await sessionsRepo.update(sessionId, { app_id: appId } as any);
        console.log(`[Plan API] Created app ${appId} for session ${sessionId}`);
      } catch (error: any) {
        console.error('[Plan API] Failed to create app:', error);
        return reply.code(500).send({
          error: 'Failed to create application workspace',
          message: error.message
        });
      }
    }

    // Phase 3: Log plan start
    await eventsRepo.log('plan.started', {
      planId,
      operationCount: operations.length,
      operationTypes: operations.map((op: any) => op.type)
    }, { sessionId, appId, actor: 'user' });

    // Phase 4: Execute plan
    try {
      console.log(`[Plan API] Executing plan ${planId} on app ${appId}`);

      const result = await executor.execute(plan, appId);

      console.log(`[Plan API] Plan ${planId} executed: ${result.status} (${result.succeededOps}/${result.totalOps} succeeded)`);

      await eventsRepo.log('plan.completed', {
        planId,
        status: result.status,
        succeeded: result.succeededOps,
        failed: result.failedOps,
        skipped: result.skippedOps,
        durationMs: result.durationMs
      }, { sessionId, appId, actor: 'system' });

      return {
        success: true,
        result: {
          planId: result.planId,
          status: result.status,
          summary: {
            total: result.totalOps,
            succeeded: result.succeededOps,
            failed: result.failedOps,
            skipped: result.skippedOps
          },
          durationMs: result.durationMs,
          logPath: result.logPath
        }
      };

    } catch (error: any) {
      console.error('[Plan API] Plan execution failed:', error);

      await eventsRepo.log('plan.failed', {
        planId,
        error: error.message,
        stack: error.stack
      }, { sessionId, appId, actor: 'system' });

      return reply.code(500).send({
        error: 'Plan execution failed',
        message: error.message
      });
    }
  });

  fastify.get<{
    Params: { planId: string };
  }>('/api/projects/plans/:planId', async (request, reply) => {
    const { planId } = request.params;

    console.log(`[Plan API] Fetching plan status: ${planId}`);

    const executionResult = await db.query(
      `SELECT * FROM core.plan_executions WHERE plan_id = $1`,
      [planId]
    );

    if (executionResult.rows.length === 0) {
      return reply.code(404).send({ error: 'Plan not found' });
    }

    const execution = executionResult.rows[0];

    const operationsResult = await db.query(
      `SELECT
         id,
         operation_index,
         operation_type,
         status,
         result,
         started_at,
         completed_at
       FROM core.plan_operations
       WHERE plan_id = $1
       ORDER BY operation_index ASC`,
      [planId]
    );

    const operations = operationsResult.rows.map(op => ({
      index: op.operation_index,
      type: op.operation_type,
      status: op.status,
      result: op.result,
      startedAt: op.started_at,
      completedAt: op.completed_at,
      durationMs: op.completed_at && op.started_at
        ? new Date(op.completed_at).getTime() - new Date(op.started_at).getTime()
        : null
    }));

    return {
      execution: {
        planId: execution.plan_id,
        sessionId: execution.session_id,
        appId: execution.app_id,
        status: execution.status,
        totalOps: execution.total_ops,
        succeededOps: execution.succeeded_ops,
        failedOps: execution.failed_ops,
        skippedOps: execution.skipped_ops,
        startedAt: execution.started_at,
        completedAt: execution.completed_at,
        durationMs: execution.completed_at && execution.started_at
          ? new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()
          : null
      },
      operations
    };
  });

  fastify.get<{
    Querystring: { sessionId?: string; limit?: string };
  }>('/api/projects/plans', async (request, reply) => {
    const { sessionId, limit = '50' } = request.query;

    const query = sessionId
      ? `SELECT * FROM core.plan_executions WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM core.plan_executions ORDER BY created_at DESC LIMIT $1`;

    const params = sessionId ? [sessionId, parseInt(limit, 10)] : [parseInt(limit, 10)];

    const result = await db.query(query, params);

    return {
      plans: result.rows.map(p => ({
        planId: p.plan_id,
        sessionId: p.session_id,
        appId: p.app_id,
        status: p.status,
        totalOps: p.total_ops,
        succeededOps: p.succeeded_ops,
        failedOps: p.failed_ops,
        createdAt: p.created_at
      }))
    };
  });
}
