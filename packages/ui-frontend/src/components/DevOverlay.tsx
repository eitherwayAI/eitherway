/**
 * DevOverlay - Stream debugging and observability panel
 *
 * Toggle with Cmd/Ctrl + ` to show:
 * - Live event stream with color coding
 * - Stream metrics (chars/s, phase durations, event counts)
 * - Event log with export/replay functionality
 */

import { useState, useEffect, useRef } from 'react';
import type { StreamEvent } from '../types/stream-events';

interface DevOverlayProps {
  streamService: any; // StreamService instance
}

interface EventLogEntry {
  timestamp: number;
  event: StreamEvent;
}

export default function DevOverlay({ streamService }: DevOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'events' | 'metrics'>('events');
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Toggle overlay with Cmd/Ctrl + `
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        setVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to stream events
  useEffect(() => {
    if (!streamService) return;

    const unsubscribe = streamService.on((event: StreamEvent) => {
      setEvents(prev => [...prev, {
        timestamp: Date.now(),
        event
      }]);
    });

    return () => unsubscribe();
  }, [streamService]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && eventsEndRef.current) {
      eventsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  if (!visible) return null;

  const handleExport = () => {
    const data = JSON.stringify(events, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stream-events-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setEvents([]);
    if (streamService?.clearEventLog) {
      streamService.clearEventLog();
    }
  };

  const getEventColor = (kind: string): string => {
    const colors: Record<string, string> = {
      stream_start: '#10b981',
      delta: '#3b82f6',
      phase: '#8b5cf6',
      tool: '#f59e0b',
      stream_end: '#ef4444',
      error: '#dc2626',
      files_updated: '#06b6d4',
      status: '#6b7280',
      response: '#10b981'
    };
    return colors[kind] || '#9ca3af';
  };

  const calculateMetrics = () => {
    if (events.length === 0) {
      return {
        totalEvents: 0,
        charsPerSecond: 0,
        averageEventGap: 0,
        eventsByKind: {}
      };
    }

    const eventsByKind: Record<string, number> = {};
    let totalChars = 0;
    let totalGap = 0;
    let prevTimestamp = 0;

    for (const entry of events) {
      const kind = entry.event.kind;
      eventsByKind[kind] = (eventsByKind[kind] || 0) + 1;

      if (entry.event.kind === 'delta' && 'text' in entry.event) {
        totalChars += entry.event.text.length;
      }

      if (prevTimestamp > 0) {
        totalGap += entry.timestamp - prevTimestamp;
      }
      prevTimestamp = entry.timestamp;
    }

    const firstTimestamp = events[0].timestamp;
    const lastTimestamp = events[events.length - 1].timestamp;
    const durationSeconds = (lastTimestamp - firstTimestamp) / 1000;
    const charsPerSecond = durationSeconds > 0 ? totalChars / durationSeconds : 0;
    const averageEventGap = events.length > 1 ? totalGap / (events.length - 1) : 0;

    return {
      totalEvents: events.length,
      charsPerSecond: Math.round(charsPerSecond),
      averageEventGap: Math.round(averageEventGap),
      eventsByKind
    };
  };

  const metrics = calculateMetrics();

  return (
    <div className="dev-overlay">
      <div className="dev-overlay-header">
        <div className="dev-overlay-tabs">
          <button
            className={activeTab === 'events' ? 'active' : ''}
            onClick={() => setActiveTab('events')}
          >
            Events ({events.length})
          </button>
          <button
            className={activeTab === 'metrics' ? 'active' : ''}
            onClick={() => setActiveTab('metrics')}
          >
            Metrics
          </button>
        </div>
        <div className="dev-overlay-controls">
          <label>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
          <button onClick={handleClear}>Clear</button>
          <button onClick={handleExport}>Export</button>
          <button onClick={() => setVisible(false)}>✕</button>
        </div>
      </div>

      <div className="dev-overlay-content">
        {activeTab === 'events' ? (
          <div className="dev-overlay-events">
            {events.map((entry, i) => {
              const relativeTime = i > 0
                ? `+${entry.timestamp - events[i - 1].timestamp}ms`
                : '0ms';

              return (
                <div key={i} className="dev-event-entry">
                  <span className="dev-event-time">{relativeTime}</span>
                  <span
                    className="dev-event-kind"
                    style={{ color: getEventColor(entry.event.kind) }}
                  >
                    {entry.event.kind}
                  </span>
                  <span className="dev-event-data">
                    {JSON.stringify(entry.event, null, 0)}
                  </span>
                </div>
              );
            })}
            <div ref={eventsEndRef} />
          </div>
        ) : (
          <div className="dev-overlay-metrics">
            <div className="metric-card">
              <div className="metric-label">Total Events</div>
              <div className="metric-value">{metrics.totalEvents}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Chars/Second</div>
              <div className="metric-value">{metrics.charsPerSecond}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Avg Event Gap</div>
              <div className="metric-value">{metrics.averageEventGap}ms</div>
            </div>
            <div className="metric-card full-width">
              <div className="metric-label">Events by Kind</div>
              <div className="metric-breakdown">
                {Object.entries(metrics.eventsByKind).map(([kind, count]) => (
                  <div key={kind} className="metric-breakdown-item">
                    <span
                      className="metric-breakdown-color"
                      style={{ background: getEventColor(kind) }}
                    />
                    <span className="metric-breakdown-label">{kind}</span>
                    <span className="metric-breakdown-value">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="dev-overlay-footer">
        Press <kbd>Cmd/Ctrl + `</kbd> to toggle
      </div>
    </div>
  );
}
