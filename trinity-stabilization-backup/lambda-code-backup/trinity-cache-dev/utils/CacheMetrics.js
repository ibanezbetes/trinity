const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

/**
 * Comprehensive metrics and monitoring for cache operations
 * Provides CloudWatch integration and performance tracking
 */
class CacheMetrics {
  constructor() {
    this.cloudWatch = new CloudWatchClient({ region: process.env.AWS_REGION });
    this.namespace = 'Trinity/MovieCache';
    this.defaultDimensions = [
      {
        Name: 'Environment',
        Value: process.env.STAGE || 'dev'
      }
    ];
  }

  /**
   * Records cache operation metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Operation duration in ms
   * @param {boolean} success - Whether operation succeeded
   * @param {Object} metadata - Additional metadata
   */
  async recordCacheOperation(operation, duration, success, metadata = {}) {
    const metrics = [
      {
        MetricName: 'CacheOperationDuration',
        Value: duration,
        Unit: 'Milliseconds',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Operation',
            Value: operation
          }
        ]
      },
      {
        MetricName: 'CacheOperationCount',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Operation',
            Value: operation
          },
          {
            Name: 'Status',
            Value: success ? 'Success' : 'Failure'
          }
        ]
      }
    ];

    // Add batch size metric if available
    if (metadata.batchSize) {
      metrics.push({
        MetricName: 'BatchSize',
        Value: metadata.batchSize,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Operation',
            Value: operation
          }
        ]
      });
    }

    // Add cache hit rate if available
    if (metadata.cacheHit !== undefined) {
      metrics.push({
        MetricName: 'CacheHitRate',
        Value: metadata.cacheHit ? 1 : 0,
        Unit: 'Count',
        Dimensions: this.defaultDimensions
      });
    }

    await this.publishMetrics(metrics);
  }

  /**
   * Records TMDB API metrics
   * @param {string} endpoint - API endpoint
   * @param {number} duration - Request duration in ms
   * @param {boolean} success - Whether request succeeded
   * @param {Object} metadata - Additional metadata
   */
  async recordTMDBApiMetrics(endpoint, duration, success, metadata = {}) {
    const metrics = [
      {
        MetricName: 'TMDBApiDuration',
        Value: duration,
        Unit: 'Milliseconds',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Endpoint',
            Value: endpoint
          }
        ]
      },
      {
        MetricName: 'TMDBApiRequestCount',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Endpoint',
            Value: endpoint
          },
          {
            Name: 'Status',
            Value: success ? 'Success' : 'Failure'
          }
        ]
      }
    ];

    // Add rate limit metrics if available
    if (metadata.rateLimited) {
      metrics.push({
        MetricName: 'TMDBApiRateLimit',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Endpoint',
            Value: endpoint
          }
        ]
      });
    }

    await this.publishMetrics(metrics);
  }

  /**
   * Records circuit breaker metrics
   * @param {string} state - Circuit breaker state (open, closed, half-open)
   * @param {number} failureCount - Current failure count
   */
  async recordCircuitBreakerMetrics(state, failureCount) {
    const metrics = [
      {
        MetricName: 'CircuitBreakerState',
        Value: this.getStateValue(state),
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'State',
            Value: state
          }
        ]
      },
      {
        MetricName: 'CircuitBreakerFailureCount',
        Value: failureCount,
        Unit: 'Count',
        Dimensions: this.defaultDimensions
      }
    ];

    await this.publishMetrics(metrics);
  }

  /**
   * Records cache performance metrics
   * @param {string} roomId - Room identifier
   * @param {Object} performance - Performance data
   */
  async recordCachePerformance(roomId, performance) {
    const metrics = [
      {
        MetricName: 'CacheResponseTime',
        Value: performance.responseTime,
        Unit: 'Milliseconds',
        Dimensions: this.defaultDimensions
      },
      {
        MetricName: 'CacheSize',
        Value: performance.cacheSize,
        Unit: 'Count',
        Dimensions: this.defaultDimensions
      }
    ];

    if (performance.sequenceConsistency !== undefined) {
      metrics.push({
        MetricName: 'SequenceConsistency',
        Value: performance.sequenceConsistency ? 1 : 0,
        Unit: 'Count',
        Dimensions: this.defaultDimensions
      });
    }

    await this.publishMetrics(metrics);
  }

  /**
   * Records cleanup operation metrics
   * @param {string} reason - Cleanup reason (MATCHED, INACTIVE, TTL)
   * @param {number} itemsDeleted - Number of items deleted
   * @param {boolean} success - Whether cleanup succeeded
   */
  async recordCleanupMetrics(reason, itemsDeleted, success) {
    const metrics = [
      {
        MetricName: 'CleanupOperationCount',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Reason',
            Value: reason
          },
          {
            Name: 'Status',
            Value: success ? 'Success' : 'Failure'
          }
        ]
      },
      {
        MetricName: 'CleanupItemsDeleted',
        Value: itemsDeleted,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Reason',
            Value: reason
          }
        ]
      }
    ];

    await this.publishMetrics(metrics);
  }

  /**
   * Records error metrics with categorization
   * @param {string} operation - Operation that failed
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   */
  async recordError(operation, error, context = {}) {
    const errorType = this.categorizeError(error);
    
    const metrics = [
      {
        MetricName: 'ErrorCount',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'Operation',
            Value: operation
          },
          {
            Name: 'ErrorType',
            Value: errorType
          }
        ]
      }
    ];

    await this.publishMetrics(metrics);

    // Log detailed error information
    console.error(`🚨 Cache Error [${operation}]:`, {
      errorType,
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Records fallback usage metrics
   * @param {string} fallbackType - Type of fallback used
   * @param {string} reason - Reason for fallback
   */
  async recordFallbackUsage(fallbackType, reason) {
    const metrics = [
      {
        MetricName: 'FallbackUsage',
        Value: 1,
        Unit: 'Count',
        Dimensions: [
          ...this.defaultDimensions,
          {
            Name: 'FallbackType',
            Value: fallbackType
          },
          {
            Name: 'Reason',
            Value: reason
          }
        ]
      }
    ];

    await this.publishMetrics(metrics);
  }

  /**
   * Publishes metrics to CloudWatch
   * @param {Array} metrics - Array of metric data
   */
  async publishMetrics(metrics) {
    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: metrics
      });

      await this.cloudWatch.send(command);
    } catch (error) {
      // Don't let metrics failures break the main operation
      console.warn('⚠️ Failed to publish metrics:', error.message);
    }
  }

  /**
   * Converts circuit breaker state to numeric value
   * @param {string} state - Circuit breaker state
   * @returns {number} Numeric representation
   */
  getStateValue(state) {
    const stateMap = {
      'closed': 0,
      'half-open': 1,
      'open': 2
    };
    return stateMap[state] || -1;
  }

  /**
   * Categorizes errors for better monitoring
   * @param {Error} error - Error to categorize
   * @returns {string} Error category
   */
  categorizeError(error) {
    if (error.name === 'TimeoutError') return 'Timeout';
    if (error.name === 'NetworkError') return 'Network';
    if (error.name === 'ServiceException') return 'Service';
    if (error.name === 'ValidationException') return 'Validation';
    if (error.name === 'ResourceNotFoundException') return 'NotFound';
    if (error.name === 'ThrottlingException') return 'Throttling';
    if (error.message.includes('DynamoDB')) return 'Database';
    if (error.message.includes('TMDB')) return 'ExternalAPI';
    if (error.message.includes('Circuit breaker')) return 'CircuitBreaker';
    return 'Unknown';
  }

  /**
   * Creates a performance timer for operations
   * @param {string} operation - Operation name
   * @returns {Object} Timer object with finish method
   */
  createTimer(operation) {
    const startTime = Date.now();
    
    return {
      finish: async (success = true, metadata = {}) => {
        const duration = Date.now() - startTime;
        await this.recordCacheOperation(operation, duration, success, metadata);
        return duration;
      }
    };
  }

  /**
   * Logs cache operation with structured format
   * @param {string} level - Log level (info, warn, error)
   * @param {string} operation - Operation name
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   */
  log(level, operation, message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      operation,
      message,
      ...data
    };

    const logMessage = `🎬 [${logEntry.level}] ${logEntry.operation}: ${logEntry.message}`;
    
    switch (level) {
      case 'error':
        console.error(logMessage, logEntry);
        break;
      case 'warn':
        console.warn(logMessage, logEntry);
        break;
      default:
        console.log(logMessage, logEntry);
    }
  }
}

module.exports = CacheMetrics;