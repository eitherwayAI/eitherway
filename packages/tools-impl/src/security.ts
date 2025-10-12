/**
 * Security utilities for path validation
 * Duplicated from runtime for tools-impl independence
 */

import type { AgentConfig } from '@eitherway/tools-core';

export class SecurityGuard {
  private allowedPaths: string[];
  private deniedPaths: string[];
  private secretPatterns: RegExp[];

  constructor(config: AgentConfig['security']) {
    this.allowedPaths = config.allowedWorkspaces;
    this.deniedPaths = config.deniedPaths;
    this.secretPatterns = config.secretPatterns.map(p => new RegExp(p, 'g'));
  }

  /**
   * Check if a path is allowed
   */
  isPathAllowed(path: string): boolean {
    // Check denied paths first
    for (const denied of this.deniedPaths) {
      if (this.matchGlob(path, denied)) {
        return false;
      }
    }

    // Check allowed paths
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
