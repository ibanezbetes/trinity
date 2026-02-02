/**
 * Circuit Breaker implementation for TMDB API calls
 * Provides resilience and fallback mechanisms
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    
    console.log(`🔧 Circuit breaker initialized with threshold: ${this.failureThreshold}`);
  }

  /**
   * Executes a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments for the function
   * @returns {Promise<any>} Function result or throws error
   */
  async execute(fn, ...args) {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        console.log('🔄 Circuit breaker transitioning to HALF_OPEN');
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await fn(...args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Records a successful execution
   */
  onSuccess() {
    this.failureCount = 0;
    
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = 'CLOSED';
        this.successCount = 0;
        console.log('✅ Circuit breaker CLOSED - service recovered');
      }
    }
  }

  /**
   * Records a failed execution
   */
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.log('❌ Circuit breaker OPEN - service still failing');
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(`❌ Circuit breaker OPEN - failure threshold reached (${this.failureCount})`);
    }
  }

  /**
   * Checks if we should attempt to reset the circuit breaker
   * @returns {boolean} True if reset should be attempted
   */
  shouldAttemptReset() {
    return Date.now() - this.lastFailureTime >= this.resetTimeout;
  }

  /**
   * Gets current circuit breaker status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount
    };
  }

  /**
   * Manually resets the circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    console.log('🔄 Circuit breaker manually reset');
  }
}

module.exports = CircuitBreaker;