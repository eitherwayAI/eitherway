/**
 * Plan Validator - Security-first validation of AI-generated plans
 *
 * Architecture:
 * - Zod schemas for type-safe validation
 * - Allow-list approach for file paths
 * - Regex-based security filters
 * - Comprehensive error reporting
 */

import { z } from 'zod';

// OPERATION SCHEMAS

/**
 * Write operation: Create or overwrite files
 * Security: Path must be in allowed directories, content size limited
 */
const WriteOpSchema = z.object({
  type: z.literal('write'),
  path: z.string()
    .min(1, 'Path cannot be empty')
    .max(500, 'Path too long')
    .regex(/^[\w\-\/\.@]+$/, 'Path contains invalid characters'),
  content: z.string().max(500_000, 'Content exceeds 500KB limit'),
  overwrite: z.boolean().optional().default(false)
});

/**
 * Patch operation: Find-and-replace within existing files
 * Security: Path must exist, search pattern required
 */
const PatchOpSchema = z.object({
  type: z.literal('patch'),
  path: z.string()
    .min(1, 'Path cannot be empty')
    .regex(/^[\w\-\/\.@]+$/, 'Path contains invalid characters'),
  search: z.string().min(1, 'Search pattern required').max(10_000, 'Search pattern too long'),
  replace: z.string().max(10_000, 'Replacement text too long')
});

/**
 * Package install operation: Add npm dependencies
 * Security: Package names must follow npm naming conventions
 */
const PackageInstallSchema = z.object({
  type: z.literal('package_install'),
  packages: z.array(
    z.string()
      .regex(/^(@[\w\-]+\/)?[\w\-]+$/, 'Invalid package name format')
      .max(100, 'Package name too long')
  )
    .min(1, 'At least one package required')
    .max(20, 'Too many packages (max 20 per operation)'),
  dev: z.boolean().optional().default(false)
});

/**
 * Package remove operation: Remove npm dependencies
 * Security: Package names validated
 */
const PackageRemoveSchema = z.object({
  type: z.literal('package_remove'),
  packages: z.array(
    z.string()
      .regex(/^(@[\w\-]+\/)?[\w\-]+$/, 'Invalid package name format')
      .max(100, 'Package name too long')
  )
    .min(1, 'At least one package required')
    .max(20, 'Too many packages (max 20 per operation)')
});

/**
 * Discriminated union of all supported operation types
 */
const PlanOperationSchema = z.discriminatedUnion('type', [
  WriteOpSchema,
  PatchOpSchema,
  PackageInstallSchema,
  PackageRemoveSchema
]);

/**
 * Plan schema: Collection of operations with metadata
 */
const PlanSchema = z.object({
  planId: z.string().uuid('Invalid plan ID format'),
  sessionId: z.string().uuid('Invalid session ID format'),
  operations: z.array(PlanOperationSchema)
    .min(1, 'Plan must contain at least one operation')
    .max(100, 'Plan exceeds maximum of 100 operations')
});

// TYPES

export type WriteOp = z.infer<typeof WriteOpSchema>;
export type PatchOp = z.infer<typeof PatchOpSchema>;
export type PackageInstallOp = z.infer<typeof PackageInstallSchema>;
export type PackageRemoveOp = z.infer<typeof PackageRemoveSchema>;
export type PlanOperation = z.infer<typeof PlanOperationSchema>;
export type Plan = z.infer<typeof PlanSchema>;

// VALIDATOR CLASS

export class PlanValidator {
  /**
   * Allowed file path patterns (whitelist approach)
   * These paths are considered safe for AI-generated content
   */
  private static readonly ALLOWED_DIRS: RegExp[] = [
    // Source directories
    /^app\//,
    /^src\//,
    /^components\//,
    /^lib\//,
    /^utils\//,
    /^hooks\//,
    /^services\//,
    /^api\//,
    /^routes\//,
    /^pages\//,

    // Asset directories
    /^public\//,
    /^static\//,
    /^assets\//,
    /^styles\//,
    /^css\//,

    // Documentation
    /^docs\//,
    /^README\.md$/,
    /^CHANGELOG\.md$/,

    // Configuration files (specific allowed files)
    /^package\.json$/,
    /^package-lock\.json$/,
    /^tsconfig\.json$/,
    /^tsconfig\..*\.json$/,
    /^vite\.config\.(ts|js|mjs)$/,
    /^vitest\.config\.(ts|js)$/,
    /^tailwind\.config\.(ts|js)$/,
    /^postcss\.config\.(js|cjs)$/,
    /^\.eslintrc\.(js|json|yaml|yml)$/,
    /^\.prettierrc\.(js|json|yaml|yml)$/,
    /^\.env\.example$/,
    /^\.gitignore$/,
    /^\.npmrc$/,
  ];

  /**
   * Blocked path patterns (blacklist - takes precedence)
   * These patterns indicate security risks or system files
   */
  private static readonly BLOCKED_PATTERNS: RegExp[] = [
    // Directory traversal
    /\.\./,
    /\/\//,

    // System directories
    /^\/etc\//,
    /^\/root\//,
    /^\/home\//,
    /^\/usr\//,
    /^\/var\//,
    /^\/sys\//,
    /^\/proc\//,
    /^\/dev\//,
    /^\/bin\//,
    /^\/sbin\//,
    /^C:\\/,
    /^D:\\/,

    // Sensitive files
    /\.env$/,
    /\.env\.local$/,
    /\.env\.production$/,
    /\.env\.development$/,
    /secrets\./i,
    /credentials/i,
    /private.*key/i,
    /\.pem$/,
    /\.key$/,
    /\.cert$/,

    // Version control and dependencies
    /^\.git\//,
    /^\.svn\//,
    /^\.hg\//,
    /^node_modules\//,
    /^\.next\//,
    /^dist\//,
    /^build\//,
    /^out\//,
    /^coverage\//,

    // SSH and security
    /\.ssh\//,
    /\.gnupg\//,
    /authorized_keys/,
    /known_hosts/,

    // Database files
    /\.db$/,
    /\.sqlite$/,
    /\.sql$/,

    // Hidden system files
    /^\.DS_Store$/,
    /^thumbs\.db$/i,
    /^desktop\.ini$/i,
  ];

  /**
   * Validate a plan against all security rules
   *
   * @param planData - Raw plan data from client
   * @returns Validation result with typed plan or errors
   */
  validate(planData: unknown):
    | { success: true; plan: Plan }
    | { success: false; errors: string[] }
  {
    // Phase 1: Schema validation
    const parsed = PlanSchema.safeParse(planData);

    if (!parsed.success) {
      return {
        success: false,
        errors: parsed.error.errors.map(e =>
          `${e.path.join('.')}: ${e.message}`
        )
      };
    }

    const plan = parsed.data;
    const errors: string[] = [];

    // Phase 2: Path security validation
    plan.operations.forEach((op, idx) => {
      if (op.type === 'write' || op.type === 'patch') {
        const pathCheck = this.validatePath(op.path);

        if (!pathCheck.valid) {
          errors.push(`Operation ${idx} (${op.type}): ${pathCheck.reason}`);
        }
      }
    });

    // Phase 3: Content security validation (for write operations)
    plan.operations.forEach((op, idx) => {
      if (op.type === 'write') {
        const contentCheck = this.validateContent(op.content, op.path);

        if (!contentCheck.valid) {
          errors.push(`Operation ${idx} (write): ${contentCheck.reason}`);
        }
      }
    });

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, plan };
  }

  /**
   * Validate file path against security rules
   *
   * @param path - File path to validate
   * @returns Validation result with reason if invalid
   */
  private validatePath(path: string): { valid: boolean; reason?: string } {
    for (const pattern of PlanValidator.BLOCKED_PATTERNS) {
      if (pattern.test(path)) {
        return {
          valid: false,
          reason: `Path '${path}' matches blocked pattern (security risk)`
        };
      }
    }

    let isAllowed = false;
    for (const pattern of PlanValidator.ALLOWED_DIRS) {
      if (pattern.test(path)) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      return {
        valid: false,
        reason: `Path '${path}' is not in allowed directories`

      };
    }

    return { valid: true };
  }

  /**
   * Validate file content for security issues
   *
   * @param content - File content to validate
   * @param path - File path for context
   * @returns Validation result
   */
  private validateContent(content: string, path: string): { valid: boolean; reason?: string } {
    const suspiciousPatterns = [
      { pattern: /eval\s*\(/i, reason: 'Contains eval() - potential code injection risk' },
      { pattern: /new\s+Function\s*\(/i, reason: 'Contains Function() constructor - potential code injection risk' },
      { pattern: /exec\s*\(/i, reason: 'Contains exec() - potential command injection risk' },
      { pattern: /(rm\s+-rf|rmdir\s+\/)/i, reason: 'Contains dangerous file deletion commands' },
      { pattern: /curl.*\|\s*(bash|sh)/i, reason: 'Contains pipe to shell - potential RCE risk' },
    ];

    // Only check JavaScript/TypeScript files
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(path)) {
      for (const { pattern, reason } of suspiciousPatterns) {
        if (pattern.test(content)) {
          return { valid: false, reason };
        }
      }
    }

    return { valid: true };
  }

  static getAllowedPatterns(): string[] {
    return PlanValidator.ALLOWED_DIRS.map(p => p.source);
  }

  static getBlockedPatterns(): string[] {
    return PlanValidator.BLOCKED_PATTERNS.map(p => p.source);
  }
}
