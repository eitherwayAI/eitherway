/**
 * Tool input validation using Ajv (JSON Schema validator)
 */

import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { TOOL_SCHEMAS } from './schemas.js';
import { ToolDefinition } from './types.js';

export class ToolValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      useDefaults: true,
      coerceTypes: false,
      strict: true,
    });

    addFormats(this.ajv);
    this.validators = new Map();

    // Compile all tool schemas
    this.compileSchemas();
  }

  private compileSchemas(): void {
    for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
      const validator = this.ajv.compile(schema.input_schema);
      this.validators.set(name, validator);
    }
  }

  /**
   * Validate tool input against its schema
   */
  validate(toolName: string, input: Record<string, any>): ValidationResult {
    const validator = this.validators.get(toolName);

    if (!validator) {
      return {
        valid: false,
        errors: [`Unknown tool: ${toolName}`],
      };
    }

    const valid = validator(input);

    if (!valid && validator.errors) {
      return {
        valid: false,
        errors: validator.errors.map((err) => {
          const path = err.instancePath || 'input';
          return `${path}: ${err.message}`;
        }),
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Get schema for a specific tool
   */
  getSchema(toolName: string): ToolDefinition | undefined {
    return TOOL_SCHEMAS[toolName];
  }

  /**
   * Check if a tool exists
   */
  hasToolSchema(toolName: string): boolean {
    return this.validators.has(toolName);
  }

  /**
   * Get all available tool names
   */
  getAvailableTools(): string[] {
    return Array.from(this.validators.keys());
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Singleton instance
let validatorInstance: ToolValidator | null = null;

export function getValidator(): ToolValidator {
  if (!validatorInstance) {
    validatorInstance = new ToolValidator();
  }
  return validatorInstance;
}
