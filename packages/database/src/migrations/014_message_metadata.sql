-- Migration 014: Message Metadata
-- Add metadata column to store streaming indicators for historical message reconstruction

-- ============================================================================
-- MESSAGE METADATA
-- ============================================================================
-- Purpose: Store phase indicators, reasoning text, file operations, thinking
--          duration, and token usage so they can be displayed when loading
--          historical messages from the database.
-- ============================================================================

ALTER TABLE core.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add GIN index for efficient JSONB queries on metadata
CREATE INDEX IF NOT EXISTS messages_metadata_gin ON core.messages USING GIN (metadata jsonb_path_ops);

-- ============================================================================
-- METADATA STRUCTURE DOCUMENTATION
-- ============================================================================
-- Expected metadata structure:
-- {
--   "phase": "thinking" | "reasoning" | "code-writing" | "building" | "completed",
--   "reasoningText": "string",
--   "thinkingDuration": number,
--   "fileOperations": [
--     { "operation": "write" | "edit", "filePath": "/path/to/file" }
--   ],
--   "tokenUsage": {
--     "inputTokens": number,
--     "outputTokens": number
--   }
-- }
-- ============================================================================
