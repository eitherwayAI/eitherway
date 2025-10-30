/**
 * either-edit: Unified edit tool with server-side processing
 * PHASE 2: Major token savings through ellipsis support and minimal returns
 * Token savings: 70-95% vs full file rewrites
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { createHash } from 'crypto';
import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';
import { SecurityGuard } from './security.js';
import { parseEllipsisContent } from './utils/ellipsis-parser.js';
import { generateUnifiedDiff } from './utils/diff-generator.js';

export class EitherEditExecutor implements ToolExecutor {
  name = 'either-edit';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const {
      path,
      operation,
      locator,
      content,
      content_format = 'full',
      return_context = 'diff'
    } = input;

    // Security check
    const guard = new SecurityGuard(context.config.security);
    if (!guard.isPathAllowed(path)) {
      return {
        content: `Error: Access denied to path '${path}'`,
        isError: true,
      };
    }

    try {
      // Read current file (SERVER-SIDE - no token cost)
      const currentContent = await this.readFileContent(path, context);
      const originalSha256 = createHash('sha256').update(currentContent).digest('hex');
      const lines = currentContent.split('\n');

      // Find the location to edit
      let { startLine, endLine } = this.findLocation(lines, locator, operation);

      // Validate and cap location
      if (startLine < 1 || startLine > lines.length + 1) {
        return {
          content: `Error: start_line ${startLine} out of range (file has ${lines.length} lines)`,
          isError: true
        };
      }

      // CRITICAL FIX: Cap endLine at actual file length to prevent duplicate content
      if (endLine > lines.length) {
        console.log(`[either-edit] Capping endLine from ${endLine} to ${lines.length} (file length)`);
        endLine = lines.length;
      }

      // DEFENSIVE FIX: If doing full-file replacement with explicit lines, auto-adjust end_line
      // This handles cases where the agent miscalculates the end line
      if (operation === 'replace' && startLine === 1 && content_format === 'full') {
        const newContentLines = content.split('\n');
        // If new content looks like a complete file (has typical file markers)
        const looksLikeCompleteFile =
          content.includes('import ') ||
          content.includes('export ') ||
          content.includes('function ') ||
          (content.startsWith('<!DOCTYPE') || content.startsWith('<html')) ||
          (content.includes('export default') && content.trim().endsWith('}'));

        // If it looks like a complete file and endLine is close to file length, adjust
        if (looksLikeCompleteFile && endLine >= lines.length - 5 && endLine < lines.length) {
          console.log(`[either-edit] Auto-adjusting endLine from ${endLine} to ${lines.length} (full file replacement detected)`);
          endLine = lines.length;
        }
      }

      // Process content based on format
      let finalContent: string;
      if (content_format === 'ellipsis') {
        // Parse ellipsis format and merge with existing content
        finalContent = parseEllipsisContent(currentContent, content, startLine, endLine);
      } else {
        // Direct content replacement
        finalContent = content;
      }

      // Perform the operation
      const newContent = this.performOperation(
        lines,
        operation,
        startLine,
        endLine,
        finalContent
      );

      // Write file (SERVER-SIDE)
      await this.writeFileContent(path, newContent, context);

      // Invalidate file cache since we wrote to it
      if (context.fileCache) {
        context.fileCache.invalidate(path);
      }

      // Calculate new hash
      const newSha256 = createHash('sha256').update(newContent).digest('hex');

      // Return based on return_context
      return this.formatResponse(
        path,
        operation,
        currentContent,
        newContent,
        startLine,
        endLine,
        originalSha256,
        newSha256,
        return_context
      );

    } catch (error: any) {
      return {
        content: `Error editing file '${path}': ${error.message}`,
        isError: true,
      };
    }
  }

  /**
   * Find location to edit based on locator
   */
  private findLocation(
    lines: string[],
    locator: any,
    operation: string
  ): { startLine: number; endLine: number } {
    // Line-based location
    if (locator.start_line !== undefined) {
      return {
        startLine: locator.start_line,
        endLine: locator.end_line || locator.start_line
      };
    }

    // Insert after specific line
    if (operation === 'insert' && locator.after_line !== undefined) {
      return {
        startLine: locator.after_line + 1,
        endLine: locator.after_line + 1
      };
    }

    // Pattern-based location
    if (locator.pattern) {
      const content = lines.join('\n');
      const pattern = locator.pattern;
      const count = locator.pattern_count || 1;

      let foundCount = 0;
      let lastIndex = -1;

      // Find nth occurrence
      for (let i = 0; i < content.length; i++) {
        const index = content.indexOf(pattern, i);
        if (index === -1) break;
        foundCount++;
        if (foundCount === count) {
          lastIndex = index;
          break;
        }
        i = index;
      }

      if (lastIndex === -1) {
        throw new Error(`Pattern not found: "${pattern}"`);
      }

      // Convert character index to line numbers
      const beforePattern = content.substring(0, lastIndex);
      const startLine = beforePattern.split('\n').length;
      const patternLines = pattern.split('\n').length;
      const endLine = startLine + patternLines - 1;

      return { startLine, endLine };
    }

    throw new Error('Locator must specify start_line or pattern');
  }

  /**
   * Perform the edit operation
   */
  private performOperation(
    lines: string[],
    operation: string,
    startLine: number,
    endLine: number,
    content: string
  ): string {
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine);
    const newLines = content.split('\n');

    switch (operation) {
      case 'replace':
        return [...before, ...newLines, ...after].join('\n');

      case 'insert':
        return [...before, ...newLines, ...lines.slice(startLine - 1)].join('\n');

      case 'delete':
        return [...before, ...after].join('\n');

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  /**
   * Format response based on return_context
   * PHASE 2: Minimize tokens returned to Claude
   */
  private formatResponse(
    path: string,
    operation: string,
    oldContent: string,
    newContent: string,
    startLine: number,
    endLine: number,
    oldSha256: string,
    newSha256: string,
    returnContext: string
  ): ToolExecutorResult {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const linesChanged = endLine - startLine + 1;
    const netChange = newLines.length - oldLines.length;

    switch (returnContext) {
      case 'minimal':
        // Just success message - MAXIMUM token savings
        return {
          content: `✓ Edited ${path} (lines ${startLine}-${endLine}, ${linesChanged} line${linesChanged > 1 ? 's' : ''} ${operation}d)`,
          isError: false,
          metadata: {
            path,
            operation,
            start_line: startLine,
            end_line: endLine,
            lines_changed: linesChanged,
            net_change: netChange,
            old_sha256: oldSha256,
            new_sha256: newSha256
          }
        };

      case 'diff':
        // Unified diff - RECOMMENDED (shows changes clearly with minimal tokens)
        const diff = generateUnifiedDiff(oldContent, newContent, path);
        return {
          content: `✓ Edited ${path}\n\n${diff}`,
          isError: false,
          metadata: {
            path,
            operation,
            start_line: startLine,
            end_line: endLine,
            lines_changed: linesChanged,
            net_change: netChange,
            old_sha256: oldSha256,
            new_sha256: newSha256
          }
        };

      case 'full':
        // Full content - only for small files
        if (newLines.length > 100) {
          return {
            content: `Warning: File has ${newLines.length} lines. Returning diff instead of full content.\n\n${generateUnifiedDiff(oldContent, newContent, path)}`,
            isError: false,
            metadata: {
              path,
              operation,
              warning: 'File too large for full return, showing diff instead'
            }
          };
        }
        return {
          content: `✓ Edited ${path}\n\n${newContent}`,
          isError: false,
          metadata: {
            path,
            operation,
            full_content: true,
            new_sha256: newSha256
          }
        };

      default:
        throw new Error(`Unknown return_context: ${returnContext}`);
    }
  }

  /**
   * Helper to read file (supports both filesystem and database)
   */
  private async readFileContent(path: string, context: ExecutionContext): Promise<string> {
    if (context.fileStore && context.appId) {
      const fileData = await context.fileStore.read(context.appId, path);
      if (typeof fileData.content === 'string') {
        return fileData.content;
      } else if (Buffer.isBuffer(fileData.content)) {
        return fileData.content.toString('utf-8');
      } else {
        return Buffer.from(fileData.content).toString('utf-8');
      }
    }

    const fullPath = resolve(context.workingDir, path);
    return await readFile(fullPath, 'utf-8');
  }

  /**
   * Helper to write file (supports both filesystem and database)
   */
  private async writeFileContent(path: string, content: string, context: ExecutionContext): Promise<void> {
    if (context.fileStore && context.appId) {
      await context.fileStore.write(context.appId, path, content);
    } else {
      const fullPath = resolve(context.workingDir, path);
      await writeFile(fullPath, content, 'utf-8');
    }
  }
}
