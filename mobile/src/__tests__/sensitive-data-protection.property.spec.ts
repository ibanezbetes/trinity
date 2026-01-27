/**
 * Property Test 28: Sensitive Data Protection
 * Validates Requirements 10.3: Sensitive data protection and sanitization
 * 
 * This property test ensures that:
 * - Passwords and tokens are never logged in plain text
 * - Data sanitization works for all authentication logs
 * - Proper secret management for configuration
 * - Data classification and masking work correctly
 */

import fc from 'fast-check';
import { sensitiveDataProtectionService, SecretMetadata } from '../services/sensitiveDataProtectionService';

describe('Property Test 28: Sensitive Data Protection', () => {
  beforeEach(() => {
    // Configure for testing
    sensitiveDataProtectionService.updateConfig({
      enableSanitization: true,
      enableSecretManagement: true,
      enableDataClassification: true,
      sanitizationLevel: 'strict',
      logSanitizationEvents: false, // Avoid recursive logging in tests
      enableDataMasking: true,
      maskingCharacter: '*',
      preserveDataLength: true,
      enableSecretRotation: false, // Disabled for testing
      secretRotationIntervalMs: 60000,
    });
  });

  afterEach(() => {
    // Clean up registered secrets
    const secrets = sensitiveDataProtectionService.getRegisteredSecrets();
    // Note: In a real implementation, we'd have a method to clear secrets
  });

  /**
   * Property: Sensitive data is always sanitized
   */
  it('should sanitize all sensitive data patterns', () => {
    fc.assert(fc.property(
      fc.record({
        password: fc.string({ minLength: 8, maxLength: 50 }),
        token: fc.string({ minLength: 20, maxLength: 100 }),
        apiKey: fc.string({ minLength: 15, maxLength: 60 }),
        secret: fc.string({ minLength: 10, maxLength: 40 }),
        email: fc.emailAddress(),
        normalData: fc.string({ minLength: 5, maxLength: 30 }),
      }),
      ({ password, token, apiKey, secret, email, normalData }) => {
        const sensitiveData = {
          password: password,
          accessToken: token,
          api_key: apiKey,
          client_secret: secret,
          userEmail: email,
          normalField: normalData,
        };

        const result = sensitiveDataProtectionService.sanitizeData(sensitiveData);

        // Should detect sensitive data
        expect(result.hadSensitiveData).toBe(true);
        expect(result.sanitizedFields.length).toBeGreaterThan(0);
        expect(result.processingTime).toBeGreaterThanOrEqual(0);

        // Sensitive fields should be sanitized
        expect(result.sanitized.password).not.toBe(password);
        expect(result.sanitized.accessToken).not.toBe(token);
        expect(result.sanitized.api_key).not.toBe(apiKey);
        expect(result.sanitized.client_secret).not.toBe(secret);

        // Should contain redaction markers
        expect(result.sanitized.password).toContain('[REDACTED]');
        expect(result.sanitized.accessToken).toContain('[REDACTED]');

        // Normal data should remain unchanged
        expect(result.sanitized.normalField).toBe(normalData);
      }
    ), { numRuns: 30 });
  });

  /**
   * Property: Passwords are never logged in plain text
   */
  it('should never log passwords in plain text', () => {
    fc.assert(fc.property(
      fc.record({
        username: fc.string({ minLength: 3, maxLength: 20 }),
        password: fc.string({ minLength: 8, maxLength: 50 }),
        confirmPassword: fc.string({ minLength: 8, maxLength: 50 }),
        oldPassword: fc.string({ minLength: 8, maxLength: 50 }),
      }),
      ({ username, password, confirmPassword, oldPassword }) => {
        const loginData = {
          username,
          password,
          confirmPassword,
          oldPassword,
        };

        const result = sensitiveDataProtectionService.sanitizeData(loginData);

        // All password fields should be sanitized
        expect(result.sanitized.password).not.toBe(password);
        expect(result.sanitized.confirmPassword).not.toBe(confirmPassword);
        expect(result.sanitized.oldPassword).not.toBe(oldPassword);

        // Username should remain unchanged
        expect(result.sanitized.username).toBe(username);

        // Should detect multiple sensitive fields
        expect(result.sanitizedFields.length).toBeGreaterThanOrEqual(3);
        expect(result.hadSensitiveData).toBe(true);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Tokens are properly sanitized in various formats
   */
  it('should sanitize tokens in various formats', () => {
    fc.assert(fc.property(
      fc.record({
        bearerToken: fc.string({ minLength: 20, maxLength: 100 }),
        accessToken: fc.string({ minLength: 20, maxLength: 100 }),
        refreshToken: fc.string({ minLength: 20, maxLength: 100 }),
        idToken: fc.string({ minLength: 20, maxLength: 100 }),
      }),
      ({ bearerToken, accessToken, refreshToken, idToken }) => {
        // Test different token formats
        const tokenFormats = [
          `Bearer ${bearerToken}`,
          `{"accessToken": "${accessToken}"}`,
          `{"refreshToken": "${refreshToken}"}`,
          `{"idToken": "${idToken}"}`,
          `Authorization: Bearer ${bearerToken}`,
          `token=${accessToken}`,
        ];

        tokenFormats.forEach(tokenString => {
          const result = sensitiveDataProtectionService.sanitizeData(tokenString);

          expect(result.hadSensitiveData).toBe(true);
          expect(result.sanitized).not.toBe(tokenString);
          expect(result.sanitized).not.toContain(bearerToken);
          expect(result.sanitized).not.toContain(accessToken);
          expect(result.sanitized).not.toContain(refreshToken);
          expect(result.sanitized).not.toContain(idToken);
          expect(result.sanitized).toContain('[REDACTED');
        });
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Data classification works correctly
   */
  it('should classify data based on sensitivity levels', () => {
    fc.assert(fc.property(
      fc.record({
        publicData: fc.string({ minLength: 5, maxLength: 30 }),
        internalData: fc.emailAddress(),
        confidentialData: fc.string({ minLength: 10, maxLength: 40 }),
        secretData: fc.string({ minLength: 15, maxLength: 50 }),
        topSecretData: fc.string({ minLength: 8, maxLength: 30 }),
      }),
      ({ publicData, internalData, confidentialData, secretData, topSecretData }) => {
        // Test different classification levels
        const testCases = [
          {
            data: { message: publicData },
            expectedLevel: 'public',
            expectedEncryption: false,
          },
          {
            data: { email: internalData },
            expectedLevel: 'internal',
            expectedEncryption: false,
          },
          {
            data: { apiKey: confidentialData },
            expectedLevel: 'confidential',
            expectedEncryption: false,
          },
          {
            data: { token: secretData },
            expectedLevel: 'secret',
            expectedEncryption: true,
          },
          {
            data: { password: topSecretData },
            expectedLevel: 'top_secret',
            expectedEncryption: true,
          },
        ];

        testCases.forEach(({ data, expectedLevel, expectedEncryption }) => {
          const classification = sensitiveDataProtectionService.classifyData(data);

          expect(classification.level).toBe(expectedLevel);
          expect(classification.requiresEncryption).toBe(expectedEncryption);
          expect(classification.categories).toBeDefined();
          expect(Array.isArray(classification.categories)).toBe(true);
          expect(classification.accessRestrictions).toBeDefined();
          expect(Array.isArray(classification.accessRestrictions)).toBe(true);
        });
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Data masking preserves structure
   */
  it('should mask sensitive data while preserving structure', () => {
    fc.assert(fc.property(
      fc.record({
        password: fc.string({ minLength: 8, maxLength: 20 }),
        token: fc.string({ minLength: 15, maxLength: 40 }),
        normalField: fc.string({ minLength: 5, maxLength: 25 }),
        numberField: fc.integer({ min: 1, max: 1000 }),
      }),
      ({ password, token, normalField, numberField }) => {
        const data = {
          password,
          authToken: token,
          description: normalField,
          count: numberField,
        };

        const masked = sensitiveDataProtectionService.maskSensitiveData(data, true);

        // Sensitive fields should be masked
        expect(masked.password).not.toBe(password);
        expect(masked.authToken).not.toBe(token);
        expect(masked.password).toMatch(/^\*+$/); // Only asterisks
        expect(masked.authToken).toMatch(/^\*+$/); // Only asterisks

        // Length should be preserved
        expect(masked.password.length).toBe(password.length);
        expect(masked.authToken.length).toBe(token.length);

        // Non-sensitive fields should remain unchanged
        expect(masked.description).toBe(normalField);
        expect(masked.count).toBe(numberField);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Secret management works correctly
   */
  it('should manage secrets correctly', () => {
    fc.assert(fc.property(
      fc.record({
        secretId: fc.string({ minLength: 5, maxLength: 20 }),
        secretType: fc.constantFrom('password', 'token', 'key', 'certificate', 'other'),
        classification: fc.constantFrom('public', 'internal', 'confidential', 'secret', 'top_secret'),
        expirationHours: fc.integer({ min: 1, max: 168 }), // 1 hour to 1 week
      }),
      ({ secretId, secretType, classification, expirationHours }) => {
        const expiresAt = Date.now() + (expirationHours * 60 * 60 * 1000);

        // Register secret
        sensitiveDataProtectionService.registerSecret(
          secretId,
          secretType as SecretMetadata['type'],
          classification as SecretMetadata['classification'],
          expiresAt
        );

        // Verify secret is registered
        const secrets = sensitiveDataProtectionService.getRegisteredSecrets();
        const registeredSecret = secrets.find(s => s.id === secretId);

        expect(registeredSecret).toBeDefined();
        expect(registeredSecret!.type).toBe(secretType);
        expect(registeredSecret!.classification).toBe(classification);
        expect(registeredSecret!.expiresAt).toBe(expiresAt);
        expect(registeredSecret!.createdAt).toBeGreaterThan(0);
        expect(registeredSecret!.rotationRequired).toBe(false);

        // Check rotation status
        const rotationCheck = sensitiveDataProtectionService.checkSecretRotation(secretId);
        expect(rotationCheck.needsRotation).toBeDefined();
        expect(typeof rotationCheck.needsRotation).toBe('boolean');

        if (expirationHours <= 24) {
          // Should need rotation if expiring within 24 hours
          expect(rotationCheck.needsRotation).toBe(true);
          expect(rotationCheck.reason).toBeDefined();
        }

        // Mark as rotated
        const rotated = sensitiveDataProtectionService.markSecretRotated(secretId);
        expect(rotated).toBe(true);

        // Verify rotation was recorded
        const updatedSecrets = sensitiveDataProtectionService.getRegisteredSecrets();
        const rotatedSecret = updatedSecrets.find(s => s.id === secretId);
        expect(rotatedSecret!.lastRotated).toBeDefined();
        expect(rotatedSecret!.rotationRequired).toBe(false);
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Sanitization levels work correctly
   */
  it('should respect different sanitization levels', () => {
    fc.assert(fc.property(
      fc.record({
        level: fc.constantFrom('basic', 'strict', 'paranoid'),
        topSecretData: fc.string({ minLength: 8, maxLength: 30 }),
        secretData: fc.string({ minLength: 10, maxLength: 40 }),
        confidentialData: fc.string({ minLength: 5, maxLength: 25 }),
      }),
      ({ level, topSecretData, secretData, confidentialData }) => {
        // Update sanitization level
        sensitiveDataProtectionService.updateConfig({
          sanitizationLevel: level as 'basic' | 'strict' | 'paranoid',
        });

        const data = {
          password: topSecretData, // top_secret
          token: secretData, // secret
          apiKey: confidentialData, // confidential
        };

        const result = sensitiveDataProtectionService.sanitizeData(data);

        // All levels should sanitize top_secret data
        expect(result.sanitized.password).not.toBe(topSecretData);

        if (level === 'basic') {
          // Basic level only sanitizes top_secret
          // Note: Implementation may vary, but should be consistent
          expect(result.hadSensitiveData).toBe(true);
        } else if (level === 'strict') {
          // Strict level sanitizes top_secret and secret
          expect(result.sanitized.token).not.toBe(secretData);
        } else if (level === 'paranoid') {
          // Paranoid level sanitizes everything
          expect(result.sanitized.token).not.toBe(secretData);
          expect(result.sanitized.apiKey).not.toBe(confidentialData);
        }

        expect(result.sanitizationLevel).toBe(level);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Configuration changes affect behavior
   */
  it('should respect configuration changes', () => {
    fc.assert(fc.property(
      fc.record({
        enableSanitization: fc.boolean(),
        enableDataMasking: fc.boolean(),
        enableDataClassification: fc.boolean(),
        maskingChar: fc.constantFrom('*', '#', 'X', '-'),
        preserveLength: fc.boolean(),
      }),
      ({ enableSanitization, enableDataMasking, enableDataClassification, maskingChar, preserveLength }) => {
        // Update configuration
        sensitiveDataProtectionService.updateConfig({
          enableSanitization,
          enableDataMasking,
          enableDataClassification,
          maskingCharacter: maskingChar,
          preserveDataLength: preserveLength,
        });

        // Verify configuration was applied
        const currentConfig = sensitiveDataProtectionService.getConfig();
        expect(currentConfig.enableSanitization).toBe(enableSanitization);
        expect(currentConfig.enableDataMasking).toBe(enableDataMasking);
        expect(currentConfig.enableDataClassification).toBe(enableDataClassification);
        expect(currentConfig.maskingCharacter).toBe(maskingChar);
        expect(currentConfig.preserveDataLength).toBe(preserveLength);

        // Test behavior with new configuration
        const testData = { password: 'testPassword123' };

        const sanitizationResult = sensitiveDataProtectionService.sanitizeData(testData);
        if (enableSanitization) {
          expect(sanitizationResult.hadSensitiveData).toBe(true);
        } else {
          expect(sanitizationResult.hadSensitiveData).toBe(false);
          expect(sanitizationResult.sanitized).toEqual(testData);
        }

        const maskingResult = sensitiveDataProtectionService.maskSensitiveData(testData, preserveLength);
        if (enableDataMasking) {
          expect(maskingResult.password).not.toBe('testPassword123');
          if (preserveLength) {
            expect(maskingResult.password.length).toBe(15); // Length of 'testPassword123'
          }
          expect(maskingResult.password).toContain(maskingChar);
        } else {
          expect(maskingResult.password).toBe('testPassword123');
        }

        const classificationResult = sensitiveDataProtectionService.classifyData(testData);
        if (enableDataClassification) {
          expect(classificationResult.level).toBeDefined();
          expect(classificationResult.categories).toBeDefined();
        } else {
          expect(classificationResult.level).toBe('internal');
          expect(classificationResult.categories).toEqual([]);
        }
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Nested object sanitization works correctly
   */
  it('should sanitize nested objects correctly', () => {
    fc.assert(fc.property(
      fc.record({
        userPassword: fc.string({ minLength: 8, maxLength: 30 }),
        authToken: fc.string({ minLength: 20, maxLength: 50 }),
        userName: fc.string({ minLength: 3, maxLength: 20 }),
        userEmail: fc.emailAddress(),
      }),
      ({ userPassword, authToken, userName, userEmail }) => {
        const nestedData = {
          user: {
            name: userName,
            email: userEmail,
            credentials: {
              password: userPassword,
              token: authToken,
            },
          },
          metadata: {
            timestamp: Date.now(),
            version: '1.0.0',
          },
        };

        const result = sensitiveDataProtectionService.sanitizeData(nestedData);

        expect(result.hadSensitiveData).toBe(true);
        expect(result.sanitizedFields.length).toBeGreaterThan(0);

        // Nested sensitive data should be sanitized
        expect(result.sanitized.user.credentials.password).not.toBe(userPassword);
        expect(result.sanitized.user.credentials.token).not.toBe(authToken);

        // Non-sensitive nested data should remain unchanged
        expect(result.sanitized.user.name).toBe(userName);
        expect(result.sanitized.metadata.version).toBe('1.0.0');
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Statistics are accurate
   */
  it('should provide accurate protection statistics', () => {
    const stats = sensitiveDataProtectionService.getStats();

    // Verify statistics structure
    expect(stats.config).toBeDefined();
    expect(stats.registeredSecretsCount).toBeDefined();
    expect(stats.secretsNeedingRotation).toBeDefined();
    expect(stats.patternsCount).toBeDefined();
    expect(stats.fieldPatternsCount).toBeDefined();

    // Verify counts are reasonable
    expect(stats.registeredSecretsCount).toBeGreaterThanOrEqual(0);
    expect(stats.secretsNeedingRotation).toBeGreaterThanOrEqual(0);
    expect(stats.patternsCount).toBeGreaterThan(0);
    expect(stats.fieldPatternsCount).toBeGreaterThan(0);

    // Verify config matches current settings
    const currentConfig = sensitiveDataProtectionService.getConfig();
    expect(stats.config).toEqual(currentConfig);
  });

  /**
   * Property: Custom sanitization patterns work
   */
  it('should apply custom sanitization patterns', () => {
    fc.assert(fc.property(
      fc.record({
        customValue: fc.string({ minLength: 10, maxLength: 30 }),
        normalValue: fc.string({ minLength: 5, maxLength: 20 }),
      }),
      ({ customValue, normalValue }) => {
        const customPatterns = [
          {
            pattern: new RegExp(customValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            replacement: '[CUSTOM_REDACTED]',
          },
        ];

        const data = {
          customField: customValue,
          normalField: normalValue,
        };

        const result = sensitiveDataProtectionService.sanitizeData(data, customPatterns);

        expect(result.hadSensitiveData).toBe(true);
        expect(result.sanitized.customField).not.toBe(customValue);
        expect(result.sanitized.customField).toContain('[CUSTOM_REDACTED]');
        expect(result.sanitized.normalField).toBe(normalValue);
        expect(result.sanitizedFields).toContain('custom_pattern');
      }
    ), { numRuns: 15 });
  });
});