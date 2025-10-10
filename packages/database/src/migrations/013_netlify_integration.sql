/**
 * Migration 013: Netlify Integration
 *
 * Purpose:
 * - Store encrypted Netlify PATs per user
 * - Track Netlify sites created via the platform
 * - Link deployments to Netlify sites
 * - Support per-user Netlify credentials (BYO-PAT model)
 *
 * Tables:
 * - core.user_integrations: Store encrypted credentials for external services
 * - core.netlify_sites: Track Netlify sites created by users
 *
 * Security:
 * - PATs encrypted using pgcrypto (AES-256)
 * - Encryption key stored in environment (ENCRYPTION_KEY)
 * - Only last 4 chars of tokens visible
 */

-- ============================================================================
-- USER INTEGRATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.user_integrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  service             TEXT NOT NULL CHECK (service IN ('netlify', 'vercel', 'github', 'gitlab')),

  -- Encrypted credentials
  encrypted_token     BYTEA NOT NULL,  -- Encrypted PAT/token
  token_last_4        TEXT,            -- Last 4 chars for UI display

  -- Service-specific user info
  service_user_id     TEXT,            -- External service user ID
  service_email       TEXT,            -- Email from the external service
  service_username    TEXT,            -- Username from the external service

  -- Status
  is_verified         BOOLEAN DEFAULT false,
  verified_at         TIMESTAMPTZ,
  last_used_at        TIMESTAMPTZ,

  -- Metadata
  metadata            JSONB DEFAULT '{}',

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One integration per service per user
  UNIQUE (user_id, service)
);

CREATE INDEX idx_user_integrations_user_id ON core.user_integrations(user_id);
CREATE INDEX idx_user_integrations_service ON core.user_integrations(service);
CREATE INDEX idx_user_integrations_verified ON core.user_integrations(is_verified) WHERE is_verified = true;

-- ============================================================================
-- NETLIFY SITES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.netlify_sites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  app_id              UUID REFERENCES core.apps(id) ON DELETE SET NULL,
  session_id          UUID REFERENCES core.sessions(id) ON DELETE SET NULL,

  -- Netlify site details
  netlify_site_id     TEXT NOT NULL,   -- Netlify's site ID
  site_name           TEXT,            -- Site name/subdomain
  url                 TEXT NOT NULL,   -- Production URL (https://name.netlify.app)
  admin_url           TEXT,            -- Netlify admin URL
  ssl_url             TEXT,            -- SSL URL if different

  -- Site metadata
  created_via         TEXT DEFAULT 'eitherway',
  custom_domain       TEXT,            -- Custom domain if configured

  -- Status
  is_active           BOOLEAN DEFAULT true,
  last_deploy_id      TEXT,            -- Last Netlify deploy ID
  last_deploy_at      TIMESTAMPTZ,

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure unique Netlify site IDs per user
  UNIQUE (user_id, netlify_site_id)
);

CREATE INDEX idx_netlify_sites_user_id ON core.netlify_sites(user_id);
CREATE INDEX idx_netlify_sites_app_id ON core.netlify_sites(app_id) WHERE app_id IS NOT NULL;
CREATE INDEX idx_netlify_sites_netlify_id ON core.netlify_sites(netlify_site_id);
CREATE INDEX idx_netlify_sites_is_active ON core.netlify_sites(is_active) WHERE is_active = true;

-- ============================================================================
-- ADD NETLIFY SITE REFERENCE TO DEPLOYMENTS
-- ============================================================================

-- Add column to link deployments to Netlify sites
ALTER TABLE core.deployments
  ADD COLUMN IF NOT EXISTS netlify_site_id UUID REFERENCES core.netlify_sites(id) ON DELETE SET NULL;

-- Add column for Netlify deploy ID
ALTER TABLE core.deployments
  ADD COLUMN IF NOT EXISTS netlify_deploy_id TEXT;

-- Add column for deployment title (shown in Netlify UI)
ALTER TABLE core.deployments
  ADD COLUMN IF NOT EXISTS deploy_title TEXT;

CREATE INDEX IF NOT EXISTS idx_deployments_netlify_site_id
  ON core.deployments(netlify_site_id) WHERE netlify_site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deployments_netlify_deploy_id
  ON core.deployments(netlify_deploy_id) WHERE netlify_deploy_id IS NOT NULL;

-- ============================================================================
-- ENCRYPTION HELPER FUNCTIONS
-- ============================================================================

/**
 * Encrypt a token using AES-256
 * Requires ENCRYPTION_KEY environment variable
 */
CREATE OR REPLACE FUNCTION encrypt_token(token TEXT, encryption_key TEXT)
RETURNS BYTEA AS $$
BEGIN
  RETURN pgp_sym_encrypt(token, encryption_key, 'cipher-algo=aes256');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/**
 * Decrypt a token
 * Requires ENCRYPTION_KEY environment variable
 */
CREATE OR REPLACE FUNCTION decrypt_token(encrypted_token BYTEA, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN pgp_sym_decrypt(encrypted_token, encryption_key, 'cipher-algo=aes256');
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL; -- Return NULL on decryption failure
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

/**
 * Get last 4 characters of a token
 */
CREATE OR REPLACE FUNCTION get_token_last_4(token TEXT)
RETURNS TEXT AS $$
BEGIN
  IF length(token) < 4 THEN
    RETURN '****';
  END IF;
  RETURN right(token, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at for user_integrations
CREATE TRIGGER user_integrations_updated_at
  BEFORE UPDATE ON core.user_integrations
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

-- Auto-update updated_at for netlify_sites
CREATE TRIGGER netlify_sites_updated_at
  BEFORE UPDATE ON core.netlify_sites
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

/**
 * View: User integrations with safe token display
 */
CREATE OR REPLACE VIEW core.user_integrations_safe AS
SELECT
  id,
  user_id,
  service,
  token_last_4,
  service_user_id,
  service_email,
  service_username,
  is_verified,
  verified_at,
  last_used_at,
  metadata,
  created_at,
  updated_at
FROM core.user_integrations;

/**
 * View: Netlify sites with deployment stats
 */
CREATE OR REPLACE VIEW core.netlify_sites_with_stats AS
SELECT
  ns.*,
  a.name AS app_name,
  u.email AS user_email,
  (
    SELECT COUNT(*)
    FROM core.deployments d
    WHERE d.netlify_site_id = ns.id
  ) AS total_deploys,
  (
    SELECT COUNT(*)
    FROM core.deployments d
    WHERE d.netlify_site_id = ns.id
      AND d.status = 'success'
  ) AS successful_deploys,
  (
    SELECT MAX(d.completed_at)
    FROM core.deployments d
    WHERE d.netlify_site_id = ns.id
      AND d.status = 'success'
  ) AS last_successful_deploy_at
FROM core.netlify_sites ns
LEFT JOIN core.apps a ON ns.app_id = a.id
LEFT JOIN core.users u ON ns.user_id = u.id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.user_integrations IS 'Store encrypted credentials for external services (Netlify, Vercel, etc.)';
COMMENT ON TABLE core.netlify_sites IS 'Track Netlify sites created and managed via EitherWay';

COMMENT ON COLUMN core.user_integrations.encrypted_token IS 'AES-256 encrypted PAT/token using pgcrypto';
COMMENT ON COLUMN core.user_integrations.token_last_4 IS 'Last 4 chars of token for UI display (security)';
COMMENT ON COLUMN core.user_integrations.service_user_id IS 'External service user ID (e.g., Netlify user ID)';

COMMENT ON COLUMN core.netlify_sites.netlify_site_id IS 'Netlify internal site ID';
COMMENT ON COLUMN core.netlify_sites.url IS 'Production site URL (e.g., https://name.netlify.app)';
COMMENT ON COLUMN core.netlify_sites.admin_url IS 'Netlify admin/settings URL';

COMMENT ON FUNCTION encrypt_token(TEXT, TEXT) IS 'Encrypt a token using AES-256 via pgcrypto';
COMMENT ON FUNCTION decrypt_token(BYTEA, TEXT) IS 'Decrypt a token encrypted with encrypt_token';
COMMENT ON FUNCTION get_token_last_4(TEXT) IS 'Get last 4 characters of a token for safe display';
