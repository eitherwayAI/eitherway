/**
 * either-line-replace: Targeted line edits with unified diff and sha256 verification
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { createHash } from 'crypto';
import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';
import { SecurityGuard } from './security.js';

export class EitherLineReplaceExecutor implements ToolExecutor {
  name = 'either-line-replace';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const { path, locator, replacement, verify_after = true } = input;
    const { start_line, end_line, needle } = locator;
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
      // Read file and calculate original sha256
      const content = await readFile(fullPath, 'utf-8');
      const originalSha256 = createHash('sha256').update(content).digest('hex');
      const lines = content.split('\n');

      // Validate line numbers
      if (start_line < 1 || start_line > lines.length) {
        return {
          content: `Error: start_line ${start_line} out of range (file has ${lines.length} lines)`,
          isError: true
        };
      }

      if (end_line < start_line || end_line > lines.length) {
        return {
          content: `Error: end_line ${end_line} invalid (must be >= start_line and <= ${lines.length})`,
          isError: true
        };
      }

      // Extract target lines
      const targetLines = lines.slice(start_line - 1, end_line);
      const targetText = targetLines.join('\n');

      // Verify needle if provided (safer edits)
      if (needle) {
        if (!targetText.includes(needle)) {
          return {
            content: `Error: Needle text not found in lines ${start_line}-${end_line}.\n\nExpected to find:\n"${needle}"\n\nBut found:\n"${targetText}"\n\nThis is a non-fatal error. You may re-locate the correct lines and retry.`,
            isError: true,
            metadata: {
              path,
              needle_mismatch: true,
              expected: needle,
              found: targetText,
              suggestion: 'Use either-view or either-search-files to locate the correct lines'
            }
          };
        }
      }

      // Perform replacement
      const before = lines.slice(0, start_line - 1);
      const after = lines.slice(end_line);
      const replacementLines = replacement.split('\n');

      const newLines = [...before, ...replacementLines, ...after];
      const newContent = newLines.join('\n');

      // Calculate new sha256
      const newSha256 = createHash('sha256').update(newContent).digest('hex');

      // Write back
      await writeFile(fullPath, newContent, 'utf-8');

      // Verify if requested
      let verificationMsg = '';
      if (verify_after) {
        const verified = await readFile(fullPath, 'utf-8');
        const verifiedSha256 = createHash('sha256').update(verified).digest('hex');
        if (verifiedSha256 !== newSha256) {
          verificationMsg = '\n⚠ Warning: Verification failed - file content differs from expected';
        }
      }

      const linesReplaced = end_line - start_line + 1;
      const newLineCount = replacementLines.length;

      // Generate unified diff
      const diff = this.generateUnifiedDiff(path, targetLines, replacementLines, start_line);

      return {
        content: `Successfully replaced lines ${start_line}-${end_line} in '${path}'\n\n${diff}${verificationMsg}`,
        isError: false,
        metadata: {
          path,
          startLine: start_line,
          endLine: end_line,
          linesReplaced,
          newLineCount,
          original_sha256: originalSha256,
          new_sha256: newSha256,
          verified: verify_after
        }
      };
    } catch (error: any) {
      return {
        content: `Error replacing lines in '${path}': ${error.message}`,
        isError: true
      };
    }
  }

  /**
   * Generate unified diff format
   */
  private generateUnifiedDiff(
    path: string,
    oldLines: string[],
    newLines: string[],
    startLine: number
  ): string {
    const diff: string[] = [];

    diff.push(`--- ${path}`);
    diff.push(`+++ ${path}`);
    diff.push(`@@ -${startLine},${oldLines.length} +${startLine},${newLines.length} @@`);

    // Show removed lines
    oldLines.forEach(line => {
      diff.push(`-${line}`);
    });

    // Show added lines
    newLines.forEach(line => {
      diff.push(`+${line}`);
    });

    return diff.join('\n');
  }
}
