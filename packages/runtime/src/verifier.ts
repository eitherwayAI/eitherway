/**
 * VerifierRunner: Automatic verification of workspace changes
 * Runs tests, linting, and builds to ensure changes are valid
 */

import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

export interface VerifyStep {
  name: string;
  ok: boolean;
  output?: string;
  duration?: number;
}

export interface VerifyResult {
  steps: VerifyStep[];
  passed: boolean;
  totalDuration: number;
}

export class VerifierRunner {
  constructor(private workingDir: string) {}

  /**
   * Run verification checks based on project type
   */
  async run(): Promise<VerifyResult> {
    const startTime = Date.now();
    const pkgPath = resolve(this.workingDir, 'package.json');

    let pkg: any = null;
    try {
      const content = await readFile(pkgPath, 'utf-8');
      pkg = JSON.parse(content);
    } catch {
      // No package.json - likely a static project
    }

    const steps: VerifyStep[] = [];

    if (pkg) {
      // Node.js project - run available scripts in order
      const scriptChecks = [
        { script: 'typecheck', name: 'Type Check' },
        { script: 'lint', name: 'Lint' },
        { script: 'test', name: 'Test' },
        { script: 'build', name: 'Build' },
      ];

      for (const check of scriptChecks) {
        if (pkg.scripts?.[check.script]) {
          const stepStartTime = Date.now();
          const result = await this.runCommand(['npm', 'run', check.script]);
          const duration = Date.now() - stepStartTime;

          steps.push({
            name: check.name,
            ok: result.ok,
            output: result.output,
            duration,
          });

          // If a critical step fails, stop verification
          if (!result.ok && (check.script === 'typecheck' || check.script === 'test')) {
            break;
          }
        }
      }
    } else {
      // Static project - basic sanity checks
      steps.push(await this.runStaticChecks());
    }

    const totalDuration = Date.now() - startTime;
    const passed = steps.length > 0 ? steps.every((s) => s.ok) : true;

    return {
      steps,
      passed,
      totalDuration,
    };
  }

  /**
   * Run basic sanity checks for static projects
   */
  private async runStaticChecks(): Promise<VerifyStep> {
    const indexPath = resolve(this.workingDir, 'index.html');

    try {
      const content = await readFile(indexPath, 'utf-8');

      // Basic HTML validation
      const hasDoctype = content.trim().toLowerCase().startsWith('<!doctype html');
      const hasClosingHtml = content.includes('</html>');

      if (hasDoctype && hasClosingHtml) {
        return {
          name: 'Static Validation',
          ok: true,
          output: 'index.html appears well-formed',
          duration: 0,
        };
      } else {
        return {
          name: 'Static Validation',
          ok: false,
          output: 'index.html may be malformed (missing doctype or closing tag)',
          duration: 0,
        };
      }
    } catch {
      return {
        name: 'Static Validation',
        ok: true,
        output: 'No index.html found - skipping validation',
        duration: 0,
      };
    }
  }

  /**
   * Execute a shell command and return result
   */
  private runCommand(cmd: string[]): Promise<{ ok: boolean; output: string }> {
    return new Promise((resolve) => {
      const proc = spawn(cmd[0], cmd.slice(1), {
        cwd: this.workingDir,
        shell: process.platform === 'win32',
        env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
      });

      let output = '';
      const outputLimit = 5000; // Limit output to 5000 chars

      proc.stdout.on('data', (data) => {
        if (output.length < outputLimit) {
          output += data.toString();
        }
      });

      proc.stderr.on('data', (data) => {
        if (output.length < outputLimit) {
          output += data.toString();
        }
      });

      proc.on('close', (code) => {
        if (output.length >= outputLimit) {
          output = output.slice(0, outputLimit) + '\n... (output truncated)';
        }

        resolve({
          ok: code === 0,
          output: output.trim(),
        });
      });

      proc.on('error', (error) => {
        resolve({
          ok: false,
          output: `Failed to execute command: ${error.message}`,
        });
      });

      // Timeout after 60 seconds
      setTimeout(() => {
        proc.kill();
        resolve({
          ok: false,
          output: 'Command timed out after 60 seconds',
        });
      }, 60000);
    });
  }

  /**
   * Format verification result as a concise summary
   */
  static formatSummary(result: VerifyResult): string {
    if (result.steps.length === 0) {
      return '✓ No verification steps configured';
    }

    const lines: string[] = ['\n**Verification Results:**'];

    for (const step of result.steps) {
      const icon = step.ok ? '✓' : '✗';
      const time = step.duration ? ` (${step.duration}ms)` : '';
      lines.push(`  ${icon} ${step.name}${time}`);

      // Include brief error output for failed steps
      if (!step.ok && step.output) {
        const errorLines = step.output.split('\n').slice(0, 5); // First 5 lines
        for (const line of errorLines) {
          if (line.trim()) {
            lines.push(`    ${line.trim()}`);
          }
        }
      }
    }

    const summary = result.passed ? 'All checks passed ✓' : 'Some checks failed ✗';
    lines.push(`\n${summary} (${result.totalDuration}ms total)`);

    return lines.join('\n');
  }
}
