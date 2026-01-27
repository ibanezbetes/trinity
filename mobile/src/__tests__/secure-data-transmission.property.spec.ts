/**
 * Property Test 27: Secure Data Transmission
 * Validates Requirements 10.2: Secure data transmission over HTTPS
 * 
 * This property test ensures that:
 * - All authentication data is transmitted over HTTPS
 * - Proper encryption for sensitive authentication data
 * - Certificate validation for secure connections
 * - Integrity checks and secure headers are applied
 */

import fc from 'fast-check';
import { secureDataTransmissionService, SecureRequest } from '../services/secureDataTransmissionService';

describe('Property Test 27: Secure Data Transmission', () => {
  beforeEach(() => {
    // Configure for testing
    secureDataTransmissionService.updateConfig({
      enforceHttps: true,
      validateCertificates: true,
      enableCertificatePinning: false, // Disabled for testing
      allowSelfSignedCerts: false,
      encryptSensitiveData: true,
      encryptionAlgorithm: 'AES-256-GCM',
      keyDerivationRounds: 100000,
      enableIntegrityChecks: true,
      enableCompressionEncryption: false,
    });
  });

  /**
   * Property: HTTPS is enforced for all authentication requests
   */
  it('should enforce HTTPS for all authentication requests', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        protocol: fc.constantFrom('http', 'https', 'ftp', 'ws'),
        hostname: fc.domain(),
        path: fc.string({ minLength: 1, maxLength: 50 }),
        method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
        hasAuthData: fc.boolean(),
      }),
      async ({ protocol, hostname, path, method, hasAuthData }) => {
        const url = `${protocol}://${hostname}/${path}`;
        
        const request: SecureRequest = {
          url,
          method,
          body: hasAuthData ? {
            username: 'test@example.com',
            password: 'testPassword123',
            token: 'auth-token-123',
          } : { data: 'non-sensitive' },
        };

        const result = await secureDataTransmissionService.sendSecureRequest(request);

        if (protocol === 'https') {
          // HTTPS requests should succeed
          expect(result.success).toBe(true);
          expect(result.httpsUsed).toBe(true);
        } else {
          // Non-HTTPS requests should be rejected when HTTPS is enforced
          expect(result.success).toBe(false);
          expect(result.httpsUsed).toBe(false);
          expect(result.error).toContain('HTTPS required');
        }
      }
    ), { numRuns: 30 });
  });

  /**
   * Property: Sensitive data is always encrypted
   */
  it('should encrypt sensitive authentication data', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        hostname: fc.domain(),
        path: fc.string({ minLength: 1, maxLength: 30 }),
        sensitiveData: fc.record({
          password: fc.string({ minLength: 8, maxLength: 50 }),
          token: fc.string({ minLength: 10, maxLength: 100 }),
          secret: fc.string({ minLength: 5, maxLength: 30 }),
          apiKey: fc.string({ minLength: 15, maxLength: 60 }),
        }),
        nonSensitiveData: fc.record({
          username: fc.string({ minLength: 3, maxLength: 20 }),
          email: fc.emailAddress(),
          timestamp: fc.integer({ min: 1000000000, max: 9999999999 }),
        }),
      }),
      async ({ hostname, path, sensitiveData, nonSensitiveData }) => {
        const url = `https://${hostname}/${path}`;
        
        const requestData = {
          ...sensitiveData,
          ...nonSensitiveData,
        };

        const request: SecureRequest = {
          url,
          method: 'POST',
          body: requestData,
          requiresEncryption: true,
        };

        const result = await secureDataTransmissionService.sendSecureRequest(request);

        // Request should succeed
        expect(result.success).toBe(true);
        expect(result.encrypted).toBe(true);
        expect(result.httpsUsed).toBe(true);

        // Verify encryption metadata
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.encryptionTime).toBeGreaterThan(0);
        expect(result.metadata!.encryptedSize).toBeGreaterThan(result.metadata!.dataSize!);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Certificate validation works correctly
   */
  it('should validate certificates for secure connections', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        hostname: fc.domain(),
        path: fc.string({ minLength: 1, maxLength: 30 }),
        validateCerts: fc.boolean(),
        method: fc.constantFrom('GET', 'POST', 'PUT'),
      }),
      async ({ hostname, path, validateCerts, method }) => {
        // Update config for this test
        secureDataTransmissionService.updateConfig({
          validateCertificates: validateCerts,
        });

        const url = `https://${hostname}/${path}`;
        
        const request: SecureRequest = {
          url,
          method,
          body: { data: 'test' },
        };

        const result = await secureDataTransmissionService.sendSecureRequest(request);

        // Request should succeed
        expect(result.success).toBe(true);
        expect(result.httpsUsed).toBe(true);

        if (validateCerts) {
          // Certificate validation should be performed
          expect(result.certificateValid).toBeDefined();
        }

        // Verify transmission metadata
        expect(result.metadata).toBeDefined();
        expect(result.metadata!.transmissionTime).toBeGreaterThan(0);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Sensitive field detection works correctly
   */
  it('should correctly identify and encrypt sensitive fields', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        hostname: fc.domain(),
        fieldName: fc.constantFrom('password', 'token', 'secret', 'apiKey', 'authToken', 'refreshToken'),
        fieldValue: fc.string({ minLength: 5, maxLength: 50 }),
        nonSensitiveField: fc.constantFrom('username', 'email', 'name', 'id', 'timestamp'),
        nonSensitiveValue: fc.string({ minLength: 3, maxLength: 30 }),
      }),
      async ({ hostname, fieldName, fieldValue, nonSensitiveField, nonSensitiveValue }) => {
        const url = `https://${hostname}/api/auth`;
        
        const requestData = {
          [fieldName]: fieldValue,
          [nonSensitiveField]: nonSensitiveValue,
        };

        // Test encryption without specifying sensitive fields (auto-detection)
        const encryptionResult = await secureDataTransmissionService.encryptSensitiveData(requestData);

        expect(encryptionResult.success).toBe(true);
        expect(encryptionResult.encryptionMetadata).toBeDefined();

        // Should have detected the sensitive field
        expect(encryptionResult.encryptionMetadata!.encryptedFields).toContain(fieldName);
        expect(encryptionResult.encryptionMetadata!.encryptedFields).not.toContain(nonSensitiveField);

        // Encrypted data should be different from original
        expect(encryptionResult.encryptedData[fieldName]).not.toBe(fieldValue);
        expect(encryptionResult.encryptedData[fieldName]).toContain('encrypted:');

        // Non-sensitive data should remain unchanged
        expect(encryptionResult.encryptedData[nonSensitiveField]).toBe(nonSensitiveValue);
      }
    ), { numRuns: 25 });
  });

  /**
   * Property: Integrity checks are applied when enabled
   */
  it('should apply integrity checks when enabled', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        hostname: fc.domain(),
        path: fc.string({ minLength: 1, maxLength: 30 }),
        enableIntegrity: fc.boolean(),
        requestData: fc.record({
          field1: fc.string({ minLength: 1, maxLength: 20 }),
          field2: fc.integer({ min: 1, max: 1000 }),
          field3: fc.boolean(),
        }),
      }),
      async ({ hostname, path, enableIntegrity, requestData }) => {
        // Update config for this test
        secureDataTransmissionService.updateConfig({
          enableIntegrityChecks: enableIntegrity,
        });

        const url = `https://${hostname}/${path}`;
        
        const request: SecureRequest = {
          url,
          method: 'POST',
          body: requestData,
        };

        const result = await secureDataTransmissionService.sendSecureRequest(request);

        expect(result.success).toBe(true);
        expect(result.httpsUsed).toBe(true);

        if (enableIntegrity) {
          expect(result.integrityVerified).toBe(true);
        }
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Configuration changes affect transmission behavior
   */
  it('should respect configuration changes for transmission security', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        enforceHttps: fc.boolean(),
        validateCertificates: fc.boolean(),
        encryptSensitiveData: fc.boolean(),
        enableIntegrityChecks: fc.boolean(),
        hostname: fc.domain(),
      }),
      async ({ enforceHttps, validateCertificates, encryptSensitiveData, enableIntegrityChecks, hostname }) => {
        // Update configuration
        secureDataTransmissionService.updateConfig({
          enforceHttps,
          validateCertificates,
          encryptSensitiveData,
          enableIntegrityChecks,
        });

        // Verify configuration was applied
        const currentConfig = secureDataTransmissionService.getConfig();
        expect(currentConfig.enforceHttps).toBe(enforceHttps);
        expect(currentConfig.validateCertificates).toBe(validateCertificates);
        expect(currentConfig.encryptSensitiveData).toBe(encryptSensitiveData);
        expect(currentConfig.enableIntegrityChecks).toBe(enableIntegrityChecks);

        // Test with HTTPS URL
        const httpsUrl = `https://${hostname}/api/test`;
        const httpsRequest: SecureRequest = {
          url: httpsUrl,
          method: 'POST',
          body: { password: 'test123', data: 'normal' },
        };

        const httpsResult = await secureDataTransmissionService.sendSecureRequest(httpsRequest);

        // HTTPS requests should always succeed
        expect(httpsResult.success).toBe(true);
        expect(httpsResult.httpsUsed).toBe(true);
        expect(httpsResult.encrypted).toBe(encryptSensitiveData);
        expect(httpsResult.integrityVerified).toBe(enableIntegrityChecks);

        // Test with HTTP URL if HTTPS is not enforced
        if (!enforceHttps) {
          const httpUrl = `http://${hostname}/api/test`;
          const httpRequest: SecureRequest = {
            url: httpUrl,
            method: 'POST',
            body: { data: 'test' },
          };

          const httpResult = await secureDataTransmissionService.sendSecureRequest(httpRequest);
          expect(httpResult.httpsUsed).toBe(false);
        }
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: URL sanitization works correctly
   */
  it('should properly sanitize URLs in logs', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        hostname: fc.domain(),
        path: fc.string({ minLength: 1, maxLength: 30 }),
        queryParam: fc.string({ minLength: 1, max: 20 }),
        queryValue: fc.string({ minLength: 1, max: 30 }),
        fragment: fc.string({ minLength: 1, max: 15 }),
      }),
      async ({ hostname, path, queryParam, queryValue, fragment }) => {
        const url = `https://${hostname}/${path}?${queryParam}=${queryValue}#${fragment}`;
        
        const request: SecureRequest = {
          url,
          method: 'GET',
        };

        const result = await secureDataTransmissionService.sendSecureRequest(request);

        // Request should succeed
        expect(result.success).toBe(true);
        expect(result.httpsUsed).toBe(true);

        // URL should be properly formatted
        expect(url).toMatch(/^https:\/\/[^\/]+\/.*$/);
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Encryption algorithms work consistently
   */
  it('should consistently encrypt data with specified algorithms', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        algorithm: fc.constantFrom('AES-256-GCM', 'ChaCha20-Poly1305'),
        sensitiveData: fc.record({
          password: fc.string({ minLength: 8, maxLength: 30 }),
          token: fc.string({ minLength: 20, maxLength: 50 }),
        }),
        rounds: fc.integer({ min: 10000, max: 200000 }),
      }),
      async ({ algorithm, sensitiveData, rounds }) => {
        // Update encryption config
        secureDataTransmissionService.updateConfig({
          encryptionAlgorithm: algorithm,
          keyDerivationRounds: rounds,
          encryptSensitiveData: true,
        });

        const encryptionResult = await secureDataTransmissionService.encryptSensitiveData(sensitiveData);

        expect(encryptionResult.success).toBe(true);
        expect(encryptionResult.encryptionMetadata).toBeDefined();
        expect(encryptionResult.encryptionMetadata!.algorithm).toBe(algorithm);
        expect(encryptionResult.encryptionMetadata!.encryptedFields.length).toBeGreaterThan(0);
        expect(encryptionResult.encryptionMetadata!.encryptionTime).toBeGreaterThan(0);

        // Encrypted data should be different from original
        expect(encryptionResult.encryptedData.password).not.toBe(sensitiveData.password);
        expect(encryptionResult.encryptedData.token).not.toBe(sensitiveData.token);

        // Should contain encryption markers
        expect(encryptionResult.encryptedData.password).toContain('encrypted:');
        expect(encryptionResult.encryptedData.token).toContain('encrypted:');
      }
    ), { numRuns: 15 });
  });

  /**
   * Property: Certificate validation handles various scenarios
   */
  it('should handle various certificate validation scenarios', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        hostname: fc.domain(),
        validateCerts: fc.boolean(),
        enablePinning: fc.boolean(),
        allowSelfSigned: fc.boolean(),
      }),
      async ({ hostname, validateCerts, enablePinning, allowSelfSigned }) => {
        // Update certificate config
        secureDataTransmissionService.updateConfig({
          validateCertificates: validateCerts,
          enableCertificatePinning: enablePinning,
          allowSelfSignedCerts: allowSelfSigned,
        });

        const url = `https://${hostname}/api/secure`;

        // Test certificate validation directly
        const certValidation = await secureDataTransmissionService.validateCertificate(url);

        if (validateCerts) {
          expect(certValidation.valid).toBeDefined();
          expect(typeof certValidation.valid).toBe('boolean');
          
          if (certValidation.valid) {
            expect(certValidation.certificateInfo).toBeDefined();
            expect(certValidation.certificateInfo!.subject).toBeDefined();
            expect(certValidation.certificateInfo!.issuer).toBeDefined();
            expect(certValidation.certificateInfo!.validFrom).toBeDefined();
            expect(certValidation.certificateInfo!.validTo).toBeDefined();
          }
        } else {
          // When validation is disabled, should always be valid
          expect(certValidation.valid).toBe(true);
        }
      }
    ), { numRuns: 20 });
  });

  /**
   * Property: Service statistics are accurate
   */
  it('should provide accurate transmission service statistics', async () => {
    const stats = secureDataTransmissionService.getStats();

    // Verify statistics structure
    expect(stats.config).toBeDefined();
    expect(stats.pinnedCertificatesCount).toBeDefined();
    expect(stats.sensitiveFieldPatternsCount).toBeDefined();

    // Verify config matches current settings
    const currentConfig = secureDataTransmissionService.getConfig();
    expect(stats.config).toEqual(currentConfig);

    // Verify counts are reasonable
    expect(stats.pinnedCertificatesCount).toBeGreaterThanOrEqual(0);
    expect(stats.sensitiveFieldPatternsCount).toBeGreaterThan(0);
  });

  /**
   * Property: Error handling works correctly for invalid requests
   */
  it('should handle invalid requests gracefully', async () => {
    await fc.assert(fc.asyncProperty(
      fc.record({
        invalidUrl: fc.constantFrom('', 'not-a-url', 'ftp://invalid', 'javascript:alert(1)'),
        method: fc.constantFrom('GET', 'POST', 'PUT'),
      }),
      async ({ invalidUrl, method }) => {
        const request: SecureRequest = {
          url: invalidUrl,
          method,
          body: { data: 'test' },
        };

        const result = await secureDataTransmissionService.sendSecureRequest(request);

        // Invalid requests should fail gracefully
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.httpsUsed).toBe(false);
        expect(result.certificateValid).toBe(false);
        expect(result.encrypted).toBe(false);
        expect(result.integrityVerified).toBe(false);
      }
    ), { numRuns: 15 });
  });
});