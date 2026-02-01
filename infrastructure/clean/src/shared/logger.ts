/**
 * Centralized logging utility for Trinity Lambda functions
 * Provides structured logging with CloudWatch integration
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  roomId?: string;
  functionName?: string;
  operation?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  metadata?: Record<string, any>;
}

class TrinityLogger {
  private logLevel: LogLevel;
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.logLevel = this.getLogLevelFromEnv();
    this.context = {
      functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
      ...context,
    };
  }

  private getLogLevelFromEnv(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    switch (level) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
    metadata?: Record<string, any>
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      context: { ...this.context, ...context },
      metadata,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(level, message, context, error, metadata);
    
    // Use appropriate console method based on level
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(JSON.stringify(entry));
        break;
      case LogLevel.INFO:
        console.info(JSON.stringify(entry));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(entry));
        break;
      case LogLevel.ERROR:
        console.error(JSON.stringify(entry));
        break;
    }
  }

  debug(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context, undefined, metadata);
  }

  info(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context, undefined, metadata);
  }

  warn(message: string, context?: LogContext, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context, undefined, metadata);
  }

  error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error, metadata);
  }

  // Business metrics logging
  logBusinessMetric(
    metricName: string,
    value: number,
    unit: string = 'Count',
    context?: LogContext,
    metadata?: Record<string, any>
  ): void {
    this.info(`📊 Business Metric: ${metricName}`, context, {
      metric: {
        name: metricName,
        value,
        unit,
      },
      ...metadata,
    });
  }

  // Performance timing
  logPerformance(
    operation: string,
    duration: number,
    success: boolean,
    context?: LogContext,
    metadata?: Record<string, any>
  ): void {
    const status = success ? 'SUCCESS' : 'FAILED';
    this.info(`⏱️ ${operation}: ${duration}ms (${status})`, context, {
      performance: {
        operation,
        duration,
        success,
      },
      ...metadata,
    });
  }

  // Create child logger with additional context
  child(additionalContext: LogContext): TrinityLogger {
    return new TrinityLogger({ ...this.context, ...additionalContext });
  }

  // Update context for current logger
  updateContext(additionalContext: LogContext): void {
    this.context = { ...this.context, ...additionalContext };
  }
}

// Performance timer utility
export class PerformanceTimer {
  private startTime: number;
  private logger: TrinityLogger;
  private operation: string;

  constructor(operation: string, logger: TrinityLogger) {
    this.operation = operation;
    this.logger = logger;
    this.startTime = Date.now();
    
    this.logger.debug(`🚀 Starting ${operation}`);
  }

  finish(success: boolean = true, errorType?: string, metadata?: Record<string, any>): void {
    const duration = Date.now() - this.startTime;
    
    this.logger.logPerformance(this.operation, duration, success, undefined, {
      errorType,
      ...metadata,
    });
  }

  finishWithError(error: Error, metadata?: Record<string, any>): void {
    const duration = Date.now() - this.startTime;
    
    this.logger.error(`❌ ${this.operation} failed after ${duration}ms`, error, undefined, metadata);
    this.finish(false, error.name, metadata);
  }
}

// Default logger instance
export const logger = new TrinityLogger();

// Factory function for creating loggers with context
export function createLogger(context: LogContext): TrinityLogger {
  return new TrinityLogger(context);
}

// Utility functions for common logging patterns
export const LogUtils = {
  // Log Lambda function start
  logFunctionStart: (functionName: string, event: any, context?: LogContext) => {
    logger.info(`🏠 ${functionName} Handler Started`, context, {
      event: JSON.stringify(event, null, 2),
    });
  },

  // Log Lambda function end
  logFunctionEnd: (functionName: string, result: any, context?: LogContext) => {
    logger.info(`✅ ${functionName} Handler Completed`, context, {
      result: typeof result === 'object' ? JSON.stringify(result, null, 2) : result,
    });
  },

  // Log GraphQL operation
  logGraphQLOperation: (fieldName: string, args: any, userId?: string) => {
    logger.info(`🔍 GraphQL Operation: ${fieldName}`, { userId, operation: fieldName }, {
      arguments: JSON.stringify(args, null, 2),
    });
  },

  // Log database operation
  logDatabaseOperation: (operation: string, tableName: string, key: any, context?: LogContext) => {
    logger.debug(`🗄️ DynamoDB ${operation}`, { ...context, tableName }, {
      key: JSON.stringify(key),
    });
  },

  // Log external API call
  logExternalAPICall: (service: string, endpoint: string, method: string, context?: LogContext) => {
    logger.debug(`🌐 External API Call: ${service}`, context, {
      endpoint,
      method,
    });
  },

  // Log cache operation
  logCacheOperation: (operation: string, cacheKey: string, hit: boolean, context?: LogContext) => {
    const status = hit ? 'HIT' : 'MISS';
    logger.debug(`💾 Cache ${operation}: ${status}`, context, {
      cacheKey,
      hit,
    });
  },
};