-- Migration 005: Fix Index Size Limit Error
-- Drop problematic covering index that includes large content columns

-- ============================================================================
-- PROBLEM
-- ============================================================================
-- The file_versions_file_version_covering index includes content_text and
-- content_bytes in the INCLUDE clause, which can exceed PostgreSQL's btree
-- index size limit (2704 bytes for version 4) when files are larger than ~2KB.
--
-- Error: "index row size 3800 exceeds btree version 4 maximum 2704"

-- ============================================================================
-- SOLUTION
-- ============================================================================
-- Drop the covering index since we already have file_versions_by_file which
-- provides the same indexed columns (file_id, version DESC) without the
-- problematic INCLUDE clause.

DROP INDEX IF EXISTS core.file_versions_file_version_covering;

-- The existing file_versions_by_file index provides the same functionality:
-- CREATE INDEX file_versions_by_file ON core.file_versions(file_id, version DESC)
--
-- This index is sufficient for queries that need to find versions by file_id,
-- and PostgreSQL will do a regular table lookup for the content columns which
-- is acceptable since content retrieval is typically infrequent compared to
-- metadata queries.

-- Also drop messages covering index that includes content to prevent same issue
DROP INDEX IF EXISTS core.messages_session_created_covering;

-- Recreate without content column to avoid size limit issues with large messages
CREATE INDEX IF NOT EXISTS messages_session_created_idx
  ON core.messages(session_id, created_at DESC)
  INCLUDE (role, model, token_count);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

ANALYZE core.file_versions;
ANALYZE core.messages;

COMMENT ON INDEX core.file_versions_by_file IS
  'Index for file version queries. Content columns are fetched via table lookup to avoid btree size limits.';

COMMENT ON INDEX core.messages_session_created_idx IS
  'Index for message queries without content column to avoid btree size limits with large messages.';
