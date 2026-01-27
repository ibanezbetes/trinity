/**
 * Coordinated Error Handling Service
 * Implements coordinated error handling for authentication errors across all services
 * Ensures all services handle authentication errors consistently with proper error
 * propagation and recovery mechanisms
 */

import { loggingService } from './loggingService';
import { cognitoErrorTranslationService, ErrorTranslation } from './cognitoErrorTranslationService';
import { networkErrorClassificationService, NetworkErrorClassification } from './networkErrorClassificationService';
import { authStateBroadcastService, AuthState } from './authStateBroadcastService';

export interface ErrorContext {
  service: string;
  operation: string;
  userId?: string;
  sessionId?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ErrorHandlingResult {
  handled: boolean;
  shouldRetry: boolean;
  retryDelayMs?: number;
  userMessage: string;
  guidance?: string;
  requiresReauth: boolean;
  requiresLogout: boolean;
  propagateToServices: string[];
  recoveryActions: RecoveryAction[];
}

export interface RecoveryAction {
  type: 'token_refresh' | 'logout' | 'retry_operation' | 'clear_cache' | 'notify_user' | 'redirect';
  priority: number;
  delayMs?: number;
  metadata?: Record<string, any>;
}

export interface ErrorHandler {
  id: string;
  service: string;
  errorTypes: string[];
  priority: number;
  handler: (error: any, context: ErrorContext) => Promise<ErrorHandlingResult>;
}

export interface CoordinationConfig {
  enableErrorPropagation: boolean;
  enableRecoveryActions: boolean;
  enableCrossServiceNotification: boolean;
  maxRetryAttempts: number;
  retryDelayMs: number;
  enableErrorAggregation: boolean;
  aggregationWindowMs: number;
}

class CoordinatedErrorHandlingService {
  private errorHandlers: Map<string, ErrorHandler> = new Map();
  private activeErrors: Map<string, { error: any; context: ErrorContext; timestamp: number }> = new Map();
  private recoveryQueue: RecoveryAction[] = [];
  private errorAggregation: Map<string, number> = new Map();
  private aggregationWindow: NodeJS.Timeout | null = null;

  private config: CoordinationConfig = {
    enableErrorPropagation: true,
    enableRecoveryActions: true,
    enableCrossServiceNotification: true,
    maxRetryAttempts: 3,
    retryDelayMs: 1000,
    enableErrorAggregation: true,
    aggregationWindowMs: 5000,
  };

  constructor() {
    this.initializeDefaultHandlers();
    this.startAggregationWindow();
    
    loggingService.info('CoordinatedErrorHandling', 'Coordinated error handling service initialized', {
      config: this.config,
      defaultHandlers: this.errorHandlers.size,
    });
  }

  /**
   * Handle error with coordinated response across services
   */
  async handleError(
    error: any,
    context: ErrorContext
  ): Promise<ErrorHandlingResult> {
    const startTime = Date.now();
    
    try {
      loggingService.logDualError(
        'CoordinatedErrorHandling',
        `Handling error from ${context.service}`,
        { error: error.message, context },
        'Procesando error del sistema...'
      );

      // Find appropriate handler
      const handler = this.findErrorHandler(error, context);
      
      if (!handler) {
        return this.createFallbackResult(error, context);
      }

      // Execute handler
      const result = await handler.handler(error, context);

      // Track error for aggregation
      if (this.config.enableErrorAggregation) {
        this.trackErrorForAggregation(error, context);
      }

      // Store active error
      this.activeErrors.set(
        `${context.service}-${context.operation}`,
        { error, context, timestamp: Date.now() }
      );

      // Propagate to other services if needed
      if (this.config.enableErrorPropagation && result.propagateToServices.length > 0) {
        await this.propagateErrorToServices(error, context, result.propagateToServices);
      }

      // Execute recovery actions
      if (this.config.enableRecoveryActions && result.recoveryActions.length > 0) {
        await this.executeRecoveryActions(result.recoveryActions, context);
      }

      // Log performance metrics
      const duration = Date.now() - startTime;
      loggingService.debug('CoordinatedErrorHandling', 'Error handling completed', {
        service: context.service,
        operation: context.operation,
        duration,
        handled: result.handled,
        requiresReauth: result.requiresReauth,
        recoveryActionsCount: result.recoveryActions.length,
      });

      return result;

    } catch (handlingError: any) {
      loggingService.error('CoordinatedErrorHandling', 'Failed to handle error', {
        originalError: error.message,
        handlingError: handlingError.message,
        context,
      });

      return this.createFallbackResult(error, context);
    }
  }

  /**
   * Register custom error handler
   */
  registerErrorHandler(handler: ErrorHandler): void {
    if (this.errorHandlers.has(handler.id)) {
      loggingService.warn('CoordinatedErrorHandling', 'Replacing existing error handler', {
        handlerId: handler.id,
        service: handler.service,
      });
    }

    this.errorHandlers.set(handler.id, handler);
    
    loggingService.debug('CoordinatedErrorHandling', 'Error handler registered', {
      handlerId: handler.id,
      service: handler.service,
      errorTypes: handler.errorTypes,
      priority: handler.priority,
    });
  }

  /**
   * Remove error handler
   */
  removeErrorHandler(handlerId: string): boolean {
    const removed = this.errorHandlers.delete(handlerId);
    
    if (removed) {
      loggingService.debug('CoordinatedErrorHandling', 'Error handler removed', {
        handlerId,
      });
    }

    return removed;
  }

  /**
   * Get active errors across all services
   */
  getActiveErrors(): Array<{ error: any; context: ErrorContext; timestamp: number }> {
    return Array.from(this.activeErrors.values());
  }

  /**
   * Clear active error for service/operation
   */
  clearActiveError(service: string, operation: string): boolean {
    const key = `${service}-${operation}`;
    const cleared = this.activeErrors.delete(key);
    
    if (cleared) {
      loggingService.debug('CoordinatedErrorHandling', 'Active error cleared', {
        service,
        operation,
      });
    }

    return cleared;
  }

  /**
   * Get error aggregation statistics
   */
  getErrorAggregation(): Record<string, number> {
    return Object.fromEntries(this.errorAggregation);
  }

  /**
   * Clear error aggregation data
   */
  clearErrorAggregation(): void {
    this.errorAggregation.clear();
    loggingService.debug('CoordinatedErrorHandling', 'Error aggregation cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CoordinationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Restart aggregation window if settings changed
    if (oldConfig.aggregationWindowMs !== this.config.aggregationWindowMs) {
      this.restartAggregationWindow();
    }
    
    loggingService.info('CoordinatedErrorHandling', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): CoordinationConfig {
    return { ...this.config };
  }

  /**
   * Get registered error handlers
   */
  getErrorHandlers(): ErrorHandler[] {
    return Array.from(this.errorHandlers.values());
  }

  // Private helper methods

  private initializeDefaultHandlers(): void {
    // Authentication error handler
    this.registerErrorHandler({
      id: 'auth-error-handler',
      service: 'authentication',
      errorTypes: ['NotAuthorizedException', 'UserNotFoundException', 'TokenRefreshException'],
      priority: 100,
      handler: async (error: any, context: ErrorContext) => {
        const translation = cognitoErrorTranslationService.translateError(error);
        const requiresReauth = ['TokenRefreshException', 'NotAuthorizedException'].includes(
          this.extractErrorCode(error)
        );

        return {
          handled: true,
          shouldRetry: translation.retryable && !requiresReauth,
          userMessage: translation.userMessage,
          guidance: translation.guidance,
          requiresReauth,
          requiresLogout: requiresReauth,
          propagateToServices: requiresReauth ? ['session', 'storage', 'network'] : [],
          recoveryActions: requiresReauth ? [
            { type: 'logout', priority: 1 },
            { type: 'clear_cache', priority: 2 },
            { type: 'notify_user', priority: 3 },
          ] : [],
        };
      },
    });

    // Network error handler
    this.registerErrorHandler({
      id: 'network-error-handler',
      service: 'network',
      errorTypes: ['NetworkError', 'TimeoutError', 'ConnectionError'],
      priority: 90,
      handler: async (error: any, context: ErrorContext) => {
        const classification = await networkErrorClassificationService.classifyError(error);
        
        return {
          handled: true,
          shouldRetry: classification.retryable,
          retryDelayMs: classification.baseDelayMs,
          userMessage: classification.userMessage,
          guidance: classification.guidance,
          requiresReauth: false,
          requiresLogout: false,
          propagateToServices: classification.type === 'connectivity' ? ['offline'] : [],
          recoveryActions: classification.retryable ? [
            { type: 'retry_operation', priority: 1, delayMs: classification.baseDelayMs },
          ] : [],
        };
      },
    });

    // Session error handler
    this.registerErrorHandler({
      id: 'session-error-handler',
      service: 'session',
      errorTypes: ['SessionExpired', 'InvalidSession'],
      priority: 95,
      handler: async (error: any, context: ErrorContext) => {
        return {
          handled: true,
          shouldRetry: false,
          userMessage: 'Tu sesión ha expirado. Inicia sesión nuevamente.',
          guidance: 'Por seguridad, necesitas autenticarte de nuevo.',
          requiresReauth: true,
          requiresLogout: true,
          propagateToServices: ['authentication', 'storage'],
          recoveryActions: [
            { type: 'logout', priority: 1 },
            { type: 'clear_cache', priority: 2 },
            { type: 'redirect', priority: 3, metadata: { destination: 'login' } },
          ],
        };
      },
    });

    // Generic error handler (fallback)
    this.registerErrorHandler({
      id: 'generic-error-handler',
      service: '*',
      errorTypes: ['*'],
      priority: 1,
      handler: async (error: any, context: ErrorContext) => {
        return {
          handled: true,
          shouldRetry: true,
          userMessage: 'Ocurrió un error inesperado.',
          guidance: 'Intenta nuevamente en unos momentos.',
          requiresReauth: false,
          requiresLogout: false,
          propagateToServices: [],
          recoveryActions: [
            { type: 'retry_operation', priority: 1, delayMs: this.config.retryDelayMs },
          ],
        };
      },
    });
  }

  private findErrorHandler(error: any, context: ErrorContext): ErrorHandler | null {
    const errorCode = this.extractErrorCode(error);
    
    // Find handlers that match the service and error type
    const matchingHandlers = Array.from(this.errorHandlers.values()).filter(handler => {
      const serviceMatches = handler.service === '*' || handler.service === context.service;
      const errorTypeMatches = handler.errorTypes.includes('*') || 
                              handler.errorTypes.includes(errorCode) ||
                              handler.errorTypes.some(type => errorCode.includes(type));
      
      return serviceMatches && errorTypeMatches;
    });

    // Sort by priority (highest first)
    matchingHandlers.sort((a, b) => b.priority - a.priority);

    return matchingHandlers[0] || null;
  }

  private extractErrorCode(error: any): string {
    if (typeof error === 'string') return error;
    if (error && error.code) return error.code;
    if (error && error.name) return error.name;
    if (error && error.message) return error.message;
    return 'UnknownError';
  }

  private createFallbackResult(error: any, context: ErrorContext): ErrorHandlingResult {
    return {
      handled: false,
      shouldRetry: true,
      userMessage: 'Ocurrió un error inesperado.',
      guidance: 'Intenta nuevamente en unos momentos.',
      requiresReauth: false,
      requiresLogout: false,
      propagateToServices: [],
      recoveryActions: [],
    };
  }

  private async propagateErrorToServices(
    error: any,
    context: ErrorContext,
    services: string[]
  ): Promise<void> {
    if (!this.config.enableCrossServiceNotification) {
      return;
    }

    loggingService.debug('CoordinatedErrorHandling', 'Propagating error to services', {
      originalService: context.service,
      targetServices: services,
      errorCode: this.extractErrorCode(error),
    });

    // Notify auth state broadcast service if authentication is affected
    if (services.includes('authentication') || services.includes('session')) {
      try {
        // Update auth state to reflect error condition
        const currentState = authStateBroadcastService.getCurrentState();
        
        if (currentState.isAuthenticated) {
          authStateBroadcastService.updateAuthState({
            isAuthenticated: false,
            user: undefined,
            tokens: undefined,
          }, 'logout');
        }
      } catch (propagationError: any) {
        loggingService.error('CoordinatedErrorHandling', 'Failed to propagate to auth state service', {
          error: propagationError.message,
        });
      }
    }

    // Log propagation for other services (they would implement their own handlers)
    services.forEach(service => {
      loggingService.info('CoordinatedErrorHandling', `Error propagated to ${service} service`, {
        originalService: context.service,
        errorCode: this.extractErrorCode(error),
      });
    });
  }

  private async executeRecoveryActions(
    actions: RecoveryAction[],
    context: ErrorContext
  ): Promise<void> {
    if (!this.config.enableRecoveryActions) {
      return;
    }

    // Sort actions by priority
    const sortedActions = [...actions].sort((a, b) => a.priority - b.priority);

    loggingService.debug('CoordinatedErrorHandling', 'Executing recovery actions', {
      actionsCount: sortedActions.length,
      service: context.service,
    });

    for (const action of sortedActions) {
      try {
        // Apply delay if specified
        if (action.delayMs && action.delayMs > 0) {
          await this.delay(action.delayMs);
        }

        await this.executeRecoveryAction(action, context);

      } catch (actionError: any) {
        loggingService.error('CoordinatedErrorHandling', 'Recovery action failed', {
          actionType: action.type,
          error: actionError.message,
          context,
        });
      }
    }
  }

  private async executeRecoveryAction(
    action: RecoveryAction,
    context: ErrorContext
  ): Promise<void> {
    switch (action.type) {
      case 'logout':
        loggingService.info('CoordinatedErrorHandling', 'Executing logout recovery action', {
          service: context.service,
        });
        // The actual logout would be handled by the authentication service
        break;

      case 'clear_cache':
        loggingService.info('CoordinatedErrorHandling', 'Executing clear cache recovery action', {
          service: context.service,
        });
        // Cache clearing would be handled by storage services
        break;

      case 'retry_operation':
        loggingService.info('CoordinatedErrorHandling', 'Scheduling operation retry', {
          service: context.service,
          operation: context.operation,
          delayMs: action.delayMs,
        });
        // Retry scheduling would be handled by the calling service
        break;

      case 'notify_user':
        loggingService.info('CoordinatedErrorHandling', 'Executing user notification', {
          service: context.service,
        });
        // User notification would be handled by UI services
        break;

      case 'redirect':
        loggingService.info('CoordinatedErrorHandling', 'Executing redirect recovery action', {
          service: context.service,
          destination: action.metadata?.destination,
        });
        // Navigation would be handled by routing services
        break;

      default:
        loggingService.warn('CoordinatedErrorHandling', 'Unknown recovery action type', {
          actionType: action.type,
        });
    }
  }

  private trackErrorForAggregation(error: any, context: ErrorContext): void {
    const errorKey = `${context.service}-${this.extractErrorCode(error)}`;
    const currentCount = this.errorAggregation.get(errorKey) || 0;
    this.errorAggregation.set(errorKey, currentCount + 1);
  }

  private startAggregationWindow(): void {
    if (this.aggregationWindow) {
      clearInterval(this.aggregationWindow);
    }

    this.aggregationWindow = setInterval(() => {
      if (this.errorAggregation.size > 0) {
        loggingService.debug('CoordinatedErrorHandling', 'Error aggregation window', {
          errors: Object.fromEntries(this.errorAggregation),
        });
        
        // Clear aggregation for next window
        this.errorAggregation.clear();
      }
    }, this.config.aggregationWindowMs);
  }

  private restartAggregationWindow(): void {
    this.startAggregationWindow();
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const coordinatedErrorHandlingService = new CoordinatedErrorHandlingService();
export type { ErrorContext, ErrorHandlingResult, RecoveryAction, ErrorHandler, CoordinationConfig };