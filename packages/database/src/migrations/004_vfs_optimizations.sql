-- Migration 004: VFS Optimizations
-- Optimizations for DB-backed Virtual File System

-- ============================================================================
-- SESSION FILES VIEW
-- ============================================================================

CREATE OR REPLACE VIEW core.session_files AS
SELECT
  s.id AS session_id,
  s.user_id,
  s.title AS session_title,
  f.id,
  f.app_id,
  f.path,
  f.is_binary,
  f.mime_type,
  f.size_bytes,
  f.sha256,
  f.head_version_id,
  f.created_at,
  f.updated_at
FROM core.sessions s
JOIN core.files f ON f.app_id = s.app_id
WHERE s.app_id IS NOT NULL;

COMMENT ON VIEW core.session_files IS 'Session-centric view of files for easier querying';

-- ============================================================================
-- ADDITIONAL INDEXES FOR VFS PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS files_app_id_idx ON core.files(app_id) WHERE app_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS file_versions_file_id_idx ON core.file_versions(file_id);

CREATE INDEX IF NOT EXISTS sessions_app_id_idx ON core.sessions(app_id) WHERE app_id IS NOT NULL;

-- ============================================================================
-- FUNCTIONS FOR VFS OPERATIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION core.get_file_content(p_session_id UUID, p_path TEXT)
RETURNS TABLE (
  content_text TEXT,
  content_bytes BYTEA,
  mime_type TEXT,
  version INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fv.content_text,
    fv.content_bytes,
    f.mime_type,
    fv.version
  FROM core.sessions s
  JOIN core.files f ON f.app_id = s.app_id
  JOIN core.file_versions fv ON fv.id = f.head_version_id
  WHERE s.id = p_session_id AND f.path = p_path;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION core.get_file_content IS 'Efficiently retrieve file content by session and path';

-- ============================================================================
-- STATISTICS
-- ============================================================================

ANALYZE core.files;
ANALYZE core.file_versions;
ANALYZE core.sessions;
