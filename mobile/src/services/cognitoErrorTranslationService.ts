/**
 * Cognito Error Translation Service
 * Provides user-friendly error message translation for all Cognito error codes
 * and specific guidance for each error type while maintaining proper error logging
 */

import { loggingService } from './loggingService';

export interface ErrorTranslation {
  userMessage: string; // User-friendly message
  guidance?: string; // Specific guidance for the user
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'authentication' | 'network' | 'validation' | 'configuration' | 'unknown';
  retryable: boolean;
}

export interface TranslationConfig {
  language: 'es' | 'en';
  includeGuidance: boolean;
  logOriginalErrors: boolean;
  sanitizeSensitiveData: boolean;
}

class CognitoErrorTranslationService {
  private config: TranslationConfig = {
    language: 'es',
    includeGuidance: true,
    logOriginalErrors: true,
    sanitizeSensitiveData: true,
  };

  // Cognito error code mappings
  private readonly errorTranslations: Record<string, Record<'es' | 'en', ErrorTranslation>> = {
    // Authentication Errors
    'NotAuthorizedException': {
      es: {
        userMessage: 'Credenciales incorrectas. Verifica tu email y contraseña.',
        guidance: 'Asegúrate de escribir correctamente tu email y contraseña. Si olvidaste tu contraseña, usa la opción "Olvidé mi contraseña".',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
      en: {
        userMessage: 'Incorrect credentials. Please check your email and password.',
        guidance: 'Make sure you enter your email and password correctly. If you forgot your password, use the "Forgot Password" option.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
    },
    'UserNotFoundException': {
      es: {
        userMessage: 'No se encontró una cuenta con este email.',
        guidance: 'Verifica que el email sea correcto o regístrate si no tienes una cuenta.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
      en: {
        userMessage: 'No account found with this email.',
        guidance: 'Check that the email is correct or sign up if you don\'t have an account.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
    },
    'UserNotConfirmedException': {
      es: {
        userMessage: 'Tu cuenta no ha sido confirmada.',
        guidance: 'Revisa tu email para el código de confirmación o solicita uno nuevo.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
      en: {
        userMessage: 'Your account has not been confirmed.',
        guidance: 'Check your email for the confirmation code or request a new one.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
    },
    'PasswordResetRequiredException': {
      es: {
        userMessage: 'Necesitas restablecer tu contraseña.',
        guidance: 'Tu contraseña debe ser restablecida por seguridad. Usa la opción "Olvidé mi contraseña".',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
      en: {
        userMessage: 'You need to reset your password.',
        guidance: 'Your password must be reset for security. Use the "Forgot Password" option.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
    },
    'TooManyRequestsException': {
      es: {
        userMessage: 'Demasiados intentos. Espera un momento antes de intentar de nuevo.',
        guidance: 'Has realizado muchos intentos seguidos. Espera unos minutos antes de volver a intentar.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
      en: {
        userMessage: 'Too many attempts. Please wait before trying again.',
        guidance: 'You have made too many consecutive attempts. Wait a few minutes before trying again.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
    },
    'LimitExceededException': {
      es: {
        userMessage: 'Se ha excedido el límite de intentos.',
        guidance: 'Has superado el límite permitido. Espera antes de intentar nuevamente.',
        severity: 'error',
        category: 'authentication',
        retryable: true,
      },
      en: {
        userMessage: 'Attempt limit exceeded.',
        guidance: 'You have exceeded the allowed limit. Please wait before trying again.',
        severity: 'error',
        category: 'authentication',
        retryable: true,
      },
    },

    // Validation Errors
    'InvalidParameterException': {
      es: {
        userMessage: 'Los datos ingresados no son válidos.',
        guidance: 'Revisa que todos los campos estén completos y en el formato correcto.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
      en: {
        userMessage: 'The entered data is not valid.',
        guidance: 'Check that all fields are complete and in the correct format.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
    },
    'InvalidPasswordException': {
      es: {
        userMessage: 'La contraseña no cumple con los requisitos.',
        guidance: 'La contraseña debe tener al menos 8 caracteres, incluir mayúsculas, minúsculas, números y símbolos.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
      en: {
        userMessage: 'Password does not meet requirements.',
        guidance: 'Password must be at least 8 characters long and include uppercase, lowercase, numbers, and symbols.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
    },
    'UsernameExistsException': {
      es: {
        userMessage: 'Ya existe una cuenta con este email.',
        guidance: 'Usa un email diferente o inicia sesión si ya tienes una cuenta.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
      en: {
        userMessage: 'An account with this email already exists.',
        guidance: 'Use a different email or sign in if you already have an account.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
    },

    // Network and Service Errors
    'NetworkError': {
      es: {
        userMessage: 'Error de conexión. Verifica tu internet.',
        guidance: 'Revisa tu conexión a internet e intenta nuevamente.',
        severity: 'error',
        category: 'network',
        retryable: true,
      },
      en: {
        userMessage: 'Connection error. Check your internet.',
        guidance: 'Check your internet connection and try again.',
        severity: 'error',
        category: 'network',
        retryable: true,
      },
    },
    'InternalErrorException': {
      es: {
        userMessage: 'Error interno del servidor. Intenta más tarde.',
        guidance: 'Ocurrió un problema temporal. Espera unos minutos e intenta nuevamente.',
        severity: 'error',
        category: 'network',
        retryable: true,
      },
      en: {
        userMessage: 'Internal server error. Please try later.',
        guidance: 'A temporary problem occurred. Wait a few minutes and try again.',
        severity: 'error',
        category: 'network',
        retryable: true,
      },
    },

    // Token and Session Errors
    'TokenRefreshException': {
      es: {
        userMessage: 'Tu sesión ha expirado. Inicia sesión nuevamente.',
        guidance: 'Por seguridad, necesitas iniciar sesión de nuevo.',
        severity: 'warning',
        category: 'authentication',
        retryable: false,
      },
      en: {
        userMessage: 'Your session has expired. Please sign in again.',
        guidance: 'For security, you need to sign in again.',
        severity: 'warning',
        category: 'authentication',
        retryable: false,
      },
    },
    'ExpiredCodeException': {
      es: {
        userMessage: 'El código ha expirado.',
        guidance: 'Solicita un nuevo código de verificación.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
      en: {
        userMessage: 'The code has expired.',
        guidance: 'Request a new verification code.',
        severity: 'warning',
        category: 'authentication',
        retryable: true,
      },
    },
    'CodeMismatchException': {
      es: {
        userMessage: 'El código ingresado es incorrecto.',
        guidance: 'Verifica el código en tu email o solicita uno nuevo.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
      en: {
        userMessage: 'The entered code is incorrect.',
        guidance: 'Check the code in your email or request a new one.',
        severity: 'warning',
        category: 'validation',
        retryable: true,
      },
    },

    // Configuration Errors
    'ResourceNotFoundException': {
      es: {
        userMessage: 'Error de configuración del servicio.',
        guidance: 'Contacta al soporte técnico si el problema persiste.',
        severity: 'critical',
        category: 'configuration',
        retryable: false,
      },
      en: {
        userMessage: 'Service configuration error.',
        guidance: 'Contact technical support if the problem persists.',
        severity: 'critical',
        category: 'configuration',
        retryable: false,
      },
    },
  };

  constructor() {
    loggingService.info('CognitoErrorTranslation', 'Cognito error translation service initialized', {
      language: this.config.language,
      supportedErrorCodes: Object.keys(this.errorTranslations).length,
    });
  }

  /**
   * Translate Cognito error to user-friendly message
   */
  translateError(error: any): ErrorTranslation & { originalError?: string } {
    try {
      // Extract error code and message
      const errorCode = this.extractErrorCode(error);
      const originalMessage = this.extractErrorMessage(error);

      // Log original error if enabled
      if (this.config.logOriginalErrors) {
        const sanitizedError = this.config.sanitizeSensitiveData 
          ? this.sanitizeErrorForLogging(error)
          : error;

        loggingService.warn('CognitoErrorTranslation', 'Translating Cognito error', {
          errorCode,
          originalMessage: sanitizedError,
          hasTranslation: !!this.errorTranslations[errorCode],
        });
      }

      // Get translation
      const translation = this.getTranslation(errorCode);
      
      // Return translation with original error for debugging
      return {
        ...translation,
        originalError: this.config.logOriginalErrors ? originalMessage : undefined,
      };

    } catch (translationError: any) {
      console.error('Error translating Cognito error:', translationError);
      loggingService.error('CognitoErrorTranslation', 'Failed to translate error', { 
        error: translationError.message 
      });

      // Return fallback translation
      return this.getFallbackTranslation();
    }
  }

  /**
   * Get specific error guidance based on error type
   */
  getErrorGuidance(errorCode: string): string | undefined {
    const translation = this.errorTranslations[errorCode];
    if (translation && translation[this.config.language]) {
      return this.config.includeGuidance 
        ? translation[this.config.language].guidance 
        : undefined;
    }
    return undefined;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: any): boolean {
    const errorCode = this.extractErrorCode(error);
    const translation = this.errorTranslations[errorCode];
    
    if (translation && translation[this.config.language]) {
      return translation[this.config.language].retryable;
    }
    
    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Get error category for handling logic
   */
  getErrorCategory(error: any): ErrorTranslation['category'] {
    const errorCode = this.extractErrorCode(error);
    const translation = this.errorTranslations[errorCode];
    
    if (translation && translation[this.config.language]) {
      return translation[this.config.language].category;
    }
    
    return 'unknown';
  }

  /**
   * Get error severity level
   */
  getErrorSeverity(error: any): ErrorTranslation['severity'] {
    const errorCode = this.extractErrorCode(error);
    const translation = this.errorTranslations[errorCode];
    
    if (translation && translation[this.config.language]) {
      return translation[this.config.language].severity;
    }
    
    return 'error';
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TranslationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('CognitoErrorTranslation', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): TranslationConfig {
    return { ...this.config };
  }

  /**
   * Get all supported error codes
   */
  getSupportedErrorCodes(): string[] {
    return Object.keys(this.errorTranslations);
  }

  // Private helper methods

  private extractErrorCode(error: any): string {
    // Handle different error formats
    if (typeof error === 'string') {
      return this.parseErrorCodeFromString(error);
    }

    if (error && typeof error === 'object') {
      // AWS Cognito error format
      if (error.code) return error.code;
      if (error.name) return error.name;
      if (error.__type) return error.__type;
      
      // Amplify error format
      if (error.message) {
        return this.parseErrorCodeFromString(error.message);
      }
    }

    return 'UnknownError';
  }

  private extractErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error && typeof error === 'object') {
      if (error.message) return error.message;
      if (error.errorMessage) return error.errorMessage;
      if (error.description) return error.description;
    }

    return 'Unknown error occurred';
  }

  private parseErrorCodeFromString(errorString: string): string {
    // Common patterns in Cognito error messages
    const patterns = [
      /NotAuthorizedException/,
      /UserNotFoundException/,
      /UserNotConfirmedException/,
      /PasswordResetRequiredException/,
      /TooManyRequestsException/,
      /LimitExceededException/,
      /InvalidParameterException/,
      /InvalidPasswordException/,
      /UsernameExistsException/,
      /InternalErrorException/,
      /ExpiredCodeException/,
      /CodeMismatchException/,
      /ResourceNotFoundException/,
    ];

    for (const pattern of patterns) {
      const match = errorString.match(pattern);
      if (match) {
        return match[0];
      }
    }

    // Check for network errors
    if (errorString.toLowerCase().includes('network') || 
        errorString.toLowerCase().includes('connection') ||
        errorString.toLowerCase().includes('timeout')) {
      return 'NetworkError';
    }

    // Check for token refresh errors
    if (errorString.toLowerCase().includes('token') && 
        (errorString.toLowerCase().includes('expired') || 
         errorString.toLowerCase().includes('invalid'))) {
      return 'TokenRefreshException';
    }

    return 'UnknownError';
  }

  private getTranslation(errorCode: string): ErrorTranslation {
    const translation = this.errorTranslations[errorCode];
    
    if (translation && translation[this.config.language]) {
      return translation[this.config.language];
    }

    // Return fallback translation for unknown errors
    return this.getFallbackTranslation();
  }

  private getFallbackTranslation(): ErrorTranslation {
    const fallbackTranslations = {
      es: {
        userMessage: 'Ocurrió un error inesperado.',
        guidance: 'Intenta nuevamente en unos momentos. Si el problema persiste, contacta al soporte.',
        severity: 'error' as const,
        category: 'unknown' as const,
        retryable: true,
      },
      en: {
        userMessage: 'An unexpected error occurred.',
        guidance: 'Please try again in a few moments. If the problem persists, contact support.',
        severity: 'error' as const,
        category: 'unknown' as const,
        retryable: true,
      },
    };

    return fallbackTranslations[this.config.language];
  }

  private sanitizeErrorForLogging(error: any): any {
    if (!this.config.sanitizeSensitiveData) {
      return error;
    }

    try {
      // Convert to string for processing
      let errorStr = typeof error === 'string' ? error : JSON.stringify(error);

      // Remove sensitive patterns
      const sensitivePatterns = [
        /password["\s]*[:=]["\s]*[^",\s}]+/gi,
        /token["\s]*[:=]["\s]*[^",\s}]+/gi,
        /secret["\s]*[:=]["\s]*[^",\s}]+/gi,
        /key["\s]*[:=]["\s]*[^",\s}]+/gi,
        /email["\s]*[:=]["\s]*[^",\s}]+/gi,
      ];

      sensitivePatterns.forEach(pattern => {
        errorStr = errorStr.replace(pattern, (match) => {
          const parts = match.split(/[:=]/);
          return parts[0] + (parts[0].includes(':') ? ':' : '=') + '"[REDACTED]"';
        });
      });

      return errorStr;

    } catch (sanitizeError) {
      console.warn('Error sanitizing error for logging:', sanitizeError);
      return '[ERROR_SANITIZATION_FAILED]';
    }
  }
}

export const cognitoErrorTranslationService = new CognitoErrorTranslationService();
export type { ErrorTranslation, TranslationConfig };