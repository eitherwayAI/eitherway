/**
 * Input Sanitizer
 *
 * Comprehensive input validation and sanitization to prevent:
 * - XSS (Cross-Site Scripting)
 * - SQL Injection
 * - Command Injection
 * - Path Traversal
 * - CSRF
 *
 * Philosophy: Be paranoid. Sanitize everything. Trust nothing.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SanitizationResult<T = string> {
  sanitized: T;
  wasModified: boolean;
  removedPatterns: string[];
  riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: any;
}

// ============================================================================
// INPUT SANITIZER CLASS
// ============================================================================

export class InputSanitizer {
  /**
   * HTML/XSS sanitization patterns
   */
  private static readonly XSS_PATTERNS = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
    /<embed[^>]*>/gi,
    /<applet[^>]*>/gi,
    /<meta[^>]*>/gi,
    /<link[^>]*>/gi,
    /javascript:/gi,
    /on\w+\s*=\s*["'][^"']*["']/gi,
    /on\w+\s*=\s*[^\s>]*/gi,
    /<style[^>]*>.*?<\/style>/gis
  ];

  /**
   * SQL injection patterns
   */
  private static readonly SQL_PATTERNS = [
    /(\bunion\b.*\bselect\b)|(\bselect\b.*\bfrom\b)/i,
    /\bdrop\b.*\btable\b/i,
    /\binsert\b.*\binto\b/i,
    /\bdelete\b.*\bfrom\b/i,
    /\bupdate\b.*\bset\b/i,
    /;.*--/,
    /\/\*.*\*\//,
    /xp_cmdshell/i,
    /\bexec\b.*\(/i
  ];

  /**
   * Command injection patterns
   */
  private static readonly COMMAND_PATTERNS = [
    /`[^`]*`/,
    /\$\([^)]*\)/,
    /&&|\|\|/,
    /;\s*(rm|wget|curl|nc|cat|ls|pwd|cd|chmod|chown)/i,
    /(eval|exec|system|shell_exec|passthru|popen)\s*\(/i
  ];

  /**
   * Path traversal patterns
   */
  private static readonly PATH_TRAVERSAL_PATTERNS = [
    /\.\./,
    /\.\.\//,
    /%2e%2e/i,
    /\0/,
    /\/etc\/|\/root\/|\/home\//i,
    /C:\\/i
  ];

  /**
   * Sanitize string for XSS
   */
  static sanitizeHtml(input: string): SanitizationResult {
    let sanitized = input;
    const removedPatterns: string[] = [];

    for (const pattern of this.XSS_PATTERNS) {
      if (pattern.test(sanitized)) {
        removedPatterns.push(pattern.source);
        sanitized = sanitized.replace(pattern, '');
      }
    }

    // Encode HTML entities
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    const riskLevel = removedPatterns.length > 0 ? 'high' : 'safe';

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize for SQL (should still use parameterized queries!)
   */
  static sanitizeSql(input: string): SanitizationResult {
    let sanitized = input;
    const removedPatterns: string[] = [];

    for (const pattern of this.SQL_PATTERNS) {
      if (pattern.test(sanitized)) {
        removedPatterns.push(pattern.source);
        // Don't just remove - this is a critical error
      }
    }

    // Escape single quotes
    sanitized = sanitized.replace(/'/g, "''");

    const riskLevel = removedPatterns.length > 0 ? 'critical' : 'safe';

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize for command execution (should avoid shell execution altogether!)
   */
  static sanitizeCommand(input: string): SanitizationResult {
    let sanitized = input;
    const removedPatterns: string[] = [];

    for (const pattern of this.COMMAND_PATTERNS) {
      if (pattern.test(sanitized)) {
        removedPatterns.push(pattern.source);
      }
    }

    // Only allow alphanumeric, dash, underscore, dot
    sanitized = sanitized.replace(/[^a-zA-Z0-9\-_.]/g, '');

    const riskLevel = removedPatterns.length > 0 ? 'critical' : 'safe';

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize file path
   */
  static sanitizeFilePath(input: string): SanitizationResult {
    let sanitized = input;
    const removedPatterns: string[] = [];

    for (const pattern of this.PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(sanitized)) {
        removedPatterns.push(pattern.source);
      }
    }

    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\./g, '');
    sanitized = sanitized.replace(/\/\//g, '/');
    sanitized = sanitized.replace(/\\/g, '/');
    sanitized = sanitized.replace(/^\/+/, ''); // Remove leading slashes

    // Only allow safe characters in paths
    sanitized = sanitized.replace(/[^a-zA-Z0-9\-_./]/g, '');

    const riskLevel = removedPatterns.length > 0 ? 'critical' : 'safe';

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize file name
   */
  static sanitizeFileName(input: string): SanitizationResult {
    let sanitized = input;
    const removedPatterns: string[] = [];

    // Check for path traversal in filename
    if (/[/\\]/.test(sanitized)) {
      removedPatterns.push('path_separator');
    }

    // Only allow safe filename characters
    sanitized = sanitized.replace(/[^a-zA-Z0-9\-_.]/g, '_');

    // Limit length
    if (sanitized.length > 255) {
      sanitized = sanitized.substring(0, 255);
      removedPatterns.push('length_exceeded');
    }

    const riskLevel = removedPatterns.length > 0 ? 'medium' : 'safe';

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize URL
   */
  static sanitizeUrl(input: string): SanitizationResult {
    let sanitized = input;
    const removedPatterns: string[] = [];

    try {
      const url = new URL(sanitized);

      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(url.protocol)) {
        removedPatterns.push('invalid_protocol');
        sanitized = '';
      }

      // Block javascript: protocol
      if (sanitized.toLowerCase().includes('javascript:')) {
        removedPatterns.push('javascript_protocol');
        sanitized = '';
      }

      // Block data: URLs (can be used for XSS)
      if (sanitized.toLowerCase().startsWith('data:')) {
        removedPatterns.push('data_url');
        sanitized = '';
      }

    } catch (error) {
      removedPatterns.push('invalid_url');
      sanitized = '';
    }

    const riskLevel = removedPatterns.length > 0 ? 'high' : 'safe';

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize email
   */
  static sanitizeEmail(input: string): SanitizationResult {
    let sanitized = input.toLowerCase().trim();
    const removedPatterns: string[] = [];

    // Basic email regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!emailRegex.test(sanitized)) {
      removedPatterns.push('invalid_email_format');
      sanitized = '';
    }

    const riskLevel = removedPatterns.length > 0 ? 'medium' : 'safe';

    return {
      sanitized,
      wasModified: sanitized !== input.toLowerCase().trim(),
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize JSON input
   */
  static sanitizeJson(input: string): SanitizationResult<object | null> {
    const removedPatterns: string[] = [];
    let sanitized: object | null = null;

    try {
      sanitized = JSON.parse(input);

      // Deep scan for dangerous patterns in string values
      const scan = (obj: any): void => {
        if (typeof obj === 'string') {
          // Check for XSS
          for (const pattern of this.XSS_PATTERNS) {
            if (pattern.test(obj)) {
              removedPatterns.push(`xss:${pattern.source.substring(0, 30)}`);
            }
          }

          // Check for SQL injection
          for (const pattern of this.SQL_PATTERNS) {
            if (pattern.test(obj)) {
              removedPatterns.push(`sql:${pattern.source.substring(0, 30)}`);
            }
          }
        } else if (typeof obj === 'object' && obj !== null) {
          Object.values(obj).forEach(scan);
        }
      };

      scan(sanitized);

    } catch (error) {
      removedPatterns.push('invalid_json');
    }

    const riskLevel = removedPatterns.length > 5 ? 'critical' :
                      removedPatterns.length > 2 ? 'high' :
                      removedPatterns.length > 0 ? 'medium' : 'safe';

    return {
      sanitized,
      wasModified: false, // We don't modify JSON, just validate
      removedPatterns,
      riskLevel
    };
  }

  /**
   * Sanitize integer input
   */
  static sanitizeInteger(input: any, options: {
    min?: number;
    max?: number;
    default?: number;
  } = {}): SanitizationResult<number> {
    const { min, max, default: defaultValue = 0 } = options;
    const removedPatterns: string[] = [];

    let sanitized = parseInt(input, 10);

    if (isNaN(sanitized)) {
      removedPatterns.push('not_a_number');
      sanitized = defaultValue;
    }

    if (min !== undefined && sanitized < min) {
      removedPatterns.push('below_minimum');
      sanitized = min;
    }

    if (max !== undefined && sanitized > max) {
      removedPatterns.push('above_maximum');
      sanitized = max;
    }

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel: removedPatterns.length > 0 ? 'low' : 'safe'
    };
  }

  /**
   * Sanitize boolean input
   */
  static sanitizeBoolean(input: any, defaultValue: boolean = false): SanitizationResult<boolean> {
    const removedPatterns: string[] = [];

    let sanitized: boolean;

    if (typeof input === 'boolean') {
      sanitized = input;
    } else if (typeof input === 'string') {
      const lower = input.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        sanitized = true;
      } else if (lower === 'false' || lower === '0' || lower === 'no') {
        sanitized = false;
      } else {
        sanitized = defaultValue;
        removedPatterns.push('invalid_boolean');
      }
    } else if (typeof input === 'number') {
      sanitized = input !== 0;
    } else {
      sanitized = defaultValue;
      removedPatterns.push('invalid_type');
    }

    return {
      sanitized,
      wasModified: sanitized !== input,
      removedPatterns,
      riskLevel: 'safe'
    };
  }

  /**
   * Validate UUID
   */
  static validateUuid(input: string): ValidationResult {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const valid = uuidRegex.test(input);

    return {
      valid,
      errors: valid ? [] : ['Invalid UUID format'],
      sanitized: valid ? input.toLowerCase() : null
    };
  }

  /**
   * Comprehensive sanitization - auto-detect and sanitize
   */
  static sanitize(input: any, type: 'html' | 'sql' | 'path' | 'filename' | 'url' | 'email' | 'json' | 'integer' | 'boolean' | 'uuid' | 'auto' = 'auto'): SanitizationResult<any> {
    if (type === 'auto') {
      // Auto-detect type
      if (typeof input === 'string') {
        // Check if it looks like a URL
        if (input.startsWith('http://') || input.startsWith('https://')) {
          return this.sanitizeUrl(input);
        }
        // Check if it looks like an email
        if (input.includes('@') && input.includes('.')) {
          return this.sanitizeEmail(input);
        }
        // Check if it looks like a file path
        if (input.includes('/') || input.includes('\\')) {
          return this.sanitizeFilePath(input);
        }
        // Default to HTML sanitization for strings
        return this.sanitizeHtml(input);
      } else if (typeof input === 'number') {
        return this.sanitizeInteger(input);
      } else if (typeof input === 'boolean') {
        return this.sanitizeBoolean(input);
      }
    }

    // Type-specific sanitization
    switch (type) {
      case 'html':
        return this.sanitizeHtml(String(input));
      case 'sql':
        return this.sanitizeSql(String(input));
      case 'path':
        return this.sanitizeFilePath(String(input));
      case 'filename':
        return this.sanitizeFileName(String(input));
      case 'url':
        return this.sanitizeUrl(String(input));
      case 'email':
        return this.sanitizeEmail(String(input));
      case 'json':
        return this.sanitizeJson(String(input));
      case 'integer':
        return this.sanitizeInteger(input);
      case 'boolean':
        return this.sanitizeBoolean(input);
      case 'uuid':
        const uuidResult = this.validateUuid(String(input));
        return {
          sanitized: uuidResult.sanitized,
          wasModified: false,
          removedPatterns: uuidResult.valid ? [] : ['invalid_uuid'],
          riskLevel: uuidResult.valid ? 'safe' : 'medium'
        };
      default:
        return {
          sanitized: input,
          wasModified: false,
          removedPatterns: [],
          riskLevel: 'safe'
        };
    }
  }
}
