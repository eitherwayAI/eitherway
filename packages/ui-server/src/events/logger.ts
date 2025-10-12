import type { StreamEvent } from './types.js';

/**
 * Stream event logger for observability and debugging
 */

interface EventLogEntry {
  direction: 'inbound' | 'outbound';
  event: StreamEvent;
  timestamp: number;
}

// In-memory event log (last 100 events)
const eventLog: EventLogEntry[] = [];
const MAX_LOG_SIZE = 100;

/**
 * Log a stream event
 */
export function logStreamEvent(direction: 'inbound' | 'outbound', event: StreamEvent): void {
  const entry: EventLogEntry = {
    direction,
    event,
    timestamp: Date.now(),
  };

  eventLog.push(entry);

  // Keep log bounded
  if (eventLog.length > MAX_LOG_SIZE) {
    eventLog.shift();
  }

  // Console log in development (with color coding)
  if (process.env.NODE_ENV !== 'production') {
    const arrow = direction === 'outbound' ? '→' : '←';
    const color = direction === 'outbound' ? '\x1b[32m' : '\x1b[34m'; // green or blue
    const reset = '\x1b[0m';

    console.log(`${color}[Stream ${arrow}]${reset} ${event.kind}`, {
      ...event,
      ts: undefined, // Hide timestamp in console for brevity
    });
  }
}

/**
 * Get recent event log entries
 */
export function getEventLog(limit?: number): EventLogEntry[] {
  const entries = limit ? eventLog.slice(-limit) : [...eventLog];
  return entries;
}

/**
 * Clear event log
 */
export function clearEventLog(): void {
  eventLog.length = 0;
}

/**
 * Get event statistics
 */
export function getEventStats() {
  const stats = {
    total: eventLog.length,
    byKind: {} as Record<string, number>,
    byDirection: {
      inbound: 0,
      outbound: 0,
    },
    avgEventGap: 0,
  };

  let totalGap = 0;
  let prevTimestamp = 0;

  for (const entry of eventLog) {
    // Count by kind
    stats.byKind[entry.event.kind] = (stats.byKind[entry.event.kind] || 0) + 1;

    // Count by direction
    stats.byDirection[entry.direction]++;

    // Calculate gaps
    if (prevTimestamp > 0) {
      totalGap += entry.timestamp - prevTimestamp;
    }
    prevTimestamp = entry.timestamp;
  }

  if (eventLog.length > 1) {
    stats.avgEventGap = totalGap / (eventLog.length - 1);
  }

  return stats;
}

/**
 * Export event log as JSON (for debugging/replay)
 */
export function exportEventLog(): string {
  return JSON.stringify(eventLog, null, 2);
}
