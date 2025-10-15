/**
 * Type definitions for tool execution results
 */

/**
 * Metadata attached to tool results by tool executors
 */
export interface ToolResultMetadata {
  /** File path for file operation tools */
  path?: string;
  /** Operation type */
  operation?: 'create' | 'edit' | 'read';
  /** SHA-256 hash of file content (for verification) */
  sha256?: string;
  /** Number of lines in the file */
  lineCount?: number;
  /** Additional context */
  [key: string]: unknown;
}
