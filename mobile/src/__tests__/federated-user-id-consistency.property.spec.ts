/**
 * Property Test: Federated User ID Consistency
 * 
 * Validates that consistent user IDs are maintained across all federated sessions,
 * user ID mapping between Google and Cognito works correctly, and user profile management
 * functions properly for federated users.
 * Tests Requirements 6.4: Federated user ID consistency
 */

import fc from 'fast-check';
import { federatedUserIdService, FederatedUserMapping, UserIdConsistencyCheck, UserIdMappingConfig } from '../services/federatedUserIdService';
import { cognitoAuthService, CognitoUser } from '../services/cognitoAuthService';
import { secureTokenStorage } from '../services/secureTokenStorage';

// Mock dependencies
jest.mock('../services/cognitoAuthService');
jest.mock('../services/secureTokenStorage');
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockCognitoAuthService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;
const mockSecureTokenStorage = secureTokenStorage as jest.Mocked<typeof secureTokenStorage>;

describe('Property Test: Federated User ID Consistency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    federatedUserIdService.stop();
    
    // Reset service state
    federatedUserIdService.updateConfig({
      enableAutoMapping: true,
      enableConsistencyChecks: false, // Disable for manual testing
      checkIntervalMinutes: 30,
      autoFixInconsistencies: true,
      preserveOriginalIds: true,
    });
  });

  afterEach(() => {
    federatedUserIdService.stop();
  });

  /**
   * Property 17.1: User Mapping Creation
   * For any valid Cognito user, a consistent mapping should be created with proper identities
   */
  test('Property 17.1: Consistent user mapping creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          cognitoUser: fc.record({
            sub: fc.string({ minLength: 10, maxLength: 50 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            preferred_username: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          }),
          googleId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
          storageSuccess: fc.boolean(),
        }),
        async ({ cognitoUser, googleId, storageSuccess }) => {
          // Arrange: Mock storage
          mockSecureTokenStorage.storeData.mockImplementation(async (key, data) => {
            if (!storageSuccess) {
              throw new Error('Storage failed');
            }
            return Promise.resolve();
          });

          // Act: Create user mapping
          const result = await federatedUserIdService.createUserMapping(
            cognitoUser as CognitoUser,
            googleId
          );

          // Assert: Mapping creation properties
          if (storageSuccess) {
            expect(result.success).toBe(true);
            expect(result.mapping).toBeDefined();
            
            const mapping = result.mapping!;
            
            // Basic mapping properties
            expect(mapping.cognitoSub).toBe(cognitoUser.sub);
            expect(mapping.email).toBe(cognitoUser.email);
            expect(mapping.googleId).toBe(googleId);
            expect(mapping.lastSyncTime).toBeGreaterThan(0);
            expect(mapping.consistencyHash).toBeDefined();

            // Federated identities should include Cognito
            const cognitoIdentity = mapping.federatedIdentities.find(fi => fi.provider === 'Cognito');
            expect(cognitoIdentity).toBeDefined();
            expect(cognitoIdentity?.providerId).toBe(cognitoUser.sub);
            expect(cognitoIdentity?.isActive).toBe(true);

            // If Google ID provided, should include Google identity
            if (googleId) {
              const googleIdentity = mapping.federatedIdentities.find(fi => fi.provider === 'Google');
              expect(googleIdentity).toBeDefined();
              expect(googleIdentity?.providerId).toBe(googleId);
              expect(googleIdentity?.isActive).toBe(true);
            }

            // Should attempt to store mapping
            expect(mockSecureTokenStorage.storeData).toHaveBeenCalledWith(
              `user_mapping_${cognitoUser.sub}`,
              expect.stringContaining(cognitoUser.sub)
            );

          } else {
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 17.2: User Mapping Retrieval
   * Stored user mappings should be retrievable by Cognito sub or Google ID consistently
   */
  test('Property 17.2: Consistent user mapping retrieval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          mapping: fc.record({
            cognitoSub: fc.string({ minLength: 10, maxLength: 50 }),
            googleId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
            email: fc.emailAddress(),
            lastSyncTime: fc.integer({ min: 1640995200000, max: 2000000000000 }),
          }),
          retrievalSuccess: fc.boolean(),
          retrievalMethod: fc.constantFrom('cognito_sub', 'google_id'),
        }),
        async ({ mapping, retrievalSuccess, retrievalMethod }) => {
          // Arrange: Mock storage retrieval
          const mappingData = JSON.stringify({
            ...mapping,
            federatedIdentities: [
              { provider: 'Cognito', providerId: mapping.cognitoSub, dateLinked: Date.now(), isActive: true },
              ...(mapping.googleId ? [{ provider: 'Google', providerId: mapping.googleId, dateLinked: Date.now(), isActive: true }] : []),
            ],
            consistencyHash: 'test-hash',
          });

          mockSecureTokenStorage.retrieveData.mockImplementation(async (key) => {
            if (!retrievalSuccess) {
              return null;
            }
            if (key === `user_mapping_${mapping.cognitoSub}`) {
              return mappingData;
            }
            return null;
          });

          // Act: Retrieve mapping using different methods
          let retrievedMapping: FederatedUserMapping | null = null;

          if (retrievalMethod === 'cognito_sub') {
            retrievedMapping = await federatedUserIdService.getUserMapping(mapping.cognitoSub);
          } else if (retrievalMethod === 'google_id' && mapping.googleId) {
            retrievedMapping = await federatedUserIdService.getUserMappingByGoogleId(mapping.googleId);
          }

          // Assert: Retrieval consistency properties
          if (retrievalSuccess && (retrievalMethod === 'cognito_sub' || mapping.googleId)) {
            expect(retrievedMapping).toBeDefined();
            expect(retrievedMapping?.cognitoSub).toBe(mapping.cognitoSub);
            expect(retrievedMapping?.email).toBe(mapping.email);
            expect(retrievedMapping?.googleId).toBe(mapping.googleId);
            expect(retrievedMapping?.lastSyncTime).toBe(mapping.lastSyncTime);

            // Should have proper federated identities
            expect(retrievedMapping?.federatedIdentities).toBeDefined();
            expect(retrievedMapping?.federatedIdentities.length).toBeGreaterThan(0);

          } else if (retrievalMethod === 'google_id' && !mapping.googleId) {
            // Cannot retrieve by Google ID if no Google ID exists
            expect(retrievedMapping).toBeNull();

          } else {
            // Retrieval failed
            expect(retrievedMapping).toBeNull();
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 17.3: User ID Consistency Checking
   * Consistency checks should accurately detect mismatches between stored mapping and current user
   */
  test('Property 17.3: Accurate consistency checking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          currentUser: fc.record({
            sub: fc.string({ minLength: 10, maxLength: 50 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          storedMapping: fc.option(
            fc.record({
              cognitoSub: fc.string({ minLength: 10, maxLength: 50 }),
              email: fc.emailAddress(),
              googleId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
            }),
            { nil: null }
          ),
          userAuthenticated: fc.boolean(),
        }),
        async ({ currentUser, storedMapping, userAuthenticated }) => {
          // Arrange: Mock authentication state
          mockCognitoAuthService.checkStoredAuth.mockResolvedValue({
            isAuthenticated: userAuthenticated,
            user: userAuthenticated ? currentUser as CognitoUser : null,
            tokens: userAuthenticated ? {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              idToken: 'id-token',
            } : null,
          });

          // Mock stored mapping retrieval
          if (storedMapping) {
            const mappingData = JSON.stringify({
              ...storedMapping,
              federatedIdentities: [
                { provider: 'Cognito', providerId: storedMapping.cognitoSub, dateLinked: Date.now(), isActive: true },
              ],
              lastSyncTime: Date.now(),
              consistencyHash: 'test-hash',
            });

            mockSecureTokenStorage.retrieveData.mockResolvedValue(mappingData);
          } else {
            mockSecureTokenStorage.retrieveData.mockResolvedValue(null);
          }

          // Act: Check consistency
          const consistencyCheck = await federatedUserIdService.checkUserIdConsistency();

          // Assert: Consistency check properties
          if (!userAuthenticated) {
            expect(consistencyCheck.isConsistent).toBe(false);
            expect(consistencyCheck.inconsistencies.length).toBeGreaterThan(0);
            expect(consistencyCheck.recommendedAction).toBe('relink_account');

          } else if (!storedMapping) {
            // No mapping exists for authenticated user
            expect(consistencyCheck.isConsistent).toBe(false);
            expect(consistencyCheck.cognitoSub).toBe(currentUser.sub);
            expect(consistencyCheck.email).toBe(currentUser.email);
            expect(consistencyCheck.recommendedAction).toBe('create_new_mapping');

          } else {
            // Both user and mapping exist, check for inconsistencies
            const hasCognitoSubMismatch = storedMapping.cognitoSub !== currentUser.sub;
            const hasEmailMismatch = storedMapping.email !== currentUser.email;

            expect(consistencyCheck.cognitoSub).toBe(currentUser.sub);
            expect(consistencyCheck.email).toBe(currentUser.email);

            if (hasCognitoSubMismatch || hasEmailMismatch) {
              expect(consistencyCheck.isConsistent).toBe(false);
              expect(consistencyCheck.inconsistencies.length).toBeGreaterThan(0);

              if (hasCognitoSubMismatch) {
                const cognitoSubInconsistency = consistencyCheck.inconsistencies.find(
                  i => i.type === 'missing_cognito_sub' || i.type === 'provider_mismatch'
                );
                expect(cognitoSubInconsistency).toBeDefined();
              }

              if (hasEmailMismatch) {
                const emailInconsistency = consistencyCheck.inconsistencies.find(i => i.type === 'email_mismatch');
                expect(emailInconsistency).toBeDefined();
              }

            } else {
              expect(consistencyCheck.isConsistent).toBe(true);
              expect(consistencyCheck.inconsistencies.length).toBe(0);
              expect(consistencyCheck.recommendedAction).toBe('no_action');
            }
          }
        }
      ),
      { numRuns: 40 }
    );
  });

  /**
   * Property 17.4: Google Account Linking
   * Linking Google accounts should update mappings consistently and preserve existing data
   */
  test('Property 17.4: Consistent Google account linking', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          cognitoSub: fc.string({ minLength: 10, maxLength: 50 }),
          googleId: fc.string({ minLength: 10, maxLength: 50 }),
          existingMapping: fc.option(
            fc.record({
              cognitoSub: fc.string({ minLength: 10, maxLength: 50 }),
              email: fc.emailAddress(),
              googleId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
            }),
            { nil: null }
          ),
          userAuthenticated: fc.boolean(),
          storageSuccess: fc.boolean(),
        }),
        async ({ cognitoSub, googleId, existingMapping, userAuthenticated, storageSuccess }) => {
          // Arrange: Mock authentication state
          const currentUser = {
            sub: cognitoSub,
            email: 'test@example.com',
            name: 'Test User',
          };

          mockCognitoAuthService.checkStoredAuth.mockResolvedValue({
            isAuthenticated: userAuthenticated,
            user: userAuthenticated ? currentUser as CognitoUser : null,
            tokens: userAuthenticated ? {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              idToken: 'id-token',
            } : null,
          });

          // Mock existing mapping
          if (existingMapping && existingMapping.cognitoSub === cognitoSub) {
            const mappingData = JSON.stringify({
              ...existingMapping,
              federatedIdentities: [
                { provider: 'Cognito', providerId: existingMapping.cognitoSub, dateLinked: Date.now(), isActive: true },
                ...(existingMapping.googleId ? [{ provider: 'Google', providerId: existingMapping.googleId, dateLinked: Date.now(), isActive: true }] : []),
              ],
              lastSyncTime: Date.now(),
              consistencyHash: 'test-hash',
            });

            mockSecureTokenStorage.retrieveData.mockResolvedValue(mappingData);
          } else {
            mockSecureTokenStorage.retrieveData.mockResolvedValue(null);
          }

          // Mock storage
          mockSecureTokenStorage.storeData.mockImplementation(async (key, data) => {
            if (!storageSuccess) {
              throw new Error('Storage failed');
            }
            return Promise.resolve();
          });

          // Act: Link Google account
          const result = await federatedUserIdService.linkGoogleAccount(cognitoSub, googleId);

          // Assert: Linking properties
          if (!userAuthenticated) {
            expect(result.success).toBe(false);
            expect(result.error).toContain('not authenticated');

          } else if (!storageSuccess) {
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();

          } else {
            expect(result.success).toBe(true);
            expect(result.mapping).toBeDefined();

            const mapping = result.mapping!;
            expect(mapping.cognitoSub).toBe(cognitoSub);
            expect(mapping.googleId).toBe(googleId);

            // Should have both Cognito and Google identities
            const cognitoIdentity = mapping.federatedIdentities.find(fi => fi.provider === 'Cognito');
            const googleIdentity = mapping.federatedIdentities.find(fi => fi.provider === 'Google');

            expect(cognitoIdentity).toBeDefined();
            expect(cognitoIdentity?.providerId).toBe(cognitoSub);
            expect(googleIdentity).toBeDefined();
            expect(googleIdentity?.providerId).toBe(googleId);

            // Should store updated mapping
            expect(mockSecureTokenStorage.storeData).toHaveBeenCalledWith(
              `user_mapping_${cognitoSub}`,
              expect.stringContaining(googleId)
            );
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 17.5: Inconsistency Resolution
   * Fixing inconsistencies should result in consistent state based on recommended actions
   */
  test('Property 17.5: Effective inconsistency resolution', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          inconsistencyCheck: fc.record({
            isConsistent: fc.constant(false), // Always inconsistent for this test
            cognitoSub: fc.string({ minLength: 10, maxLength: 50 }),
            googleId: fc.option(fc.string({ minLength: 10, maxLength: 50 }), { nil: undefined }),
            email: fc.emailAddress(),
            recommendedAction: fc.constantFrom('update_mapping', 'create_new_mapping', 'relink_account', 'no_action'),
            inconsistencies: fc.array(
              fc.record({
                type: fc.constantFrom('missing_google_id', 'missing_cognito_sub', 'email_mismatch', 'provider_mismatch'),
                description: fc.string({ minLength: 10, maxLength: 100 }),
              }),
              { minLength: 1, maxLength: 3 }
            ),
          }),
          userAuthenticated: fc.boolean(),
          storageSuccess: fc.boolean(),
        }),
        async ({ inconsistencyCheck, userAuthenticated, storageSuccess }) => {
          // Arrange: Mock authentication state
          const currentUser = {
            sub: inconsistencyCheck.cognitoSub,
            email: inconsistencyCheck.email,
            name: 'Test User',
          };

          mockCognitoAuthService.checkStoredAuth.mockResolvedValue({
            isAuthenticated: userAuthenticated,
            user: userAuthenticated ? currentUser as CognitoUser : null,
            tokens: userAuthenticated ? {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              idToken: 'id-token',
            } : null,
          });

          // Mock storage
          mockSecureTokenStorage.storeData.mockImplementation(async (key, data) => {
            if (!storageSuccess) {
              throw new Error('Storage failed');
            }
            return Promise.resolve();
          });

          // Act: Fix inconsistencies
          const fixResult = await federatedUserIdService.fixUserIdInconsistencies(
            inconsistencyCheck as UserIdConsistencyCheck
          );

          // Assert: Fix result properties
          if (inconsistencyCheck.recommendedAction === 'no_action') {
            expect(fixResult.success).toBe(true);
            expect(fixResult.fixedInconsistencies.length).toBe(0);

          } else if (!userAuthenticated) {
            // Cannot fix without authenticated user
            expect(fixResult.success).toBe(true); // Service handles gracefully
            expect(fixResult.fixedInconsistencies.length).toBe(0);

          } else {
            // User is authenticated, should attempt fixes
            expect(fixResult.success).toBe(true);

            switch (inconsistencyCheck.recommendedAction) {
              case 'update_mapping':
              case 'create_new_mapping':
                if (storageSuccess) {
                  expect(fixResult.fixedInconsistencies.length).toBeGreaterThan(0);
                  expect(fixResult.fixedInconsistencies).toContain(
                    inconsistencyCheck.recommendedAction === 'update_mapping' 
                      ? 'updated_user_mapping' 
                      : 'created_user_mapping'
                  );
                } else {
                  // Storage failed, no fixes applied
                  expect(fixResult.fixedInconsistencies.length).toBe(0);
                }
                break;

              case 'relink_account':
                // Manual action required
                expect(fixResult.fixedInconsistencies).toContain('marked_for_manual_relink');
                break;
            }
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 17.6: Service Configuration and Lifecycle
   * Service configuration should be properly applied and lifecycle managed correctly
   */
  test('Property 17.6: Service configuration and lifecycle management', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          enableAutoMapping: fc.boolean(),
          enableConsistencyChecks: fc.boolean(),
          checkIntervalMinutes: fc.integer({ min: 1, max: 120 }),
          autoFixInconsistencies: fc.boolean(),
          preserveOriginalIds: fc.boolean(),
        }),
        async ({ enableAutoMapping, enableConsistencyChecks, checkIntervalMinutes, autoFixInconsistencies, preserveOriginalIds }) => {
          // Arrange: Configuration
          const config = {
            enableAutoMapping,
            enableConsistencyChecks,
            checkIntervalMinutes,
            autoFixInconsistencies,
            preserveOriginalIds,
          };

          // Act: Start service with configuration
          federatedUserIdService.start(config);

          // Assert: Configuration should be applied
          const status = federatedUserIdService.getServiceStatus();
          expect(status.isActive).toBe(enableConsistencyChecks);
          expect(status.config.enableAutoMapping).toBe(enableAutoMapping);
          expect(status.config.enableConsistencyChecks).toBe(enableConsistencyChecks);
          expect(status.config.checkIntervalMinutes).toBe(checkIntervalMinutes);
          expect(status.config.autoFixInconsistencies).toBe(autoFixInconsistencies);
          expect(status.config.preserveOriginalIds).toBe(preserveOriginalIds);

          // Act: Update configuration
          const newConfig = {
            checkIntervalMinutes: checkIntervalMinutes + 10,
            autoFixInconsistencies: !autoFixInconsistencies,
          };
          federatedUserIdService.updateConfig(newConfig);

          // Assert: Configuration should be updated
          const updatedStatus = federatedUserIdService.getServiceStatus();
          expect(updatedStatus.config.checkIntervalMinutes).toBe(checkIntervalMinutes + 10);
          expect(updatedStatus.config.autoFixInconsistencies).toBe(!autoFixInconsistencies);
          // Other config should remain unchanged
          expect(updatedStatus.config.enableAutoMapping).toBe(enableAutoMapping);
          expect(updatedStatus.config.preserveOriginalIds).toBe(preserveOriginalIds);

          // Act: Stop service
          federatedUserIdService.stop();

          // Assert: Service should be stopped
          const stoppedStatus = federatedUserIdService.getServiceStatus();
          expect(stoppedStatus.isActive).toBe(false);
          expect(stoppedStatus.cachedMappingsCount).toBe(0);
        }
      ),
      { numRuns: 15 }
    );
  });
});