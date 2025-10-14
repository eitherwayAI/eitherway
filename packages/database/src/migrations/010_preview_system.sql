/**
 * Migration 010: Mobile Preview & PWA Validation System
 *
 * Purpose:
 * - Store preview configurations for different devices
 * - Track PWA validation results
 * - Store responsive breakpoint tests
 * - Enable preview URL generation
 *
 * Tables:
 * - core.preview_configs: Device preview configurations
 * - core.pwa_validations: PWA manifest and service worker validation results
 * - core.preview_sessions: Preview session tracking
 */

-- ============================================================================
-- PREVIEW CONFIGURATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.preview_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

  -- Device specification (iPhone 17 Pro Max only for this phase)
  device_name       TEXT NOT NULL DEFAULT 'iPhone 17 Pro Max',
  viewport_width    INT NOT NULL DEFAULT 430,  -- Logical pixels
  viewport_height   INT NOT NULL DEFAULT 932,  -- Logical pixels
  pixel_ratio       FLOAT NOT NULL DEFAULT 3.0,
  user_agent        TEXT NOT NULL DEFAULT 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',

  -- Preview settings
  is_default        BOOLEAN DEFAULT false,
  orientation       TEXT NOT NULL DEFAULT 'portrait' CHECK (orientation IN ('portrait', 'landscape')),

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT preview_configs_dimensions_check CHECK (viewport_width > 0 AND viewport_height > 0),
  CONSTRAINT preview_configs_pixel_ratio_check CHECK (pixel_ratio > 0)
);

CREATE INDEX idx_preview_configs_app_id ON core.preview_configs(app_id);
CREATE INDEX idx_preview_configs_user_id ON core.preview_configs(user_id);
CREATE INDEX idx_preview_configs_is_default ON core.preview_configs(is_default) WHERE is_default = true;

-- Only one default config per app
CREATE UNIQUE INDEX idx_preview_configs_unique_default
  ON core.preview_configs(app_id)
  WHERE is_default = true;

-- ============================================================================
-- PWA VALIDATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.pwa_validations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,

  -- Validation status
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'passed', 'failed', 'warning')),

  -- Overall scores
  manifest_score    INT CHECK (manifest_score >= 0 AND manifest_score <= 100),
  service_worker_score INT CHECK (service_worker_score >= 0 AND service_worker_score <= 100),
  icons_score       INT CHECK (icons_score >= 0 AND icons_score <= 100),
  overall_score     INT CHECK (overall_score >= 0 AND overall_score <= 100),

  -- Manifest validation
  manifest_valid    BOOLEAN DEFAULT false,
  manifest_url      TEXT,
  manifest_errors   JSONB DEFAULT '[]',
  manifest_warnings JSONB DEFAULT '[]',
  manifest_data     JSONB,

  -- Service Worker validation
  service_worker_registered BOOLEAN DEFAULT false,
  service_worker_url TEXT,
  service_worker_scope TEXT,
  service_worker_errors JSONB DEFAULT '[]',

  -- Icons validation
  icons_valid       BOOLEAN DEFAULT false,
  icons_found       JSONB DEFAULT '[]',  -- Array of { src, sizes, type }
  icons_missing     JSONB DEFAULT '[]',  -- Array of required but missing sizes

  -- Required PWA features
  has_name          BOOLEAN DEFAULT false,
  has_short_name    BOOLEAN DEFAULT false,
  has_start_url     BOOLEAN DEFAULT false,
  has_display       BOOLEAN DEFAULT false,
  has_theme_color   BOOLEAN DEFAULT false,
  has_background_color BOOLEAN DEFAULT false,
  has_icons         BOOLEAN DEFAULT false,

  -- Additional checks
  is_https          BOOLEAN DEFAULT false,
  has_viewport_meta BOOLEAN DEFAULT false,
  offline_ready     BOOLEAN DEFAULT false,

  -- Validation metadata
  validation_url    TEXT NOT NULL,
  validation_errors JSONB DEFAULT '[]',

  -- Timestamps
  validated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pwa_validations_app_id ON core.pwa_validations(app_id);
CREATE INDEX idx_pwa_validations_user_id ON core.pwa_validations(user_id);
CREATE INDEX idx_pwa_validations_status ON core.pwa_validations(status);
CREATE INDEX idx_pwa_validations_overall_score ON core.pwa_validations(overall_score DESC);
CREATE INDEX idx_pwa_validations_validated_at ON core.pwa_validations(validated_at DESC);

-- ============================================================================
-- PREVIEW SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.preview_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  preview_config_id UUID REFERENCES core.preview_configs(id) ON DELETE SET NULL,

  -- Preview URL
  preview_url       TEXT NOT NULL,
  preview_token     TEXT NOT NULL, -- Unique token for iframe access

  -- Session metadata
  is_active         BOOLEAN DEFAULT true,
  expires_at        TIMESTAMPTZ NOT NULL,
  last_accessed_at  TIMESTAMPTZ,
  access_count      INT DEFAULT 0,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT preview_sessions_token_unique UNIQUE (preview_token)
);

CREATE INDEX idx_preview_sessions_app_id ON core.preview_sessions(app_id);
CREATE INDEX idx_preview_sessions_user_id ON core.preview_sessions(user_id);
CREATE INDEX idx_preview_sessions_preview_token ON core.preview_sessions(preview_token);
CREATE INDEX idx_preview_sessions_is_active ON core.preview_sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_preview_sessions_expires_at ON core.preview_sessions(expires_at);

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at for preview_configs
CREATE OR REPLACE FUNCTION update_preview_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER preview_configs_updated_at
  BEFORE UPDATE ON core.preview_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_preview_config_timestamp();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Get or create default preview config for an app
 */
CREATE OR REPLACE FUNCTION get_or_create_default_preview_config(
  target_app_id UUID,
  target_user_id UUID
) RETURNS UUID AS $$
DECLARE
  config_id UUID;
BEGIN
  -- Try to find existing default config
  SELECT id INTO config_id
  FROM core.preview_configs
  WHERE app_id = target_app_id AND is_default = true
  LIMIT 1;

  -- If not found, create one
  IF config_id IS NULL THEN
    INSERT INTO core.preview_configs (app_id, user_id, is_default)
    VALUES (target_app_id, target_user_id, true)
    RETURNING id INTO config_id;
  END IF;

  RETURN config_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Cleanup expired preview sessions
 */
CREATE OR REPLACE FUNCTION cleanup_expired_preview_sessions()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM core.preview_sessions
  WHERE expires_at < now() AND is_active = true;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

/**
 * View: Active PWA validation summary
 */
CREATE OR REPLACE VIEW core.pwa_validation_summary AS
SELECT
  app_id,
  COUNT(*) AS total_validations,
  COUNT(*) FILTER (WHERE status = 'passed') AS passed_count,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
  COUNT(*) FILTER (WHERE status = 'warning') AS warning_count,
  AVG(overall_score) FILTER (WHERE overall_score IS NOT NULL) AS avg_score,
  MAX(validated_at) AS last_validated_at,
  bool_or(manifest_valid) AS has_valid_manifest,
  bool_or(service_worker_registered) AS has_service_worker,
  bool_or(icons_valid) AS has_valid_icons
FROM core.pwa_validations
WHERE validated_at >= now() - interval '30 days'
GROUP BY app_id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.preview_configs IS 'Device preview configurations (iPhone 17 Pro Max for Phase 1)';
COMMENT ON TABLE core.pwa_validations IS 'PWA validation results including manifest, service worker, and icons';
COMMENT ON TABLE core.preview_sessions IS 'Active preview sessions with expiring tokens';

COMMENT ON COLUMN core.preview_configs.pixel_ratio IS 'Device pixel ratio (3x for iPhone 17 Pro Max)';
COMMENT ON COLUMN core.pwa_validations.overall_score IS 'Composite PWA score 0-100';
COMMENT ON COLUMN core.preview_sessions.preview_token IS 'Unique token for secure iframe access';
