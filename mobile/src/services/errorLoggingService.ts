/**
 * Error Logging Service
 * Implements dual error handling: detailed logs for debugging + simple user messages
 * Validates: Requirements 9.3, 9.5
 */

export interface ErrorContext {
  operation: string;
  userId?: string;
  roomId?: string;
  mediaId?: string;
  timestamp?: number;
  metadata?: Record<string, any>;
}

export interface UserFriendlyError {
  message: string;
  action?: string;
  canRetry: boolean;
}

export interface ErrorLogEntry {
  id: string;
  level: 'error' | 'warning' | 'info';
  operation: string;
  error: Error | string;
  context: ErrorContext;
  userMessage: UserFriendlyError;
  timestamp: number;
  stackTrace?: string;
}

class ErrorLoggingService {
  private logs: ErrorLogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 log entries
  private listeners: ((entry: ErrorLogEntry) => void)[] = [];

  /**
   * Log an error with dual behavior: detailed logging + user-friendly message
   */
  logError(
    error: Error | string,
    context: ErrorContext,
    userMessage?: Partial<UserFriendlyError>
  ): ErrorLogEntry {
    const errorObj = error instanceof Error ? error : new Error(error);
    
    const entry: ErrorLogEntry = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level: 'error',
      operation: context.operation,
      error: errorObj,
      context: {
        ...context,
        timestamp: context.timestamp || Date.now()
      },
      userMessage: this.generateUserFriendlyMessage(errorObj, context, userMessage),
      timestamp: Date.now(),
      stackTrace: errorObj.stack
    };

    // Detailed logging for debugging
    this.logDetailed(entry);
    
    // Store in memory for analysis
    this.storeLogs(entry);
    
    // Notify listeners (for UI error displays)
    this.notifyListeners(entry);

    return entry;
  }

  /**
   * Log a warning with contextual information
   */
  logWarning(
    message: string,
    context: ErrorContext,
    userMessage?: Partial<UserFriendlyError>
  ): ErrorLogEntry {
    const entry: ErrorLogEntry = {
      id: `warn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level: 'warning',
      operation: context.operation,
      error: message,
      context: {
        ...context,
        timestamp: context.timestamp || Date.now()
      },
      userMessage: this.generateUserFriendlyMessage(message, context, userMessage),
      timestamp: Date.now()
    };

    // Detailed logging for debugging
    this.logDetailed(entry);
    
    // Store in memory for analysis
    this.storeLogs(entry);

    return entry;
  }

  /**
   * Log informational message with context
   */
  logInfo(
    message: string,
    context: ErrorContext
  ): ErrorLogEntry {
    const entry: ErrorLogEntry = {
      id: `info_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level: 'info',
      operation: context.operation,
      error: message,
      context: {
        ...context,
        timestamp: context.timestamp || Date.now()
      },
      userMessage: { message: '', canRetry: false }, // No user message for info
      timestamp: Date.now()
    };

    // Detailed logging for debugging
    this.logDetailed(entry);
    
    // Store in memory for analysis
    this.storeLogs(entry);

    return entry;
  }

  /**
   * Generate user-friendly error messages with suggested actions
   */
  private generateUserFriendlyMessage(
    error: Error | string,
    context: ErrorContext,
    override?: Partial<UserFriendlyError>
  ): UserFriendlyError {
    if (override?.message) {
      return {
        message: override.message,
        action: override.action,
        canRetry: override.canRetry ?? true
      };
    }

    const errorMessage = error instanceof Error ? error.message : error;
    const operation = context.operation.toLowerCase();

    // Network-related errors
    if (this.isNetworkError(errorMessage)) {
      return {
        message: 'Connection issue detected. Your action has been queued.',
        action: 'Check your internet connection and try again',
        canRetry: true
      };
    }

    // Vote-related errors
    if (operation.includes('vote')) {
      return {
        message: 'Unable to register your vote right now.',
        action: 'Please try voting again',
        canRetry: true
      };
    }

    // Room-related errors
    if (operation.includes('room')) {
      if (operation.includes('join')) {
        return {
          message: 'Could not join the room.',
          action: 'Check the invite code and try again',
          canRetry: true
        };
      }
      if (operation.includes('create')) {
        return {
          message: 'Unable to create room at the moment.',
          action: 'Please try again in a few seconds',
          canRetry: true
        };
      }
      return {
        message: 'Room operation failed.',
        action: 'Please try again',
        canRetry: true
      };
    }

    // Media-related errors
    if (operation.includes('media') || operation.includes('movie')) {
      return {
        message: 'Having trouble loading content.',
        action: 'We\'ll try loading the next item',
        canRetry: false
      };
    }

    // Authentication errors
    if (operation.includes('auth') || operation.includes('login')) {
      return {
        message: 'Sign-in issue occurred.',
        action: 'Please try signing in again',
        canRetry: true
      };
    }

    // Storage errors
    if (operation.includes('storage') || operation.includes('cache')) {
      return {
        message: 'Data sync issue detected.',
        action: 'Your changes will sync when connection improves',
        canRetry: false
      };
    }

    // Generic fallback
    return {
      message: 'Something went wrong.',
      action: 'Please try again',
      canRetry: true
    };
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(errorMessage: string): boolean {
    const networkKeywords = [
      'network', 'connection', 'timeout', 'offline', 'unreachable',
      'fetch', 'request failed', 'no internet', 'connectivity'
    ];
    
    return networkKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword)
    );
  }

  /**
   * Detailed logging for debugging (console output)
   */
  private logDetailed(entry: ErrorLogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const contextStr = this.formatContext(entry.context);
    
    switch (entry.level) {
      case 'error':
        console.error(
          `🚨 [${timestamp}] ERROR in ${entry.operation}:`,
          entry.error,
          contextStr,
          entry.stackTrace ? `\nStack: ${entry.stackTrace}` : ''
        );
        break;
      
      case 'warning':
        console.warn(
          `⚠️ [${timestamp}] WARNING in ${entry.operation}:`,
          entry.error,
          contextStr
        );
        break;
      
      case 'info':
        console.log(
          `ℹ️ [${timestamp}] INFO in ${entry.operation}:`,
          entry.error,
          contextStr
        );
        break;
    }
  }

  /**
   * Format context for logging
   */
  private formatContext(context: ErrorContext): string {
    const parts: string[] = [];
    
    if (context.userId) parts.push(`User: ${context.userId}`);
    if (context.roomId) parts.push(`Room: ${context.roomId}`);
    if (context.mediaId) parts.push(`Media: ${context.mediaId}`);
    if (context.metadata) {
      const metaStr = Object.entries(context.metadata)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      parts.push(`Meta: {${metaStr}}`);
    }
    
    return parts.length > 0 ? `[${parts.join(', ')}]` : '';
  }

  /**
   * Store logs in memory with size limit
   */
  private storeLogs(entry: ErrorLogEntry): void {
    this.logs.push(entry);
    
    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  /**
   * Notify listeners of new log entries
   */
  private notifyListeners(entry: ErrorLogEntry): void {
    this.listeners.forEach(listener => {
      try {
        listener(entry);
      } catch (error) {
        console.error('❌ Error in error logging listener:', error);
      }
    });
  }

  /**
   * Add listener for error events (for UI notifications)
   */
  addErrorListener(listener: (entry: ErrorLogEntry) => void): () => void {
    this.listeners.push(listener);
    
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get recent error logs for debugging
   */
  getRecentLogs(count: number = 50): ErrorLogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs by operation type
   */
  getLogsByOperation(operation: string): ErrorLogEntry[] {
    return this.logs.filter(log => 
      log.operation.toLowerCase().includes(operation.toLowerCase())
    );
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    totalWarnings: number;
    totalInfo: number;
    recentErrors: number; // Last hour
    topOperations: Array<{ operation: string; count: number }>;
  } {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const errors = this.logs.filter(log => log.level === 'error');
    const warnings = this.logs.filter(log => log.level === 'warning');
    const info = this.logs.filter(log => log.level === 'info');
    const recentErrors = errors.filter(log => log.timestamp > oneHourAgo);
    
    // Count operations
    const operationCounts = new Map<string, number>();
    errors.forEach(log => {
      const count = operationCounts.get(log.operation) || 0;
      operationCounts.set(log.operation, count + 1);
    });
    
    const topOperations = Array.from(operationCounts.entries())
      .map(([operation, count]) => ({ operation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalErrors: errors.length,
      totalWarnings: warnings.length,
      totalInfo: info.length,
      recentErrors: recentErrors.length,
      topOperations
    };
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
    console.log('🗑️ Error logs cleared');
  }
}

export const errorLoggingService = new ErrorLoggingService();
export default errorLoggingService;