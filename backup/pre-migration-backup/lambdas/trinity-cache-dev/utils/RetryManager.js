/**
 * Retry Manager with exponential backoff
 * Provides resilient retry logic for API calls and database operations
 */
class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 30000; // 30 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitter = options.jitter || true;
    
    console.log(`🔄 Retry manager initialized with max retries: ${this.maxRetries}`);
  }

  /**
   * Executes a function with retry logic
   * @param {Function} fn - Function to execute
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Function result
   */
  async executeWithRetry(fn, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    const retryableErrors = options.retryableErrors || [
      'NetworkError',
      'TimeoutError',
      'ServiceException',
      'ThrottlingException',
      'InternalServerError',
      'ProvisionedThroughputExceededException'
    ];

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt);
          console.log(`🔄 Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
          await this.sleep(delay);
        }

        const result = await fn();
        
        if (attempt > 0) {
          console.log(`✅ Operation succeeded on retry attempt ${attempt}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        const isRetryable = this.isRetryableError(error, retryableErrors);
        
        if (!isRetryable || attempt === maxRetries) {
          console.error(`❌ Operation failed after ${attempt + 1} attempts:`, error.message);
          throw error;
        }
        
        console.warn(`⚠️ Retryable error on attempt ${attempt + 1}: ${error.message}`);
      }
    }
    
    throw lastError;
  }

  /**
   * Calculates delay for exponential backoff with jitter
   * @param {number} attempt - Current attempt number
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    let delay = this.baseDelay * Math.pow(this.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, this.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  /**
   * Checks if an error is retryable
   * @param {Error} error - Error to check
   * @param {string[]} retryableErrors - List of retryable error types
   * @returns {boolean} True if error is retryable
   */
  isRetryableError(error, retryableErrors) {
    // Check error name
    if (retryableErrors.includes(error.name)) {
      return true;
    }
    
    // Check error message for specific patterns
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /throttl/i,
      /rate limit/i,
      /service unavailable/i,
      /internal server error/i,
      /502|503|504/
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Creates a retry wrapper for a function
   * @param {Function} fn - Function to wrap
   * @param {Object} options - Retry options
   * @returns {Function} Wrapped function with retry logic
   */
  wrapWithRetry(fn, options = {}) {
    return (...args) => {
      return this.executeWithRetry(() => fn(...args), options);
    };
  }
}

module.exports = RetryManager;