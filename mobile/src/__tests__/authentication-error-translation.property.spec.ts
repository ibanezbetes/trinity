/**
 * Property Test: Authentication Error Translation
 * 
 * Validates that user-friendly error message translation works for all Cognito error codes
 * and provides specific guidance for each error type while maintaining proper error logging.
 * Tests Requirements 1.4, 7.1: Authentication error translation
 */

import fc from 'fast-check';
import { cognitoErrorTranslationService, ErrorTranslation, TranslationConfig } from '../services/cognitoErrorTranslationService';

// Mock logging service
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Property Test: Authentication Error Translation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset service configuration
    cognitoErrorTranslationService.updateConfig({
      language: 'es',
      includeGuidance: true,
      logOriginalErrors: true,
      sanitizeSensitiveData: true,
    });
  });

  /**
   * Property 4.1: Error Code Recognition
   * For any supported Cognito error code, the service should provide appropriate translation
   */
  test('Property 4.1: Consistent error code recognition and translation', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          errorCode: fc.constantFrom(
            'NotAuthorizedException',
            'UserNotFoundException', 
            'UserNotConfirmedException',
            'PasswordResetRequiredException',
            'TooManyRequestsException',
            'LimitExceededException',
            'InvalidParameterException',
            'InvalidPasswordException',
            'UsernameExistsException',
            'NetworkError',
            'InternalErrorException',
            'TokenRefreshException',
            'ExpiredCodeException',
            'CodeMismatchException',
            'ResourceNotFoundException'
          ),
          errorFormat: fc.constantFrom('string', 'object_with_code', 'object_with_name', 'object_with_message'),
          language: fc.constantFrom('es', 'en'),
          includeGuidance: fc.boolean(),
        }),
        ({ errorCode, errorFormat, language, includeGuidance }) => {
          // Arrange: Configure service
          cognitoErrorTranslationService.updateConfig({ 
            language, 
            includeGuidance 
          });

          // Create error in different formats
          let mockError: any;
          switch (errorFormat) {
            case 'string':
              mockError = `Error: ${errorCode} - Some error message`;
              break;
            case 'object_with_code':
              mockError = { code: errorCode, message: 'Some error message' };
              break;
            case 'object_with_name':
              mockError = { name: errorCode, message: 'Some error message' };
              break;
            case 'object_with_message':
              mockError = { message: `${errorCode}: Some error message` };
              break;
          }

          // Act: Translate error
          const translation = cognitoErrorTranslationService.translateError(mockError);

          // Assert: Translation properties
          expect(translation.userMessage).toBeDefined();
          expect(translation.userMessage.length).toBeGreaterThan(0);
          expect(translation.severity).toMatch(/^(info|warning|error|critical)$/);
          expect(translation.category).toMatch(/^(authentication|network|validation|configuration|unknown)$/);
          expect(typeof translation.retryable).toBe('boolean');

          // Language-specific assertions
          if (language === 'es') {
            // Spanish messages should not contain common English words
            expect(translation.userMessage).not.toMatch(/\b(error|please|check|try|again)\b/i);
          } else {
            // English messages should not contain common Spanish words
            expect(translation.userMessage).not.toMatch(/\b(error|por favor|verifica|intenta|nuevamente)\b/i);
          }

          // Guidance should be included if configured
          if (includeGuidance) {
            expect(translation.guidance).toBeDefined();
            if (translation.guidance) {
              expect(translation.guidance.length).toBeGreaterThan(0);
            }
          }

          // Should have consistent error categorization
          const category = cognitoErrorTranslationService.getErrorCategory(mockError);
          const severity = cognitoErrorTranslationService.getErrorSeverity(mockError);
          const isRetryable = cognitoErrorTranslationService.isRetryableError(mockError);

          expect(category).toBe(translation.category);
          expect(severity).toBe(translation.severity);
          expect(isRetryable).toBe(translation.retryable);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4.2: Unknown Error Handling
   * For any unknown or malformed error, the service should provide fallback translation
   */
  test('Property 4.2: Graceful unknown error handling', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          unknownError: fc.oneof(
            fc.string({ minLength: 1, maxLength: 100 }),
            fc.record({
              randomField: fc.string(),
              anotherField: fc.integer(),
            }),
            fc.constant(null),
            fc.constant(undefined),
            fc.integer(),
            fc.boolean(),
          ),
          language: fc.constantFrom('es', 'en'),
        }),
        ({ unknownError, language }) => {
          // Arrange: Configure service
          cognitoErrorTranslationService.updateConfig({ language });

          // Act: Translate unknown error
          const translation = cognitoErrorTranslationService.translateError(unknownError);

          // Assert: Fallback translation properties
          expect(translation.userMessage).toBeDefined();
          expect(translation.userMessage.length).toBeGreaterThan(0);
          expect(translation.severity).toBe('error');
          expect(translation.category).toBe('unknown');
          expect(translation.retryable).toBe(true);

          // Should provide guidance for unknown errors
          expect(translation.guidance).toBeDefined();
          expect(translation.guidance!.length).toBeGreaterThan(0);

          // Language-specific fallback messages
          if (language === 'es') {
            expect(translation.userMessage).toContain('error inesperado');
          } else {
            expect(translation.userMessage).toContain('unexpected error');
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 4.3: Error Categorization Consistency
   * Error categorization should be consistent and logical across all error types
   */
  test('Property 4.3: Consistent error categorization logic', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          errorScenario: fc.constantFrom(
            { code: 'NotAuthorizedException', expectedCategory: 'authentication', expectedRetryable: true },
            { code: 'UserNotFoundException', expectedCategory: 'authentication', expectedRetryable: true },
            { code: 'InvalidPasswordException', expectedCategory: 'validation', expectedRetryable: true },
            { code: 'NetworkError', expectedCategory: 'network', expectedRetryable: true },
            { code: 'ResourceNotFoundException', expectedCategory: 'configuration', expectedRetryable: false },
            { code: 'TokenRefreshException', expectedCategory: 'authentication', expectedRetryable: false },
          ),
          errorFormat: fc.constantFrom('direct_code', 'in_message', 'as_object'),
        }),
        ({ errorScenario, errorFormat }) => {
          // Arrange: Create error in specified format
          let mockError: any;
          switch (errorFormat) {
            case 'direct_code':
              mockError = { code: errorScenario.code };
              break;
            case 'in_message':
              mockError = { message: `${errorScenario.code}: Error occurred` };
              break;
            case 'as_object':
              mockError = { name: errorScenario.code, message: 'Error details' };
              break;
          }

          // Act: Get error properties
          const category = cognitoErrorTranslationService.getErrorCategory(mockError);
          const isRetryable = cognitoErrorTranslationService.isRetryableError(mockError);
          const translation = cognitoErrorTranslationService.translateError(mockError);

          // Assert: Categorization consistency
          expect(category).toBe(errorScenario.expectedCategory);
          expect(isRetryable).toBe(errorScenario.expectedRetryable);
          expect(translation.category).toBe(errorScenario.expectedCategory);
          expect(translation.retryable).toBe(errorScenario.expectedRetryable);

          // Category-specific assertions
          switch (errorScenario.expectedCategory) {
            case 'authentication':
              expect(['warning', 'error']).toContain(translation.severity);
              break;
            case 'validation':
              expect(translation.severity).toBe('warning');
              break;
            case 'network':
              expect(translation.severity).toBe('error');
              break;
            case 'configuration':
              expect(translation.severity).toBe('critical');
              break;
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 4.4: Sensitive Data Sanitization
   * When logging is enabled, sensitive data should be properly sanitized
   */
  test('Property 4.4: Proper sensitive data sanitization', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          errorWithSensitiveData: fc.record({
            code: fc.constantFrom('NotAuthorizedException', 'InvalidParameterException'),
            message: fc.string({ minLength: 10, maxLength: 100 }),
            password: fc.string({ minLength: 8, maxLength: 20 }),
            token: fc.string({ minLength: 20, maxLength: 50 }),
            email: fc.emailAddress(),
          }),
          sanitizeSensitiveData: fc.boolean(),
          logOriginalErrors: fc.boolean(),
        }),
        ({ errorWithSensitiveData, sanitizeSensitiveData, logOriginalErrors }) => {
          // Arrange: Configure service
          cognitoErrorTranslationService.updateConfig({
            sanitizeSensitiveData,
            logOriginalErrors,
          });

          // Act: Translate error with sensitive data
          const translation = cognitoErrorTranslationService.translateError(errorWithSensitiveData);

          // Assert: Translation should work regardless of sensitive data
          expect(translation.userMessage).toBeDefined();
          expect(translation.userMessage.length).toBeGreaterThan(0);

          // Original error should be included only if logging is enabled
          if (logOriginalErrors) {
            expect(translation.originalError).toBeDefined();
            
            if (sanitizeSensitiveData && translation.originalError) {
              // Sensitive data should be redacted in logged error
              expect(translation.originalError).not.toContain(errorWithSensitiveData.password);
              expect(translation.originalError).not.toContain(errorWithSensitiveData.token);
              
              // Should contain redaction markers
              if (translation.originalError.includes('password') || 
                  translation.originalError.includes('token')) {
                expect(translation.originalError).toContain('[REDACTED]');
              }
            }
          } else {
            expect(translation.originalError).toBeUndefined();
          }

          // User message should never contain sensitive data
          expect(translation.userMessage).not.toContain(errorWithSensitiveData.password);
          expect(translation.userMessage).not.toContain(errorWithSensitiveData.token);
          expect(translation.userMessage).not.toContain(errorWithSensitiveData.email);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 4.5: Configuration Consistency
   * Service configuration changes should be applied consistently across all operations
   */
  test('Property 4.5: Configuration consistency across operations', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          config: fc.record({
            language: fc.constantFrom('es', 'en'),
            includeGuidance: fc.boolean(),
            logOriginalErrors: fc.boolean(),
            sanitizeSensitiveData: fc.boolean(),
          }),
          errorCode: fc.constantFrom('NotAuthorizedException', 'UserNotFoundException', 'NetworkError'),
        }),
        ({ config, errorCode }) => {
          // Arrange: Apply configuration
          cognitoErrorTranslationService.updateConfig(config);

          // Verify configuration was applied
          const currentConfig = cognitoErrorTranslationService.getConfig();
          expect(currentConfig.language).toBe(config.language);
          expect(currentConfig.includeGuidance).toBe(config.includeGuidance);
          expect(currentConfig.logOriginalErrors).toBe(config.logOriginalErrors);
          expect(currentConfig.sanitizeSensitiveData).toBe(config.sanitizeSensitiveData);

          // Act: Translate error with new configuration
          const mockError = { code: errorCode, message: 'Test error message' };
          const translation = cognitoErrorTranslationService.translateError(mockError);

          // Assert: Configuration effects
          // Language should affect message content
          if (config.language === 'es') {
            // Should contain Spanish words or patterns
            expect(translation.userMessage).toMatch(/[áéíóúñ]|verifica|intenta|contraseña|sesión/i);
          } else {
            // Should contain English words
            expect(translation.userMessage).toMatch(/check|try|password|session|please/i);
          }

          // Guidance inclusion should match configuration
          if (config.includeGuidance) {
            expect(translation.guidance).toBeDefined();
          }

          // Original error logging should match configuration
          if (config.logOriginalErrors) {
            expect(translation.originalError).toBeDefined();
          } else {
            expect(translation.originalError).toBeUndefined();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 4.6: Error Message Quality
   * All translated error messages should meet quality standards
   */
  test('Property 4.6: Error message quality standards', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          errorCode: fc.constantFrom(...cognitoErrorTranslationService.getSupportedErrorCodes()),
          language: fc.constantFrom('es', 'en'),
        }),
        ({ errorCode, language }) => {
          // Arrange: Configure service
          cognitoErrorTranslationService.updateConfig({ language, includeGuidance: true });

          // Act: Translate error
          const mockError = { code: errorCode };
          const translation = cognitoErrorTranslationService.translateError(mockError);

          // Assert: Message quality properties
          // User message quality
          expect(translation.userMessage).toBeDefined();
          expect(translation.userMessage.length).toBeGreaterThan(5);
          expect(translation.userMessage.length).toBeLessThan(200);
          expect(translation.userMessage.trim()).toBe(translation.userMessage); // No leading/trailing whitespace
          expect(translation.userMessage).toMatch(/^[A-ZÁÉÍÓÚÑ]/); // Starts with capital letter
          expect(translation.userMessage).toMatch(/[.!]$/); // Ends with punctuation

          // Guidance quality (if present)
          if (translation.guidance) {
            expect(translation.guidance.length).toBeGreaterThan(10);
            expect(translation.guidance.length).toBeLessThan(300);
            expect(translation.guidance.trim()).toBe(translation.guidance);
            expect(translation.guidance).toMatch(/^[A-ZÁÉÍÓÚÑ]/);
            expect(translation.guidance).toMatch(/[.!]$/);
          }

          // Should not contain technical jargon in user message
          expect(translation.userMessage).not.toMatch(/exception|null|undefined|stack|trace/i);
          
          // Should not contain placeholder text
          expect(translation.userMessage).not.toMatch(/\[.*\]|{.*}|TODO|FIXME/i);
          
          // Should be actionable (contain verbs or instructions)
          const actionWords = language === 'es' 
            ? /verifica|revisa|intenta|usa|contacta|espera|solicita/i
            : /check|verify|try|use|contact|wait|request/i;
          
          const hasActionInMessage = actionWords.test(translation.userMessage);
          const hasActionInGuidance = translation.guidance ? actionWords.test(translation.guidance) : false;
          
          expect(hasActionInMessage || hasActionInGuidance).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });
});