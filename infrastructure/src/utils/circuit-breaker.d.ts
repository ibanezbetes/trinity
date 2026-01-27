/**
 * Circuit Breaker Implementation for External API Calls
 * Prevents cascading failures when external services are down
 */
export declare enum CircuitState {
    CLOSED = "CLOSED",// Normal operation
    OPEN = "OPEN",// Circuit is open, failing fast
    HALF_OPEN = "HALF_OPEN"
}
export interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
    successThreshold: number;
    serviceName: string;
}
export interface CircuitBreakerState {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: number;
    successCount: number;
    nextAttempt: number;
}
export declare class CircuitBreaker {
    private state;
    private config;
    constructor(config?: Partial<CircuitBreakerConfig>);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private updateState;
    private onSuccess;
    private onFailure;
    private logCurrentState;
    getState(): CircuitBreakerState;
    getConfig(): CircuitBreakerConfig;
    forceOpen(): void;
    forceClose(): void;
}
export declare const tmdbCircuitBreaker: CircuitBreaker;
