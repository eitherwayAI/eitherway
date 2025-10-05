-- Migration 002: Phase 2 Schema - Embeddings, Symbol Index, Enhanced Features

-- ============================================================================
-- DOC EMBEDDINGS (Semantic Search)
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.doc_embeddings (
  id         BIGSERIAL PRIMARY KEY,
  app_id     UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN ('file', 'symbol', 'session', 'chunk')),
  ref_id     UUID,
  chunk_idx  INT,
  vector     VECTOR(1536),
  content_preview TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS doc_embeddings_app_scope ON core.doc_embeddings(app_id, scope);
CREATE INDEX IF NOT EXISTS doc_embeddings_ref ON core.doc_embeddings(ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS doc_embeddings_vector_idx
  ON core.doc_embeddings
  USING ivfflat (vector vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- SYMBOL INDEX (Code Navigation)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE core.symbol_kind AS ENUM (
    'function', 'class', 'interface', 'type', 'const', 'variable',
    'component', 'hook', 'endpoint', 'model', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS core.symbol_index (
  id            BIGSERIAL PRIMARY KEY,
  app_id        UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  file_id       UUID NOT NULL REFERENCES core.files(id) ON DELETE CASCADE,
  symbol_name   TEXT NOT NULL,
  symbol_kind   core.symbol_kind NOT NULL,
  is_exported   BOOLEAN NOT NULL DEFAULT FALSE,
  line_start    INT,
  line_end      INT,
  signature     TEXT,
  doc_comment   TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS symbol_index_app_file ON core.symbol_index(app_id, file_id);
CREATE INDEX IF NOT EXISTS symbol_index_name_trgm ON core.symbol_index USING GIN (symbol_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS symbol_index_exported ON core.symbol_index(app_id, is_exported) WHERE is_exported = TRUE;

-- ============================================================================
-- SYMBOL USAGES (Cross-references)
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.symbol_usages (
  id                BIGSERIAL PRIMARY KEY,
  app_id            UUID NOT NULL REFERENCES core.apps(id) ON DELETE CASCADE,
  symbol_id         BIGINT NOT NULL REFERENCES core.symbol_index(id) ON DELETE CASCADE,
  usage_file_id     UUID NOT NULL REFERENCES core.files(id) ON DELETE CASCADE,
  usage_line        INT,
  usage_kind        TEXT CHECK (usage_kind IN ('import', 'call', 'reference', 'extend', 'implement')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS symbol_usages_symbol ON core.symbol_usages(symbol_id);
CREATE INDEX IF NOT EXISTS symbol_usages_file ON core.symbol_usages(usage_file_id);

-- ============================================================================
-- ENHANCED IMAGE JOBS (Idempotency)
-- ============================================================================

ALTER TABLE core.image_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS revised_prompt TEXT,
  ADD COLUMN IF NOT EXISTS generation_params JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS image_jobs_idempotency
  ON core.image_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- PROJECT METADATA (Global Context)
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.project_metadata (
  app_id          UUID PRIMARY KEY REFERENCES core.apps(id) ON DELETE CASCADE,
  framework       TEXT,
  language        TEXT,
  package_manager TEXT,
  entry_points    JSONB,
  routes_map      JSONB,
  dependencies    JSONB,
  dev_dependencies JSONB,
  scripts         JSONB,
  readme_summary  TEXT,
  last_analyzed   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- CONTEXT BUILD CACHE (Performance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.context_cache (
  id              BIGSERIAL PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  app_id          UUID REFERENCES core.apps(id) ON DELETE CASCADE,
  cache_key       TEXT NOT NULL,
  context_data    JSONB NOT NULL,
  token_count     INT,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, cache_key)
);

CREATE INDEX IF NOT EXISTS context_cache_expires ON core.context_cache(expires_at);

-- ============================================================================
-- BACKGROUND JOBS (Compaction, Indexing)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE core.job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS core.background_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      TEXT NOT NULL,
  target_id     UUID,
  payload       JSONB,
  status        core.job_status NOT NULL DEFAULT 'pending',
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         JSONB,
  retries       INT NOT NULL DEFAULT 0,
  max_retries   INT NOT NULL DEFAULT 3,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS background_jobs_status ON core.background_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS background_jobs_type ON core.background_jobs(job_type, status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER doc_embeddings_updated_at
  BEFORE UPDATE ON core.doc_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

CREATE TRIGGER symbol_index_updated_at
  BEFORE UPDATE ON core.symbol_index
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();

CREATE TRIGGER project_metadata_updated_at
  BEFORE UPDATE ON core.project_metadata
  FOR EACH ROW
  EXECUTE FUNCTION core.update_updated_at();
