/**
 * Network Error Classification Service
 * Distinguishes between connectivity and service issues, implements proper retry mechanisms
 * with exponential backoff, and provides appropriate error messages and guidance
 */

import NetInfo from '@react-native-community/netinfo';
import { loggingService } from './loggingService';

export interface NetworkErrorClassification {
  type: 'connectivity' | 'service' | 'timeout' | 'authentication' | 'rate_limit' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
  retryStrategy: 'immediate' | 'exponential_backoff' | 'linear_backoff' | 'no_retry';
  maxRetries: number;
  baseDelayMs: number;
  userMessage: string;
  guidance: string;
  technicalDetails?: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryableStatusCodes: number[];
  retryableErrorTypes: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attemptCount: number;
  totalDelayMs: number;
  classification: NetworkErrorClassification;
}

class NetworkErrorClassificationService {
  private config: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    retryableErrorTypes: ['NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_ERROR'],
  };

  private readonly errorClassifications: Record<string, Partial<NetworkErrorClassification>> = {
    // Connectivity Issues
    'NETWORK_ERROR': {
      type: 'connectivity',
      severity: 'high',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 5,
      baseDelayMs: 2000,
      userMessage: 'Sin conexión a internet. Verifica tu conexión.',
      guidance: 'Revisa tu WiFi o datos móviles e intenta nuevamente.',
    },
    'CONNECTION_FAILED': {
      type: 'connectivity',
      severity: 'high',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 3,
      baseDelayMs: 1500,
      userMessage: 'No se pudo conectar al servidor.',
      guidance: 'Verifica tu conexión a internet y que no haya restricciones de red.',
    },
    'DNS_RESOLUTION_FAILED': {
      type: 'connectivity',
      severity: 'medium',
      retryable: true,
      retryStrategy: 'linear_backoff',
      maxRetries: 2,
      baseDelayMs: 3000,
      userMessage: 'Error de resolución de red.',
      guidance: 'Cambia a una red diferente o reinicia tu conexión.',
    },

    // Timeout Issues
    'TIMEOUT': {
      type: 'timeout',
      severity: 'medium',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 3,
      baseDelayMs: 2000,
      userMessage: 'La conexión tardó demasiado.',
      guidance: 'Tu conexión es lenta. Intenta desde una red más rápida.',
    },
    'REQUEST_TIMEOUT': {
      type: 'timeout',
      severity: 'medium',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 2,
      baseDelayMs: 3000,
      userMessage: 'Tiempo de espera agotado.',
      guidance: 'El servidor no respondió a tiempo. Intenta nuevamente.',
    },

    // Service Issues
    'SERVER_ERROR': {
      type: 'service',
      severity: 'high',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 2,
      baseDelayMs: 5000,
      userMessage: 'Error del servidor. Intenta más tarde.',
      guidance: 'Hay un problema temporal con el servicio. Espera unos minutos.',
    },
    'SERVICE_UNAVAILABLE': {
      type: 'service',
      severity: 'critical',
      retryable: true,
      retryStrategy: 'linear_backoff',
      maxRetries: 1,
      baseDelayMs: 10000,
      userMessage: 'Servicio temporalmente no disponible.',
      guidance: 'El servicio está en mantenimiento. Intenta más tarde.',
    },
    'BAD_GATEWAY': {
      type: 'service',
      severity: 'high',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 2,
      baseDelayMs: 3000,
      userMessage: 'Error de comunicación con el servidor.',
      guidance: 'Problema temporal del servidor. Intenta en unos minutos.',
    },

    // Authentication Issues
    'UNAUTHORIZED': {
      type: 'authentication',
      severity: 'medium',
      retryable: false,
      retryStrategy: 'no_retry',
      maxRetries: 0,
      baseDelayMs: 0,
      userMessage: 'Sesión expirada. Inicia sesión nuevamente.',
      guidance: 'Tu sesión ha caducado por seguridad. Vuelve a autenticarte.',
    },
    'FORBIDDEN': {
      type: 'authentication',
      severity: 'medium',
      retryable: false,
      retryStrategy: 'no_retry',
      maxRetries: 0,
      baseDelayMs: 0,
      userMessage: 'No tienes permisos para esta acción.',
      guidance: 'Contacta al administrador si necesitas acceso.',
    },

    // Rate Limiting
    'TOO_MANY_REQUESTS': {
      type: 'rate_limit',
      severity: 'medium',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 3,
      baseDelayMs: 5000,
      userMessage: 'Demasiadas solicitudes. Espera un momento.',
      guidance: 'Has hecho muchas solicitudes seguidas. Espera antes de continuar.',
    },
    'RATE_LIMITED': {
      type: 'rate_limit',
      severity: 'low',
      retryable: true,
      retryStrategy: 'linear_backoff',
      maxRetries: 2,
      baseDelayMs: 8000,
      userMessage: 'Límite de solicitudes alcanzado.',
      guidance: 'Espera unos segundos antes de intentar nuevamente.',
    },
  };

  constructor() {
    loggingService.info('NetworkErrorClassification', 'Network error classification service initialized', {
      config: this.config,
      supportedErrorTypes: Object.keys(this.errorClassifications).length,
    });
  }

  /**
   * Classify network error and determine handling strategy
   */
  async classifyError(error: any): Promise<NetworkErrorClassification> {
    try {
      loggingService.debug('NetworkErrorClassification', 'Classifying network error', {
        errorType: typeof error,
        hasMessage: !!(error && error.message),
        hasStatus: !!(error && error.status),
      });

      // Check network connectivity first
      const networkState = await NetInfo.fetch();
      const isConnected = networkState.isConnected ?? false;

      if (!isConnected) {
        return this.getConnectivityErrorClassification();
      }

      // Extract error information
      const errorCode = this.extractErrorCode(error);
      const statusCode = this.extractStatusCode(error);
      const errorMessage = this.extractErrorMessage(error);

      // Classify based on status code
      if (statusCode) {
        const statusClassification = this.classifyByStatusCode(statusCode);
        if (statusClassification) {
          return this.buildClassification(statusClassification, { statusCode, errorMessage });
        }
      }

      // Classify based on error code/type
      if (errorCode) {
        const codeClassification = this.classifyByErrorCode(errorCode);
        if (codeClassification) {
          return this.buildClassification(codeClassification, { errorCode, errorMessage });
        }
      }

      // Classify based on error message patterns
      const messageClassification = this.classifyByErrorMessage(errorMessage);
      return this.buildClassification(messageClassification, { errorMessage });

    } catch (classificationError: any) {
      console.error('Error classifying network error:', classificationError);
      loggingService.error('NetworkErrorClassification', 'Failed to classify error', { 
        error: classificationError.message 
      });

      return this.getUnknownErrorClassification();
    }
  }

  /**
   * Execute operation with retry logic based on error classification
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'network_operation'
  ): Promise<RetryResult<T>> {
    let lastError: any;
    let attemptCount = 0;
    let totalDelayMs = 0;
    const startTime = Date.now();

    loggingService.info('NetworkErrorClassification', `Starting ${operationName} with retry logic`, {
      maxRetries: this.config.maxRetries,
      baseDelayMs: this.config.baseDelayMs,
    });

    while (attemptCount <= this.config.maxRetries) {
      try {
        attemptCount++;
        
        loggingService.debug('NetworkErrorClassification', `Attempt ${attemptCount} for ${operationName}`);

        const result = await operation();
        
        loggingService.info('NetworkErrorClassification', `${operationName} succeeded`, {
          attemptCount,
          totalDelayMs,
          totalTimeMs: Date.now() - startTime,
        });

        return {
          success: true,
          result,
          attemptCount,
          totalDelayMs,
          classification: await this.classifyError(null), // Success classification
        };

      } catch (error: any) {
        lastError = error;
        
        loggingService.warn('NetworkErrorClassification', `Attempt ${attemptCount} failed for ${operationName}`, {
          error: error.message,
          attemptCount,
        });

        // Classify the error
        const classification = await this.classifyError(error);

        // Check if we should retry
        if (!classification.retryable || attemptCount > classification.maxRetries) {
          loggingService.info('NetworkErrorClassification', `No more retries for ${operationName}`, {
            retryable: classification.retryable,
            attemptCount,
            maxRetries: classification.maxRetries,
            errorType: classification.type,
          });

          return {
            success: false,
            error: lastError,
            attemptCount,
            totalDelayMs,
            classification,
          };
        }

        // Calculate delay for next attempt
        if (attemptCount <= classification.maxRetries) {
          const delay = this.calculateRetryDelay(
            attemptCount - 1, // 0-based for calculation
            classification.retryStrategy,
            classification.baseDelayMs
          );

          totalDelayMs += delay;

          loggingService.debug('NetworkErrorClassification', `Waiting ${delay}ms before retry ${attemptCount + 1}`, {
            retryStrategy: classification.retryStrategy,
            baseDelayMs: classification.baseDelayMs,
          });

          await this.delay(delay);
        }
      }
    }

    // This should not be reached, but included for completeness
    const finalClassification = await this.classifyError(lastError);
    return {
      success: false,
      error: lastError,
      attemptCount,
      totalDelayMs,
      classification: finalClassification,
    };
  }

  /**
   * Check if error is retryable based on classification
   */
  async isRetryableError(error: any): Promise<boolean> {
    const classification = await this.classifyError(error);
    return classification.retryable;
  }

  /**
   * Get user-friendly error message with guidance
   */
  async getErrorMessage(error: any): Promise<{ message: string; guidance: string }> {
    const classification = await this.classifyError(error);
    return {
      message: classification.userMessage,
      guidance: classification.guidance,
    };
  }

  /**
   * Update retry configuration
   */
  updateConfig(newConfig: Partial<RetryConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('NetworkErrorClassification', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  // Private helper methods

  private extractErrorCode(error: any): string | null {
    if (!error) return null;

    if (typeof error === 'string') {
      return this.parseErrorCodeFromString(error);
    }

    if (error && typeof error === 'object') {
      if (error.code) return error.code;
      if (error.name) return error.name;
      if (error.type) return error.type;
      if (error.errno) return `ERRNO_${error.errno}`;
    }

    return null;
  }

  private extractStatusCode(error: any): number | null {
    if (!error) return null;

    if (error && typeof error === 'object') {
      if (error.status) return error.status;
      if (error.statusCode) return error.statusCode;
      if (error.response && error.response.status) return error.response.status;
    }

    return null;
  }

  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error && error.message) return error.message;
    if (error && error.description) return error.description;
    return 'Unknown error';
  }

  private parseErrorCodeFromString(errorString: string): string | null {
    const patterns = [
      { pattern: /network|connection/i, code: 'NETWORK_ERROR' },
      { pattern: /timeout|timed out/i, code: 'TIMEOUT' },
      { pattern: /dns|resolution/i, code: 'DNS_RESOLUTION_FAILED' },
      { pattern: /server error|500/i, code: 'SERVER_ERROR' },
      { pattern: /service unavailable|503/i, code: 'SERVICE_UNAVAILABLE' },
      { pattern: /bad gateway|502/i, code: 'BAD_GATEWAY' },
      { pattern: /unauthorized|401/i, code: 'UNAUTHORIZED' },
      { pattern: /forbidden|403/i, code: 'FORBIDDEN' },
      { pattern: /too many requests|429/i, code: 'TOO_MANY_REQUESTS' },
    ];

    for (const { pattern, code } of patterns) {
      if (pattern.test(errorString)) {
        return code;
      }
    }

    return null;
  }

  private classifyByStatusCode(statusCode: number): Partial<NetworkErrorClassification> | null {
    const statusMappings: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      408: 'REQUEST_TIMEOUT',
      429: 'TOO_MANY_REQUESTS',
      500: 'SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };

    const errorCode = statusMappings[statusCode];
    if (errorCode && this.errorClassifications[errorCode]) {
      return this.errorClassifications[errorCode];
    }

    // General classification based on status code ranges
    if (statusCode >= 500) {
      return this.errorClassifications['SERVER_ERROR'];
    } else if (statusCode >= 400) {
      return this.errorClassifications['UNAUTHORIZED'];
    }

    return null;
  }

  private classifyByErrorCode(errorCode: string): Partial<NetworkErrorClassification> | null {
    const normalizedCode = errorCode.toUpperCase();
    
    if (this.errorClassifications[normalizedCode]) {
      return this.errorClassifications[normalizedCode];
    }

    // Check for partial matches
    for (const [key, classification] of Object.entries(this.errorClassifications)) {
      if (normalizedCode.includes(key) || key.includes(normalizedCode)) {
        return classification;
      }
    }

    return null;
  }

  private classifyByErrorMessage(message: string): Partial<NetworkErrorClassification> {
    const messageLower = message.toLowerCase();

    // Network connectivity patterns
    if (messageLower.includes('network') || messageLower.includes('connection')) {
      return this.errorClassifications['NETWORK_ERROR'];
    }

    // Timeout patterns
    if (messageLower.includes('timeout') || messageLower.includes('timed out')) {
      return this.errorClassifications['TIMEOUT'];
    }

    // Server error patterns
    if (messageLower.includes('server') || messageLower.includes('internal')) {
      return this.errorClassifications['SERVER_ERROR'];
    }

    // Default to unknown
    return {
      type: 'unknown',
      severity: 'medium',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 2,
      baseDelayMs: 2000,
      userMessage: 'Error de conexión inesperado.',
      guidance: 'Intenta nuevamente en unos momentos.',
    };
  }

  private buildClassification(
    baseClassification: Partial<NetworkErrorClassification>,
    context: { statusCode?: number; errorCode?: string; errorMessage?: string }
  ): NetworkErrorClassification {
    return {
      type: baseClassification.type || 'unknown',
      severity: baseClassification.severity || 'medium',
      retryable: baseClassification.retryable ?? true,
      retryStrategy: baseClassification.retryStrategy || 'exponential_backoff',
      maxRetries: baseClassification.maxRetries ?? this.config.maxRetries,
      baseDelayMs: baseClassification.baseDelayMs ?? this.config.baseDelayMs,
      userMessage: baseClassification.userMessage || 'Error de conexión.',
      guidance: baseClassification.guidance || 'Intenta nuevamente.',
      technicalDetails: context.errorMessage,
    };
  }

  private getConnectivityErrorClassification(): NetworkErrorClassification {
    return this.buildClassification(this.errorClassifications['NETWORK_ERROR'], {
      errorMessage: 'No network connectivity detected',
    });
  }

  private getUnknownErrorClassification(): NetworkErrorClassification {
    return {
      type: 'unknown',
      severity: 'medium',
      retryable: true,
      retryStrategy: 'exponential_backoff',
      maxRetries: 2,
      baseDelayMs: 2000,
      userMessage: 'Error de conexión inesperado.',
      guidance: 'Verifica tu conexión e intenta nuevamente.',
    };
  }

  private calculateRetryDelay(
    attemptNumber: number,
    strategy: NetworkErrorClassification['retryStrategy'],
    baseDelayMs: number
  ): number {
    let delay: number;

    switch (strategy) {
      case 'immediate':
        delay = 0;
        break;

      case 'linear_backoff':
        delay = baseDelayMs * (attemptNumber + 1);
        break;

      case 'exponential_backoff':
        delay = baseDelayMs * Math.pow(this.config.backoffMultiplier, attemptNumber);
        break;

      case 'no_retry':
      default:
        delay = 0;
        break;
    }

    // Apply jitter if enabled
    if (this.config.jitterEnabled && delay > 0) {
      const jitter = Math.random() * 0.1 * delay; // ±10% jitter
      delay += Math.random() > 0.5 ? jitter : -jitter;
    }

    // Ensure delay doesn't exceed maximum
    return Math.min(delay, this.config.maxDelayMs);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const networkErrorClassificationService = new NetworkErrorClassificationService();
export type { NetworkErrorClassification, RetryConfig, RetryResult };