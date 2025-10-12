/**
 * Tool Runner with validation, allowlist, idempotency, metrics, and rate limiting
 */

import crypto from 'crypto';
import { getValidator } from '@eitherway/tools-core';
import type {
  ToolExecutor,
  ToolExecutorResult,
  ToolUse,
  ToolResult,
  ExecutionContext,
  AgentConfig
} from '@eitherway/tools-core';
import { MetricsCollector } from './metrics.js';
import { RateLimiter } from './rate-limiter.js';

export class ToolRunner {
  private executors: Map<string, ToolExecutor>;
  private context: ExecutionContext;
  private executionCache: Map<string, ToolExecutorResult>;
  private validator = getValidator();
  private metrics: MetricsCollector;
  private rateLimiter: RateLimiter;

  constructor(
    executors: ToolExecutor[],
    workingDir: string,
    config: AgentConfig
  ) {
    this.executors = new Map();
    for (const executor of executors) {
      this.executors.set(executor.name, executor);
    }

    this.context = {
      workingDir,
      allowedPaths: config.security.allowedWorkspaces,
      deniedPaths: config.security.deniedPaths,
      config
    };

    this.executionCache = new Map();
    this.metrics = new MetricsCollector(config);
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Execute a single tool use with metrics and rate limiting
   */
  async executeTool(toolUse: ToolUse): Promise<ToolResult> {
    const { id, name, input } = toolUse;
    const startTime = Date.now();

    const executor = this.executors.get(name);
    if (!executor) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Error: Unknown tool '${name}'`,
        is_error: true
      };
    }

    const validation = this.validator.validate(name, input);
    if (!validation.valid) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Validation error: ${validation.errors.join(', ')}`,
        is_error: true
      };
    }

    // Rate limiting for external APIs
    if (name.startsWith('websearch') || name.startsWith('eithergen')) {
      const rateCheck = await this.rateLimiter.checkLimit(name.split('--')[0]);
      if (!rateCheck.allowed) {
        return {
          type: 'tool_result',
          tool_use_id: id,
          content: `Rate limit exceeded for ${name}. Retry after ${rateCheck.retryAfter} seconds.`,
          is_error: true
        };
      }
    }

    const cacheKey = this.getCacheKey(name, input);
    const cached = this.executionCache.get(cacheKey);
    if (cached) {
      return {
        type: 'tool_result',
        tool_use_id: id,
        content: cached.content,
        is_error: cached.isError
      };
    }

    try {
      // Execute the tool
      const result = await executor.execute(input, this.context);

      const latency = Date.now() - startTime;
      const inputSize = JSON.stringify(input).length;
      const outputSize = result.content.length;
      const fileCount = result.metadata?.matchCount || result.metadata?.fileCount;

      // Record metrics
      this.metrics.recordToolExecution({
        tool: name,
        latency_ms: latency,
        input_size: inputSize,
        output_size: outputSize,
        file_count: fileCount,
        success: !result.isError,
        error: result.isError ? result.content : undefined,
        timestamp: new Date().toISOString()
      });

      // Cache the result
      this.executionCache.set(cacheKey, result);

      return {
        type: 'tool_result',
        tool_use_id: id,
        content: result.content,
        is_error: result.isError
      };
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const latency = Date.now() - startTime;

      // Record error metrics
      this.metrics.recordToolExecution({
        tool: name,
        latency_ms: latency,
        input_size: JSON.stringify(input).length,
        output_size: errorMessage.length,
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });

      return {
        type: 'tool_result',
        tool_use_id: id,
        content: `Execution error: ${errorMessage}`,
        is_error: true
      };
    }
  }

  /**
   * Execute multiple tools with parallel execution where safe
   * Reads run in parallel; writes are serialized per-path
   */
  async executeTools(toolUses: ToolUse[]): Promise<ToolResult[]> {
    if (toolUses.length === 0) return [];
    if (toolUses.length === 1) return [await this.executeTool(toolUses[0])];

    // Classify tools into reads and writes
    const reads: ToolUse[] = [];
    const writesByPath = new Map<string, ToolUse[]>();

    for (const tu of toolUses) {
      const isWrite = this.isWriteTool(tu.name);

      if (!isWrite) {
        reads.push(tu);
      } else {
        // Group writes by their target path
        const path = this.extractPath(tu.input);
        if (!writesByPath.has(path)) {
          writesByPath.set(path, []);
        }
        writesByPath.get(path)!.push(tu);
      }
    }

    // Execute reads in parallel (with concurrency limit)
    const concurrencyLimit = this.context.config.limits.maxConcurrentTools || 4;
    const readResults = await this.runWithConcurrency(reads, concurrencyLimit);

    // Execute writes: each path group runs sequentially, different paths in parallel
    const writeGroups = Array.from(writesByPath.values());
    const writeResults = await this.runWriteGroupsInParallel(writeGroups, concurrencyLimit);

    // Combine and sort results back to original order
    const resultMap = new Map<string, ToolResult>();
    for (const result of [...readResults, ...writeResults]) {
      resultMap.set(result.tool_use_id, result);
    }

    return toolUses.map(tu => resultMap.get(tu.id)!);
  }

  /**
   * Determine if a tool performs writes
   */
  private isWriteTool(name: string): boolean {
    return name === 'either-write' ||
           name === 'either-line-replace' ||
           name === 'eithergen--generate_image';
  }

  /**
   * Extract file path from tool input (used for grouping writes)
   */
  private extractPath(input: Record<string, any>): string {
    return (input?.path as string) || '__no_path__';
  }

  /**
   * Run tools in parallel with concurrency limit
   */
  private async runWithConcurrency(tools: ToolUse[], limit: number): Promise<ToolResult[]> {
    if (tools.length === 0) return [];

    const results: ToolResult[] = new Array(tools.length);
    let activeCount = 0;
    let currentIndex = 0;

    return new Promise((resolve) => {
      const startNext = () => {
        while (activeCount < limit && currentIndex < tools.length) {
          const index = currentIndex++;
          const tool = tools[index];
          activeCount++;

          this.executeTool(tool).then(result => {
            results[index] = result;
            activeCount--;
            if (currentIndex < tools.length) {
              startNext();
            } else if (activeCount === 0) {
              resolve(results);
            }
          });
        }
      };

      startNext();
    });
  }

  /**
   * Execute write groups: sequential within each group, parallel across groups
   */
  private async runWriteGroupsInParallel(groups: ToolUse[][], limit: number): Promise<ToolResult[]> {
    const allResults: ToolResult[] = [];
    let activeCount = 0;
    let currentIndex = 0;

    return new Promise((resolve) => {
      if (groups.length === 0) {
        resolve([]);
        return;
      }

      const startNext = () => {
        while (activeCount < limit && currentIndex < groups.length) {
          const group = groups[currentIndex++];
          activeCount++;

          this.executeSequentially(group).then(results => {
            allResults.push(...results);
            activeCount--;
            if (currentIndex < groups.length) {
              startNext();
            } else if (activeCount === 0) {
              resolve(allResults);
            }
          });
        }
      };

      startNext();
    });
  }

  /**
   * Execute tools sequentially (for same-path writes)
   */
  private async executeSequentially(tools: ToolUse[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const tool of tools) {
      results.push(await this.executeTool(tool));
    }
    return results;
  }

  /**
   * Generate cache key for idempotency
   */
  private getCacheKey(name: string, input: Record<string, any>): string {
    const payload = JSON.stringify({ name, input });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Clear execution cache (useful between turns)
   */
  clearCache(): void {
    this.executionCache.clear();
  }

  getAvailableTools(): string[] {
    return Array.from(this.executors.keys());
  }

  hasExecutor(name: string): boolean {
    return this.executors.has(name);
  }

  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  setDatabaseContext(fileStore: any, appId: string, sessionId?: string): void {
    this.context.fileStore = fileStore;
    this.context.appId = appId;
    this.context.sessionId = sessionId;
  }

  /**
   * Clear database context
   */
  clearDatabaseContext(): void {
    delete this.context.fileStore;
    delete this.context.appId;
    delete this.context.sessionId;
  }
}

/**
 * Security utilities for path validation
 */
export class SecurityGuard {
  private allowedPaths: string[];
  private deniedPaths: string[];
  private secretPatterns: RegExp[];

  constructor(config: AgentConfig['security']) {
    this.allowedPaths = config.allowedWorkspaces;
    this.deniedPaths = config.deniedPaths;
    this.secretPatterns = config.secretPatterns.map(p => new RegExp(p, 'g'));
  }

  isPathAllowed(path: string): boolean {
    for (const denied of this.deniedPaths) {
      if (this.matchGlob(path, denied)) {
        return false;
      }
    }

    for (const allowed of this.allowedPaths) {
      if (this.matchGlob(path, allowed)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Redact secrets from content
   */
  redactSecrets(content: string): string {
    let redacted = content;
    for (const pattern of this.secretPatterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
  }

  /**
   * Simple glob matching (supports ** and *)
   */
  private matchGlob(path: string, pattern: string): boolean {
    const regex = this.globToRegExp(pattern);
    return regex.test(path);
  }

  // Convert a glob to a RegExp with proper ** semantics:
  //  - "**/"   => "(?:.*/)?", i.e., zero or more directories (including none)
  //  - "**"    => ".*"
  //  - "*"     => "[^/]*"
  //  - "?"     => "[^/]"
  private globToRegExp(pattern: string): RegExp {
    const specials = /[.+^${}()|[\]\\]/;
    let i = 0;
    let out = '^';
    while (i < pattern.length) {
      const ch = pattern[i];
      if (ch === '*') {
        const next = pattern[i + 1];
        if (next === '*') {
          const hasSlash = pattern[i + 2] === '/';
          if (hasSlash) {
            out += '(?:.*/)?'; // zero or more directories, including none
            i += 3;
          } else {
            out += '.*';       // any characters, including '/'
            i += 2;
          }
        } else {
          out += '[^/]*';      // any chars except '/'
          i += 1;
        }
      } else if (ch === '?') {
        out += '[^/]';
        i += 1;
      } else {
        out += specials.test(ch) ? '\\' + ch : ch;
        i += 1;
      }
    }
    out += '$';
    return new RegExp(out);
  }
}
