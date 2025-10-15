/**
 * Structured Logging Package
 * Provides JSON/pretty logging with correlation IDs and context
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  scope?: string;
  [key: string]: unknown;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerOptions {
  format?: 'json' | 'pretty';
  minLevel?: LogLevel;
  context?: LogContext;
}

export interface Logger {
  trace: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, error?: Error, context?: LogContext) => void;
  child: (childContext: LogContext) => Logger;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m', // Gray
  debug: '\x1b[36m', // Cyan
  info: '\x1b[34m', // Blue
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

/**
 * Create a structured logger
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const format = options.format || (process.env.LOG_FORMAT as 'json' | 'pretty') || 'pretty';
  const minLevel = options.minLevel || (process.env.LOG_LEVEL as LogLevel) || 'info';
  const baseContext = options.context || {};

  const log = (level: LogLevel, message: string, error?: Error, context?: LogContext) => {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLevel]) {
      return;
    }

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...baseContext, ...context },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    if (format === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      const color = LOG_LEVEL_COLORS[level];
      const levelStr = `[${level.toUpperCase()}]`.padEnd(7);
      const scopeStr = entry.context?.scope ? `[${entry.context.scope}]` : '';
      const corrIdStr = entry.context?.correlationId ? `[${entry.context.correlationId}]` : '';

      let output = `${color}${levelStr}${RESET_COLOR} ${scopeStr}${corrIdStr} ${message}`;

      // Include additional context keys (excluding scope and correlationId)
      const contextKeys = Object.keys(entry.context || {}).filter((k) => k !== 'scope' && k !== 'correlationId');
      if (contextKeys.length > 0) {
        const contextStr = contextKeys.map((k) => `${k}=${entry.context?.[k]}`).join(' ');
        output += ` ${contextStr}`;
      }

      if (error) {
        output += `\n  Error: ${error.message}`;
        if (error.stack) {
          output += `\n${error.stack.split('\n').slice(1).join('\n')}`;
        }
      }

      console.log(output);
    }
  };

  const logger: Logger = {
    trace: (message, context) => log('trace', message, undefined, context),
    debug: (message, context) => log('debug', message, undefined, context),
    info: (message, context) => log('info', message, undefined, context),
    warn: (message, context) => log('warn', message, undefined, context),
    error: (message, error, context) => log('error', message, error, context),
    child: (childContext) =>
      createLogger({
        ...options,
        context: { ...baseContext, ...childContext },
      }),
  };

  return logger;
}

/**
 * Create a scoped logger (convenience function)
 */
export function createScopedLogger(scope: string, options: Omit<LoggerOptions, 'context'> = {}): Logger {
  return createLogger({
    ...options,
    context: { scope },
  });
}

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
