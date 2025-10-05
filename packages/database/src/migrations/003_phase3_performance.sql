-- Migration 003: Phase 3 Performance Optimizations

-- ============================================================================
-- COVERING INDEXES (Hot Queries)
-- ============================================================================

CREATE INDEX IF NOT EXISTS messages_session_created_covering
  ON core.messages(session_id, created_at DESC)
  INCLUDE (role, content, model, token_count);

CREATE INDEX IF NOT EXISTS files_app_updated_covering
  ON core.files(app_id, updated_at DESC)
  INCLUDE (path, head_version_id, is_binary, mime_type, size_bytes);

CREATE INDEX IF NOT EXISTS file_versions_file_version_covering
  ON core.file_versions(file_id, version DESC)
  INCLUDE (content_text, content_bytes, created_by, created_at);

CREATE INDEX IF NOT EXISTS working_set_session_covering
  ON core.working_set(session_id)
  INCLUDE (app_id, file_id, reason, pinned_by, created_at);

CREATE INDEX IF NOT EXISTS file_refs_src_covering
  ON core.file_references(src_file_id)
  INCLUDE (dest_file_id, raw_target, symbol, ref_type);

-- ============================================================================
-- OPTIMIZED QUERIES FOR N+1 ELIMINATION
-- ============================================================================

CREATE INDEX IF NOT EXISTS files_app_paths ON core.files(app_id, path);

CREATE INDEX IF NOT EXISTS messages_session_id_range
  ON core.messages(session_id, id)
  WHERE id > 0;

-- ============================================================================
-- STATISTICS UPDATES
-- ============================================================================

ALTER TABLE core.messages ALTER COLUMN session_id SET STATISTICS 1000;
ALTER TABLE core.files ALTER COLUMN app_id SET STATISTICS 1000;
ALTER TABLE core.file_references ALTER COLUMN src_file_id SET STATISTICS 1000;

-- ============================================================================
-- MATERIALIZED VIEW FOR WORKING SET WITH FILE INFO
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS core.working_set_enriched AS
SELECT
  ws.session_id,
  ws.app_id,
  ws.file_id,
  ws.reason,
  ws.pinned_by,
  ws.created_at,
  f.path as file_path,
  f.is_binary,
  f.mime_type,
  f.size_bytes,
  f.updated_at as file_updated_at
FROM core.working_set ws
JOIN core.files f ON ws.file_id = f.id;

CREATE UNIQUE INDEX IF NOT EXISTS working_set_enriched_pk
  ON core.working_set_enriched(session_id, file_id);

CREATE INDEX IF NOT EXISTS working_set_enriched_session
  ON core.working_set_enriched(session_id);

-- Refresh function
CREATE OR REPLACE FUNCTION core.refresh_working_set_enriched()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY core.working_set_enriched;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROW LEVEL SECURITY SETUP (Disabled by default, enable as needed)
-- ============================================================================

ALTER TABLE core.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_owner_policy ON core.sessions;
CREATE POLICY sessions_owner_policy ON core.sessions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS apps_owner_policy ON core.apps;
CREATE POLICY apps_owner_policy ON core.apps
  FOR ALL
  USING (owner_id = current_setting('app.current_user_id', true)::uuid)
  WITH CHECK (owner_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS files_app_owner_policy ON core.files;
CREATE POLICY files_app_owner_policy ON core.files
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM core.apps
      WHERE apps.id = files.app_id
        AND apps.owner_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- ============================================================================
-- PARTITION STRATEGY PREPARATION (For future growth)
-- ============================================================================

-- Events table partitioning by month (example, not auto-created)
-- CREATE TABLE core.events_2025_01 PARTITION OF core.events
--   FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Add partition key helper
CREATE OR REPLACE FUNCTION core.get_partition_name(table_name text, date timestamptz)
RETURNS text AS $$
BEGIN
  RETURN table_name || '_' || to_char(date, 'YYYY_MM');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- INTEGRITY CHECK HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION core.verify_file_checksums(p_app_id uuid DEFAULT NULL)
RETURNS TABLE(
  file_id uuid,
  path text,
  stored_checksum bytea,
  computed_checksum bytea,
  matches boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.path,
    f.sha256,
    digest(
      COALESCE(fv.content_text::bytea, fv.content_bytes),
      'sha256'
    ) as computed,
    f.sha256 = digest(
      COALESCE(fv.content_text::bytea, fv.content_bytes),
      'sha256'
    ) as matches
  FROM core.files f
  JOIN core.file_versions fv ON f.head_version_id = fv.id
  WHERE (p_app_id IS NULL OR f.app_id = p_app_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION core.verify_image_integrity(p_job_id uuid DEFAULT NULL)
RETURNS TABLE(
  asset_id uuid,
  job_id uuid,
  mime_type text,
  has_valid_magic_bytes boolean,
  has_valid_eof boolean,
  checksum_valid boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ia.id,
    ia.job_id,
    ia.mime_type,
    CASE
      WHEN ia.mime_type = 'image/png' THEN
        get_byte(ia.bytes, 0) = 137 AND
        get_byte(ia.bytes, 1) = 80 AND
        get_byte(ia.bytes, 2) = 78 AND
        get_byte(ia.bytes, 3) = 71
      WHEN ia.mime_type = 'image/jpeg' THEN
        get_byte(ia.bytes, 0) = 255 AND
        get_byte(ia.bytes, 1) = 216
      ELSE false
    END as has_valid_magic,
    CASE
      WHEN ia.mime_type = 'image/jpeg' THEN
        get_byte(ia.bytes, length(ia.bytes) - 2) = 255 AND
        get_byte(ia.bytes, length(ia.bytes) - 1) = 217
      WHEN ia.mime_type = 'image/png' THEN
        position(E'IEND'::bytea in ia.bytes) > 0
      ELSE false
    END as has_valid_eof,
    ia.checksum = digest(ia.bytes, 'sha256') as checksum_valid
  FROM core.image_assets ia
  WHERE (p_job_id IS NULL OR ia.job_id = p_job_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- QUERY PLAN HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION core.analyze_query_performance()
RETURNS void AS $$
BEGIN
  ANALYZE core.messages;
  ANALYZE core.files;
  ANALYZE core.file_versions;
  ANALYZE core.file_references;
  ANALYZE core.working_set;
  ANALYZE core.sessions;
  ANALYZE core.apps;
END;
$$ LANGUAGE plpgsql;

-- Initial analysis
SELECT core.analyze_query_performance();
