/**
 * Plan Progress Component
 *
 * Displays real-time progress of plan execution with:
 * - Overall status (running, completed, failed, partial)
 * - Progress bar and statistics
 * - Individual operation statuses
 * - Error details for failed operations
 * - Automatic polling for live updates
 */

import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';

interface PlanProgressProps {
  planId: string;
  sessionId: string;
  onComplete?: (result: PlanExecutionResult) => void;
  autoClose?: boolean; // Auto-close when completed successfully
}

interface PlanExecutionResult {
  execution: {
    planId: string;
    sessionId: string;
    appId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
    totalOps: number;
    succeededOps: number;
    failedOps: number;
    skippedOps: number;
    startedAt: string;
    completedAt?: string;
    durationMs?: number;
  };
  operations: Array<{
    index: number;
    type: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
    result?: any;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
  }>;
}

export function PlanProgress({ planId, sessionId, onComplete, autoClose = false }: PlanProgressProps) {
  const [executionResult, setExecutionResult] = useState<PlanExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const fetchProgress = async () => {
      try {
        const response = await fetch(`/api/projects/plans/${planId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch plan status: ${response.statusText}`);
        }

        const data: PlanExecutionResult = await response.json();
        setExecutionResult(data);
        setLoading(false);

        // Stop polling if execution is complete
        if (data.execution.status !== 'running' && data.execution.status !== 'pending') {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }

          // Notify parent component
          if (onComplete) {
            onComplete(data);
          }
        }
      } catch (err: any) {
        console.error('[PlanProgress] Error fetching status:', err);
        setError(err.message);
        setLoading(false);

        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    // Initial fetch
    fetchProgress();

    // Poll every second while running
    interval = setInterval(fetchProgress, 1000);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [planId, onComplete]);

  if (loading && !executionResult) {
    return (
      <div className="plan-progress p-4 bg-black/50 border border-eitherway-elements-borderColor rounded-lg">
        <div className="flex items-center gap-2">
          <div className="i-ph:spinner animate-spin text-blue-400" />
          <span className="text-sm text-eitherway-elements-textSecondary">Loading plan execution status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="plan-progress p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="i-ph:warning-circle text-red-400 text-xl" />
          <div>
            <div className="text-sm font-medium text-red-400">Error Loading Plan Status</div>
            <div className="text-xs text-red-300/80 mt-1">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!executionResult) {
    return null;
  }

  const { execution, operations } = executionResult;
  const progressPercent =
    execution.totalOps > 0
      ? Math.round(((execution.succeededOps + execution.failedOps) / execution.totalOps) * 100)
      : 0;

  const statusColors = {
    pending: 'text-gray-400',
    running: 'text-blue-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
    partial: 'text-yellow-400',
  };

  const statusIcons = {
    pending: 'i-ph:clock',
    running: 'i-ph:spinner animate-spin',
    completed: 'i-ph:check-circle',
    failed: 'i-ph:x-circle',
    partial: 'i-ph:warning-circle',
  };

  return (
    <div className="plan-progress flex flex-col gap-3 p-4 bg-black/50 border border-eitherway-elements-borderColor rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={classNames(statusIcons[execution.status], statusColors[execution.status], 'text-xl')} />
          <span className={classNames('text-sm font-medium', statusColors[execution.status])}>
            Plan Execution: {execution.status.toUpperCase()}
          </span>
        </div>

        {execution.durationMs !== undefined && (
          <span className="text-xs text-eitherway-elements-textTertiary">
            {execution.durationMs < 1000 ? `${execution.durationMs}ms` : `${(execution.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="flex flex-col gap-1">
        <div className="h-2 bg-black/50 rounded-full overflow-hidden">
          <div
            className={classNames(
              'h-full transition-all duration-300',
              execution.status === 'completed'
                ? 'bg-green-500'
                : execution.status === 'failed'
                  ? 'bg-red-500'
                  : execution.status === 'partial'
                    ? 'bg-yellow-500'
                    : 'bg-blue-500',
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-eitherway-elements-textTertiary">
          <span>
            {execution.succeededOps + execution.failedOps} / {execution.totalOps} operations
          </span>
          <span>{progressPercent}%</span>
        </div>
      </div>

      {/* Statistics */}
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="i-ph:check-circle text-green-400" />
          <span className="text-eitherway-elements-textSecondary">{execution.succeededOps} succeeded</span>
        </div>

        {execution.failedOps > 0 && (
          <div className="flex items-center gap-1">
            <div className="i-ph:x-circle text-red-400" />
            <span className="text-eitherway-elements-textSecondary">{execution.failedOps} failed</span>
          </div>
        )}

        {execution.skippedOps > 0 && (
          <div className="flex items-center gap-1">
            <div className="i-ph:arrow-circle-right text-gray-400" />
            <span className="text-eitherway-elements-textSecondary">{execution.skippedOps} skipped</span>
          </div>
        )}
      </div>

      {/* Operations List */}
      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
        {operations.map((op) => (
          <div
            key={op.index}
            className={classNames(
              'flex items-center justify-between px-3 py-2 rounded border text-xs',
              op.status === 'success'
                ? 'bg-green-500/10 border-green-500/30'
                : op.status === 'failed'
                  ? 'bg-red-500/10 border-red-500/30'
                  : op.status === 'running'
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : op.status === 'skipped'
                      ? 'bg-gray-500/10 border-gray-500/30'
                      : 'bg-gray-500/5 border-gray-500/20',
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-eitherway-elements-textTertiary">#{op.index}</span>
              <span className="font-mono text-eitherway-elements-textPrimary truncate">{op.type}</span>

              {/* Operation Status Icon */}
              {op.status === 'success' && <div className="i-ph:check text-green-400" />}
              {op.status === 'failed' && <div className="i-ph:x text-red-400" />}
              {op.status === 'running' && <div className="i-ph:spinner animate-spin text-blue-400" />}
              {op.status === 'skipped' && <div className="i-ph:minus text-gray-400" />}
            </div>

            {/* Duration */}
            {op.durationMs !== undefined && (
              <span className="text-eitherway-elements-textTertiary ml-2">{op.durationMs}ms</span>
            )}
          </div>
        ))}
      </div>

      {/* Error Details (if any operation failed) */}
      {operations.some((op) => op.error) && (
        <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-xs">
          <div className="font-medium text-red-400 mb-1">Error Details:</div>
          {operations
            .filter((op) => op.error)
            .map((op) => (
              <div key={op.index} className="text-red-300/80 mt-1">
                <span className="font-mono">
                  Op {op.index} ({op.type}):
                </span>{' '}
                {op.error}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
