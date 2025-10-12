/**
 * either-line-replace: Targeted line edits with text editor pattern
 * Enhanced with exact string matching and comprehensive verification
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

    // Security check
    const guard = new SecurityGuard(context.config.security);
    if (!guard.isPathAllowed(path)) {
      return {
        content: `Error: Access denied to path '${path}'. Path is not in allowed workspaces.`,
        isError: true
      };
    }

    // Use database if fileStore is available
    if (context.fileStore && context.appId) {
      return this.executeWithDatabase(path, locator, replacement, context);
    }

    // Otherwise use filesystem
    const fullPath = resolve(context.workingDir, path);

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

      // Verify needle if provided (text editor pattern: exact match verification)
      if (needle) {
        const needleOccurrences = content.split(needle).length - 1;

        if (needleOccurrences === 0) {
          const preview = targetText.length > 100 ? targetText.substring(0, 100) + '...' : targetText;
          return {
            content: `Error: Needle text not found in file.\n\nExpected to find:\n"${needle}"\n\nBut in lines ${start_line}-${end_line} found:\n"${preview}"\n\nUse either-view to verify current file contents and exact text to match.`,
            isError: true,
            metadata: {
              path,
              needle_mismatch: true,
              expected: needle,
              actualPreview: preview,
              suggestion: 'Use either-view to check file contents and provide exact matching text'
            }
          };
        }

        if (needleOccurrences > 1) {
          return {
            content: `Error: Needle text appears ${needleOccurrences} times in file. Provide more context to create a unique match.\n\nSearching for:\n"${needle}"\n\nProvide more surrounding lines or unique identifiers.`,
            isError: true,
            metadata: {
              path,
              needle_occurrences: needleOccurrences,
              suggestion: 'Include more context in needle to create a unique match'
            }
          };
        }

        if (!targetText.includes(needle)) {
          return {
            content: `Error: Needle found in file but not at specified line range ${start_line}-${end_line}.\n\nUse either-search-files to locate the correct line numbers.`,
            isError: true,
            metadata: {
              path,
              needle_location_mismatch: true,
              suggestion: 'Use either-search-files to find correct line numbers'
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

      // Verify if requested (text editor pattern: always verify by default)
      let verificationMsg = '';
      let isVerified = false;
      if (verify_after) {
        const verified = await readFile(fullPath, 'utf-8');
        const verifiedSha256 = createHash('sha256').update(verified).digest('hex');
        isVerified = verifiedSha256 === newSha256;
        if (!isVerified) {
          verificationMsg = '\n\nWarning: Verification failed - file content differs from expected. File may have been modified by another process.';
        }
      }

      const linesReplaced = end_line - start_line + 1;
      const newLineCount = replacementLines.length;
      const netLineChange = newLineCount - linesReplaced;

      // Generate unified diff
      const diff = this.generateUnifiedDiff(path, targetLines, replacementLines, start_line);

      const summary = netLineChange === 0
        ? `${linesReplaced} line(s)`
        : `${linesReplaced} line(s) → ${newLineCount} line(s) (${netLineChange > 0 ? '+' : ''}${netLineChange})`;

      return {
        content: `Successfully replaced lines ${start_line}-${end_line} in '${path}' (${summary})\n\n${diff}${verificationMsg}`,
        isError: false,
        metadata: {
          path,
          startLine: start_line,
          endLine: end_line,
          linesReplaced,
          newLineCount,
          netLineChange,
          original_sha256: originalSha256,
          new_sha256: newSha256,
          verified: isVerified,
          needleVerified: needle ? true : false
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
   * Execute using database FileStore
   */
  private async executeWithDatabase(
    path: string,
    locator: any,
    replacement: string,
    context: ExecutionContext
  ): Promise<ToolExecutorResult> {
    const { fileStore, appId } = context;
    const { start_line, end_line, needle } = locator;

    try {
      // Read file from database
      const fileData = await fileStore.read(appId, path);

      // Convert content to string
      let content: string;
      if (typeof fileData.content === 'string') {
        content = fileData.content;
      } else if (Buffer.isBuffer(fileData.content)) {
        content = fileData.content.toString('utf-8');
      } else {
        content = Buffer.from(fileData.content).toString('utf-8');
      }

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

      // Verify needle if provided
      if (needle) {
        const needleOccurrences = content.split(needle).length - 1;

        if (needleOccurrences === 0) {
          const preview = targetText.length > 100 ? targetText.substring(0, 100) + '...' : targetText;
          return {
            content: `Error: Needle text not found in file.\n\nExpected to find:\n"${needle}"\n\nBut in lines ${start_line}-${end_line} found:\n"${preview}"\n\nUse either-view to verify current file contents and exact text to match.`,
            isError: true,
            metadata: {
              path,
              needle_mismatch: true,
              expected: needle,
              actualPreview: preview,
              suggestion: 'Use either-view to check file contents and provide exact matching text'
            }
          };
        }

        if (needleOccurrences > 1) {
          return {
            content: `Error: Needle text appears ${needleOccurrences} times in file. Provide more context to create a unique match.\n\nSearching for:\n"${needle}"\n\nProvide more surrounding lines or unique identifiers.`,
            isError: true,
            metadata: {
              path,
              needle_occurrences: needleOccurrences,
              suggestion: 'Include more context in needle to create a unique match'
            }
          };
        }

        if (!targetText.includes(needle)) {
          return {
            content: `Error: Needle found in file but not at specified line range ${start_line}-${end_line}.\n\nUse either-search-files to locate the correct line numbers.`,
            isError: true,
            metadata: {
              path,
              needle_location_mismatch: true,
              suggestion: 'Use either-search-files to find correct line numbers'
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

      // Write back to database
      await fileStore.write(appId, path, newContent);

      const linesReplaced = end_line - start_line + 1;
      const newLineCount = replacementLines.length;
      const netLineChange = newLineCount - linesReplaced;

      // Generate unified diff
      const diff = this.generateUnifiedDiff(path, targetLines, replacementLines, start_line);

      const summary = netLineChange === 0
        ? `${linesReplaced} line(s)`
        : `${linesReplaced} line(s) → ${newLineCount} line(s) (${netLineChange > 0 ? '+' : ''}${netLineChange})`;

      return {
        content: `Successfully replaced lines ${start_line}-${end_line} in '${path}' (${summary}) in database\n\n${diff}`,
        isError: false,
        metadata: {
          path,
          startLine: start_line,
          endLine: end_line,
          linesReplaced,
          newLineCount,
          netLineChange,
          original_sha256: originalSha256,
          new_sha256: newSha256,
          needleVerified: needle ? true : false,
          storage: 'database'
        }
      };
    } catch (error: any) {
      return {
        content: `Error replacing lines in '${path}' in database: ${error.message}`,
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
