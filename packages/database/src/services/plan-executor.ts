/**
 * Plan Executor - Safe execution of validated AI-generated plans
 *
 * Architecture:
 * - Sequential execution with progress tracking
 * - Database-backed state for resumability
 * - Comprehensive logging and error handling
 * - Idempotent operations
 */

import { DatabaseClient } from '../client.js';
import { PostgresFileStore } from './file-store.js';
import { EventsRepository } from '../repositories/events.js';
import type { Plan, PlanOperation, WriteOp, PatchOp, PackageInstallOp, PackageRemoveOp } from './plan-validator.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutionResult {
  planId: string;
  totalOps: number;
  succeededOps: number;
  failedOps: number;
  skippedOps: number;
  status: 'completed' | 'failed' | 'partial';
  operations: OperationResult[];
  logPath: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface OperationResult {
  index: number;
  type: string;
  status: 'success' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  durationMs?: number;
}

// ============================================================================
// EXECUTOR CLASS
// ============================================================================

export class PlanExecutor {
  private fileStore: PostgresFileStore;
  private eventsRepo: EventsRepository;

  constructor(private db: DatabaseClient) {
    this.fileStore = new PostgresFileStore(db);
    this.eventsRepo = new EventsRepository(db);
  }

  /**
   * Execute a validated plan
   *
   * @param plan - Validated plan from PlanValidator
   * @param appId - Application ID for file operations
   * @returns Execution result with operation statuses
   */
  async execute(plan: Plan, appId: string): Promise<ExecutionResult> {
    const { planId, sessionId, operations } = plan;
    const executionStartTime = Date.now();

    // Check if plan already exists (idempotency)
    const existingExecution = await this.checkExistingExecution(planId);

    if (existingExecution) {
      console.log(`[PlanExecutor] Plan ${planId} already executed, returning existing result`);
      return this.getExecutionResult(planId);
    }

    // Create plan execution record
    await this.db.query(
      `INSERT INTO core.plan_executions (plan_id, session_id, app_id, total_ops, status, started_at)
       VALUES ($1, $2, $3, $4, 'running', now())`,
      [planId, sessionId, appId, operations.length]
    );

    await this.eventsRepo.log('plan.execution.started', {
      planId,
      sessionId,
      appId,
      operationCount: operations.length
    }, { sessionId, appId, actor: 'system' });

    const results: OperationResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    // Execute operations sequentially
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const opStartTime = Date.now();

      try {
        console.log(`[PlanExecutor] Executing operation ${i}/${operations.length}: ${op.type}`);

        // Record operation start
        await this.db.query(
          `INSERT INTO core.plan_operations
           (plan_id, session_id, app_id, operation_index, operation_type, operation_params, status, started_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'running', now())`,
          [planId, sessionId, appId, i, op.type, JSON.stringify(op)]
        );

        // Execute the operation
        const result = await this.executeOperation(op, appId);
        const opDuration = Date.now() - opStartTime;

        // Record success
        await this.db.query(
          `UPDATE core.plan_operations
           SET status = 'success', result = $1, completed_at = now()
           WHERE plan_id = $2 AND operation_index = $3`,
          [JSON.stringify(result), planId, i]
        );

        results.push({
          index: i,
          type: op.type,
          status: 'success',
          result,
          durationMs: opDuration
        });

        succeeded++;

        await this.eventsRepo.log('plan.operation.success', {
          planId,
          operationIndex: i,
          operationType: op.type,
          durationMs: opDuration
        }, { sessionId, appId, actor: 'system' });

      } catch (error: any) {
        console.error(`[PlanExecutor] Operation ${i} failed:`, error.message);
        const opDuration = Date.now() - opStartTime;

        // Record failure
        await this.db.query(
          `UPDATE core.plan_operations
           SET status = 'failed', result = $1, completed_at = now()
           WHERE plan_id = $2 AND operation_index = $3`,
          [JSON.stringify({ error: error.message, stack: error.stack }), planId, i]
        );

        results.push({
          index: i,
          type: op.type,
          status: 'failed',
          error: error.message,
          durationMs: opDuration
        });

        failed++;

        await this.eventsRepo.log('plan.operation.failed', {
          planId,
          operationIndex: i,
          operationType: op.type,
          error: error.message,
          durationMs: opDuration
        }, { sessionId, appId, actor: 'system' });

        // Stop on first failure (fail-fast strategy)
        // Remaining operations are marked as skipped
        skipped = operations.length - i - 1;
        break;
      }
    }

    // Determine final status
    let finalStatus: 'completed' | 'failed' | 'partial';
    if (failed === 0) {
      finalStatus = 'completed';
    } else if (succeeded === 0) {
      finalStatus = 'failed';
    } else {
      finalStatus = 'partial';
    }

    const executionDuration = Date.now() - executionStartTime;

    // Update plan execution summary
    await this.db.query(
      `UPDATE core.plan_executions
       SET succeeded_ops = $1, failed_ops = $2, skipped_ops = $3,
           status = $4, completed_at = now()
       WHERE plan_id = $5`,
      [succeeded, failed, skipped, finalStatus, planId]
    );

    // Generate apply log JSON
    const logPath = `/plan/apply-log-${planId}.json`;
    const logContent = JSON.stringify({
      planId,
      sessionId,
      appId,
      executedAt: new Date().toISOString(),
      status: finalStatus,
      summary: {
        total: operations.length,
        succeeded,
        failed,
        skipped,
        durationMs: executionDuration
      },
      operations: results.map((result, idx) => ({
        ...result,
        operation: operations[idx]
      }))
    }, null, 2);

    try {
      await this.fileStore.write(appId, logPath, logContent, undefined, 'application/json');
      console.log(`[PlanExecutor] Apply log written to: ${logPath}`);
    } catch (error) {
      console.error('[PlanExecutor] Failed to write apply log:', error);
      // Non-fatal error - continue
    }

    await this.eventsRepo.log('plan.execution.completed', {
      planId,
      status: finalStatus,
      succeeded,
      failed,
      skipped,
      durationMs: executionDuration
    }, { sessionId, appId, actor: 'system' });

    return {
      planId,
      totalOps: operations.length,
      succeededOps: succeeded,
      failedOps: failed,
      skippedOps: skipped,
      status: finalStatus,
      operations: results,
      logPath,
      startedAt: new Date(executionStartTime),
      completedAt: new Date(),
      durationMs: executionDuration
    };
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(op: PlanOperation, appId: string): Promise<any> {
    switch (op.type) {
      case 'write':
        return await this.executeWrite(op, appId);

      case 'patch':
        return await this.executePatch(op, appId);

      case 'package_install':
        return await this.executePackageInstall(op, appId);

      case 'package_remove':
        return await this.executePackageRemove(op, appId);

      default:
        throw new Error(`Unknown operation type: ${(op as any).type}`);
    }
  }

  /**
   * Execute write operation
   */
  private async executeWrite(op: WriteOp, appId: string): Promise<any> {
    const { path, content } = op;

    await this.fileStore.write(appId, path, content, 'text/plain');

    return {
      operation: 'write',
      path,
      size: content.length,
      lines: content.split('\n').length
    };
  }

  /**
   * Execute patch operation
   */
  private async executePatch(op: PatchOp, appId: string): Promise<any> {
    const { path, search, replace } = op;

    // Read existing file
    const file = await this.fileStore.read(appId, path);
    let content = typeof file.content === 'string'
      ? file.content
      : Buffer.from(file.content).toString('utf-8');

    // Perform replacement
    const originalContent = content;
    content = content.replace(search, replace);

    if (content === originalContent) {
      throw new Error(`Pattern '${search.substring(0, 50)}...' not found in ${path}`);
    }

    // Count occurrences
    const occurrences = (originalContent.match(new RegExp(search, 'g')) || []).length;

    // Write back
    await this.fileStore.write(appId, path, content, file.mimeType);

    return {
      operation: 'patch',
      path,
      occurrences,
      searchPattern: search.substring(0, 100),
      sizeDiff: content.length - originalContent.length
    };
  }

  /**
   * Execute package install operation
   */
  private async executePackageInstall(op: PackageInstallOp, appId: string): Promise<any> {
    const { packages, dev } = op;

    return await this.updatePackageJson(appId, 'add', packages, dev);
  }

  /**
   * Execute package remove operation
   */
  private async executePackageRemove(op: PackageRemoveOp, appId: string): Promise<any> {
    const { packages } = op;

    return await this.updatePackageJson(appId, 'remove', packages, false);
  }

  /**
   * Update package.json with package operations
   */
  private async updatePackageJson(
    appId: string,
    action: 'add' | 'remove',
    packages: string[],
    isDev: boolean = false
  ): Promise<any> {
    const pkgPath = 'package.json';

    // Read package.json
    const file = await this.fileStore.read(appId, pkgPath);
    const content = typeof file.content === 'string'
      ? file.content
      : Buffer.from(file.content).toString('utf-8');

    const pkg = JSON.parse(content);
    const depsKey = isDev ? 'devDependencies' : 'dependencies';

    // Ensure dependencies object exists
    if (!pkg[depsKey]) {
      pkg[depsKey] = {};
    }

    const modified: string[] = [];

    if (action === 'add') {
      for (const p of packages) {
        if (!pkg[depsKey][p]) {
          pkg[depsKey][p] = 'latest';  // Could enhance to fetch actual versions
          modified.push(p);
        }
      }
    } else {
      for (const p of packages) {
        if (pkg[depsKey][p]) {
          delete pkg[depsKey][p];
          modified.push(p);
        }
      }
    }

    if (modified.length === 0) {
      return {
        operation: action === 'add' ? 'package_install' : 'package_remove',
        modified: [],
        message: 'No changes needed - packages already in desired state'
      };
    }

    // Write back package.json
    await this.fileStore.write(appId, pkgPath, JSON.stringify(pkg, null, 2), 'application/json');

    return {
      operation: action === 'add' ? 'package_install' : 'package_remove',
      modified,
      target: depsKey,
      path: pkgPath
    };
  }

  /**
   * Check if plan has already been executed (idempotency)
   */
  private async checkExistingExecution(planId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT id FROM core.plan_executions WHERE plan_id = $1`,
      [planId]
    );

    return result.rows.length > 0;
  }

  /**
   * Get execution result from database
   */
  private async getExecutionResult(planId: string): Promise<ExecutionResult> {
    const executionResult = await this.db.query(
      `SELECT * FROM core.plan_executions WHERE plan_id = $1`,
      [planId]
    );

    const execution = executionResult.rows[0];

    const operationsResult = await this.db.query(
      `SELECT * FROM core.plan_operations
       WHERE plan_id = $1
       ORDER BY operation_index ASC`,
      [planId]
    );

    const operations: OperationResult[] = operationsResult.rows.map(op => ({
      index: op.operation_index,
      type: op.operation_type,
      status: op.status,
      result: op.result,
      error: op.result?.error
    }));

    const durationMs = execution.completed_at
      ? new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()
      : 0;

    return {
      planId: execution.plan_id,
      totalOps: execution.total_ops,
      succeededOps: execution.succeeded_ops,
      failedOps: execution.failed_ops,
      skippedOps: execution.skipped_ops,
      status: execution.status,
      operations,
      logPath: `/plan/apply-log-${planId}.json`,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
      durationMs
    };
  }
}
