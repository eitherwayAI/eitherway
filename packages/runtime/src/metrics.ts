/**
 * Structured logging and metrics for tool execution
 */

import type { AgentConfig } from '@eitherway/tools-core';

export interface ToolMetrics {
  tool: string;
  latency_ms: number;
  input_size: number;
  output_size: number;
  file_count?: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export class MetricsCollector {
  private metrics: ToolMetrics[] = [];
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Record tool execution metrics
   */
  recordToolExecution(metrics: ToolMetrics): void {
    this.metrics.push(metrics);

    // Structured log output
    const level = metrics.success ? 'info' : 'error';
    const status = metrics.success ? 'OK' : 'FAIL';

    this.log(
      level,
      `[TOOL] ${status} ${metrics.tool} | ` +
      `${metrics.latency_ms}ms | ` +
      `in:${this.formatSize(metrics.input_size)} | ` +
      `out:${this.formatSize(metrics.output_size)}` +
      (metrics.file_count !== undefined ? ` | files:${metrics.file_count}` : '') +
      (metrics.error ? ` | error: ${metrics.error}` : '')
    );
  }

  getMetrics(): ToolMetrics[] {
    return [...this.metrics];
  }

  getSummary(): {
    totalCalls: number;
    successRate: number;
    avgLatency: number;
    totalInputSize: number;
    totalOutputSize: number;
    byTool: Record<string, { calls: number; avgLatency: number }>;
  } {
    const totalCalls = this.metrics.length;
    const successCount = this.metrics.filter(m => m.success).length;
    const avgLatency = totalCalls > 0
      ? this.metrics.reduce((sum, m) => sum + m.latency_ms, 0) / totalCalls
      : 0;

    const byTool: Record<string, { calls: number; avgLatency: number }> = {};

    for (const metric of this.metrics) {
      if (!byTool[metric.tool]) {
        byTool[metric.tool] = { calls: 0, avgLatency: 0 };
      }
      byTool[metric.tool].calls++;
      byTool[metric.tool].avgLatency =
        (byTool[metric.tool].avgLatency * (byTool[metric.tool].calls - 1) + metric.latency_ms) /
        byTool[metric.tool].calls;
    }

    return {
      totalCalls,
      successRate: totalCalls > 0 ? successCount / totalCalls : 0,
      avgLatency,
      totalInputSize: this.metrics.reduce((sum, m) => sum + m.input_size, 0),
      totalOutputSize: this.metrics.reduce((sum, m) => sum + m.output_size, 0),
      byTool
    };
  }

  getSummaryString(): string {
    const summary = this.getSummary();

    if (summary.totalCalls === 0) {
      return 'No tools executed';
    }

    const lines: string[] = [
      `Total calls: ${summary.totalCalls}`,
      `Success rate: ${(summary.successRate * 100).toFixed(1)}%`,
      `Avg latency: ${summary.avgLatency.toFixed(0)}ms`
    ];

    const toolNames = Object.keys(summary.byTool).sort();
    if (toolNames.length > 0) {
      lines.push('Per-tool:');
      for (const tool of toolNames) {
        const stats = summary.byTool[tool];
        lines.push(`  - ${tool}: ${stats.calls} calls, ${stats.avgLatency.toFixed(0)}ms avg`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Format byte size for display
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * Log with level filtering
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevel = levels[this.config.logging.level];
    const messageLevel = levels[level];

    if (messageLevel >= configLevel) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

      if (level === 'error') {
        console.error(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  }
}
