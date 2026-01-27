"use strict";
/**
 * CloudWatch Metrics and Monitoring Utilities
 * Provides structured logging and metrics for production monitoring
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceTimer = void 0;
exports.logMetric = logMetric;
exports.logPerformance = logPerformance;
exports.logCircuitBreakerMetric = logCircuitBreakerMetric;
exports.logBusinessMetric = logBusinessMetric;
exports.logError = logError;
exports.logCacheMetric = logCacheMetric;
/**
 * Log structured metrics for CloudWatch
 */
function logMetric(metric) {
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
function logPerformance(perf) {
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
function logCircuitBreakerMetric(service, state, failureCount, successCount) {
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
function logBusinessMetric(eventType, roomId, userId, metadata) {
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
function logError(operation, error, context) {
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
class PerformanceTimer {
    constructor(operation) {
        this.operation = operation;
        this.startTime = Date.now();
    }
    finish(success = true, errorType, metadata) {
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
exports.PerformanceTimer = PerformanceTimer;
/**
 * Cache hit/miss metrics
 */
function logCacheMetric(cacheType, hit, key) {
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
