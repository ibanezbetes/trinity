/**
 * Monitoring and metrics system for Trinity Lambda functions
 * Provides CloudWatch metrics, alarms, and performance tracking
 */

import { logger } from './logger';
import { ErrorCategory } from './error-handler';

export interface MetricData {
  name: string;
  value: number;
  unit: string;
  dimensions?: Record<string, string>;
  timestamp?: Date;
}

export interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  errorType?: string;
  userId?: string;
  roomId?: string;
}

export interface BusinessMetric {
  name: string;
  value: number;
  dimensions?: Record<string, string>;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private functionName: string;
  private environment: string;

  private constructor() {
    this.functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown';
    this.environment = process.env.TRINITY_ENV || 'dev';
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Record performance metric
   */
  recordPerformance(metric: PerformanceMetric): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      Operation: metric.operation,
      Success: metric.success.toString(),
    };

    if (metric.errorType) {
      (dimensions as any)['ErrorType'] = metric.errorType;
    }

    // Record duration
    this.putMetric({
      name: 'OperationDuration',
      value: metric.duration,
      unit: 'Milliseconds',
      dimensions,
    });

    // Record success/failure count
    this.putMetric({
      name: 'OperationCount',
      value: 1,
      unit: 'Count',
      dimensions,
    });

    // Log performance for debugging
    logger.logPerformance(
      metric.operation,
      metric.duration,
      metric.success,
      {
        userId: metric.userId,
        roomId: metric.roomId,
      }
    );
  }

  /**
   * Record business metric
   */
  recordBusinessMetric(metric: BusinessMetric): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      ...metric.dimensions,
    };

    this.putMetric({
      name: metric.name,
      value: metric.value,
      unit: 'Count',
      dimensions,
    });

    logger.logBusinessMetric(
      metric.name,
      metric.value,
      'Count',
      undefined,
      { dimensions }
    );
  }

  /**
   * Record error metric
   */
  recordError(category: ErrorCategory, operation?: string, details?: any): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      ErrorCategory: category,
    };

    if (operation) {
      (dimensions as any)['Operation'] = operation;
    }

    this.putMetric({
      name: 'ErrorCount',
      value: 1,
      unit: 'Count',
      dimensions,
    });

    // Record specific error type metrics
    this.putMetric({
      name: `Error${category}`,
      value: 1,
      unit: 'Count',
      dimensions: {
        FunctionName: this.functionName,
        Environment: this.environment,
      },
    });
  }

  /**
   * Record cache metrics
   */
  recordCacheMetric(operation: 'hit' | 'miss' | 'create' | 'invalidate', cacheType: string): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      CacheType: cacheType,
      Operation: operation,
    };

    this.putMetric({
      name: 'CacheOperation',
      value: 1,
      unit: 'Count',
      dimensions,
    });

    // Record cache hit ratio for hits and misses
    if (operation === 'hit' || operation === 'miss') {
      this.putMetric({
        name: 'CacheHitRatio',
        value: operation === 'hit' ? 1 : 0,
        unit: 'Percent',
        dimensions: {
          FunctionName: this.functionName,
          Environment: this.environment,
          CacheType: cacheType,
        },
      });
    }
  }

  /**
   * Record database operation metrics
   */
  recordDatabaseMetric(
    operation: 'get' | 'put' | 'update' | 'delete' | 'query' | 'scan' | 'batch',
    tableName: string,
    duration: number,
    success: boolean,
    itemCount?: number
  ): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      TableName: tableName,
      Operation: operation,
      Success: success.toString(),
    };

    // Record operation duration
    this.putMetric({
      name: 'DatabaseOperationDuration',
      value: duration,
      unit: 'Milliseconds',
      dimensions,
    });

    // Record operation count
    this.putMetric({
      name: 'DatabaseOperationCount',
      value: 1,
      unit: 'Count',
      dimensions,
    });

    // Record item count for operations that return items
    if (itemCount !== undefined) {
      this.putMetric({
        name: 'DatabaseItemCount',
        value: itemCount,
        unit: 'Count',
        dimensions,
      });
    }
  }

  /**
   * Record external API metrics
   */
  recordExternalApiMetric(
    service: string,
    operation: string,
    duration: number,
    success: boolean,
    statusCode?: number
  ): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      Service: service,
      Operation: operation,
      Success: success.toString(),
    };

    if (statusCode) {
      (dimensions as any)['StatusCode'] = statusCode.toString();
    }

    // Record API call duration
    this.putMetric({
      name: 'ExternalApiDuration',
      value: duration,
      unit: 'Milliseconds',
      dimensions,
    });

    // Record API call count
    this.putMetric({
      name: 'ExternalApiCount',
      value: 1,
      unit: 'Count',
      dimensions,
    });
  }

  /**
   * Record room activity metrics
   */
  recordRoomActivity(
    activity: 'created' | 'joined' | 'left' | 'matched' | 'no_consensus',
    roomCapacity?: number,
    memberCount?: number
  ): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      Activity: activity,
    };

    if (roomCapacity) {
      (dimensions as any)['RoomCapacity'] = roomCapacity.toString();
    }

    this.putMetric({
      name: 'RoomActivity',
      value: 1,
      unit: 'Count',
      dimensions,
    });

    // Record member count for relevant activities
    if (memberCount !== undefined && (activity === 'joined' || activity === 'left')) {
      this.putMetric({
        name: 'RoomMemberCount',
        value: memberCount,
        unit: 'Count',
        dimensions: {
          FunctionName: this.functionName,
          Environment: this.environment,
        },
      });
    }
  }

  /**
   * Record voting metrics
   */
  recordVoteActivity(
    voteType: 'LIKE' | 'DISLIKE',
    roomCapacity: number,
    currentVotes?: number,
    isMatch?: boolean
  ): void {
    const dimensions = {
      FunctionName: this.functionName,
      Environment: this.environment,
      VoteType: voteType,
      RoomCapacity: roomCapacity.toString(),
    };

    this.putMetric({
      name: 'VoteActivity',
      value: 1,
      unit: 'Count',
      dimensions,
    });

    // Record match detection
    if (isMatch !== undefined) {
      this.putMetric({
        name: 'MatchDetection',
        value: isMatch ? 1 : 0,
        unit: 'Count',
        dimensions: {
          FunctionName: this.functionName,
          Environment: this.environment,
          RoomCapacity: roomCapacity.toString(),
        },
      });
    }

    // Record vote progress
    if (currentVotes !== undefined) {
      this.putMetric({
        name: 'VoteProgress',
        value: (currentVotes / roomCapacity) * 100,
        unit: 'Percent',
        dimensions: {
          FunctionName: this.functionName,
          Environment: this.environment,
          RoomCapacity: roomCapacity.toString(),
        },
      });
    }
  }

  /**
   * Put metric to CloudWatch (in production) or log (in development)
   */
  private putMetric(metric: MetricData): void {
    // In development, just log the metric
    if (this.environment !== 'production') {
      logger.debug('📊 Metric recorded', undefined, {
        metric: {
          name: metric.name,
          value: metric.value,
          unit: metric.unit,
          dimensions: metric.dimensions,
        },
      });
      return;
    }

    // In production, this would send to CloudWatch
    // For now, we'll log it with a special format that can be picked up by CloudWatch Logs
    const metricLog = {
      timestamp: (metric.timestamp || new Date()).toISOString(),
      metricName: metric.name,
      value: metric.value,
      unit: metric.unit,
      dimensions: metric.dimensions,
    };

    // Use a special log format that CloudWatch can parse
    console.log(`MONITORING_METRIC: ${JSON.stringify(metricLog)}`);
  }
}

/**
 * Decorator for automatic performance monitoring
 */
export function monitor(operation?: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    const operationName = operation || propertyName;
    
    descriptor.value = async function (...args: any[]) {
      const monitoring = MonitoringService.getInstance();
      const startTime = Date.now();
      let success = false;
      let errorType: string | undefined;
      
      try {
        const result = await method.apply(this, args);
        success = true;
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errorType = err.constructor.name;
        throw error;
      } finally {
        const duration = Date.now() - startTime;
        
        monitoring.recordPerformance({
          operation: operationName,
          duration,
          success,
          errorType,
        });
      }
    };
    
    return descriptor;
  };
}

/**
 * Performance timer with automatic metric recording
 */
export class MetricTimer {
  private startTime: number;
  private operation: string;
  private monitoring: MonitoringService;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
    this.monitoring = MonitoringService.getInstance();
  }

  finish(success: boolean = true, errorType?: string): void {
    const duration = Date.now() - this.startTime;
    
    this.monitoring.recordPerformance({
      operation: this.operation,
      duration,
      success,
      errorType,
    });
  }
}

// Export singleton instance
export const monitoring = MonitoringService.getInstance();