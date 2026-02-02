"use strict";
/**
 * Monitoring and metrics system for Trinity Lambda functions
 * Provides CloudWatch metrics, alarms, and performance tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoring = exports.MetricTimer = exports.MonitoringService = void 0;
exports.monitor = monitor;
const logger_1 = require("./logger");
class MonitoringService {
    constructor() {
        this.functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown';
        this.environment = process.env.TRINITY_ENV || 'dev';
    }
    static getInstance() {
        if (!MonitoringService.instance) {
            MonitoringService.instance = new MonitoringService();
        }
        return MonitoringService.instance;
    }
    /**
     * Record performance metric
     */
    recordPerformance(metric) {
        const dimensions = {
            FunctionName: this.functionName,
            Environment: this.environment,
            Operation: metric.operation,
            Success: metric.success.toString(),
        };
        if (metric.errorType) {
            dimensions['ErrorType'] = metric.errorType;
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
        logger_1.logger.logPerformance(metric.operation, metric.duration, metric.success, {
            userId: metric.userId,
            roomId: metric.roomId,
        });
    }
    /**
     * Record business metric
     */
    recordBusinessMetric(metric) {
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
        logger_1.logger.logBusinessMetric(metric.name, metric.value, 'Count', undefined, { dimensions });
    }
    /**
     * Record error metric
     */
    recordError(category, operation, details) {
        const dimensions = {
            FunctionName: this.functionName,
            Environment: this.environment,
            ErrorCategory: category,
        };
        if (operation) {
            dimensions['Operation'] = operation;
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
    recordCacheMetric(operation, cacheType) {
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
    recordDatabaseMetric(operation, tableName, duration, success, itemCount) {
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
    recordExternalApiMetric(service, operation, duration, success, statusCode) {
        const dimensions = {
            FunctionName: this.functionName,
            Environment: this.environment,
            Service: service,
            Operation: operation,
            Success: success.toString(),
        };
        if (statusCode) {
            dimensions['StatusCode'] = statusCode.toString();
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
    recordRoomActivity(activity, roomCapacity, memberCount) {
        const dimensions = {
            FunctionName: this.functionName,
            Environment: this.environment,
            Activity: activity,
        };
        if (roomCapacity) {
            dimensions['RoomCapacity'] = roomCapacity.toString();
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
    recordVoteActivity(voteType, roomCapacity, currentVotes, isMatch) {
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
    putMetric(metric) {
        // In development, just log the metric
        if (this.environment !== 'production') {
            logger_1.logger.debug('📊 Metric recorded', undefined, {
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
exports.MonitoringService = MonitoringService;
/**
 * Decorator for automatic performance monitoring
 */
function monitor(operation) {
    return function (target, propertyName, descriptor) {
        const method = descriptor.value;
        const operationName = operation || propertyName;
        descriptor.value = async function (...args) {
            const monitoring = MonitoringService.getInstance();
            const startTime = Date.now();
            let success = false;
            let errorType;
            try {
                const result = await method.apply(this, args);
                success = true;
                return result;
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                errorType = err.constructor.name;
                throw error;
            }
            finally {
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
class MetricTimer {
    constructor(operation) {
        this.operation = operation;
        this.startTime = Date.now();
        this.monitoring = MonitoringService.getInstance();
    }
    finish(success = true, errorType) {
        const duration = Date.now() - this.startTime;
        this.monitoring.recordPerformance({
            operation: this.operation,
            duration,
            success,
            errorType,
        });
    }
}
exports.MetricTimer = MetricTimer;
// Export singleton instance
exports.monitoring = MonitoringService.getInstance();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbml0b3JpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBc1lILDBCQXFDQztBQXphRCxxQ0FBa0M7QUEwQmxDLE1BQWEsaUJBQWlCO0lBSzVCO1FBQ0UsSUFBSSxDQUFDLFlBQVksR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixJQUFJLFNBQVMsQ0FBQztRQUN0RSxJQUFJLENBQUMsV0FBVyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQztJQUN0RCxDQUFDO0lBRUQsTUFBTSxDQUFDLFdBQVc7UUFDaEIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2hDLGlCQUFpQixDQUFDLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDdkQsQ0FBQztRQUNELE9BQU8saUJBQWlCLENBQUMsUUFBUSxDQUFDO0lBQ3BDLENBQUM7SUFFRDs7T0FFRztJQUNILGlCQUFpQixDQUFDLE1BQXlCO1FBQ3pDLE1BQU0sVUFBVSxHQUFHO1lBQ2pCLFlBQVksRUFBRSxJQUFJLENBQUMsWUFBWTtZQUMvQixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDN0IsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTO1lBQzNCLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRTtTQUNuQyxDQUFDO1FBRUYsSUFBSSxNQUFNLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDcEIsVUFBa0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDO1FBQ3RELENBQUM7UUFFRCxrQkFBa0I7UUFDbEIsSUFBSSxDQUFDLFNBQVMsQ0FBQztZQUNiLElBQUksRUFBRSxtQkFBbUI7WUFDekIsS0FBSyxFQUFFLE1BQU0sQ0FBQyxRQUFRO1lBQ3RCLElBQUksRUFBRSxjQUFjO1lBQ3BC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UyxHQUFHLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDO2dCQUNqQyxNQUFNLEtBQUssQ0FBQztZQUNkLENBQUM7b0JBQVMsQ0FBQztnQkFDVCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsU0FBUyxDQUFDO2dCQUV4QyxVQUFVLENBQUMsaUJBQWlCLENBQUM7b0JBQzNCLFNBQVMsRUFBRSxhQUFhO29CQUN4QixRQUFRO29CQUNSLE9BQU87b0JBQ1AsU0FBUztpQkFDVixDQUFDLENBQUM7WUFDTCxDQUFDO1FBQ0gsQ0FBQyxDQUFDO1FBRUYsT0FBTyxVQUFVLENBQUM7SUFDcEIsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBYSxXQUFXO0lBS3RCLFlBQVksU0FBaUI7UUFDM0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLFVBQVUsR0FBRyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsQ0FBQztJQUNwRCxDQUFDO0lBRUQsTUFBTSxDQUFDLFVBQW1CLElBQUksRUFBRSxTQUFrQjtRQUNoRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQztRQUU3QyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDO1lBQ2hDLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztZQUN6QixRQUFRO1lBQ1IsT0FBTztZQUNQLFNBQVM7U0FDVixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyQkQsa0NBcUJDO0FBRUQsNEJBQTRCO0FBQ2YsUUFBQSxVQUFVLEdBQUcsaUJBQWlCLENBQUMsV0FBVyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcclxuICogTW9uaXRvcmluZyBhbmQgbWV0cmljcyBzeXN0ZW0gZm9yIFRyaW5pdHkgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gKiBQcm92aWRlcyBDbG91ZFdhdGNoIG1ldHJpY3MsIGFsYXJtcywgYW5kIHBlcmZvcm1hbmNlIHRyYWNraW5nXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xyXG5pbXBvcnQgeyBFcnJvckNhdGVnb3J5IH0gZnJvbSAnLi9lcnJvci1oYW5kbGVyJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTWV0cmljRGF0YSB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIHZhbHVlOiBudW1iZXI7XHJcbiAgdW5pdDogc3RyaW5nO1xyXG4gIGRpbWVuc2lvbnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xyXG4gIHRpbWVzdGFtcD86IERhdGU7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgUGVyZm9ybWFuY2VNZXRyaWMge1xyXG4gIG9wZXJhdGlvbjogc3RyaW5nO1xyXG4gIGR1cmF0aW9uOiBudW1iZXI7XHJcbiAgc3VjY2VzczogYm9vbGVhbjtcclxuICBlcnJvclR5cGU/OiBzdHJpbmc7XHJcbiAgdXNlcklkPzogc3RyaW5nO1xyXG4gIHJvb21JZD86IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBCdXNpbmVzc01ldHJpYyB7XHJcbiAgbmFtZTogc3RyaW5nO1xyXG4gIHZhbHVlOiBudW1iZXI7XHJcbiAgZGltZW5zaW9ucz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNb25pdG9yaW5nU2VydmljZSB7XHJcbiAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IE1vbml0b3JpbmdTZXJ2aWNlO1xyXG4gIHByaXZhdGUgZnVuY3Rpb25OYW1lOiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSBlbnZpcm9ubWVudDogc3RyaW5nO1xyXG5cclxuICBwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgdGhpcy5mdW5jdGlvbk5hbWUgPSBwcm9jZXNzLmVudi5BV1NfTEFNQkRBX0ZVTkNUSU9OX05BTUUgfHwgJ3Vua25vd24nO1xyXG4gICAgdGhpcy5lbnZpcm9ubWVudCA9IHByb2Nlc3MuZW52LlRSSU5JVFlfRU5WIHx8ICdkZXYnO1xyXG4gIH1cclxuXHJcbiAgc3RhdGljIGdldEluc3RhbmNlKCk6IE1vbml0b3JpbmdTZXJ2aWNlIHtcclxuICAgIGlmICghTW9uaXRvcmluZ1NlcnZpY2UuaW5zdGFuY2UpIHtcclxuICAgICAgTW9uaXRvcmluZ1NlcnZpY2UuaW5zdGFuY2UgPSBuZXcgTW9uaXRvcmluZ1NlcnZpY2UoKTtcclxuICAgIH1cclxuICAgIHJldHVybiBNb25pdG9yaW5nU2VydmljZS5pbnN0YW5jZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlY29yZCBwZXJmb3JtYW5jZSBtZXRyaWNcclxuICAgKi9cclxuICByZWNvcmRQZXJmb3JtYW5jZShtZXRyaWM6IFBlcmZvcm1hbmNlTWV0cmljKTogdm9pZCB7XHJcbiAgICBjb25zdCBkaW1lbnNpb25zID0ge1xyXG4gICAgICBGdW5jdGlvbk5hbWU6IHRoaXMuZnVuY3Rpb25OYW1lLFxyXG4gICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgT3BlcmF0aW9uOiBtZXRyaWMub3BlcmF0aW9uLFxyXG4gICAgICBTdWNjZXNzOiBtZXRyaWMuc3VjY2Vzcy50b1N0cmluZygpLFxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAobWV0cmljLmVycm9yVHlwZSkge1xyXG4gICAgICAoZGltZW5zaW9ucyBhcyBhbnkpWydFcnJvclR5cGUnXSA9IG1ldHJpYy5lcnJvclR5cGU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVjb3JkIGR1cmF0aW9uXHJcbiAgICB0aGlzLnB1dE1ldHJpYyh7XHJcbiAgICAgIG5hbWU6ICdPcGVyYXRpb25EdXJhdGlvbicsXHJcbiAgICAgIHZhbHVlOiBtZXRyaWMuZHVyYXRpb24sXHJcbiAgICAgIHVuaXQ6ICdNaWxsaXNlY29uZHMnLFxyXG4gICAgICBkaW1lbnNpb25zLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUmVjb3JkIHN1Y2Nlc3MvZmFpbHVyZSBjb3VudFxyXG4gICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICBuYW1lOiAnT3BlcmF0aW9uQ291bnQnLFxyXG4gICAgICB2YWx1ZTogMSxcclxuICAgICAgdW5pdDogJ0NvdW50JyxcclxuICAgICAgZGltZW5zaW9ucyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIExvZyBwZXJmb3JtYW5jZSBmb3IgZGVidWdnaW5nXHJcbiAgICBsb2dnZXIubG9nUGVyZm9ybWFuY2UoXHJcbiAgICAgIG1ldHJpYy5vcGVyYXRpb24sXHJcbiAgICAgIG1ldHJpYy5kdXJhdGlvbixcclxuICAgICAgbWV0cmljLnN1Y2Nlc3MsXHJcbiAgICAgIHtcclxuICAgICAgICB1c2VySWQ6IG1ldHJpYy51c2VySWQsXHJcbiAgICAgICAgcm9vbUlkOiBtZXRyaWMucm9vbUlkLFxyXG4gICAgICB9XHJcbiAgICApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVjb3JkIGJ1c2luZXNzIG1ldHJpY1xyXG4gICAqL1xyXG4gIHJlY29yZEJ1c2luZXNzTWV0cmljKG1ldHJpYzogQnVzaW5lc3NNZXRyaWMpOiB2b2lkIHtcclxuICAgIGNvbnN0IGRpbWVuc2lvbnMgPSB7XHJcbiAgICAgIEZ1bmN0aW9uTmFtZTogdGhpcy5mdW5jdGlvbk5hbWUsXHJcbiAgICAgIEVudmlyb25tZW50OiB0aGlzLmVudmlyb25tZW50LFxyXG4gICAgICAuLi5tZXRyaWMuZGltZW5zaW9ucyxcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICBuYW1lOiBtZXRyaWMubmFtZSxcclxuICAgICAgdmFsdWU6IG1ldHJpYy52YWx1ZSxcclxuICAgICAgdW5pdDogJ0NvdW50JyxcclxuICAgICAgZGltZW5zaW9ucyxcclxuICAgIH0pO1xyXG5cclxuICAgIGxvZ2dlci5sb2dCdXNpbmVzc01ldHJpYyhcclxuICAgICAgbWV0cmljLm5hbWUsXHJcbiAgICAgIG1ldHJpYy52YWx1ZSxcclxuICAgICAgJ0NvdW50JyxcclxuICAgICAgdW5kZWZpbmVkLFxyXG4gICAgICB7IGRpbWVuc2lvbnMgfVxyXG4gICAgKTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlY29yZCBlcnJvciBtZXRyaWNcclxuICAgKi9cclxuICByZWNvcmRFcnJvcihjYXRlZ29yeTogRXJyb3JDYXRlZ29yeSwgb3BlcmF0aW9uPzogc3RyaW5nLCBkZXRhaWxzPzogYW55KTogdm9pZCB7XHJcbiAgICBjb25zdCBkaW1lbnNpb25zID0ge1xyXG4gICAgICBGdW5jdGlvbk5hbWU6IHRoaXMuZnVuY3Rpb25OYW1lLFxyXG4gICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgRXJyb3JDYXRlZ29yeTogY2F0ZWdvcnksXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChvcGVyYXRpb24pIHtcclxuICAgICAgKGRpbWVuc2lvbnMgYXMgYW55KVsnT3BlcmF0aW9uJ10gPSBvcGVyYXRpb247XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICBuYW1lOiAnRXJyb3JDb3VudCcsXHJcbiAgICAgIHZhbHVlOiAxLFxyXG4gICAgICB1bml0OiAnQ291bnQnLFxyXG4gICAgICBkaW1lbnNpb25zLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUmVjb3JkIHNwZWNpZmljIGVycm9yIHR5cGUgbWV0cmljc1xyXG4gICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICBuYW1lOiBgRXJyb3Ike2NhdGVnb3J5fWAsXHJcbiAgICAgIHZhbHVlOiAxLFxyXG4gICAgICB1bml0OiAnQ291bnQnLFxyXG4gICAgICBkaW1lbnNpb25zOiB7XHJcbiAgICAgICAgRnVuY3Rpb25OYW1lOiB0aGlzLmZ1bmN0aW9uTmFtZSxcclxuICAgICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVjb3JkIGNhY2hlIG1ldHJpY3NcclxuICAgKi9cclxuICByZWNvcmRDYWNoZU1ldHJpYyhvcGVyYXRpb246ICdoaXQnIHwgJ21pc3MnIHwgJ2NyZWF0ZScgfCAnaW52YWxpZGF0ZScsIGNhY2hlVHlwZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBjb25zdCBkaW1lbnNpb25zID0ge1xyXG4gICAgICBGdW5jdGlvbk5hbWU6IHRoaXMuZnVuY3Rpb25OYW1lLFxyXG4gICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgQ2FjaGVUeXBlOiBjYWNoZVR5cGUsXHJcbiAgICAgIE9wZXJhdGlvbjogb3BlcmF0aW9uLFxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnB1dE1ldHJpYyh7XHJcbiAgICAgIG5hbWU6ICdDYWNoZU9wZXJhdGlvbicsXHJcbiAgICAgIHZhbHVlOiAxLFxyXG4gICAgICB1bml0OiAnQ291bnQnLFxyXG4gICAgICBkaW1lbnNpb25zLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUmVjb3JkIGNhY2hlIGhpdCByYXRpbyBmb3IgaGl0cyBhbmQgbWlzc2VzXHJcbiAgICBpZiAob3BlcmF0aW9uID09PSAnaGl0JyB8fCBvcGVyYXRpb24gPT09ICdtaXNzJykge1xyXG4gICAgICB0aGlzLnB1dE1ldHJpYyh7XHJcbiAgICAgICAgbmFtZTogJ0NhY2hlSGl0UmF0aW8nLFxyXG4gICAgICAgIHZhbHVlOiBvcGVyYXRpb24gPT09ICdoaXQnID8gMSA6IDAsXHJcbiAgICAgICAgdW5pdDogJ1BlcmNlbnQnLFxyXG4gICAgICAgIGRpbWVuc2lvbnM6IHtcclxuICAgICAgICAgIEZ1bmN0aW9uTmFtZTogdGhpcy5mdW5jdGlvbk5hbWUsXHJcbiAgICAgICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgICAgIENhY2hlVHlwZTogY2FjaGVUeXBlLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVjb3JkIGRhdGFiYXNlIG9wZXJhdGlvbiBtZXRyaWNzXHJcbiAgICovXHJcbiAgcmVjb3JkRGF0YWJhc2VNZXRyaWMoXHJcbiAgICBvcGVyYXRpb246ICdnZXQnIHwgJ3B1dCcgfCAndXBkYXRlJyB8ICdkZWxldGUnIHwgJ3F1ZXJ5JyB8ICdzY2FuJyB8ICdiYXRjaCcsXHJcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcclxuICAgIGR1cmF0aW9uOiBudW1iZXIsXHJcbiAgICBzdWNjZXNzOiBib29sZWFuLFxyXG4gICAgaXRlbUNvdW50PzogbnVtYmVyXHJcbiAgKTogdm9pZCB7XHJcbiAgICBjb25zdCBkaW1lbnNpb25zID0ge1xyXG4gICAgICBGdW5jdGlvbk5hbWU6IHRoaXMuZnVuY3Rpb25OYW1lLFxyXG4gICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgVGFibGVOYW1lOiB0YWJsZU5hbWUsXHJcbiAgICAgIE9wZXJhdGlvbjogb3BlcmF0aW9uLFxyXG4gICAgICBTdWNjZXNzOiBzdWNjZXNzLnRvU3RyaW5nKCksXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFJlY29yZCBvcGVyYXRpb24gZHVyYXRpb25cclxuICAgIHRoaXMucHV0TWV0cmljKHtcclxuICAgICAgbmFtZTogJ0RhdGFiYXNlT3BlcmF0aW9uRHVyYXRpb24nLFxyXG4gICAgICB2YWx1ZTogZHVyYXRpb24sXHJcbiAgICAgIHVuaXQ6ICdNaWxsaXNlY29uZHMnLFxyXG4gICAgICBkaW1lbnNpb25zLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUmVjb3JkIG9wZXJhdGlvbiBjb3VudFxyXG4gICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICBuYW1lOiAnRGF0YWJhc2VPcGVyYXRpb25Db3VudCcsXHJcbiAgICAgIHZhbHVlOiAxLFxyXG4gICAgICB1bml0OiAnQ291bnQnLFxyXG4gICAgICBkaW1lbnNpb25zLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUmVjb3JkIGl0ZW0gY291bnQgZm9yIG9wZXJhdGlvbnMgdGhhdCByZXR1cm4gaXRlbXNcclxuICAgIGlmIChpdGVtQ291bnQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB0aGlzLnB1dE1ldHJpYyh7XHJcbiAgICAgICAgbmFtZTogJ0RhdGFiYXNlSXRlbUNvdW50JyxcclxuICAgICAgICB2YWx1ZTogaXRlbUNvdW50LFxyXG4gICAgICAgIHVuaXQ6ICdDb3VudCcsXHJcbiAgICAgICAgZGltZW5zaW9ucyxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBSZWNvcmQgZXh0ZXJuYWwgQVBJIG1ldHJpY3NcclxuICAgKi9cclxuICByZWNvcmRFeHRlcm5hbEFwaU1ldHJpYyhcclxuICAgIHNlcnZpY2U6IHN0cmluZyxcclxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxyXG4gICAgZHVyYXRpb246IG51bWJlcixcclxuICAgIHN1Y2Nlc3M6IGJvb2xlYW4sXHJcbiAgICBzdGF0dXNDb2RlPzogbnVtYmVyXHJcbiAgKTogdm9pZCB7XHJcbiAgICBjb25zdCBkaW1lbnNpb25zID0ge1xyXG4gICAgICBGdW5jdGlvbk5hbWU6IHRoaXMuZnVuY3Rpb25OYW1lLFxyXG4gICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgU2VydmljZTogc2VydmljZSxcclxuICAgICAgT3BlcmF0aW9uOiBvcGVyYXRpb24sXHJcbiAgICAgIFN1Y2Nlc3M6IHN1Y2Nlc3MudG9TdHJpbmcoKSxcclxuICAgIH07XHJcblxyXG4gICAgaWYgKHN0YXR1c0NvZGUpIHtcclxuICAgICAgKGRpbWVuc2lvbnMgYXMgYW55KVsnU3RhdHVzQ29kZSddID0gc3RhdHVzQ29kZS50b1N0cmluZygpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlY29yZCBBUEkgY2FsbCBkdXJhdGlvblxyXG4gICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICBuYW1lOiAnRXh0ZXJuYWxBcGlEdXJhdGlvbicsXHJcbiAgICAgIHZhbHVlOiBkdXJhdGlvbixcclxuICAgICAgdW5pdDogJ01pbGxpc2Vjb25kcycsXHJcbiAgICAgIGRpbWVuc2lvbnMsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBSZWNvcmQgQVBJIGNhbGwgY291bnRcclxuICAgIHRoaXMucHV0TWV0cmljKHtcclxuICAgICAgbmFtZTogJ0V4dGVybmFsQXBpQ291bnQnLFxyXG4gICAgICB2YWx1ZTogMSxcclxuICAgICAgdW5pdDogJ0NvdW50JyxcclxuICAgICAgZGltZW5zaW9ucyxcclxuICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVjb3JkIHJvb20gYWN0aXZpdHkgbWV0cmljc1xyXG4gICAqL1xyXG4gIHJlY29yZFJvb21BY3Rpdml0eShcclxuICAgIGFjdGl2aXR5OiAnY3JlYXRlZCcgfCAnam9pbmVkJyB8ICdsZWZ0JyB8ICdtYXRjaGVkJyB8ICdub19jb25zZW5zdXMnLFxyXG4gICAgcm9vbUNhcGFjaXR5PzogbnVtYmVyLFxyXG4gICAgbWVtYmVyQ291bnQ/OiBudW1iZXJcclxuICApOiB2b2lkIHtcclxuICAgIGNvbnN0IGRpbWVuc2lvbnMgPSB7XHJcbiAgICAgIEZ1bmN0aW9uTmFtZTogdGhpcy5mdW5jdGlvbk5hbWUsXHJcbiAgICAgIEVudmlyb25tZW50OiB0aGlzLmVudmlyb25tZW50LFxyXG4gICAgICBBY3Rpdml0eTogYWN0aXZpdHksXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChyb29tQ2FwYWNpdHkpIHtcclxuICAgICAgKGRpbWVuc2lvbnMgYXMgYW55KVsnUm9vbUNhcGFjaXR5J10gPSByb29tQ2FwYWNpdHkudG9TdHJpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLnB1dE1ldHJpYyh7XHJcbiAgICAgIG5hbWU6ICdSb29tQWN0aXZpdHknLFxyXG4gICAgICB2YWx1ZTogMSxcclxuICAgICAgdW5pdDogJ0NvdW50JyxcclxuICAgICAgZGltZW5zaW9ucyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFJlY29yZCBtZW1iZXIgY291bnQgZm9yIHJlbGV2YW50IGFjdGl2aXRpZXNcclxuICAgIGlmIChtZW1iZXJDb3VudCAhPT0gdW5kZWZpbmVkICYmIChhY3Rpdml0eSA9PT0gJ2pvaW5lZCcgfHwgYWN0aXZpdHkgPT09ICdsZWZ0JykpIHtcclxuICAgICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICAgIG5hbWU6ICdSb29tTWVtYmVyQ291bnQnLFxyXG4gICAgICAgIHZhbHVlOiBtZW1iZXJDb3VudCxcclxuICAgICAgICB1bml0OiAnQ291bnQnLFxyXG4gICAgICAgIGRpbWVuc2lvbnM6IHtcclxuICAgICAgICAgIEZ1bmN0aW9uTmFtZTogdGhpcy5mdW5jdGlvbk5hbWUsXHJcbiAgICAgICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgICB9LFxyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJlY29yZCB2b3RpbmcgbWV0cmljc1xyXG4gICAqL1xyXG4gIHJlY29yZFZvdGVBY3Rpdml0eShcclxuICAgIHZvdGVUeXBlOiAnTElLRScgfCAnRElTTElLRScsXHJcbiAgICByb29tQ2FwYWNpdHk6IG51bWJlcixcclxuICAgIGN1cnJlbnRWb3Rlcz86IG51bWJlcixcclxuICAgIGlzTWF0Y2g/OiBib29sZWFuXHJcbiAgKTogdm9pZCB7XHJcbiAgICBjb25zdCBkaW1lbnNpb25zID0ge1xyXG4gICAgICBGdW5jdGlvbk5hbWU6IHRoaXMuZnVuY3Rpb25OYW1lLFxyXG4gICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgVm90ZVR5cGU6IHZvdGVUeXBlLFxyXG4gICAgICBSb29tQ2FwYWNpdHk6IHJvb21DYXBhY2l0eS50b1N0cmluZygpLFxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnB1dE1ldHJpYyh7XHJcbiAgICAgIG5hbWU6ICdWb3RlQWN0aXZpdHknLFxyXG4gICAgICB2YWx1ZTogMSxcclxuICAgICAgdW5pdDogJ0NvdW50JyxcclxuICAgICAgZGltZW5zaW9ucyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFJlY29yZCBtYXRjaCBkZXRlY3Rpb25cclxuICAgIGlmIChpc01hdGNoICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgdGhpcy5wdXRNZXRyaWMoe1xyXG4gICAgICAgIG5hbWU6ICdNYXRjaERldGVjdGlvbicsXHJcbiAgICAgICAgdmFsdWU6IGlzTWF0Y2ggPyAxIDogMCxcclxuICAgICAgICB1bml0OiAnQ291bnQnLFxyXG4gICAgICAgIGRpbWVuc2lvbnM6IHtcclxuICAgICAgICAgIEZ1bmN0aW9uTmFtZTogdGhpcy5mdW5jdGlvbk5hbWUsXHJcbiAgICAgICAgICBFbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgICAgIFJvb21DYXBhY2l0eTogcm9vbUNhcGFjaXR5LnRvU3RyaW5nKCksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmVjb3JkIHZvdGUgcHJvZ3Jlc3NcclxuICAgIGlmIChjdXJyZW50Vm90ZXMgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICB0aGlzLnB1dE1ldHJpYyh7XHJcbiAgICAgICAgbmFtZTogJ1ZvdGVQcm9ncmVzcycsXHJcbiAgICAgICAgdmFsdWU6IChjdXJyZW50Vm90ZXMgLyByb29tQ2FwYWNpdHkpICogMTAwLFxyXG4gICAgICAgIHVuaXQ6ICdQZXJjZW50JyxcclxuICAgICAgICBkaW1lbnNpb25zOiB7XHJcbiAgICAgICAgICBGdW5jdGlvbk5hbWU6IHRoaXMuZnVuY3Rpb25OYW1lLFxyXG4gICAgICAgICAgRW52aXJvbm1lbnQ6IHRoaXMuZW52aXJvbm1lbnQsXHJcbiAgICAgICAgICBSb29tQ2FwYWNpdHk6IHJvb21DYXBhY2l0eS50b1N0cmluZygpLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUHV0IG1ldHJpYyB0byBDbG91ZFdhdGNoIChpbiBwcm9kdWN0aW9uKSBvciBsb2cgKGluIGRldmVsb3BtZW50KVxyXG4gICAqL1xyXG4gIHByaXZhdGUgcHV0TWV0cmljKG1ldHJpYzogTWV0cmljRGF0YSk6IHZvaWQge1xyXG4gICAgLy8gSW4gZGV2ZWxvcG1lbnQsIGp1c3QgbG9nIHRoZSBtZXRyaWNcclxuICAgIGlmICh0aGlzLmVudmlyb25tZW50ICE9PSAncHJvZHVjdGlvbicpIHtcclxuICAgICAgbG9nZ2VyLmRlYnVnKCfwn5OKIE1ldHJpYyByZWNvcmRlZCcsIHVuZGVmaW5lZCwge1xyXG4gICAgICAgIG1ldHJpYzoge1xyXG4gICAgICAgICAgbmFtZTogbWV0cmljLm5hbWUsXHJcbiAgICAgICAgICB2YWx1ZTogbWV0cmljLnZhbHVlLFxyXG4gICAgICAgICAgdW5pdDogbWV0cmljLnVuaXQsXHJcbiAgICAgICAgICBkaW1lbnNpb25zOiBtZXRyaWMuZGltZW5zaW9ucyxcclxuICAgICAgICB9LFxyXG4gICAgICB9KTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEluIHByb2R1Y3Rpb24sIHRoaXMgd291bGQgc2VuZCB0byBDbG91ZFdhdGNoXHJcbiAgICAvLyBGb3Igbm93LCB3ZSdsbCBsb2cgaXQgd2l0aCBhIHNwZWNpYWwgZm9ybWF0IHRoYXQgY2FuIGJlIHBpY2tlZCB1cCBieSBDbG91ZFdhdGNoIExvZ3NcclxuICAgIGNvbnN0IG1ldHJpY0xvZyA9IHtcclxuICAgICAgdGltZXN0YW1wOiAobWV0cmljLnRpbWVzdGFtcCB8fCBuZXcgRGF0ZSgpKS50b0lTT1N0cmluZygpLFxyXG4gICAgICBtZXRyaWNOYW1lOiBtZXRyaWMubmFtZSxcclxuICAgICAgdmFsdWU6IG1ldHJpYy52YWx1ZSxcclxuICAgICAgdW5pdDogbWV0cmljLnVuaXQsXHJcbiAgICAgIGRpbWVuc2lvbnM6IG1ldHJpYy5kaW1lbnNpb25zLFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBVc2UgYSBzcGVjaWFsIGxvZyBmb3JtYXQgdGhhdCBDbG91ZFdhdGNoIGNhbiBwYXJzZVxyXG4gICAgY29uc29sZS5sb2coYE1PTklUT1JJTkdfTUVUUklDOiAke0pTT04uc3RyaW5naWZ5KG1ldHJpY0xvZyl9YCk7XHJcbiAgfVxyXG59XHJcblxyXG4vKipcclxuICogRGVjb3JhdG9yIGZvciBhdXRvbWF0aWMgcGVyZm9ybWFuY2UgbW9uaXRvcmluZ1xyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIG1vbml0b3Iob3BlcmF0aW9uPzogc3RyaW5nKSB7XHJcbiAgcmV0dXJuIGZ1bmN0aW9uIChcclxuICAgIHRhcmdldDogYW55LFxyXG4gICAgcHJvcGVydHlOYW1lOiBzdHJpbmcsXHJcbiAgICBkZXNjcmlwdG9yOiBQcm9wZXJ0eURlc2NyaXB0b3JcclxuICApIHtcclxuICAgIGNvbnN0IG1ldGhvZCA9IGRlc2NyaXB0b3IudmFsdWU7XHJcbiAgICBjb25zdCBvcGVyYXRpb25OYW1lID0gb3BlcmF0aW9uIHx8IHByb3BlcnR5TmFtZTtcclxuICAgIFxyXG4gICAgZGVzY3JpcHRvci52YWx1ZSA9IGFzeW5jIGZ1bmN0aW9uICguLi5hcmdzOiBhbnlbXSkge1xyXG4gICAgICBjb25zdCBtb25pdG9yaW5nID0gTW9uaXRvcmluZ1NlcnZpY2UuZ2V0SW5zdGFuY2UoKTtcclxuICAgICAgY29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgbGV0IHN1Y2Nlc3MgPSBmYWxzZTtcclxuICAgICAgbGV0IGVycm9yVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG4gICAgICBcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtZXRob2QuYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgc3VjY2VzcyA9IHRydWU7XHJcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICAgICAgZXJyb3JUeXBlID0gZXJyLmNvbnN0cnVjdG9yLm5hbWU7XHJcbiAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgY29uc3QgZHVyYXRpb24gPSBEYXRlLm5vdygpIC0gc3RhcnRUaW1lO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG1vbml0b3JpbmcucmVjb3JkUGVyZm9ybWFuY2Uoe1xyXG4gICAgICAgICAgb3BlcmF0aW9uOiBvcGVyYXRpb25OYW1lLFxyXG4gICAgICAgICAgZHVyYXRpb24sXHJcbiAgICAgICAgICBzdWNjZXNzLFxyXG4gICAgICAgICAgZXJyb3JUeXBlLFxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICByZXR1cm4gZGVzY3JpcHRvcjtcclxuICB9O1xyXG59XHJcblxyXG4vKipcclxuICogUGVyZm9ybWFuY2UgdGltZXIgd2l0aCBhdXRvbWF0aWMgbWV0cmljIHJlY29yZGluZ1xyXG4gKi9cclxuZXhwb3J0IGNsYXNzIE1ldHJpY1RpbWVyIHtcclxuICBwcml2YXRlIHN0YXJ0VGltZTogbnVtYmVyO1xyXG4gIHByaXZhdGUgb3BlcmF0aW9uOiBzdHJpbmc7XHJcbiAgcHJpdmF0ZSBtb25pdG9yaW5nOiBNb25pdG9yaW5nU2VydmljZTtcclxuXHJcbiAgY29uc3RydWN0b3Iob3BlcmF0aW9uOiBzdHJpbmcpIHtcclxuICAgIHRoaXMub3BlcmF0aW9uID0gb3BlcmF0aW9uO1xyXG4gICAgdGhpcy5zdGFydFRpbWUgPSBEYXRlLm5vdygpO1xyXG4gICAgdGhpcy5tb25pdG9yaW5nID0gTW9uaXRvcmluZ1NlcnZpY2UuZ2V0SW5zdGFuY2UoKTtcclxuICB9XHJcblxyXG4gIGZpbmlzaChzdWNjZXNzOiBib29sZWFuID0gdHJ1ZSwgZXJyb3JUeXBlPzogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBjb25zdCBkdXJhdGlvbiA9IERhdGUubm93KCkgLSB0aGlzLnN0YXJ0VGltZTtcclxuICAgIFxyXG4gICAgdGhpcy5tb25pdG9yaW5nLnJlY29yZFBlcmZvcm1hbmNlKHtcclxuICAgICAgb3BlcmF0aW9uOiB0aGlzLm9wZXJhdGlvbixcclxuICAgICAgZHVyYXRpb24sXHJcbiAgICAgIHN1Y2Nlc3MsXHJcbiAgICAgIGVycm9yVHlwZSxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuLy8gRXhwb3J0IHNpbmdsZXRvbiBpbnN0YW5jZVxyXG5leHBvcnQgY29uc3QgbW9uaXRvcmluZyA9IE1vbml0b3JpbmdTZXJ2aWNlLmdldEluc3RhbmNlKCk7Il19