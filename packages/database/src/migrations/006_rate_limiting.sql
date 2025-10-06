-- Migration 006: Rate Limiting
-- Add tables to track daily rate limits per user and per session

-- ============================================================================
-- USER DAILY LIMITS
-- Tracks the number of sessions created by each user per UTC day
-- Limit: 5 sessions per day
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.user_daily_limits (
  user_id         UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  limit_date      DATE NOT NULL,
  sessions_created INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, limit_date)
);

CREATE INDEX IF NOT EXISTS user_daily_limits_date_idx ON core.user_daily_limits(limit_date);

-- ============================================================================
-- SESSION DAILY LIMITS
-- Tracks the number of messages sent per session per UTC day
-- Limit: 5 messages per session per day
-- ============================================================================

CREATE TABLE IF NOT EXISTS core.session_daily_limits (
  session_id    UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
  limit_date    DATE NOT NULL,
  messages_sent INT NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, limit_date)
);

CREATE INDEX IF NOT EXISTS session_daily_limits_date_idx ON core.session_daily_limits(limit_date);

-- ============================================================================
-- CLEANUP FUNCTION
-- Optional: Function to clean up old limit records (older than 7 days)
-- Can be called periodically to prevent table growth
-- ============================================================================

CREATE OR REPLACE FUNCTION core.cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM core.user_daily_limits WHERE limit_date < CURRENT_DATE - INTERVAL '7 days';
  DELETE FROM core.session_daily_limits WHERE limit_date < CURRENT_DATE - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
