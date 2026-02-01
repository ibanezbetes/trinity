/**
 * Monitoring and metrics system for Trinity Lambda functions
 * Provides CloudWatch metrics, alarms, and performance tracking
 */
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
export declare class MonitoringService {
    private static instance;
    private functionName;
    private environment;
    private constructor();
    static getInstance(): MonitoringService;
    /**
     * Record performance metric
     */
    recordPerformance(metric: PerformanceMetric): void;
    /**
     * Record business metric
     */
    recordBusinessMetric(metric: BusinessMetric): void;
    /**
     * Record error metric
     */
    recordError(category: ErrorCategory, operation?: string, details?: any): void;
    /**
     * Record cache metrics
     */
    recordCacheMetric(operation: 'hit' | 'miss' | 'create' | 'invalidate', cacheType: string): void;
    /**
     * Record database operation metrics
     */
    recordDatabaseMetric(operation: 'get' | 'put' | 'update' | 'delete' | 'query' | 'scan' | 'batch', tableName: string, duration: number, success: boolean, itemCount?: number): void;
    /**
     * Record external API metrics
     */
    recordExternalApiMetric(service: string, operation: string, duration: number, success: boolean, statusCode?: number): void;
    /**
     * Record room activity metrics
     */
    recordRoomActivity(activity: 'created' | 'joined' | 'left' | 'matched' | 'no_consensus', roomCapacity?: number, memberCount?: number): void;
    /**
     * Record voting metrics
     */
    recordVoteActivity(voteType: 'LIKE' | 'DISLIKE', roomCapacity: number, currentVotes?: number, isMatch?: boolean): void;
    /**
     * Put metric to CloudWatch (in production) or log (in development)
     */
    private putMetric;
}
/**
 * Decorator for automatic performance monitoring
 */
export declare function monitor(operation?: string): (target: any, propertyName: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Performance timer with automatic metric recording
 */
export declare class MetricTimer {
    private startTime;
    private operation;
    private monitoring;
    constructor(operation: string);
    finish(success?: boolean, errorType?: string): void;
}
export declare const monitoring: MonitoringService;
