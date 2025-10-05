/**
 * either-search-files: Search code for patterns with regex support
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import fg from 'fast-glob';
import type { ToolExecutor, ExecutionContext, ToolExecutorResult } from '@eitherway/tools-core';
import { SecurityGuard } from './security.js';

interface SearchMatch {
  path: string;
  line: number;
  snippet: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

export class EitherSearchFilesExecutor implements ToolExecutor {
  name = 'either-search-files';

  async execute(input: Record<string, any>, context: ExecutionContext): Promise<ToolExecutorResult> {
    const {
      query,
      glob = 'src/**/*',
      max_results = 100,
      regex = false,
      context_lines = 0
    } = input;

    try {
      // Find files matching glob pattern
      const files = await fg(glob, {
        cwd: context.workingDir,
        absolute: false,
        onlyFiles: true,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.min.js', '*.map']
      });

      const guard = new SecurityGuard(context.config.security);
      const matches: SearchMatch[] = [];

      // Prepare search pattern
      let searchPattern: RegExp;
      if (regex) {
        try {
          searchPattern = new RegExp(query, 'g');
        } catch (error: any) {
          return {
            content: `Invalid regex pattern: ${error.message}`,
            isError: true
          };
        }
      } else {
        // Escape special regex characters for literal search
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchPattern = new RegExp(escapedQuery, 'g');
      }

      // Search in each file
      for (const file of files) {
        if (!guard.isPathAllowed(file)) {
          continue; // Skip disallowed files
        }

        try {
          const fullPath = resolve(context.workingDir, file);
          const content = await readFile(fullPath, 'utf-8');
          const lines = content.split('\n');

          // Search for pattern
          for (let i = 0; i < lines.length; i++) {
            // Reset regex lastIndex before each test to avoid missed matches
            searchPattern.lastIndex = 0;
            if (searchPattern.test(lines[i])) {
              const match: SearchMatch = {
                path: file,
                line: i + 1,
                snippet: lines[i]
              };

              // Add context lines if requested
              if (context_lines > 0) {
                const startIdx = Math.max(0, i - context_lines);
                const endIdx = Math.min(lines.length - 1, i + context_lines);

                if (startIdx < i) {
                  match.contextBefore = lines.slice(startIdx, i);
                }
                if (endIdx > i) {
                  match.contextAfter = lines.slice(i + 1, endIdx + 1);
                }
              }

              matches.push(match);

              if (matches.length >= max_results) {
                break;
              }
            }
          }

          if (matches.length >= max_results) {
            break;
          }
        } catch (error) {
          // Skip files that can't be read (binary, etc.)
          continue;
        }
      }

      if (matches.length === 0) {
        return {
          content: `No matches found for "${query}" in ${glob}`,
          isError: false,
          metadata: {
            query,
            glob,
            regex,
            filesSearched: files.length,
            matchCount: 0
          }
        };
      }

      // Format results with context
      const resultText = matches.map(m => {
        let output = `${m.path}:${m.line}: ${m.snippet}`;

        if (m.contextBefore && m.contextBefore.length > 0) {
          const before = m.contextBefore.map((line, idx) =>
            `  ${m.line - m.contextBefore!.length + idx} | ${line}`
          ).join('\n');
          output = `${before}\n${output}`;
        }

        if (m.contextAfter && m.contextAfter.length > 0) {
          const after = m.contextAfter.map((line, idx) =>
            `  ${m.line + idx + 1} | ${line}`
          ).join('\n');
          output = `${output}\n${after}`;
        }

        return output;
      }).join('\n---\n');

      return {
        content: `Found ${matches.length} match(es) in ${glob}:\n\n${resultText}`,
        isError: false,
        metadata: {
          query,
          glob,
          regex,
          filesSearched: files.length,
          matchCount: matches.length,
          matches: matches.map(m => ({ path: m.path, line: m.line }))
        }
      };
    } catch (error: any) {
      return {
        content: `Error searching files: ${error.message}`,
        isError: true
      };
    }
  }
}
