/**
 * Centralized logging utility for Trinity Lambda functions
 * Provides structured logging with CloudWatch integration
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
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
declare class TrinityLogger {
    private logLevel;
    private context;
    constructor(context?: LogContext);
    private getLogLevelFromEnv;
    private shouldLog;
    private createLogEntry;
    private log;
    debug(message: string, context?: LogContext, metadata?: Record<string, any>): void;
    info(message: string, context?: LogContext, metadata?: Record<string, any>): void;
    warn(message: string, context?: LogContext, metadata?: Record<string, any>): void;
    error(message: string, error?: Error, context?: LogContext, metadata?: Record<string, any>): void;
    logBusinessMetric(metricName: string, value: number, unit?: string, context?: LogContext, metadata?: Record<string, any>): void;
    logPerformance(operation: string, duration: number, success: boolean, context?: LogContext, metadata?: Record<string, any>): void;
    child(additionalContext: LogContext): TrinityLogger;
    updateContext(additionalContext: LogContext): void;
}
export declare class PerformanceTimer {
    private startTime;
    private logger;
    private operation;
    constructor(operation: string, logger: TrinityLogger);
    finish(success?: boolean, errorType?: string, metadata?: Record<string, any>): void;
    finishWithError(error: Error, metadata?: Record<string, any>): void;
}
export declare const logger: TrinityLogger;
export declare function createLogger(context: LogContext): TrinityLogger;
export declare const LogUtils: {
    logFunctionStart: (functionName: string, event: any, context?: LogContext) => void;
    logFunctionEnd: (functionName: string, result: any, context?: LogContext) => void;
    logGraphQLOperation: (fieldName: string, args: any, userId?: string) => void;
    logDatabaseOperation: (operation: string, tableName: string, key: any, context?: LogContext) => void;
    logExternalAPICall: (service: string, endpoint: string, method: string, context?: LogContext) => void;
    logCacheOperation: (operation: string, cacheKey: string, hit: boolean, context?: LogContext) => void;
};
export {};
