/**
 * Authentication Concurrency Control Service
 * Provides protection against race conditions in authentication operations,
 * implements proper locking for simultaneous authentication attempts,
 * and fixes state conflicts in concurrent authentication scenarios
 */

import { loggingService } from './loggingService';

export interface ConcurrencyLock {
  id: string;
  operation: string;
  acquiredAt: number;
  expiresAt: number;
  metadata?: Record<string, any>;
}

export interface ConcurrencyConfig {
  enableConcurrencyControl: boolean;
  defaultLockTimeoutMs: number;
  maxConcurrentOperations: number;
  enableDeadlockDetection: boolean;
  deadlockTimeoutMs: number;
  enableQueueing: boolean;
  maxQueueSize: number;
  queueTimeoutMs: number;
}

export interface OperationResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  waitTimeMs: number;
  lockHeldMs: number;
  queuePosition?: number;
}

export interface QueuedOperation<T> {
  id: string;
  operation: string;
  executor: () => Promise<T>;
  resolve: (result: OperationResult<T>) => void;
  reject: (error: any) => void;
  queuedAt: number;
  timeoutMs: number;
  metadata?: Record<string, any>;
}

class AuthConcurrencyControlService {
  private locks: Map<string, ConcurrencyLock> = new Map();
  private operationQueue: Map<string, QueuedOperation<any>[]> = new Map();
  private activeOperations: Set<string> = new Set();
  private lockCleanupInterval?: NodeJS.Timeout;

  private config: ConcurrencyConfig = {
    enableConcurrencyControl: true,
    defaultLockTimeoutMs: 30000, // 30 seconds
    maxConcurrentOperations: 3,
    enableDeadlockDetection: true,
    deadlockTimeoutMs: 60000, // 1 minute
    enableQueueing: true,
    maxQueueSize: 10,
    queueTimeoutMs: 120000, // 2 minutes
  };

  constructor() {
    this.startLockCleanup();
    
    loggingService.info('AuthConcurrencyControl', 'Authentication concurrency control service initialized', {
      config: this.config,
    });
  }

  /**
   * Execute operation with concurrency control
   */
  async executeWithLock<T>(
    operation: string,
    executor: () => Promise<T>,
    timeoutMs?: number,
    metadata?: Record<string, any>
  ): Promise<OperationResult<T>> {
    const startTime = Date.now();
    const lockTimeout = timeoutMs || this.config.defaultLockTimeoutMs;
    
    if (!this.config.enableConcurrencyControl) {
      // Execute without concurrency control
      try {
        const result = await executor();
        return {
          success: true,
          result,
          waitTimeMs: 0,
          lockHeldMs: Date.now() - startTime,
        };
      } catch (error) {
        return {
          success: false,
          error,
          waitTimeMs: 0,
          lockHeldMs: Date.now() - startTime,
        };
      }
    }

    try {
      loggingService.debug('AuthConcurrencyControl', `Attempting to acquire lock for ${operation}`, {
        operation,
        timeoutMs: lockTimeout,
        metadata,
      });

      // Try to acquire lock
      const lockResult = await this.acquireLock(operation, lockTimeout, metadata);
      
      if (!lockResult.success) {
        if (this.config.enableQueueing) {
          // Queue the operation
          return await this.queueOperation(operation, executor, lockTimeout, metadata);
        } else {
          return {
            success: false,
            error: new Error(`Failed to acquire lock for ${operation}: ${lockResult.error}`),
            waitTimeMs: Date.now() - startTime,
            lockHeldMs: 0,
          };
        }
      }

      const lockAcquiredTime = Date.now();
      const waitTime = lockAcquiredTime - startTime;

      try {
        // Execute the operation
        loggingService.debug('AuthConcurrencyControl', `Executing operation ${operation}`, {
          operation,
          waitTimeMs: waitTime,
        });

        const result = await executor();
        const executionTime = Date.now() - lockAcquiredTime;

        loggingService.debug('AuthConcurrencyControl', `Operation ${operation} completed successfully`, {
          operation,
          executionTimeMs: executionTime,
          waitTimeMs: waitTime,
        });

        return {
          success: true,
          result,
          waitTimeMs: waitTime,
          lockHeldMs: executionTime,
        };

      } catch (executionError: any) {
        const executionTime = Date.now() - lockAcquiredTime;
        
        loggingService.error('AuthConcurrencyControl', `Operation ${operation} failed`, {
          operation,
          error: executionError.message,
          executionTimeMs: executionTime,
          waitTimeMs: waitTime,
        });

        return {
          success: false,
          error: executionError,
          waitTimeMs: waitTime,
          lockHeldMs: executionTime,
        };

      } finally {
        // Always release the lock
        this.releaseLock(operation);
        
        // Process queued operations
        if (this.config.enableQueueing) {
          this.processQueue(operation);
        }
      }

    } catch (error: any) {
      loggingService.error('AuthConcurrencyControl', `Concurrency control failed for ${operation}`, {
        operation,
        error: error.message,
      });

      return {
        success: false,
        error,
        waitTimeMs: Date.now() - startTime,
        lockHeldMs: 0,
      };
    }
  }

  /**
   * Check if operation is currently locked
   */
  isLocked(operation: string): boolean {
    const lock = this.locks.get(operation);
    if (!lock) return false;
    
    // Check if lock has expired
    if (Date.now() > lock.expiresAt) {
      this.locks.delete(operation);
      return false;
    }
    
    return true;
  }

  /**
   * Get current locks
   */
  getCurrentLocks(): ConcurrencyLock[] {
    // Clean expired locks first
    this.cleanupExpiredLocks();
    return Array.from(this.locks.values());
  }

  /**
   * Get queue status for operation
   */
  getQueueStatus(operation: string): {
    queueLength: number;
    estimatedWaitTimeMs: number;
    isQueued: boolean;
  } {
    const queue = this.operationQueue.get(operation) || [];
    const avgExecutionTime = 5000; // Estimate 5 seconds per operation
    
    return {
      queueLength: queue.length,
      estimatedWaitTimeMs: queue.length * avgExecutionTime,
      isQueued: queue.length > 0,
    };
  }

  /**
   * Force release lock (emergency use)
   */
  forceReleaseLock(operation: string): boolean {
    const released = this.locks.delete(operation);
    
    if (released) {
      loggingService.warn('AuthConcurrencyControl', `Force released lock for ${operation}`, {
        operation,
      });
      
      // Process queued operations
      if (this.config.enableQueueing) {
        this.processQueue(operation);
      }
    }
    
    return released;
  }

  /**
   * Clear all locks (emergency use)
   */
  clearAllLocks(): number {
    const lockCount = this.locks.size;
    const operations = Array.from(this.locks.keys());
    
    this.locks.clear();
    this.activeOperations.clear();
    
    loggingService.warn('AuthConcurrencyControl', 'All locks cleared', {
      clearedLocks: lockCount,
      operations,
    });
    
    // Process all queues
    if (this.config.enableQueueing) {
      operations.forEach(operation => this.processQueue(operation));
    }
    
    return lockCount;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConcurrencyConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('AuthConcurrencyControl', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): ConcurrencyConfig {
    return { ...this.config };
  }

  /**
   * Get concurrency statistics
   */
  getStats(): {
    activeLocks: number;
    activeOperations: number;
    totalQueuedOperations: number;
    queuesByOperation: Record<string, number>;
    config: ConcurrencyConfig;
  } {
    this.cleanupExpiredLocks();
    
    const queuesByOperation: Record<string, number> = {};
    let totalQueued = 0;
    
    this.operationQueue.forEach((queue, operation) => {
      queuesByOperation[operation] = queue.length;
      totalQueued += queue.length;
    });
    
    return {
      activeLocks: this.locks.size,
      activeOperations: this.activeOperations.size,
      totalQueuedOperations: totalQueued,
      queuesByOperation,
      config: this.config,
    };
  }

  // Private helper methods

  private async acquireLock(
    operation: string,
    timeoutMs: number,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    // Check if already locked
    if (this.isLocked(operation)) {
      return {
        success: false,
        error: `Operation ${operation} is already locked`,
      };
    }

    // Check concurrent operation limit
    if (this.activeOperations.size >= this.config.maxConcurrentOperations) {
      return {
        success: false,
        error: `Maximum concurrent operations (${this.config.maxConcurrentOperations}) reached`,
      };
    }

    // Deadlock detection
    if (this.config.enableDeadlockDetection) {
      const deadlockDetected = this.detectDeadlock(operation);
      if (deadlockDetected) {
        return {
          success: false,
          error: `Potential deadlock detected for operation ${operation}`,
        };
      }
    }

    // Create lock
    const lockId = this.generateLockId();
    const now = Date.now();
    const lock: ConcurrencyLock = {
      id: lockId,
      operation,
      acquiredAt: now,
      expiresAt: now + timeoutMs,
      metadata,
    };

    this.locks.set(operation, lock);
    this.activeOperations.add(operation);

    loggingService.debug('AuthConcurrencyControl', `Lock acquired for ${operation}`, {
      lockId,
      operation,
      expiresAt: new Date(lock.expiresAt).toISOString(),
    });

    return { success: true };
  }

  private releaseLock(operation: string): boolean {
    const lock = this.locks.get(operation);
    if (!lock) return false;

    this.locks.delete(operation);
    this.activeOperations.delete(operation);

    const lockDuration = Date.now() - lock.acquiredAt;
    
    loggingService.debug('AuthConcurrencyControl', `Lock released for ${operation}`, {
      lockId: lock.id,
      operation,
      lockDurationMs: lockDuration,
    });

    return true;
  }

  private async queueOperation<T>(
    operation: string,
    executor: () => Promise<T>,
    timeoutMs: number,
    metadata?: Record<string, any>
  ): Promise<OperationResult<T>> {
    return new Promise((resolve, reject) => {
      // Check queue size limit
      const currentQueue = this.operationQueue.get(operation) || [];
      if (currentQueue.length >= this.config.maxQueueSize) {
        resolve({
          success: false,
          error: new Error(`Queue full for operation ${operation}`),
          waitTimeMs: 0,
          lockHeldMs: 0,
        });
        return;
      }

      // Create queued operation
      const queuedOp: QueuedOperation<T> = {
        id: this.generateOperationId(),
        operation,
        executor,
        resolve,
        reject,
        queuedAt: Date.now(),
        timeoutMs,
        metadata,
      };

      // Add to queue
      if (!this.operationQueue.has(operation)) {
        this.operationQueue.set(operation, []);
      }
      this.operationQueue.get(operation)!.push(queuedOp);

      const queuePosition = this.operationQueue.get(operation)!.length;

      loggingService.debug('AuthConcurrencyControl', `Operation queued for ${operation}`, {
        operationId: queuedOp.id,
        queuePosition,
        timeoutMs,
      });

      // Set timeout for queued operation
      setTimeout(() => {
        this.removeFromQueue(operation, queuedOp.id);
        resolve({
          success: false,
          error: new Error(`Queue timeout for operation ${operation}`),
          waitTimeMs: Date.now() - queuedOp.queuedAt,
          lockHeldMs: 0,
          queuePosition,
        });
      }, this.config.queueTimeoutMs);
    });
  }

  private async processQueue(operation: string): Promise<void> {
    const queue = this.operationQueue.get(operation);
    if (!queue || queue.length === 0) return;

    const nextOp = queue.shift();
    if (!nextOp) return;

    loggingService.debug('AuthConcurrencyControl', `Processing queued operation for ${operation}`, {
      operationId: nextOp.id,
      queuedDurationMs: Date.now() - nextOp.queuedAt,
    });

    // Execute the queued operation
    try {
      const result = await this.executeWithLock(
        nextOp.operation,
        nextOp.executor,
        nextOp.timeoutMs,
        nextOp.metadata
      );
      
      nextOp.resolve(result);
    } catch (error) {
      nextOp.reject(error);
    }
  }

  private removeFromQueue(operation: string, operationId: string): boolean {
    const queue = this.operationQueue.get(operation);
    if (!queue) return false;

    const index = queue.findIndex(op => op.id === operationId);
    if (index === -1) return false;

    queue.splice(index, 1);
    
    // Clean up empty queues
    if (queue.length === 0) {
      this.operationQueue.delete(operation);
    }

    return true;
  }

  private detectDeadlock(operation: string): boolean {
    // Simple deadlock detection: check if operation has been waiting too long
    const existingLock = this.locks.get(operation);
    if (!existingLock) return false;

    const lockAge = Date.now() - existingLock.acquiredAt;
    return lockAge > this.config.deadlockTimeoutMs;
  }

  private cleanupExpiredLocks(): void {
    const now = Date.now();
    const expiredOperations: string[] = [];

    this.locks.forEach((lock, operation) => {
      if (now > lock.expiresAt) {
        expiredOperations.push(operation);
      }
    });

    expiredOperations.forEach(operation => {
      loggingService.warn('AuthConcurrencyControl', `Cleaning up expired lock for ${operation}`, {
        operation,
        lockAge: now - this.locks.get(operation)!.acquiredAt,
      });
      
      this.locks.delete(operation);
      this.activeOperations.delete(operation);
      
      // Process queued operations
      if (this.config.enableQueueing) {
        this.processQueue(operation);
      }
    });
  }

  private startLockCleanup(): void {
    // Clean up expired locks every 30 seconds
    this.lockCleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks();
    }, 30000);
  }

  private generateLockId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `lock-${timestamp}-${random}`;
  }

  private generateOperationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `op-${timestamp}-${random}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.lockCleanupInterval) {
      clearInterval(this.lockCleanupInterval);
      this.lockCleanupInterval = undefined;
    }
    
    this.clearAllLocks();
    this.operationQueue.clear();
    
    loggingService.info('AuthConcurrencyControl', 'Concurrency control service destroyed');
  }
}

export const authConcurrencyControlService = new AuthConcurrencyControlService();
export type { ConcurrencyLock, ConcurrencyConfig, OperationResult, QueuedOperation };