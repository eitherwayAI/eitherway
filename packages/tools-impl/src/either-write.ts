/**
 * either-write: Create new files with diff summary
 */

import { writeFile, mkdir, access, readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';
import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';
import { SecurityGuard } from './security.js';

export class EitherWriteExecutor implements ToolExecutor {
  name = 'either-write';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const { path, content, overwrite = false, create_dirs = true } = input;

    // Security check
    const guard = new SecurityGuard(context.config.security);
    if (!guard.isPathAllowed(path)) {
      return {
        content: `Error: Access denied to path '${path}'. Path is not in allowed workspaces.`,
        isError: true,
      };
    }

    // Use database if fileStore is available
    if (context.fileStore && context.appId) {
      return this.executeWithDatabase(path, content, context);
    }

    // Otherwise use filesystem
    const fullPath = resolve(context.workingDir, path);

    try {
      let isExisting = false;
      let oldContent = '';
      let oldSha256 = '';

      // Check if file exists
      try {
        await access(fullPath);
        isExisting = true;

        if (!overwrite) {
          return {
            content: `Error: File '${path}' already exists. Set overwrite=true to replace it.`,
            isError: true,
          };
        }

        // Read existing content for diff
        oldContent = await readFile(fullPath, 'utf-8');
        oldSha256 = createHash('sha256').update(oldContent).digest('hex');
      } catch {
        // File doesn't exist, which is fine
      }

      // Create parent directories if needed
      if (create_dirs) {
        const dir = dirname(fullPath);
        await mkdir(dir, { recursive: true });
      }

      // Size limit check
      const maxSize = context.config.limits.maxToolPayloadSize;
      if (content.length > maxSize) {
        return {
          content: `Error: Content size (${content.length} bytes) exceeds limit (${maxSize} bytes)`,
          isError: true,
        };
      }

      // Write file
      await writeFile(fullPath, content, 'utf-8');

      // Calculate new hash
      const newSha256 = createHash('sha256').update(content).digest('hex');
      const lineCount = content.split('\n').length;

      // Generate diff summary
      let diffSummary: string;
      if (isExisting) {
        const oldLines = oldContent.split('\n');
        const newLines = content.split('\n');
        diffSummary = this.generateDiffSummary(path, oldLines, newLines);
      } else {
        // New file - show first few lines
        const lines = content.split('\n');
        const preview = lines
          .slice(0, 10)
          .map((line: string, idx: number) => `${idx + 1}+ ${line}`)
          .join('\n');
        const more = lines.length > 10 ? `\n... ${lines.length - 10} more lines` : '';
        diffSummary = `+++ ${path} (new file)\n${preview}${more}`;
      }

      return {
        content: `Successfully wrote '${path}'\n\n${diffSummary}`,
        isError: false,
        metadata: {
          path,
          size: content.length,
          sha256: newSha256,
          line_count: lineCount,
          overwritten: isExisting,
          old_sha256: oldSha256 || undefined,
        },
      };
    } catch (error: any) {
      return {
        content: `Error writing file '${path}': ${error.message}`,
        isError: true,
      };
    }
  }

  /**
   * Execute using database FileStore
   */
  private async executeWithDatabase(
    path: string,
    content: string,
    context: ExecutionContext,
  ): Promise<ToolExecutorResult> {
    const { fileStore, appId } = context;

    try {
      // Check if file exists in database
      let isExisting = false;
      let oldContent = '';

      try {
        const existingFile = await fileStore.read(appId, path);
        isExisting = true;

        // Convert content to string if it's a buffer
        if (typeof existingFile.content === 'string') {
          oldContent = existingFile.content;
        } else if (Buffer.isBuffer(existingFile.content)) {
          oldContent = existingFile.content.toString('utf-8');
        } else {
          oldContent = Buffer.from(existingFile.content).toString('utf-8');
        }
      } catch {
        // File doesn't exist, which is fine for new files
      }

      // Write to database
      await fileStore.write(appId, path, content);

      // Calculate hash and line count
      const newSha256 = createHash('sha256').update(content).digest('hex');
      const lineCount = content.split('\n').length;

      // Generate diff summary
      let diffSummary: string;
      if (isExisting) {
        const oldLines = oldContent.split('\n');
        const newLines = content.split('\n');
        diffSummary = this.generateDiffSummary(path, oldLines, newLines);
      } else {
        // New file - show first few lines
        const lines = content.split('\n');
        const preview = lines
          .slice(0, 10)
          .map((line: string, idx: number) => `${idx + 1}+ ${line}`)
          .join('\n');
        const more = lines.length > 10 ? `\n... ${lines.length - 10} more lines` : '';
        diffSummary = `+++ ${path} (new file)\n${preview}${more}`;
      }

      return {
        content: `Successfully wrote '${path}' to database\n\n${diffSummary}`,
        isError: false,
        metadata: {
          path,
          size: content.length,
          sha256: newSha256,
          line_count: lineCount,
          overwritten: isExisting,
          storage: 'database',
        },
      };
    } catch (error: any) {
      return {
        content: `Error writing file '${path}' to database: ${error.message}`,
        isError: true,
      };
    }
  }

  /**
   * Generate a simple diff summary
   */
  private generateDiffSummary(path: string, oldLines: string[], newLines: string[]): string {
    const maxPreview = 20;
    const diff: string[] = [`--- ${path} (before)`, `+++ ${path} (after)`];

    // Simple line-by-line diff for preview
    const minLen = Math.min(oldLines.length, newLines.length, maxPreview);

    for (let i = 0; i < minLen; i++) {
      if (oldLines[i] !== newLines[i]) {
        diff.push(`${i + 1}- ${oldLines[i]}`);
        diff.push(`${i + 1}+ ${newLines[i]}`);
      }
    }

    // Handle length differences
    if (newLines.length > oldLines.length) {
      const added = newLines.length - oldLines.length;
      diff.push(`... +${added} lines added`);
    } else if (oldLines.length > newLines.length) {
      const removed = oldLines.length - newLines.length;
      diff.push(`... -${removed} lines removed`);
    }

    return diff.join('\n');
  }
}
