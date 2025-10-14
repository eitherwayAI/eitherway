/**
 * Migration 012: Telemetry & Observability
 *
 * Purpose:
 * - Extend events table with typed metrics
 * - Add event schemas for different event types
 * - Create aggregation functions for analytics
 * - Build materialized views for dashboards
 *
 * Event Types:
 * - message.sent, message.received, message.streamed
 * - file.created, file.updated, file.deleted
 * - plan.applied, plan.failed
 * - brand_kit.uploaded, brand_kit.processed
 * - deployment.started, deployment.completed
 * - export.created, export.downloaded
 * - pwa.validated
 * - session.created, session.resumed
 */

-- ============================================================================
-- EXTEND EVENTS TABLE WITH TYPED METRICS
-- ============================================================================

ALTER TABLE IF EXISTS core.events
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES core.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS event_category TEXT,
  ADD COLUMN IF NOT EXISTS metrics JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dimensions JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add check constraint for event categories
ALTER TABLE IF EXISTS core.events
  ADD CONSTRAINT events_category_check
  CHECK (event_category IN (
    'messaging', 'files', 'plans', 'brand_kits',
    'deployments', 'exports', 'pwa', 'sessions',
    'security', 'performance'
  ));

-- Add indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_events_user_id ON core.events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON core.events(event_category);
CREATE INDEX IF NOT EXISTS idx_events_type_category ON core.events(event_type, event_category);
CREATE INDEX IF NOT EXISTS idx_events_created_at_category ON core.events(created_at DESC, event_category);
CREATE INDEX IF NOT EXISTS idx_events_metrics ON core.events USING GIN (metrics);
CREATE INDEX IF NOT EXISTS idx_events_dimensions ON core.events USING GIN (dimensions);
CREATE INDEX IF NOT EXISTS idx_events_tags ON core.events USING GIN (tags);

COMMENT ON COLUMN core.events.event_category IS 'High-level event category for filtering';
COMMENT ON COLUMN core.events.metrics IS 'Numeric metrics (duration_ms, size_bytes, count, etc.)';
COMMENT ON COLUMN core.events.dimensions IS 'Categorical dimensions (status, source, target, etc.)';
COMMENT ON COLUMN core.events.tags IS 'Array of tags for flexible filtering';

-- ============================================================================
-- EVENT SCHEMAS (JSONB Validation)
-- ============================================================================

/**
 * Validate message event metrics
 */
CREATE OR REPLACE FUNCTION validate_message_metrics(data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Required fields: token_count, duration_ms
  RETURN (
    data ? 'token_count' AND
    data ? 'duration_ms' AND
    (data->>'token_count')::int >= 0 AND
    (data->>'duration_ms')::int >= 0
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

/**
 * Validate file event metrics
 */
CREATE OR REPLACE FUNCTION validate_file_metrics(data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Required fields: size_bytes, operation
  RETURN (
    data ? 'size_bytes' AND
    data ? 'operation' AND
    (data->>'size_bytes')::bigint >= 0
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

/**
 * Validate deployment event metrics
 */
CREATE OR REPLACE FUNCTION validate_deployment_metrics(data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  -- Required fields: duration_ms, status
  RETURN (
    data ? 'duration_ms' AND
    data ? 'status' AND
    (data->>'duration_ms')::int >= 0
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- TELEMETRY LOGGING FUNCTIONS
-- ============================================================================

/**
 * Log telemetry event with typed metrics
 */
CREATE OR REPLACE FUNCTION log_telemetry_event(
  p_app_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_event_type TEXT,
  p_event_category TEXT,
  p_metrics JSONB DEFAULT '{}',
  p_dimensions JSONB DEFAULT '{}',
  p_tags TEXT[] DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO core.events (
    app_id, user_id, session_id, event_type,
    event_category, metrics, dimensions, tags
  )
  VALUES (
    p_app_id, p_user_id, p_session_id, p_event_type,
    p_event_category, p_metrics, p_dimensions, p_tags
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Log message event
 */
CREATE OR REPLACE FUNCTION log_message_event(
  p_app_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_token_count INT,
  p_duration_ms INT,
  p_role TEXT,
  p_model TEXT DEFAULT NULL
)
RETURNS UUID AS $$
BEGIN
  RETURN log_telemetry_event(
    p_app_id,
    p_user_id,
    p_session_id,
    'message.sent',
    'messaging',
    jsonb_build_object(
      'token_count', p_token_count,
      'duration_ms', p_duration_ms
    ),
    jsonb_build_object(
      'role', p_role,
      'model', p_model
    ),
    ARRAY['messaging', 'tokens']
  );
END;
$$ LANGUAGE plpgsql;

/**
 * Log file operation event
 */
CREATE OR REPLACE FUNCTION log_file_event(
  p_app_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_operation TEXT,
  p_file_path TEXT,
  p_size_bytes BIGINT
)
RETURNS UUID AS $$
BEGIN
  RETURN log_telemetry_event(
    p_app_id,
    p_user_id,
    p_session_id,
    'file.' || p_operation,
    'files',
    jsonb_build_object(
      'size_bytes', p_size_bytes,
      'operation', p_operation
    ),
    jsonb_build_object(
      'file_path', p_file_path,
      'file_extension', regexp_replace(p_file_path, '.*\.', '')
    ),
    ARRAY['files', p_operation]
  );
END;
$$ LANGUAGE plpgsql;

/**
 * Log deployment event
 */
CREATE OR REPLACE FUNCTION log_deployment_event(
  p_app_id UUID,
  p_user_id UUID,
  p_deployment_id UUID,
  p_status TEXT,
  p_duration_ms INT,
  p_deployment_type TEXT DEFAULT 'github_pages'
)
RETURNS UUID AS $$
BEGIN
  RETURN log_telemetry_event(
    p_app_id,
    p_user_id,
    NULL,
    'deployment.' || p_status,
    'deployments',
    jsonb_build_object(
      'duration_ms', p_duration_ms,
      'deployment_id', p_deployment_id
    ),
    jsonb_build_object(
      'status', p_status,
      'deployment_type', p_deployment_type
    ),
    ARRAY['deployments', p_status]
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ANALYTICS AGGREGATION FUNCTIONS
-- ============================================================================

/**
 * Get event counts by category for a time range
 */
CREATE OR REPLACE FUNCTION get_event_counts_by_category(
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_app_id UUID DEFAULT NULL
)
RETURNS TABLE (
  event_category TEXT,
  event_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.event_category,
    COUNT(*) as event_count
  FROM core.events e
  WHERE e.created_at BETWEEN p_start_time AND p_end_time
    AND (p_app_id IS NULL OR e.app_id = p_app_id)
  GROUP BY e.event_category
  ORDER BY event_count DESC;
END;
$$ LANGUAGE plpgsql;

/**
 * Get metric aggregates for a category
 */
CREATE OR REPLACE FUNCTION get_metric_aggregates(
  p_event_category TEXT,
  p_metric_name TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_app_id UUID DEFAULT NULL
)
RETURNS TABLE (
  total_count BIGINT,
  sum_value NUMERIC,
  avg_value NUMERIC,
  min_value NUMERIC,
  max_value NUMERIC,
  p50_value NUMERIC,
  p95_value NUMERIC,
  p99_value NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_count,
    SUM((metrics->>p_metric_name)::numeric) as sum_value,
    AVG((metrics->>p_metric_name)::numeric) as avg_value,
    MIN((metrics->>p_metric_name)::numeric) as min_value,
    MAX((metrics->>p_metric_name)::numeric) as max_value,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (metrics->>p_metric_name)::numeric) as p50_value,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metrics->>p_metric_name)::numeric) as p95_value,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY (metrics->>p_metric_name)::numeric) as p99_value
  FROM core.events
  WHERE event_category = p_event_category
    AND created_at BETWEEN p_start_time AND p_end_time
    AND metrics ? p_metric_name
    AND (p_app_id IS NULL OR app_id = p_app_id);
END;
$$ LANGUAGE plpgsql;

/**
 * Get time-series data for a metric (hourly buckets)
 */
CREATE OR REPLACE FUNCTION get_metric_timeseries(
  p_event_category TEXT,
  p_metric_name TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_bucket_size INTERVAL DEFAULT '1 hour',
  p_app_id UUID DEFAULT NULL
)
RETURNS TABLE (
  time_bucket TIMESTAMPTZ,
  event_count BIGINT,
  avg_value NUMERIC,
  sum_value NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    date_trunc('hour', created_at) as time_bucket,
    COUNT(*) as event_count,
    AVG((metrics->>p_metric_name)::numeric) as avg_value,
    SUM((metrics->>p_metric_name)::numeric) as sum_value
  FROM core.events
  WHERE event_category = p_event_category
    AND created_at BETWEEN p_start_time AND p_end_time
    AND metrics ? p_metric_name
    AND (p_app_id IS NULL OR app_id = p_app_id)
  GROUP BY time_bucket
  ORDER BY time_bucket;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================================

/**
 * Daily event summary (materialized for performance)
 */
CREATE MATERIALIZED VIEW IF NOT EXISTS core.daily_event_summary AS
SELECT
  DATE(created_at) as event_date,
  event_category,
  event_type,
  app_id,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions,

  -- Messaging metrics
  SUM(CASE WHEN metrics ? 'token_count' THEN (metrics->>'token_count')::bigint ELSE 0 END) as total_tokens,
  AVG(CASE WHEN metrics ? 'duration_ms' THEN (metrics->>'duration_ms')::numeric ELSE NULL END) as avg_duration_ms,

  -- File metrics
  SUM(CASE WHEN metrics ? 'size_bytes' THEN (metrics->>'size_bytes')::bigint ELSE 0 END) as total_bytes,

  MIN(created_at) as first_event_at,
  MAX(created_at) as last_event_at
FROM core.events
GROUP BY DATE(created_at), event_category, event_type, app_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_event_summary_unique
  ON core.daily_event_summary(event_date, event_category, event_type, app_id);

CREATE INDEX IF NOT EXISTS idx_daily_event_summary_date ON core.daily_event_summary(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_event_summary_category ON core.daily_event_summary(event_category);
CREATE INDEX IF NOT EXISTS idx_daily_event_summary_app_id ON core.daily_event_summary(app_id);

COMMENT ON MATERIALIZED VIEW core.daily_event_summary IS 'Daily aggregated event metrics for analytics dashboards';

/**
 * Hourly performance metrics (materialized)
 */
CREATE MATERIALIZED VIEW IF NOT EXISTS core.hourly_performance_metrics AS
SELECT
  date_trunc('hour', created_at) as hour_bucket,
  event_category,
  app_id,
  COUNT(*) as event_count,

  -- Duration metrics (p50, p95, p99)
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (metrics->>'duration_ms')::numeric) as p50_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (metrics->>'duration_ms')::numeric) as p95_duration_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY (metrics->>'duration_ms')::numeric) as p99_duration_ms,
  AVG((metrics->>'duration_ms')::numeric) as avg_duration_ms,

  -- Token metrics
  SUM(CASE WHEN metrics ? 'token_count' THEN (metrics->>'token_count')::bigint ELSE 0 END) as total_tokens,
  AVG(CASE WHEN metrics ? 'token_count' THEN (metrics->>'token_count')::numeric ELSE NULL END) as avg_tokens
FROM core.events
WHERE metrics ? 'duration_ms'
GROUP BY hour_bucket, event_category, app_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_performance_unique
  ON core.hourly_performance_metrics(hour_bucket, event_category, app_id);

CREATE INDEX IF NOT EXISTS idx_hourly_performance_time ON core.hourly_performance_metrics(hour_bucket DESC);

COMMENT ON MATERIALIZED VIEW core.hourly_performance_metrics IS 'Hourly performance metrics with percentiles';

/**
 * User activity summary
 */
CREATE MATERIALIZED VIEW IF NOT EXISTS core.user_activity_summary AS
SELECT
  user_id,
  DATE(created_at) as activity_date,
  COUNT(*) as total_events,
  COUNT(DISTINCT session_id) as session_count,
  COUNT(DISTINCT app_id) as app_count,

  -- Event category breakdown
  COUNT(*) FILTER (WHERE event_category = 'messaging') as messaging_events,
  COUNT(*) FILTER (WHERE event_category = 'files') as file_events,
  COUNT(*) FILTER (WHERE event_category = 'deployments') as deployment_events,

  MIN(created_at) as first_event_at,
  MAX(created_at) as last_event_at
FROM core.events
GROUP BY user_id, DATE(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_unique
  ON core.user_activity_summary(user_id, activity_date);

CREATE INDEX IF NOT EXISTS idx_user_activity_date ON core.user_activity_summary(activity_date DESC);

COMMENT ON MATERIALIZED VIEW core.user_activity_summary IS 'Daily user activity metrics';

-- ============================================================================
-- REFRESH FUNCTIONS FOR MATERIALIZED VIEWS
-- ============================================================================

/**
 * Refresh all analytics views (run daily via cron)
 */
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY core.daily_event_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY core.hourly_performance_metrics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY core.user_activity_summary;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

/**
 * Archive old events (move to archive table or delete after N days)
 */
CREATE OR REPLACE FUNCTION archive_old_events(days_to_keep INT DEFAULT 90)
RETURNS INT AS $$
DECLARE
  archived_count INT;
BEGIN
  DELETE FROM core.events
  WHERE created_at < now() - (days_to_keep || ' days')::interval;

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION archive_old_events IS 'Delete events older than N days (default: 90)';

-- ============================================================================
-- EXAMPLE USAGE
-- ============================================================================

COMMENT ON FUNCTION log_telemetry_event IS 'Log generic telemetry event with typed metrics';
COMMENT ON FUNCTION log_message_event IS 'Log message event with token count and duration';
COMMENT ON FUNCTION log_file_event IS 'Log file operation event with size and path';
COMMENT ON FUNCTION log_deployment_event IS 'Log deployment event with status and duration';
COMMENT ON FUNCTION get_event_counts_by_category IS 'Get event counts grouped by category for a time range';
COMMENT ON FUNCTION get_metric_aggregates IS 'Get statistical aggregates for a metric';
COMMENT ON FUNCTION get_metric_timeseries IS 'Get time-series data for a metric';
