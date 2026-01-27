/**
 * CloudWatch Metrics and Monitoring Utilities
 * Provides structured logging and metrics for production monitoring
 */

export interface MetricData {
  metricName: string;
  value: number;
  unit: 'Count' | 'Seconds' | 'Milliseconds' | 'Percent' | 'Bytes';
  dimensions?: { [key: string]: string };
  timestamp?: Date;
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  errorType?: string;
  metadata?: { [key: string]: any };
}

/**
 * Log structured metrics for CloudWatch
 */
export function logMetric(metric: MetricData): void {
  const logEntry = {
    timestamp: metric.timestamp?.toISOString() || new Date().toISOString(),
    metricType: 'CUSTOM_METRIC',
    metricName: metric.metricName,
    value: metric.value,
    unit: metric.unit,
    dimensions: metric.dimensions || {},
  };

  console.log(`📊 METRIC: ${JSON.stringify(logEntry)}`);
}

/**
 * Log performance metrics
 */
export function logPerformance(perf: PerformanceMetric): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    metricType: 'PERFORMANCE',
    operation: perf.operation,
    duration: perf.duration,
    success: perf.success,
    errorType: perf.errorType,
    metadata: perf.metadata || {},
  };

  console.log(`⚡ PERFORMANCE: ${JSON.stringify(logEntry)}`);

  // Also log as CloudWatch metric
  logMetric({
    metricName: `${perf.operation}_Duration`,
    value: perf.duration,
    unit: 'Milliseconds',
    dimensions: {
      Operation: perf.operation,
      Success: perf.success.toString(),
      ErrorType: perf.errorType || 'None'
    }
  });
}

/**
 * Circuit Breaker metrics
 */
export function logCircuitBreakerMetric(
  service: string,
  state: string,
  failureCount: number,
  successCount: number
): void {
  logMetric({
    metricName: 'CircuitBreaker_State',
    value: state === 'OPEN' ? 1 : 0,
    unit: 'Count',
    dimensions: {
      Service: service,
      State: state
    }
  });

  logMetric({
    metricName: 'CircuitBreaker_FailureCount',
    value: failureCount,
    unit: 'Count',
    dimensions: {
      Service: service
    }
  });

  logMetric({
    metricName: 'CircuitBreaker_SuccessCount',
    value: successCount,
    unit: 'Count',
    dimensions: {
      Service: service
    }
  });
}

/**
 * Business metrics for Trinity
 */
export function logBusinessMetric(
  eventType: 'ROOM_CREATED' | 'ROOM_JOINED' | 'ROOM_JOINED_BY_INVITE' | 'VOTE_CAST' | 'MATCH_FOUND' | 'AI_RECOMMENDATION' | 'MOVIES_CACHED' | 'INVITE_LINK_CREATED' | 'WEB_INVITE_VALIDATED' | 'USER_DISCONNECTED' | 'ROOM_STATE_SYNCED' | 'CONNECTION_CLEANED_UP' | 'CONNECTION_HANDLED' | 'DISCONNECTION_HANDLED' | 'STATE_SYNC_REQUESTED' | 'CONNECTION_STATUS_CHECKED',
  roomId?: string,
  userId?: string,
  metadata?: { [key: string]: any }
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    metricType: 'BUSINESS_EVENT',
    eventType,
    roomId: roomId || 'unknown',
    userId: userId || 'unknown',
    metadata: metadata || {},
  };

  console.log(`💼 BUSINESS: ${JSON.stringify(logEntry)}`);

  // Log as CloudWatch metric
  logMetric({
    metricName: `Business_${eventType}`,
    value: 1,
    unit: 'Count',
    dimensions: {
      EventType: eventType,
      Stage: process.env.STAGE || 'dev'
    }
  });
}

/**
 * Error tracking
 */
export function logError(
  operation: string,
  error: Error,
  context?: { [key: string]: any }
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    metricType: 'ERROR',
    operation,
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    context: context || {},
  };

  console.error(`❌ ERROR: ${JSON.stringify(logEntry)}`);

  // Log as CloudWatch metric
  logMetric({
    metricName: 'Errors',
    value: 1,
    unit: 'Count',
    dimensions: {
      Operation: operation,
      ErrorType: error.name,
      Stage: process.env.STAGE || 'dev'
    }
  });
}

/**
 * Performance timer utility
 */
export class PerformanceTimer {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
  }

  finish(success: boolean = true, errorType?: string, metadata?: { [key: string]: any }): void {
    const duration = Date.now() - this.startTime;
    
    logPerformance({
      operation: this.operation,
      duration,
      success,
      errorType,
      metadata
    });
  }
}

/**
 * Cache hit/miss metrics
 */
export function logCacheMetric(
  cacheType: 'MOVIES' | 'USER_PROFILE' | 'ROOM_DATA',
  hit: boolean,
  key?: string
): void {
  logMetric({
    metricName: `Cache_${hit ? 'Hit' : 'Miss'}`,
    value: 1,
    unit: 'Count',
    dimensions: {
      CacheType: cacheType,
      Result: hit ? 'Hit' : 'Miss'
    }
  });

  if (key) {
    console.log(`💾 CACHE_${hit ? 'HIT' : 'MISS'}: ${cacheType} - ${key}`);
  }
}