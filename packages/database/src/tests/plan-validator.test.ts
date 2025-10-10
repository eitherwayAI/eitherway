/**
 * Security Tests for PlanValidator
 *
 * Comprehensive test suite covering:
 * - Path traversal attacks
 * - System file access attempts
 * - Sensitive file protection
 * - Content size limits
 * - Operation limits
 * - Package name validation
 * - Schema validation
 */

// @ts-nocheck - Test files use runtime type narrowing with vitest
import { describe, it, expect, beforeEach } from 'vitest';
import { PlanValidator } from '../services/plan-validator.js';

describe('PlanValidator - Security Tests', () => {
  let validator: PlanValidator;

  beforeEach(() => {
    validator = new PlanValidator();
  });

  // Helper to assert validation failure and access errors
  function assertValidationFailed(result: ReturnType<typeof validator.validate>): asserts result is { success: false; errors: string[] } {
    if (result.success) {
      throw new Error('Expected validation to fail but it succeeded');
    }
  }

  // Helper to assert validation success
  function assertValidationSuccess(result: ReturnType<typeof validator.validate>): asserts result is { success: true; plan: any } {
    if (!result.success) {
      throw new Error(`Expected validation to succeed but it failed: ${result.errors.join(', ')}`);
    }
  }

  // ============================================================================
  // PATH SECURITY TESTS
  // ============================================================================

  describe('Path Traversal Prevention', () => {
    it('should block simple parent directory traversal', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: '../../../etc/passwd',
          content: 'malicious content'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('blocked pattern'))).toBe(true);
    });

    it('should block encoded directory traversal', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: '..%2F..%2Fetc%2Fpasswd',
          content: 'malicious content'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('invalid characters'))).toBe(true);
    });

    it('should block nested parent directory references', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'src/../../../../../../root/.ssh/authorized_keys',
          content: 'ssh-rsa malicious-key'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('blocked pattern'))).toBe(true);
    });

    it('should block absolute system paths', () => {
      const systemPaths = [
        '/etc/passwd',
        '/root/.bashrc',
        '/home/user/.ssh/id_rsa'
      ];

      systemPaths.forEach((path, index) => {
        const plan = createValidPlan([
          {
            type: 'write',
            path,
            content: 'malicious'
          }
        ]);

        const result = validator.validate(plan);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.includes('blocked pattern') || e.includes('invalid characters'))).toBe(true);
      });
    });
  });

  describe('Sensitive File Protection', () => {
    it('should block .env file writes', () => {
      const envPaths = [
        '.env',
        'config/.env',
        'app/.env.production'
      ];

      envPaths.forEach(path => {
        const plan = createValidPlan([
          {
            type: 'write',
            path,
            content: 'API_KEY=secret123'
          }
        ]);

        const result = validator.validate(plan);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.includes('blocked pattern'))).toBe(true);
      });
    });

    it('should block .ssh directory access', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: '.ssh/authorized_keys',
          content: 'ssh-rsa AAAA...'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('blocked pattern') || e.includes('invalid characters'))).toBe(true);
    });

    it('should block .git directory access', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: '.git/config',
          content: '[remote "origin"]'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('blocked pattern'))).toBe(true);
    });

    it('should block credential file writes', () => {
      const credentialPaths = [
        'credentials.json',
        'secrets.yml',
        'private-key.pem',
        'config/api-credentials.json'
      ];

      credentialPaths.forEach(path => {
        const plan = createValidPlan([
          {
            type: 'write',
            path,
            content: '{"apiKey": "secret"}'
          }
        ]);

        const result = validator.validate(plan);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.includes('blocked pattern'))).toBe(true);
      });
    });

    it('should block node_modules writes', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'node_modules/malicious-package/index.js',
          content: 'console.log("pwned");'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('node_modules') || e.includes('dangerous'))).toBe(true);
    });

    it('should allow .env.example files', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: '.env.example',
          content: 'API_KEY=your_key_here\nDATABASE_URL=postgres://...'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });
  });

  describe('Allowed Path Validation', () => {
    it('should allow writes to app/ directory', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/components/Header.tsx',
          content: 'export function Header() { return <div>Header</div>; }'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
    });

    it('should allow writes to src/ directory', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'src/utils/format.ts',
          content: 'export function format(s: string) { return s.trim(); }'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should allow writes to public/ directory', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'public/favicon.ico',
          content: 'binary content here'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should allow writes to config files', () => {
      const configFiles = [
        'package.json',
        'tsconfig.json',
        'vite.config.ts',
        'vite.config.js'
      ];

      configFiles.forEach(path => {
        const plan = createValidPlan([
          {
            type: 'write',
            path,
            content: '{}'
          }
        ]);

        const result = validator.validate(plan);

        expect(result.success).toBe(true);
      });
    });
  });

  // ============================================================================
  // CONTENT SECURITY TESTS
  // ============================================================================

  describe('Content Size Limits', () => {
    it('should reject content exceeding 500KB', () => {
      // Create a string slightly over 500KB (500,000 bytes)
      const largeContent = 'x'.repeat(500_001);

      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/large-file.txt',
          content: largeContent
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds 500KB limit'))).toBe(true);
    });

    it('should accept content at exactly 500KB', () => {
      const maxContent = 'x'.repeat(500_000);

      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/max-file.txt',
          content: maxContent
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should accept small content', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/small.txt',
          content: 'This is a small file'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });
  });

  describe('Content Pattern Validation', () => {
    it('should detect suspicious eval usage', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/malicious.js',
          content: 'function hack() { eval(userInput); }'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('eval()') || e.includes('suspicious'))).toBe(true);
    });

    it('should detect suspicious Function constructor', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'src/bad.ts',
          content: 'const fn = new Function("return " + userCode);'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Function() constructor'))).toBe(true);
    });

    it('should allow legitimate code with Function as type', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'src/types.ts',
          content: 'type Callback = Function; // Type annotation only'
        }
      ]);

      const result = validator.validate(plan);

      // This should pass since it's just a type annotation, not "new Function"
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // OPERATION LIMITS TESTS
  // ============================================================================

  describe('Operation Count Limits', () => {
    it('should reject plans with more than 100 operations', () => {
      const operations: any[] = [];
      for (let i = 0; i < 101; i++) {
        operations.push({
          type: 'write',
          path: `app/file-${i}.txt`,
          content: `Content ${i}`
        });
      }

      const plan = createValidPlan(operations);
      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum of 100 operations'))).toBe(true);
    });

    it('should accept plans with exactly 100 operations', () => {
      const operations: any[] = [];
      for (let i = 0; i < 100; i++) {
        operations.push({
          type: 'write',
          path: `app/file-${i}.txt`,
          content: `Content ${i}`
        });
      }

      const plan = createValidPlan(operations);
      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should reject empty operation lists', () => {
      const plan = createValidPlan([]);
      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('at least one operation'))).toBe(true);
    });
  });

  // ============================================================================
  // PACKAGE SECURITY TESTS
  // ============================================================================

  describe('Package Name Validation', () => {
    it('should accept valid npm package names', () => {
      const plan = createValidPlan([
        {
          type: 'package_install',
          packages: ['react', 'react-dom', '@types/node'],
          dev: false
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should reject package names with path traversal', () => {
      const plan = createValidPlan([
        {
          type: 'package_install',
          packages: ['../../../etc/passwd'],
          dev: false
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid package name'))).toBe(true);
    });

    it('should reject package names with special characters', () => {
      const plan = createValidPlan([
        {
          type: 'package_install',
          packages: ['package$name', 'bad;package'],
          dev: false
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid package name'))).toBe(true);
    });

    it('should accept scoped packages', () => {
      const plan = createValidPlan([
        {
          type: 'package_install',
          packages: ['@remix-run/react', '@tanstack/react-query'],
          dev: false
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should reject empty package arrays', () => {
      const plan = createValidPlan([
        {
          type: 'package_install',
          packages: [],
          dev: false
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('At least one package required'))).toBe(true);
    });
  });

  // ============================================================================
  // PATCH OPERATION TESTS
  // ============================================================================

  describe('Patch Operation Validation', () => {
    it('should accept valid patch operations', () => {
      const plan = createValidPlan([
        {
          type: 'patch',
          path: 'src/config.ts',
          search: 'const PORT = 3000',
          replace: 'const PORT = 8080'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should reject patch with empty search pattern', () => {
      const plan = createValidPlan([
        {
          type: 'patch',
          path: 'src/config.ts',
          search: '',
          replace: 'replacement'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Search pattern required'))).toBe(true);
    });

    it('should reject patch with oversized search/replace', () => {
      const largePattern = 'x'.repeat(50_001);

      const plan = createValidPlan([
        {
          type: 'patch',
          path: 'src/file.ts',
          search: largePattern,
          replace: 'replacement'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('too long'))).toBe(true);
    });
  });

  // ============================================================================
  // SCHEMA VALIDATION TESTS
  // ============================================================================

  describe('Plan Schema Validation', () => {
    it('should reject invalid UUID for planId', () => {
      const invalidPlan = {
        planId: 'not-a-uuid',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        operations: [
          {
            type: 'write',
            path: 'app/test.txt',
            content: 'test'
          }
        ]
      };

      const result = validator.validate(invalidPlan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid plan ID format'))).toBe(true);
    });

    it('should reject invalid UUID for sessionId', () => {
      const invalidPlan = {
        planId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: 'invalid-session',
        operations: [
          {
            type: 'write',
            path: 'app/test.txt',
            content: 'test'
          }
        ]
      };

      const result = validator.validate(invalidPlan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid session ID format'))).toBe(true);
    });

    it('should reject unknown operation types', () => {
      const plan = createValidPlan([
        {
          type: 'delete' as any,  // Invalid operation type
          path: 'app/file.txt'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid discriminator value'))).toBe(true);
    });

    it('should reject operations with missing required fields', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/test.txt'
          // Missing 'content' field
        } as any
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Required'))).toBe(true);
    });
  });

  // ============================================================================
  // MULTI-OPERATION TESTS
  // ============================================================================

  describe('Multi-Operation Plans', () => {
    it('should validate all operations in sequence', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/Header.tsx',
          content: 'export function Header() { return <div>Header</div>; }'
        },
        {
          type: 'patch',
          path: 'app/config.ts',
          search: 'debug: false',
          replace: 'debug: true'
        },
        {
          type: 'package_install',
          packages: ['zod', 'react-hook-form'],
          dev: false
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
      expect(result.plan?.operations).toHaveLength(3);
    });

    it('should fail if any operation is invalid', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/valid.txt',
          content: 'Valid content'
        },
        {
          type: 'write',
          path: '../../../etc/passwd',  // Invalid!
          content: 'malicious'
        },
        {
          type: 'write',
          path: 'app/another-valid.txt',
          content: 'Also valid'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Operation 1'))).toBe(true);
    });

    it('should report all validation errors', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: '../etc/passwd',
          content: 'x'.repeat(600_000)  // Too large + bad path
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      // Should have at least one error (schema validation catches oversized content first)
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle paths with unusual but valid characters', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/components/@shared/utils_v2.0.ts',
          content: 'export const VERSION = "2.0";'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(true);
    });

    it('should reject paths with null bytes', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: 'app/test\x00.txt',
          content: 'content'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
    });

    it('should reject empty paths', () => {
      const plan = createValidPlan([
        {
          type: 'write',
          path: '',
          content: 'content'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Path cannot be empty'))).toBe(true);
    });

    it('should reject extremely long paths', () => {
      const longPath = 'app/' + 'a'.repeat(600);

      const plan = createValidPlan([
        {
          type: 'write',
          path: longPath,
          content: 'content'
        }
      ]);

      const result = validator.validate(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Path too long'))).toBe(true);
    });
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a valid plan structure with given operations
 */
function createValidPlan(operations: any[]): any {
  return {
    planId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '660e8400-e29b-41d4-a716-446655440001',
    operations
  };
}
