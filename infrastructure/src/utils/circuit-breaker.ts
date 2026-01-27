/**
 * Circuit Breaker Implementation for External API Calls
 * Prevents cascading failures when external services are down
 */

import { logCircuitBreakerMetric, logError, PerformanceTimer } from './metrics';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit is open, failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service is back
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening
  resetTimeout: number;        // Time to wait before trying again (ms)
  monitoringPeriod: number;    // Time window for failure counting (ms)
  successThreshold: number;    // Successes needed to close from half-open
  serviceName: string;         // Service name for metrics
}

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
  nextAttempt: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      successThreshold: 2,
      serviceName: 'UnknownService',
      ...config
    };

    this.state = {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0,
      nextAttempt: 0
    };

    // Log initial state
    this.logCurrentState();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const timer = new PerformanceTimer(`CircuitBreaker_${this.config.serviceName}`);
    const now = Date.now();

    // Check if we should transition states
    this.updateState(now);

    // If circuit is open, fail fast
    if (this.state.state === CircuitState.OPEN) {
      const error = new Error(`Circuit breaker is OPEN for ${this.config.serviceName}. Next attempt at ${new Date(this.state.nextAttempt).toISOString()}`);
      timer.finish(false, 'CircuitOpen');
      throw error;
    }

    try {
      const result = await operation();
      this.onSuccess();
      timer.finish(true, undefined, { state: this.state.state });
      return result;
    } catch (error) {
      this.onFailure(now);
      timer.finish(false, 'OperationFailed', { 
        state: this.state.state,
        failureCount: this.state.failureCount 
      });
      
      logError(`CircuitBreaker_${this.config.serviceName}`, error as Error, {
        circuitState: this.state.state,
        failureCount: this.state.failureCount
      });
      
      throw error;
    }
  }

  private updateState(now: number): void {
    const previousState = this.state.state;
    
    switch (this.state.state) {
      case CircuitState.CLOSED:
        // Reset failure count if monitoring period has passed
        if (now - this.state.lastFailureTime > this.config.monitoringPeriod) {
          this.state.failureCount = 0;
        }
        break;

      case CircuitState.OPEN:
        // Check if we should transition to half-open
        if (now >= this.state.nextAttempt) {
          this.state.state = CircuitState.HALF_OPEN;
          this.state.successCount = 0;
          console.log(`🔄 Circuit breaker for ${this.config.serviceName} transitioning to HALF_OPEN`);
        }
        break;

      case CircuitState.HALF_OPEN:
        // Stay in half-open, will be handled by success/failure
        break;
    }

    // Log state change
    if (previousState !== this.state.state) {
      this.logCurrentState();
    }
  }

  private onSuccess(): void {
    const previousState = this.state.state;
    
    switch (this.state.state) {
      case CircuitState.CLOSED:
        // Reset failure count on success
        this.state.failureCount = 0;
        break;

      case CircuitState.HALF_OPEN:
        this.state.successCount++;
        if (this.state.successCount >= this.config.successThreshold) {
          this.state.state = CircuitState.CLOSED;
          this.state.failureCount = 0;
          this.state.successCount = 0;
          console.log(`✅ Circuit breaker for ${this.config.serviceName} CLOSED - service recovered`);
        }
        break;
    }

    if (previousState !== this.state.state) {
      this.logCurrentState();
    }
  }

  private onFailure(now: number): void {
    const previousState = this.state.state;
    this.state.lastFailureTime = now;

    switch (this.state.state) {
      case CircuitState.CLOSED:
        this.state.failureCount++;
        if (this.state.failureCount >= this.config.failureThreshold) {
          this.state.state = CircuitState.OPEN;
          this.state.nextAttempt = now + this.config.resetTimeout;
          console.log(`🚨 Circuit breaker for ${this.config.serviceName} OPENED - too many failures (${this.state.failureCount})`);
        }
        break;

      case CircuitState.HALF_OPEN:
        // Go back to open on any failure
        this.state.state = CircuitState.OPEN;
        this.state.nextAttempt = now + this.config.resetTimeout;
        this.state.successCount = 0;
        console.log(`🚨 Circuit breaker for ${this.config.serviceName} back to OPEN - half-open test failed`);
        break;
    }

    if (previousState !== this.state.state) {
      this.logCurrentState();
    }
  }

  private logCurrentState(): void {
    logCircuitBreakerMetric(
      this.config.serviceName,
      this.state.state,
      this.state.failureCount,
      this.state.successCount
    );
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  // Manual controls for testing/admin
  forceOpen(): void {
    this.state.state = CircuitState.OPEN;
    this.state.nextAttempt = Date.now() + this.config.resetTimeout;
    console.log(`🔧 Circuit breaker for ${this.config.serviceName} manually OPENED`);
    this.logCurrentState();
  }

  forceClose(): void {
    this.state.state = CircuitState.CLOSED;
    this.state.failureCount = 0;
    this.state.successCount = 0;
    console.log(`🔧 Circuit breaker for ${this.config.serviceName} manually CLOSED`);
    this.logCurrentState();
  }
}

// Singleton instance for TMDB API
export const tmdbCircuitBreaker = new CircuitBreaker({
  failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
  resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '60000'),
  monitoringPeriod: 300000, // 5 minutes
  successThreshold: 2,
  serviceName: 'TMDB_API'
});