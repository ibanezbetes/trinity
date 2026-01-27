/**
 * React Hook for Error Logging
 * Provides easy access to error logging functionality in components
 * Validates: Requirements 9.3, 9.5
 */

import { useEffect, useState, useCallback } from 'react';
import { errorLoggingService, ErrorLogEntry, ErrorContext, UserFriendlyError } from '../services/errorLoggingService';

export interface UseErrorLoggingReturn {
  // Logging functions
  logError: (error: Error | string, context: ErrorContext, userMessage?: Partial<UserFriendlyError>) => ErrorLogEntry;
  logWarning: (message: string, context: ErrorContext, userMessage?: Partial<UserFriendlyError>) => ErrorLogEntry;
  logInfo: (message: string, context: ErrorContext) => ErrorLogEntry;
  
  // Recent errors for UI display
  recentErrors: ErrorLogEntry[];
  
  // Error statistics
  errorStats: {
    totalErrors: number;
    totalWarnings: number;
    totalInfo: number;
    recentErrors: number;
    topOperations: Array<{ operation: string; count: number }>;
  };
  
  // Utility functions
  clearLogs: () => void;
  getLogsByOperation: (operation: string) => ErrorLogEntry[];
}

/**
 * Hook for error logging with UI integration
 */
export const useErrorLogging = (options?: {
  maxRecentErrors?: number;
  autoRefreshStats?: boolean;
  refreshInterval?: number;
}): UseErrorLoggingReturn => {
  const {
    maxRecentErrors = 10,
    autoRefreshStats = true,
    refreshInterval = 5000
  } = options || {};

  const [recentErrors, setRecentErrors] = useState<ErrorLogEntry[]>([]);
  const [errorStats, setErrorStats] = useState(() => errorLoggingService.getErrorStats());

  // Update recent errors when new errors occur
  useEffect(() => {
    const unsubscribe = errorLoggingService.addErrorListener((entry) => {
      if (entry.level === 'error') {
        setRecentErrors(prev => {
          const updated = [entry, ...prev].slice(0, maxRecentErrors);
          return updated;
        });
      }
      
      // Update stats immediately when new error occurs
      if (autoRefreshStats) {
        setErrorStats(errorLoggingService.getErrorStats());
      }
    });

    return unsubscribe;
  }, [maxRecentErrors, autoRefreshStats]);

  // Auto-refresh error statistics
  useEffect(() => {
    if (!autoRefreshStats) return;

    const interval = setInterval(() => {
      setErrorStats(errorLoggingService.getErrorStats());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefreshStats, refreshInterval]);

  // Initialize recent errors
  useEffect(() => {
    const initialErrors = errorLoggingService.getRecentLogs(maxRecentErrors)
      .filter(log => log.level === 'error');
    setRecentErrors(initialErrors);
  }, [maxRecentErrors]);

  // Logging functions with UI updates
  const logError = useCallback((
    error: Error | string,
    context: ErrorContext,
    userMessage?: Partial<UserFriendlyError>
  ): ErrorLogEntry => {
    return errorLoggingService.logError(error, context, userMessage);
  }, []);

  const logWarning = useCallback((
    message: string,
    context: ErrorContext,
    userMessage?: Partial<UserFriendlyError>
  ): ErrorLogEntry => {
    return errorLoggingService.logWarning(message, context, userMessage);
  }, []);

  const logInfo = useCallback((
    message: string,
    context: ErrorContext
  ): ErrorLogEntry => {
    return errorLoggingService.logInfo(message, context);
  }, []);

  const clearLogs = useCallback(() => {
    errorLoggingService.clearLogs();
    setRecentErrors([]);
    setErrorStats(errorLoggingService.getErrorStats());
  }, []);

  const getLogsByOperation = useCallback((operation: string) => {
    return errorLoggingService.getLogsByOperation(operation);
  }, []);

  return {
    logError,
    logWarning,
    logInfo,
    recentErrors,
    errorStats,
    clearLogs,
    getLogsByOperation
  };
};

/**
 * Hook for displaying user-friendly error messages
 */
export const useErrorDisplay = () => {
  const [currentError, setCurrentError] = useState<UserFriendlyError | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = errorLoggingService.addErrorListener((entry) => {
      // Only show user messages for errors (not warnings or info)
      if (entry.level === 'error' && entry.userMessage.message) {
        setCurrentError(entry.userMessage);
        setIsVisible(true);
      }
    });

    return unsubscribe;
  }, []);

  const dismissError = useCallback(() => {
    setIsVisible(false);
    // Clear after animation completes
    setTimeout(() => setCurrentError(null), 300);
  }, []);

  const retryAction = useCallback(() => {
    dismissError();
    // Trigger retry logic if available
    // This would be implemented by the consuming component
  }, [dismissError]);

  return {
    currentError,
    isVisible,
    dismissError,
    retryAction
  };
};

export default useErrorLogging;