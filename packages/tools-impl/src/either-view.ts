/**
 * either-view: Read files with hash and metadata
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { createHash } from 'crypto';
import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';
import { SecurityGuard } from './security.js';

export class EitherViewExecutor implements ToolExecutor {
  name = 'either-view';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const { path, max_bytes = 1048576, encoding = 'utf-8' } = input;
    const fullPath = resolve(context.workingDir, path);

    // Security check
    const guard = new SecurityGuard(context.config.security);
    if (!guard.isPathAllowed(path)) {
      return {
        content: `Error: Access denied to path '${path}'. Path is not in allowed workspaces.`,
        isError: true
      };
    }

    try {
      // Read file with size limit
      const content = await readFile(fullPath, encoding as BufferEncoding);

      // Calculate SHA-256 hash
      const sha256 = createHash('sha256').update(content).digest('hex');

      // Count lines
      const lineCount = content.split('\n').length;

      // Check if truncation needed
      const isTruncated = content.length > max_bytes;

      if (isTruncated) {
        const truncated = content.slice(0, max_bytes);
        const truncatedLines = truncated.split('\n').length;

        return {
          content: `${truncated}\n\n[File truncated: ${content.length} bytes, showing first ${max_bytes} bytes]`,
          isError: false,
          metadata: {
            path,
            encoding,
            size: content.length,
            sha256,
            line_count: lineCount,
            truncated: true,
            shown_lines: truncatedLines
          }
        };
      }

      // Return full content with metadata
      return {
        content,
        isError: false,
        metadata: {
          path,
          encoding,
          size: content.length,
          sha256,
          line_count: lineCount,
          truncated: false
        }
      };
    } catch (error: any) {
      return {
        content: `Error reading file '${path}': ${error.message}`,
        isError: true
      };
    }
  }
}
