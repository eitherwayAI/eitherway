/**
 * Migration 011: Deployment & Export System
 *
 * Purpose:
 * - Track GitHub Pages deployments
 * - Record ZIP export history
 * - Store build logs and deployment URLs
 * - Monitor deployment status
 *
 * Tables:
 * - core.deployments: Deployment history (GitHub Pages)
 * - core.exports: Export history (ZIP downloads)
 * - core.deployment_logs: Build and deployment logs
 */

-- ============================================================================
-- DEPLOYMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.deployments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES core.sessions(id) ON DELETE SET NULL,

  -- Deployment metadata
  deployment_type   TEXT NOT NULL DEFAULT 'github_pages'
                    CHECK (deployment_type IN ('github_pages', 'netlify', 'vercel', 'custom')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'building', 'deploying', 'success', 'failed', 'cancelled')),

  -- GitHub integration
  repository_url    TEXT,
  repository_owner  TEXT,
  repository_name   TEXT,
  branch            TEXT DEFAULT 'gh-pages',
  commit_sha        TEXT,

  -- Deployment URLs
  deployment_url    TEXT,
  preview_url       TEXT,

  -- Build configuration
  build_command     TEXT,
  output_directory  TEXT DEFAULT 'dist',
  environment_vars  JSONB DEFAULT '{}',

  -- Status tracking
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  duration_ms       INT,

  -- Error tracking
  error_message     TEXT,
  error_stack       TEXT,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT deployments_duration_check CHECK (duration_ms >= 0)
);

CREATE INDEX idx_deployments_app_id ON core.deployments(app_id);
CREATE INDEX idx_deployments_user_id ON core.deployments(user_id);
CREATE INDEX idx_deployments_session_id ON core.deployments(session_id);
CREATE INDEX idx_deployments_status ON core.deployments(status);
CREATE INDEX idx_deployments_created_at ON core.deployments(created_at DESC);
CREATE INDEX idx_deployments_repository ON core.deployments(repository_owner, repository_name) WHERE repository_owner IS NOT NULL;

-- ============================================================================
-- EXPORTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.exports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  session_id        UUID REFERENCES core.sessions(id) ON DELETE SET NULL,

  -- Export metadata
  export_type       TEXT NOT NULL DEFAULT 'zip'
                    CHECK (export_type IN ('zip', 'tar', 'git_bundle')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'success', 'failed')),

  -- File information
  file_count        INT,
  total_size_bytes  BIGINT,
  compressed_size_bytes BIGINT,
  file_path         TEXT, -- Storage path if persisted

  -- Export options
  include_node_modules BOOLEAN DEFAULT false,
  include_git_history BOOLEAN DEFAULT false,
  exclude_patterns  TEXT[] DEFAULT ARRAY['.git', 'node_modules', '.env', '.DS_Store'],

  -- Status tracking
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  duration_ms       INT,
  download_count    INT DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,

  -- Error tracking
  error_message     TEXT,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT exports_file_count_check CHECK (file_count >= 0),
  CONSTRAINT exports_size_check CHECK (total_size_bytes >= 0 AND compressed_size_bytes >= 0),
  CONSTRAINT exports_duration_check CHECK (duration_ms >= 0)
);

CREATE INDEX idx_exports_app_id ON core.exports(app_id);
CREATE INDEX idx_exports_user_id ON core.exports(user_id);
CREATE INDEX idx_exports_session_id ON core.exports(session_id);
CREATE INDEX idx_exports_status ON core.exports(status);
CREATE INDEX idx_exports_created_at ON core.exports(created_at DESC);

-- ============================================================================
-- DEPLOYMENT LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.deployment_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id     UUID NOT NULL REFERENCES core.deployments(id) ON DELETE CASCADE,

  -- Log entry
  log_level         TEXT NOT NULL DEFAULT 'info'
                    CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'critical')),
  message           TEXT NOT NULL,
  details           JSONB,

  -- Step tracking
  step_name         TEXT, -- e.g., 'build', 'deploy', 'verify'
  step_index        INT,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deployment_logs_deployment_id ON core.deployment_logs(deployment_id);
CREATE INDEX idx_deployment_logs_log_level ON core.deployment_logs(log_level);
CREATE INDEX idx_deployment_logs_created_at ON core.deployment_logs(created_at);
CREATE INDEX idx_deployment_logs_step ON core.deployment_logs(step_name, step_index);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at for deployments
CREATE OR REPLACE FUNCTION update_deployment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();

  -- Auto-calculate duration if completed
  IF NEW.status IN ('success', 'failed', 'cancelled') AND NEW.started_at IS NOT NULL THEN
    NEW.completed_at = now();
    NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deployments_updated_at
  BEFORE UPDATE ON core.deployments
  FOR EACH ROW
  EXECUTE FUNCTION update_deployment_timestamp();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Get latest deployment for an app
 */
CREATE OR REPLACE FUNCTION get_latest_deployment(target_app_id UUID)
RETURNS UUID AS $$
DECLARE
  deployment_id UUID;
BEGIN
  SELECT id INTO deployment_id
  FROM core.deployments
  WHERE app_id = target_app_id
    AND status = 'success'
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN deployment_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Get deployment success rate for an app
 */
CREATE OR REPLACE FUNCTION get_deployment_success_rate(target_app_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_deployments INT;
  successful_deployments INT;
  success_rate NUMERIC;
BEGIN
  SELECT COUNT(*) INTO total_deployments
  FROM core.deployments
  WHERE app_id = target_app_id;

  IF total_deployments = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO successful_deployments
  FROM core.deployments
  WHERE app_id = target_app_id
    AND status = 'success';

  success_rate = (successful_deployments::NUMERIC / total_deployments::NUMERIC) * 100;

  RETURN ROUND(success_rate, 2);
END;
$$ LANGUAGE plpgsql;

/**
 * Cleanup old failed deployments (keep last 10 per app)
 */
CREATE OR REPLACE FUNCTION cleanup_old_failed_deployments(target_app_id UUID)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM core.deployments
  WHERE id IN (
    SELECT id FROM core.deployments
    WHERE app_id = target_app_id
      AND status = 'failed'
    ORDER BY created_at DESC
    OFFSET 10
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

/**
 * View: Deployment summary per app
 */
CREATE OR REPLACE VIEW core.deployment_summary AS
SELECT
  app_id,
  COUNT(*) AS total_deployments,
  COUNT(*) FILTER (WHERE status = 'success') AS successful_deployments,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_deployments,
  COUNT(*) FILTER (WHERE status IN ('pending', 'building', 'deploying')) AS in_progress_deployments,
  AVG(duration_ms) FILTER (WHERE status = 'success') AS avg_build_time_ms,
  MAX(created_at) FILTER (WHERE status = 'success') AS last_successful_deployment,
  get_deployment_success_rate(app_id) AS success_rate
FROM core.deployments
GROUP BY app_id;

/**
 * View: Recent deployments with logs
 */
CREATE OR REPLACE VIEW core.recent_deployments AS
SELECT
  d.id,
  d.app_id,
  d.user_id,
  d.deployment_type,
  d.status,
  d.deployment_url,
  d.branch,
  d.commit_sha,
  d.duration_ms,
  d.error_message,
  d.created_at,
  d.completed_at,
  a.name AS app_name,
  u.email AS user_email,
  (
    SELECT COUNT(*)
    FROM core.deployment_logs dl
    WHERE dl.deployment_id = d.id
      AND dl.log_level IN ('error', 'critical')
  ) AS error_count
FROM core.deployments d
JOIN core.apps a ON d.app_id = a.id
JOIN core.users u ON d.user_id = u.id
ORDER BY d.created_at DESC
LIMIT 100;

/**
 * View: Export statistics per app
 */
CREATE OR REPLACE VIEW core.export_statistics AS
SELECT
  app_id,
  COUNT(*) AS total_exports,
  COUNT(*) FILTER (WHERE status = 'success') AS successful_exports,
  SUM(download_count) AS total_downloads,
  AVG(total_size_bytes) FILTER (WHERE status = 'success') AS avg_export_size_bytes,
  MAX(created_at) AS last_export_at
FROM core.exports
GROUP BY app_id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.deployments IS 'Deployment history for apps (GitHub Pages, Netlify, Vercel, etc.)';
COMMENT ON TABLE core.exports IS 'Export history for ZIP/TAR downloads';
COMMENT ON TABLE core.deployment_logs IS 'Build and deployment logs with step tracking';

COMMENT ON COLUMN core.deployments.deployment_type IS 'Deployment target platform';
COMMENT ON COLUMN core.deployments.status IS 'Current deployment status';
COMMENT ON COLUMN core.deployments.deployment_url IS 'Live deployment URL (e.g., https://user.github.io/repo)';
COMMENT ON COLUMN core.deployments.duration_ms IS 'Total deployment time in milliseconds';

COMMENT ON COLUMN core.exports.export_type IS 'Export archive format';
COMMENT ON COLUMN core.exports.compressed_size_bytes IS 'ZIP/TAR archive size';
COMMENT ON COLUMN core.exports.download_count IS 'Number of times this export was downloaded';
