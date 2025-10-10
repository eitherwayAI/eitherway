/**
 * Migration 009: Security Audit System
 *
 * Purpose:
 * - Track security-relevant events
 * - Monitor suspicious activity patterns
 * - Enable forensic analysis
 * - Support compliance requirements
 *
 * Tables:
 * - core.security_events: All security-related events
 * - core.rate_limit_violations: Detailed rate limit tracking
 */

-- ============================================================================
-- SECURITY EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.security_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event classification
  event_type        TEXT NOT NULL CHECK (event_type IN (
    'auth.login_attempt',
    'auth.login_success',
    'auth.login_failure',
    'auth.logout',
    'auth.session_expired',
    'validation.plan_rejected',
    'validation.input_sanitized',
    'validation.file_blocked',
    'rate_limit.exceeded',
    'rate_limit.warning',
    'access.unauthorized',
    'access.forbidden',
    'injection.sql_attempt',
    'injection.xss_attempt',
    'injection.command_attempt',
    'upload.malicious_file',
    'upload.size_exceeded',
    'api.abuse_detected',
    'api.invalid_request',
    'system.config_changed',
    'system.admin_action'
  )),

  severity          TEXT NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),

  -- Context
  user_id           UUID REFERENCES core.users(id) ON DELETE SET NULL,
  session_id        UUID REFERENCES core.sessions(id) ON DELETE SET NULL,
  app_id            UUID REFERENCES core.apps(id) ON DELETE SET NULL,

  -- Request context
  ip_address        INET,
  user_agent        TEXT,
  request_path      TEXT,
  request_method    TEXT,

  -- Event details
  event_data        JSONB NOT NULL DEFAULT '{}',

  -- Detection metadata
  risk_score        INT CHECK (risk_score >= 0 AND risk_score <= 100),
  is_blocked        BOOLEAN DEFAULT false,
  detection_rules   TEXT[],

  -- Timestamp
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Indexes for common queries
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_events_event_type ON core.security_events(event_type);
CREATE INDEX idx_security_events_severity ON core.security_events(severity);
CREATE INDEX idx_security_events_user_id ON core.security_events(user_id);
CREATE INDEX idx_security_events_session_id ON core.security_events(session_id);
CREATE INDEX idx_security_events_ip_address ON core.security_events(ip_address);
CREATE INDEX idx_security_events_occurred_at ON core.security_events(occurred_at DESC);
CREATE INDEX idx_security_events_risk_score ON core.security_events(risk_score DESC) WHERE risk_score > 50;
CREATE INDEX idx_security_events_blocked ON core.security_events(is_blocked) WHERE is_blocked = true;

-- GIN index for JSONB queries
CREATE INDEX idx_security_events_event_data ON core.security_events USING GIN (event_data);

-- ============================================================================
-- RATE LIMIT VIOLATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.rate_limit_violations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rate limit context
  limit_type        TEXT NOT NULL CHECK (limit_type IN (
    'message_sending',
    'file_operations',
    'plan_execution',
    'brand_kit_uploads',
    'api_requests',
    'auth_attempts',
    'session_creation'
  )),

  -- Identifier (user_id, IP, or composite)
  identifier        TEXT NOT NULL,
  identifier_type   TEXT NOT NULL CHECK (identifier_type IN ('user_id', 'ip_address', 'session_id', 'api_key')),

  -- Violation details
  limit_value       INT NOT NULL,
  current_count     INT NOT NULL,
  window_start      TIMESTAMPTZ NOT NULL,
  window_end        TIMESTAMPTZ NOT NULL,

  -- Context
  user_id           UUID REFERENCES core.users(id) ON DELETE SET NULL,
  session_id        UUID REFERENCES core.sessions(id) ON DELETE SET NULL,
  ip_address        INET,

  -- Request details
  request_path      TEXT,
  request_method    TEXT,
  user_agent        TEXT,

  -- Action taken
  action            TEXT NOT NULL CHECK (action IN ('blocked', 'throttled', 'logged', 'warned')),

  -- Timestamp
  violated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Metadata
  metadata          JSONB DEFAULT '{}'
);

CREATE INDEX idx_rate_limit_violations_limit_type ON core.rate_limit_violations(limit_type);
CREATE INDEX idx_rate_limit_violations_identifier ON core.rate_limit_violations(identifier, identifier_type);
CREATE INDEX idx_rate_limit_violations_user_id ON core.rate_limit_violations(user_id);
CREATE INDEX idx_rate_limit_violations_ip_address ON core.rate_limit_violations(ip_address);
CREATE INDEX idx_rate_limit_violations_violated_at ON core.rate_limit_violations(violated_at DESC);

-- ============================================================================
-- SECURITY METRICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW core.security_metrics AS
SELECT
  date_trunc('hour', occurred_at) AS hour,
  event_type,
  severity,
  COUNT(*) AS event_count,
  COUNT(*) FILTER (WHERE is_blocked) AS blocked_count,
  AVG(risk_score) FILTER (WHERE risk_score IS NOT NULL) AS avg_risk_score,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT ip_address) AS unique_ips
FROM core.security_events
WHERE occurred_at >= now() - interval '7 days'
GROUP BY date_trunc('hour', occurred_at), event_type, severity
ORDER BY hour DESC, event_count DESC;

-- ============================================================================
-- HIGH RISK USERS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW core.high_risk_users AS
SELECT
  u.id AS user_id,
  u.email,
  COUNT(*) AS total_security_events,
  COUNT(*) FILTER (WHERE se.severity IN ('error', 'critical')) AS critical_events,
  COUNT(*) FILTER (WHERE se.is_blocked) AS blocked_attempts,
  AVG(se.risk_score) FILTER (WHERE se.risk_score IS NOT NULL) AS avg_risk_score,
  MAX(se.occurred_at) AS last_security_event,
  array_agg(DISTINCT se.event_type) FILTER (WHERE se.severity IN ('error', 'critical')) AS event_types
FROM core.users u
JOIN core.security_events se ON se.user_id = u.id
WHERE se.occurred_at >= now() - interval '30 days'
GROUP BY u.id, u.email
HAVING COUNT(*) FILTER (WHERE se.severity IN ('error', 'critical')) > 5
   OR AVG(se.risk_score) > 60
ORDER BY avg_risk_score DESC NULLS LAST, critical_events DESC;

-- ============================================================================
-- SUSPICIOUS IP ADDRESSES VIEW
-- ============================================================================

CREATE OR REPLACE VIEW core.suspicious_ips AS
SELECT
  ip_address,
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE severity IN ('error', 'critical')) AS critical_events,
  COUNT(*) FILTER (WHERE is_blocked) AS blocked_requests,
  COUNT(DISTINCT user_id) AS unique_users,
  AVG(risk_score) FILTER (WHERE risk_score IS NOT NULL) AS avg_risk_score,
  MAX(occurred_at) AS last_seen,
  array_agg(DISTINCT event_type) AS event_types
FROM core.security_events
WHERE ip_address IS NOT NULL
  AND occurred_at >= now() - interval '24 hours'
GROUP BY ip_address
HAVING COUNT(*) FILTER (WHERE severity IN ('error', 'critical')) > 10
   OR COUNT(*) FILTER (WHERE is_blocked) > 5
   OR AVG(risk_score) > 70
ORDER BY critical_events DESC, avg_risk_score DESC NULLS LAST;

-- ============================================================================
-- CLEANUP POLICY (Optional - for automated retention)
-- ============================================================================

-- Delete old security events (keep 90 days)
-- This should be run via a scheduled job, not a trigger
COMMENT ON TABLE core.security_events IS
'Security audit log - recommended retention: 90 days for info/debug, 1 year for warning/error/critical';

COMMENT ON TABLE core.rate_limit_violations IS
'Rate limit violation tracking - recommended retention: 30 days';

-- ============================================================================
-- FUNCTIONS FOR SECURITY ANALYSIS
-- ============================================================================

/**
 * Calculate risk score for an IP address based on recent activity
 */
CREATE OR REPLACE FUNCTION calculate_ip_risk_score(target_ip INET)
RETURNS INT AS $$
DECLARE
  risk INT := 0;
  event_count INT;
  blocked_count INT;
  critical_count INT;
BEGIN
  -- Count recent events from this IP
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_blocked),
    COUNT(*) FILTER (WHERE severity IN ('error', 'critical'))
  INTO event_count, blocked_count, critical_count
  FROM core.security_events
  WHERE ip_address = target_ip
    AND occurred_at >= now() - interval '1 hour';

  -- Calculate risk score
  risk := LEAST(100,
    (event_count * 2) +           -- 2 points per event
    (blocked_count * 10) +        -- 10 points per blocked request
    (critical_count * 20)         -- 20 points per critical event
  );

  RETURN risk;
END;
$$ LANGUAGE plpgsql;

/**
 * Check if an IP should be blocked
 */
CREATE OR REPLACE FUNCTION should_block_ip(target_ip INET)
RETURNS BOOLEAN AS $$
DECLARE
  risk_score INT;
  recent_blocks INT;
BEGIN
  risk_score := calculate_ip_risk_score(target_ip);

  -- Count blocks in last 10 minutes
  SELECT COUNT(*)
  INTO recent_blocks
  FROM core.security_events
  WHERE ip_address = target_ip
    AND is_blocked = true
    AND occurred_at >= now() - interval '10 minutes';

  -- Block if risk score > 80 OR 5+ blocks in 10 minutes
  RETURN risk_score > 80 OR recent_blocks >= 5;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN core.security_events.risk_score IS 'Computed risk score 0-100, higher = more dangerous';
COMMENT ON COLUMN core.security_events.detection_rules IS 'Array of rule names that detected this event';
COMMENT ON COLUMN core.rate_limit_violations.action IS 'Action taken when limit was exceeded';
