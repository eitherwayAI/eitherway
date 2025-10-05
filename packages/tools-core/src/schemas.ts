/**
 * JSON Schema definitions for all tools
 * These match Anthropic's Messages API tool schema format
 */

import { ToolDefinition } from './types.js';

export const TOOL_SCHEMAS: Record<string, ToolDefinition> = {
  'either-view': {
    name: 'either-view',
    description: 'Read a file (or small list) to understand current code before changing it.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to a file.'
        },
        max_bytes: {
          type: 'integer',
          minimum: 1,
          maximum: 1048576,
          description: 'Maximum bytes to read (default: 1MB)'
        },
        encoding: {
          type: 'string',
          description: 'File encoding (default: utf-8)',
          default: 'utf-8'
        }
      },
      required: ['path'],
      additionalProperties: false
    }
  },

  'either-search-files': {
    name: 'either-search-files',
    description: 'Search code for patterns to understand usage and dependencies.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search pattern or text to find'
        },
        glob: {
          type: 'string',
          description: 'File pattern to search in',
          default: 'src/**/*'
        },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum number of results to return',
          default: 100
        },
        regex: {
          type: 'boolean',
          description: 'Treat query as a regex pattern (default: false)',
          default: false
        },
        context_lines: {
          type: 'integer',
          minimum: 0,
          description: 'Number of context lines to show before/after matches',
          default: 0
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },

  'either-write': {
    name: 'either-write',
    description: 'Create a NEW file with provided content. Fails if file exists unless overwrite=true.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path for the new file'
        },
        content: {
          type: 'string',
          description: 'Content to write to the file'
        },
        overwrite: {
          type: 'boolean',
          description: 'Allow overwriting existing file',
          default: false
        },
        create_dirs: {
          type: 'boolean',
          description: 'Create parent directories if needed',
          default: true
        }
      },
      required: ['path', 'content'],
      additionalProperties: false
    }
  },

  'either-line-replace': {
    name: 'either-line-replace',
    description: 'Targeted edits in EXISTING files. Prefer this over rewriting entire files.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the file to edit'
        },
        locator: {
          type: 'object',
          description: 'Location specification for the edit',
          properties: {
            start_line: {
              type: 'integer',
              minimum: 1,
              description: 'Starting line number (1-indexed)'
            },
            end_line: {
              type: 'integer',
              minimum: 1,
              description: 'Ending line number (inclusive)'
            },
            needle: {
              type: 'string',
              description: 'Optional exact text to verify you are editing the intended block'
            }
          },
          required: ['start_line', 'end_line'],
          additionalProperties: false
        },
        replacement: {
          type: 'string',
          description: 'New content to replace the specified lines'
        },
        verify_after: {
          type: 'boolean',
          description: 'Verify the edit was applied correctly',
          default: true
        }
      },
      required: ['path', 'locator', 'replacement'],
      additionalProperties: false
    }
  },

  'websearch--web_search': {
    name: 'websearch--web_search',
    description: 'Search the web for docs, best practices, and real-time info. Supports domain filtering and localization.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        top_k: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'Number of top results to return',
          default: 5
        },
        recency_days: {
          type: 'integer',
          minimum: 0,
          description: 'Only return results from the last N days (0 = no limit)'
        },
        site: {
          type: 'string',
          description: 'Optional domain filter (e.g., "stackoverflow.com")'
        },
        allowed_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only include results from these domains (cannot be used with blocked_domains)'
        },
        blocked_domains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Never include results from these domains (cannot be used with allowed_domains)'
        },
        user_location: {
          type: 'object',
          description: 'Localize search results based on user location',
          properties: {
            type: { type: 'string', enum: ['approximate'], description: 'Location type' },
            city: { type: 'string', description: 'City name' },
            region: { type: 'string', description: 'Region or state' },
            country: { type: 'string', description: 'Country' },
            timezone: { type: 'string', description: 'IANA timezone ID' }
          },
          required: ['type']
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },

  'eithergen--generate_image': {
    name: 'eithergen--generate_image',
    description: 'Generate hero images, icons, or illustrations and save to disk.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Image generation prompt'
        },
        path: {
          type: 'string',
          description: 'Path where the image should be saved'
        },
        size: {
          type: 'string',
          pattern: '^[0-9]+x[0-9]+$',
          description: 'Image size (e.g., "512x512", "1024x1024")',
          default: '512x512'
        },
        provider: {
          type: 'string',
          enum: ['openai', 'stability', 'fal', 'replicate', 'custom'],
          description: 'Image generation provider',
          default: 'custom'
        },
        seed: {
          type: 'integer',
          description: 'Random seed for reproducible generation'
        }
      },
      required: ['prompt', 'path'],
      additionalProperties: false
    }
  }
};

// Export individual schemas for direct access
export const EITHER_VIEW_SCHEMA = TOOL_SCHEMAS['either-view'];
export const EITHER_SEARCH_FILES_SCHEMA = TOOL_SCHEMAS['either-search-files'];
export const EITHER_WRITE_SCHEMA = TOOL_SCHEMAS['either-write'];
export const EITHER_LINE_REPLACE_SCHEMA = TOOL_SCHEMAS['either-line-replace'];
export const WEBSEARCH_SCHEMA = TOOL_SCHEMAS['websearch--web_search'];
export const IMAGEGEN_SCHEMA = TOOL_SCHEMAS['eithergen--generate_image'];

// Get all tool definitions as array for Claude API
export function getAllToolDefinitions(): ToolDefinition[] {
  return Object.values(TOOL_SCHEMAS);
}
