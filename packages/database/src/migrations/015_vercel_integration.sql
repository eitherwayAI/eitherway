/**
 * Migration 015: Vercel Integration
 *
 * Purpose:
 * - Track Vercel projects created via the platform
 * - Link deployments to Vercel projects
 * - Support Git repository linkage for auto-deploys
 *
 * Tables:
 * - core.vercel_projects: Track Vercel projects created by users
 *
 * Note: user_integrations already supports 'vercel' service (created in 013)
 */

-- ============================================================================
-- VERCEL PROJECTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.vercel_projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  app_id              UUID REFERENCES core.apps(id) ON DELETE SET NULL,
  session_id          UUID REFERENCES core.sessions(id) ON DELETE SET NULL,

  -- Vercel project details
  vercel_project_id   TEXT NOT NULL,   -- Vercel's project ID
  project_name        TEXT NOT NULL,   -- Project name
  framework           TEXT,            -- Framework (e.g., 'vite', 'nextjs', null)

  -- Git linkage (for auto-deploys)
  git_provider        TEXT,            -- 'github', 'gitlab', 'bitbucket'
  git_repo            TEXT,            -- 'owner/repo'
  git_branch          TEXT,            -- Default branch

  -- URLs
  production_url      TEXT,            -- Production URL
  deployment_url      TEXT,            -- Latest deployment URL

  -- Team/Organization
  team_id             TEXT,            -- Vercel team ID (if in team context)

  -- Build settings
  build_command       TEXT,            -- Build command
  output_directory    TEXT DEFAULT 'dist', -- Output directory
  install_command     TEXT,            -- Install command

  -- Status
  is_active           BOOLEAN DEFAULT true,
  last_deploy_id      TEXT,            -- Last Vercel deployment ID
  last_deploy_at      TIMESTAMPTZ,

  -- Metadata
  metadata            JSONB DEFAULT '{}',

  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Ensure unique Vercel project IDs per user
  UNIQUE (user_id, vercel_project_id)
);

CREATE INDEX idx_vercel_projects_user_id ON core.vercel_projects(user_id);
CREATE INDEX idx_vercel_projects_app_id ON core.vercel_projects(app_id) WHERE app_id IS NOT NULL;
CREATE INDEX idx_vercel_projects_project_id ON core.vercel_projects(vercel_project_id);
CREATE INDEX idx_vercel_projects_is_active ON core.vercel_projects(is_active) WHERE is_active = true;
CREATE INDEX idx_vercel_projects_team_id ON core.vercel_projects(team_id) WHERE team_id IS NOT NULL;

-- ============================================================================
-- ADD VERCEL PROJECT REFERENCE TO DEPLOYMENTS
-- ============================================================================

-- Add column to link deployments to Vercel projects
ALTER TABLE core.deployments
  ADD COLUMN IF NOT EXISTS vercel_project_id UUID REFERENCES core.vercel_projects(id) ON DELETE SET NULL;

-- Add column for Vercel deployment ID
ALTER TABLE core.deployments
  ADD COLUMN IF NOT EXISTS vercel_deployment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_deployments_vercel_project_id
  ON core.deployments(vercel_project_id) WHERE vercel_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deployments_vercel_deployment_id
  ON core.deployments(vercel_deployment_id) WHERE vercel_deployment_id IS NOT NULL;

-- ============================================================================
-- UPDATE TRIGGERS
-- ============================================================================

-- Auto-update updated_at for vercel_projects
CREATE TRIGGER vercel_projects_updated_at
  BEFORE UPDATE ON core.vercel_projects
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

/**
 * View: Vercel projects with deployment stats
 */
CREATE OR REPLACE VIEW core.vercel_projects_with_stats AS
SELECT
  vp.*,
  a.name AS app_name,
  u.email AS user_email,
  (
    SELECT COUNT(*)
    FROM core.deployments d
    WHERE d.vercel_project_id = vp.id
  ) AS total_deploys,
  (
    SELECT COUNT(*)
    FROM core.deployments d
    WHERE d.vercel_project_id = vp.id
      AND d.status = 'success'
  ) AS successful_deploys,
  (
    SELECT MAX(d.completed_at)
    FROM core.deployments d
    WHERE d.vercel_project_id = vp.id
      AND d.status = 'success'
  ) AS last_successful_deploy_at
FROM core.vercel_projects vp
LEFT JOIN core.apps a ON vp.app_id = a.id
LEFT JOIN core.users u ON vp.user_id = u.id;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.vercel_projects IS 'Track Vercel projects created and managed via EitherWay';

COMMENT ON COLUMN core.vercel_projects.vercel_project_id IS 'Vercel internal project ID';
COMMENT ON COLUMN core.vercel_projects.git_provider IS 'Git provider (github, gitlab, bitbucket) for auto-deploys';
COMMENT ON COLUMN core.vercel_projects.git_repo IS 'Git repository in owner/repo format';
COMMENT ON COLUMN core.vercel_projects.team_id IS 'Vercel team ID if project is in team context';
COMMENT ON COLUMN core.vercel_projects.framework IS 'Framework preset (vite, nextjs, etc.)';
