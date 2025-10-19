-- Migration 007: Plan Execution System
-- Safe execution of AI-generated plans with validation, logging, and idempotency

-- ============================================================================
-- PLAN OPERATIONS LOG
-- ============================================================================
-- Tracks each individual operation within a plan execution

CREATE TABLE IF NOT EXISTS core.plan_operations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  app_id            UUID REFERENCES core.apps(id) ON DELETE CASCADE,
  plan_id           UUID NOT NULL,  -- Client-generated plan identifier for idempotency
  operation_index   INT NOT NULL,   -- Execution order in plan (0-indexed)
  operation_type    TEXT NOT NULL CHECK (operation_type IN ('write', 'patch', 'package_install', 'package_remove')),
  operation_params  JSONB NOT NULL, -- Full operation parameters for replay/audit
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  result            JSONB,          -- Success result or error details
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, operation_index) -- Ensures idempotency per plan
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS plan_operations_plan ON core.plan_operations(plan_id, operation_index);
CREATE INDEX IF NOT EXISTS plan_operations_session ON core.plan_operations(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_operations_status ON core.plan_operations(status) WHERE status IN ('running', 'pending');
CREATE INDEX IF NOT EXISTS plan_operations_app ON core.plan_operations(app_id, created_at DESC) WHERE app_id IS NOT NULL;

-- ============================================================================
-- PLAN EXECUTION SUMMARY
-- ============================================================================
-- High-level tracking of entire plan execution

CREATE TABLE IF NOT EXISTS core.plan_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL UNIQUE,  -- Globally unique plan identifier
  session_id      UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  app_id          UUID REFERENCES core.apps(id) ON DELETE CASCADE,
  total_ops       INT NOT NULL,
  succeeded_ops   INT NOT NULL DEFAULT 0,
  failed_ops      INT NOT NULL DEFAULT 0,
  skipped_ops     INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for reporting and dashboards
CREATE INDEX IF NOT EXISTS plan_executions_session ON core.plan_executions(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_executions_status ON core.plan_executions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS plan_executions_app ON core.plan_executions(app_id, created_at DESC) WHERE app_id IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE core.plan_operations IS 'Individual operations within plan executions with full audit trail';
COMMENT ON TABLE core.plan_executions IS 'Summary of plan executions for monitoring and analytics';
COMMENT ON COLUMN core.plan_operations.plan_id IS 'Client-generated UUID for idempotent plan execution';
COMMENT ON COLUMN core.plan_operations.operation_index IS 'Zero-based index indicating execution order';
COMMENT ON COLUMN core.plan_operations.operation_params IS 'Full operation details stored as JSON for audit and replay';
COMMENT ON COLUMN core.plan_executions.status IS 'completed=all success, failed=all failed, partial=mixed results';
