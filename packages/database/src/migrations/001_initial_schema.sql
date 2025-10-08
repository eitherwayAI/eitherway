-- Migration 001: Initial Schema
-- Phase 1 - Database foundation

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- SCHEMA
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS core;

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        CITEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON core.users(email);

-- ============================================================================
-- SESSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  app_id           UUID,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_by_user ON core.sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS sessions_by_app ON core.sessions(app_id) WHERE app_id IS NOT NULL;

-- ============================================================================
-- MESSAGES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE core.message_role AS ENUM ('user','assistant','system','tool');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS core.messages (
  id           BIGSERIAL PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  role         core.message_role NOT NULL,
  content      JSONB NOT NULL,
  model        TEXT,
  token_count  INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_by_session ON core.messages(session_id, id);
CREATE INDEX IF NOT EXISTS messages_content_gin ON core.messages USING GIN (content jsonb_path_ops);

-- ============================================================================
-- APPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.apps (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  visibility         TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','team','public')),
  default_session_id UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apps_by_owner ON core.apps(owner_id, created_at DESC);

-- Add foreign key constraint for sessions.app_id
ALTER TABLE core.sessions
  ADD CONSTRAINT sessions_app_id_fkey
  FOREIGN KEY (app_id) REFERENCES core.apps(id) ON DELETE SET NULL;

-- ============================================================================
-- FILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  path            TEXT NOT NULL,
  is_binary       BOOLEAN NOT NULL DEFAULT FALSE,
  mime_type       TEXT,
  size_bytes      INT,
  sha256          BYTEA,
  head_version_id UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, path)
);

CREATE INDEX IF NOT EXISTS files_by_app_path ON core.files(app_id, path);
CREATE INDEX IF NOT EXISTS files_path_trgm ON core.files USING GIN (path gin_trgm_ops);

-- ============================================================================
-- FILE VERSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.file_versions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id            UUID NOT NULL REFERENCES core.files(id) ON DELETE CASCADE,
  version            INT  NOT NULL,
  parent_version_id  UUID REFERENCES core.file_versions(id),
  content_text       TEXT,
  content_bytes      BYTEA,
  diff_from_parent   JSONB,
  created_by         UUID REFERENCES core.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, version)
);

CREATE INDEX IF NOT EXISTS file_versions_by_file ON core.file_versions(file_id, version DESC);

-- Add foreign key for files.head_version_id
ALTER TABLE core.files
  ADD CONSTRAINT files_head_version_id_fkey
  FOREIGN KEY (head_version_id) REFERENCES core.file_versions(id) ON DELETE SET NULL;

-- ============================================================================
-- FILE REFERENCES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE core.reference_type AS ENUM ('import','style','asset','link','test','build','env','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS core.file_references (
  id           BIGSERIAL PRIMARY KEY,
  app_id       UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  src_file_id  UUID NOT NULL REFERENCES core.files(id) ON DELETE CASCADE,
  dest_file_id UUID     REFERENCES core.files(id) ON DELETE CASCADE,
  raw_target   TEXT,
  symbol       TEXT,
  ref_type     core.reference_type NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_refs_src ON core.file_references(app_id, src_file_id);
CREATE INDEX IF NOT EXISTS file_refs_dest ON core.file_references(app_id, dest_file_id);
CREATE INDEX IF NOT EXISTS file_refs_target_trgm ON core.file_references USING GIN (raw_target gin_trgm_ops);

-- ============================================================================
-- SESSION MEMORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.session_memory (
  session_id                 UUID PRIMARY KEY REFERENCES core.sessions(id) ON DELETE CASCADE,
  rolling_summary            TEXT,
  facts                      JSONB,
  last_compacted_message_id  BIGINT,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- WORKING SET
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.working_set (
  session_id  UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  app_id      UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  file_id     UUID NOT NULL REFERENCES core.files(id) ON DELETE CASCADE,
  reason      TEXT,
  pinned_by   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, file_id)
);

CREATE INDEX IF NOT EXISTS working_set_by_session ON core.working_set(session_id);

-- ============================================================================
-- IMAGE GENERATION JOBS
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.image_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES core.sessions(id) ON DELETE CASCADE,
  app_id        UUID REFERENCES core.apps(id) ON DELETE SET NULL,
  prompt        TEXT NOT NULL,
  model         TEXT NOT NULL,
  size          TEXT,
  n             INT NOT NULL DEFAULT 1,
  state         TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','generating','succeeded','failed','canceled')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  error         JSONB
);

CREATE INDEX IF NOT EXISTS image_jobs_by_session ON core.image_jobs(session_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS image_jobs_by_state ON core.image_jobs(state, requested_at);

-- ============================================================================
-- IMAGE ASSETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.image_assets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES core.image_jobs(id) ON DELETE CASCADE,
  position   INT  NOT NULL,
  mime_type  TEXT NOT NULL,
  bytes      BYTEA,
  storage_url TEXT,
  checksum   BYTEA,
  width      INT,
  height     INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, position)
);

CREATE INDEX IF NOT EXISTS image_assets_by_job ON core.image_assets(job_id, position);

-- ============================================================================
-- EVENT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.events (
  id         BIGSERIAL PRIMARY KEY,
  session_id UUID,
  app_id     UUID,
  actor      TEXT,
  kind       TEXT,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_by_session ON core.events(session_id, id);
CREATE INDEX IF NOT EXISTS events_by_app ON core.events(app_id, id);
CREATE INDEX IF NOT EXISTS events_by_kind ON core.events(kind, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (Optional - Disabled by default)
-- ============================================================================

-- Uncomment to enable RLS on sessions
-- ALTER TABLE core.sessions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY session_owner_all ON core.sessions
--   USING (user_id = current_setting('app.user_id', true)::uuid);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION core.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON core.sessions
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

CREATE TRIGGER apps_updated_at
  BEFORE UPDATE ON core.apps
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

CREATE TRIGGER files_updated_at
  BEFORE UPDATE ON core.files
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();
