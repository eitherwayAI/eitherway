/**
 * Telemetry Service
 *
 * Provides typed event logging and analytics querying for observability.
 *
 * Features:
 * - Type-safe event logging
 * - Metric aggregation (avg, sum, percentiles)
 * - Time-series data
 * - Category-based analytics
 * - Materialized view refresh
 */

import type { DatabaseClient } from '../client.js';

// ============================================================================
// TYPES
// ============================================================================

export type EventCategory =
  | 'messaging'
  | 'files'
  | 'plans'
  | 'brand_kits'
  | 'deployments'
  | 'exports'
  | 'pwa'
  | 'sessions'
  | 'security'
  | 'performance';

export interface TelemetryEvent {
  appId: string;
  userId: string;
  sessionId?: string;
  eventType: string;
  eventCategory: EventCategory;
  metrics?: Record<string, number>;
  dimensions?: Record<string, string>;
  tags?: string[];
}

export interface MetricAggregates {
  totalCount: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface TimeSeriesDataPoint {
  timeBucket: Date;
  eventCount: number;
  avgValue: number;
  sumValue: number;
}

export interface EventCounts {
  eventCategory: string;
  eventCount: number;
}

export interface DailyEventSummary {
  eventDate: Date;
  eventCategory: string;
  eventType: string;
  appId: string;
  eventCount: number;
  uniqueUsers: number;
  uniqueSessions: number;
  totalTokens: number;
  avgDurationMs: number;
  totalBytes: number;
  firstEventAt: Date;
  lastEventAt: Date;
}

export interface HourlyPerformanceMetrics {
  hourBucket: Date;
  eventCategory: string;
  appId: string;
  eventCount: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  avgDurationMs: number;
  totalTokens: number;
  avgTokens: number;
}

// ============================================================================
// TELEMETRY SERVICE
// ============================================================================

export class TelemetryService {
  constructor(private db: DatabaseClient) {}

  /**
   * Log a generic telemetry event
   */
  async logEvent(event: TelemetryEvent): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `SELECT log_telemetry_event($1, $2, $3, $4, $5, $6, $7, $8) as id`,
      [
        event.appId,
        event.userId,
        event.sessionId || null,
        event.eventType,
        event.eventCategory,
        event.metrics ? JSON.stringify(event.metrics) : '{}',
        event.dimensions ? JSON.stringify(event.dimensions) : '{}',
        event.tags || []
      ]
    );

    return result.rows[0].id;
  }

  /**
   * Log a message event
   */
  async logMessage(
    appId: string,
    userId: string,
    sessionId: string,
    tokenCount: number,
    durationMs: number,
    role: 'user' | 'assistant',
    model?: string
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `SELECT log_message_event($1, $2, $3, $4, $5, $6, $7) as id`,
      [appId, userId, sessionId, tokenCount, durationMs, role, model || null]
    );

    return result.rows[0].id;
  }

  /**
   * Log a file operation event
   */
  async logFileOperation(
    appId: string,
    userId: string,
    sessionId: string,
    operation: 'created' | 'updated' | 'deleted',
    filePath: string,
    sizeBytes: number
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `SELECT log_file_event($1, $2, $3, $4, $5, $6) as id`,
      [appId, userId, sessionId, operation, filePath, sizeBytes]
    );

    return result.rows[0].id;
  }

  /**
   * Log a deployment event
   */
  async logDeployment(
    appId: string,
    userId: string,
    deploymentId: string,
    status: 'started' | 'completed' | 'failed',
    durationMs: number,
    deploymentType: string = 'github_pages'
  ): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `SELECT log_deployment_event($1, $2, $3, $4, $5, $6) as id`,
      [appId, userId, deploymentId, status, durationMs, deploymentType]
    );

    return result.rows[0].id;
  }

  /**
   * Get event counts by category for a time range
   */
  async getEventCountsByCategory(
    startTime: Date,
    endTime: Date,
    appId?: string
  ): Promise<EventCounts[]> {
    const result = await this.db.query<EventCounts>(
      `SELECT * FROM get_event_counts_by_category($1, $2, $3)`,
      [startTime, endTime, appId || null]
    );

    return result.rows.map(row => ({
      eventCategory: row.eventCategory,
      eventCount: row.eventCount
    }));
  }

  /**
   * Get metric aggregates for a category and metric
   */
  async getMetricAggregates(
    eventCategory: EventCategory,
    metricName: string,
    startTime: Date,
    endTime: Date,
    appId?: string
  ): Promise<MetricAggregates | null> {
    const result = await this.db.query<any>(
      `SELECT * FROM get_metric_aggregates($1, $2, $3, $4, $5)`,
      [eventCategory, metricName, startTime, endTime, appId || null]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      totalCount: parseInt(row.total_count),
      sum: parseFloat(row.sum_value),
      avg: parseFloat(row.avg_value),
      min: parseFloat(row.min_value),
      max: parseFloat(row.max_value),
      p50: parseFloat(row.p50_value),
      p95: parseFloat(row.p95_value),
      p99: parseFloat(row.p99_value)
    };
  }

  /**
   * Get time-series data for a metric
   */
  async getMetricTimeSeries(
    eventCategory: EventCategory,
    metricName: string,
    startTime: Date,
    endTime: Date,
    bucketSize: string = '1 hour',
    appId?: string
  ): Promise<TimeSeriesDataPoint[]> {
    const result = await this.db.query<any>(
      `SELECT * FROM get_metric_timeseries($1, $2, $3, $4, $5, $6)`,
      [eventCategory, metricName, startTime, endTime, bucketSize, appId || null]
    );

    return result.rows.map(row => ({
      timeBucket: row.time_bucket,
      eventCount: parseInt(row.event_count),
      avgValue: parseFloat(row.avg_value),
      sumValue: parseFloat(row.sum_value)
    }));
  }

  /**
   * Get daily event summary
   */
  async getDailyEventSummary(
    startDate: Date,
    endDate: Date,
    appId?: string,
    eventCategory?: EventCategory
  ): Promise<DailyEventSummary[]> {
    let query = `
      SELECT * FROM core.daily_event_summary
      WHERE event_date BETWEEN $1 AND $2
    `;
    const params: any[] = [startDate, endDate];

    if (appId) {
      params.push(appId);
      query += ` AND app_id = $${params.length}`;
    }

    if (eventCategory) {
      params.push(eventCategory);
      query += ` AND event_category = $${params.length}`;
    }

    query += ' ORDER BY event_date DESC, event_count DESC';

    const result = await this.db.query<any>(query, params);

    return result.rows.map(row => ({
      eventDate: row.event_date,
      eventCategory: row.event_category,
      eventType: row.event_type,
      appId: row.app_id,
      eventCount: parseInt(row.event_count),
      uniqueUsers: parseInt(row.unique_users),
      uniqueSessions: parseInt(row.unique_sessions),
      totalTokens: parseInt(row.total_tokens || 0),
      avgDurationMs: parseFloat(row.avg_duration_ms || 0),
      totalBytes: parseInt(row.total_bytes || 0),
      firstEventAt: row.first_event_at,
      lastEventAt: row.last_event_at
    }));
  }

  /**
   * Get hourly performance metrics
   */
  async getHourlyPerformanceMetrics(
    startTime: Date,
    endTime: Date,
    appId?: string,
    eventCategory?: EventCategory
  ): Promise<HourlyPerformanceMetrics[]> {
    let query = `
      SELECT * FROM core.hourly_performance_metrics
      WHERE hour_bucket BETWEEN $1 AND $2
    `;
    const params: any[] = [startTime, endTime];

    if (appId) {
      params.push(appId);
      query += ` AND app_id = $${params.length}`;
    }

    if (eventCategory) {
      params.push(eventCategory);
      query += ` AND event_category = $${params.length}`;
    }

    query += ' ORDER BY hour_bucket DESC';

    const result = await this.db.query<any>(query, params);

    return result.rows.map(row => ({
      hourBucket: row.hour_bucket,
      eventCategory: row.event_category,
      appId: row.app_id,
      eventCount: parseInt(row.event_count),
      p50DurationMs: parseFloat(row.p50_duration_ms || 0),
      p95DurationMs: parseFloat(row.p95_duration_ms || 0),
      p99DurationMs: parseFloat(row.p99_duration_ms || 0),
      avgDurationMs: parseFloat(row.avg_duration_ms || 0),
      totalTokens: parseInt(row.total_tokens || 0),
      avgTokens: parseFloat(row.avg_tokens || 0)
    }));
  }

  /**
   * Refresh materialized views (run daily)
   */
  async refreshAnalyticsViews(): Promise<void> {
    await this.db.query('SELECT refresh_analytics_views()');
  }

  /**
   * Archive old events (cleanup)
   */
  async archiveOldEvents(daysToKeep: number = 90): Promise<number> {
    const result = await this.db.query<{ archived_count: number }>(
      'SELECT archive_old_events($1) as archived_count',
      [daysToKeep]
    );

    return result.rows[0].archived_count;
  }

  /**
   * Get real-time events (last N events)
   */
  async getRecentEvents(
    limit: number = 100,
    eventCategory?: EventCategory,
    appId?: string
  ): Promise<any[]> {
    let query = 'SELECT * FROM core.events WHERE 1=1';
    const params: any[] = [];

    if (eventCategory) {
      params.push(eventCategory);
      query += ` AND event_category = $${params.length}`;
    }

    if (appId) {
      params.push(appId);
      query += ` AND app_id = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    const result = await this.db.query(
      `SELECT * FROM core.user_activity_summary
       WHERE user_id = $1
         AND activity_date BETWEEN $2 AND $3
       ORDER BY activity_date DESC`,
      [userId, startDate, endDate]
    );

    return result.rows;
  }
}
