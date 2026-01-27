/**
 * Property Test: Google Profile Synchronization
 * 
 * Validates that Google profile data is properly mapped to Cognito user attributes,
 * automatic profile sync works when Google data changes, and conflict resolution functions correctly.
 * Tests Requirements 6.2, 6.3, 6.5: Google profile synchronization and conflict resolution
 */

import fc from 'fast-check';
import { googleProfileSyncService, GoogleProfile, ProfileSyncConfig, ProfileSyncResult, ProfileConflict } from '../services/googleProfileSyncService';
import { cognitoAuthService, CognitoUser } from '../services/cognitoAuthService';

// Mock dependencies
jest.mock('../services/cognitoAuthService');
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Google Sign-In
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    isSignedIn: jest.fn(),
    getCurrentUser: jest.fn(),
  },
}));

const mockCognitoAuthService = cognitoAuthService as jest.Mocked<typeof cognitoAuthService>;

describe('Property Test: Google Profile Synchronization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    googleProfileSyncService.stop();
    
    // Reset service state
    googleProfileSyncService.updateConfig({
      enableAutoSync: false, // Disable for manual testing
      syncIntervalMinutes: 60,
      conflictResolutionStrategy: 'most_recent',
      syncFields: ['name', 'picture', 'locale'],
      enableConflictLogging: true,
    });

    // Mock Google Sign-In
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    GoogleSignin.isSignedIn.mockResolvedValue(true);
  });

  afterEach(() => {
    googleProfileSyncService.stop();
  });

  /**
   * Property 16.1: Profile Conflict Detection
   * For any Google and Cognito profiles, conflicts should be accurately detected for configured fields
   */
  test('Property 16.1: Accurate profile conflict detection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          googleProfile: fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            photo: fc.option(fc.webUrl(), { nil: undefined }),
            locale: fc.option(fc.constantFrom('en', 'es', 'fr', 'de'), { nil: undefined }),
          }),
          cognitoUser: fc.record({
            sub: fc.string({ minLength: 1, maxLength: 50 }),
            email: fc.emailAddress(),
            name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
            preferred_username: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
            picture: fc.option(fc.webUrl(), { nil: undefined }),
            locale: fc.option(fc.constantFrom('en', 'es', 'fr', 'de'), { nil: undefined }),
          }),
          syncFields: fc.subarray(['name', 'email', 'picture', 'locale'], { minLength: 1, maxLength: 4 }),
        }),
        async ({ googleProfile, cognitoUser, syncFields }) => {
          // Arrange: Configure sync fields
          googleProfileSyncService.updateConfig({ syncFields });

          // Act: Detect conflicts
          const conflicts = await googleProfileSyncService.detectProfileConflicts(
            googleProfile as GoogleProfile,
            cognitoUser as CognitoUser
          );

          // Assert: Conflict detection properties
          const expectedConflicts: string[] = [];

          for (const field of syncFields) {
            let googleValue: any;
            let cognitoValue: any;

            switch (field) {
              case 'name':
                googleValue = googleProfile.name;
                cognitoValue = cognitoUser.name || cognitoUser.preferred_username;
                break;
              case 'email':
                googleValue = googleProfile.email;
                cognitoValue = cognitoUser.email;
                break;
              case 'picture':
                googleValue = googleProfile.photo;
                cognitoValue = cognitoUser.picture;
                break;
              case 'locale':
                googleValue = googleProfile.locale;
                cognitoValue = cognitoUser.locale;
                break;
            }

            // Normalize values for comparison (same logic as service)
            const normalizedGoogle = normalizeValue(googleValue);
            const normalizedCognito = normalizeValue(cognitoValue);

            if (normalizedGoogle !== normalizedCognito) {
              expectedConflicts.push(field);
            }
          }

          // Verify detected conflicts match expected conflicts
          expect(conflicts.length).toBe(expectedConflicts.length);
          
          const detectedFields = conflicts.map(c => c.field).sort();
          const expectedFields = expectedConflicts.sort();
          expect(detectedFields).toEqual(expectedFields);

          // Verify conflict details
          conflicts.forEach(conflict => {
            expect(expectedConflicts).toContain(conflict.field);
            expect(conflict.googleValue).toBeDefined();
            expect(conflict.cognitoValue).toBeDefined();
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 16.2: Conflict Resolution Strategies
   * Different resolution strategies should produce consistent and predictable results
   */
  test('Property 16.2: Conflict resolution strategy consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          conflicts: fc.array(
            fc.record({
              field: fc.constantFrom('name', 'picture', 'locale'),
              googleValue: fc.string({ minLength: 1, maxLength: 50 }),
              cognitoValue: fc.string({ minLength: 1, maxLength: 50 }),
              lastGoogleUpdate: fc.integer({ min: 1640995200000, max: 2000000000000 }),
              lastCognitoUpdate: fc.integer({ min: 1640995200000, max: 2000000000000 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          strategy: fc.constantFrom('google_priority', 'cognito_priority', 'most_recent', 'manual'),
        }),
        async ({ conflicts, strategy }) => {
          // Arrange: Configure resolution strategy
          googleProfileSyncService.updateConfig({ conflictResolutionStrategy: strategy });

          // Act: Resolve conflicts
          const resolutions = googleProfileSyncService.resolveProfileConflicts(conflicts as ProfileConflict[]);

          // Assert: Resolution strategy properties
          expect(resolutions.length).toBe(conflicts.length);

          resolutions.forEach((resolution, index) => {
            const conflict = conflicts[index];
            
            expect(resolution.field).toBe(conflict.field);
            expect(resolution.googleValue).toBe(conflict.googleValue);
            expect(resolution.cognitoValue).toBe(conflict.cognitoValue);

            // Verify resolution follows strategy
            switch (strategy) {
              case 'google_priority':
                expect(resolution.resolvedValue).toBe(conflict.googleValue);
                expect(resolution.strategy).toBe('google_priority');
                break;

              case 'cognito_priority':
                expect(resolution.resolvedValue).toBe(conflict.cognitoValue);
                expect(resolution.strategy).toBe('cognito_priority');
                break;

              case 'most_recent':
                const expectedValue = conflict.lastGoogleUpdate > conflict.lastCognitoUpdate
                  ? conflict.googleValue
                  : conflict.cognitoValue;
                expect(resolution.resolvedValue).toBe(expectedValue);
                break;

              case 'manual':
                // Manual strategy should prefer non-empty values or default to Google
                if (conflict.googleValue && !conflict.cognitoValue) {
                  expect(resolution.resolvedValue).toBe(conflict.googleValue);
                } else if (conflict.cognitoValue && !conflict.googleValue) {
                  expect(resolution.resolvedValue).toBe(conflict.cognitoValue);
                } else {
                  // Both have values, should prefer Google
                  expect(resolution.resolvedValue).toBe(conflict.googleValue);
                }
                break;
            }
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 16.3: Profile Update Application
   * Profile updates should be correctly applied to Cognito with proper field mapping
   */
  test('Property 16.3: Profile update application accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          updates: fc.array(
            fc.record({
              field: fc.constantFrom('name', 'picture', 'locale'),
              value: fc.string({ minLength: 1, maxLength: 100 }),
            }),
            { minLength: 1, maxLength: 3 }
          ),
          authSuccess: fc.boolean(),
          updateSuccess: fc.boolean(),
        }),
        async ({ updates, authSuccess, updateSuccess }) => {
          // Arrange: Mock authentication state
          mockCognitoAuthService.checkStoredAuth.mockResolvedValue({
            isAuthenticated: authSuccess,
            user: authSuccess ? {
              sub: 'user-123',
              email: 'test@example.com',
              name: 'Test User',
              preferred_username: 'testuser',
            } : null,
            tokens: authSuccess ? {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              idToken: 'id-token',
            } : null,
          });

          // Mock update user attributes
          mockCognitoAuthService.updateUserAttributes.mockResolvedValue({
            success: updateSuccess,
            error: updateSuccess ? undefined : 'Update failed',
          });

          // Act: Apply profile updates
          const result = await googleProfileSyncService.applyProfileUpdates(updates);

          // Assert: Update application properties
          if (!authSuccess) {
            expect(result.success).toBe(false);
            expect(result.error).toContain('not authenticated');
            expect(mockCognitoAuthService.updateUserAttributes).not.toHaveBeenCalled();
          } else {
            expect(mockCognitoAuthService.checkStoredAuth).toHaveBeenCalled();
            
            if (updates.length > 0) {
              expect(mockCognitoAuthService.updateUserAttributes).toHaveBeenCalled();
              
              // Verify update attributes mapping
              const updateCall = mockCognitoAuthService.updateUserAttributes.mock.calls[0];
              const updateAttributes = updateCall[1];
              
              updates.forEach(update => {
                switch (update.field) {
                  case 'name':
                    expect(updateAttributes.name).toBe(update.value);
                    expect(updateAttributes.preferred_username).toBe(update.value);
                    break;
                  case 'picture':
                    expect(updateAttributes.picture).toBe(update.value);
                    break;
                  case 'locale':
                    expect(updateAttributes.locale).toBe(update.value);
                    break;
                }
              });
              
              expect(result.success).toBe(updateSuccess);
              
              if (updateSuccess) {
                expect(result.updatedFields.length).toBeGreaterThan(0);
                expect(result.error).toBeUndefined();
              } else {
                expect(result.error).toBeDefined();
              }
            }
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Property 16.4: Full Profile Synchronization Flow
   * Complete sync process should handle all steps correctly
   */
  test('Property 16.4: Complete profile synchronization flow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          googleSignedIn: fc.boolean(),
          userAuthenticated: fc.boolean(),
          hasConflicts: fc.boolean(),
          updateSuccess: fc.boolean(),
          googleProfile: fc.record({
            id: fc.string({ minLength: 1, maxLength: 50 }),
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 100 }),
            photo: fc.option(fc.webUrl(), { nil: undefined }),
            locale: fc.constantFrom('en', 'es', 'fr'),
          }),
        }),
        async ({ googleSignedIn, userAuthenticated, hasConflicts, updateSuccess, googleProfile }) => {
          // Arrange: Setup mocks
          const { GoogleSignin } = require('@react-native-google-signin/google-signin');
          GoogleSignin.isSignedIn.mockResolvedValue(googleSignedIn);
          
          if (googleSignedIn) {
            GoogleSignin.getCurrentUser.mockResolvedValue({
              user: googleProfile,
            });
          }

          const cognitoUser = {
            sub: 'user-123',
            email: hasConflicts ? 'different@example.com' : googleProfile.email,
            name: hasConflicts ? 'Different Name' : googleProfile.name,
            preferred_username: hasConflicts ? 'differentuser' : googleProfile.name,
            picture: hasConflicts ? 'https://different.com/pic.jpg' : googleProfile.photo,
            locale: hasConflicts ? 'de' : googleProfile.locale,
          };

          mockCognitoAuthService.checkStoredAuth.mockResolvedValue({
            isAuthenticated: userAuthenticated,
            user: userAuthenticated ? cognitoUser : null,
            tokens: userAuthenticated ? {
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
              idToken: 'id-token',
            } : null,
          });

          mockCognitoAuthService.updateUserAttributes.mockResolvedValue({
            success: updateSuccess,
            error: updateSuccess ? undefined : 'Update failed',
          });

          // Setup event listener to capture sync events
          const capturedEvents: Array<{ type: string; data?: any }> = [];
          const eventListener = (event: { type: string; data?: any }) => {
            capturedEvents.push(event);
          };
          googleProfileSyncService.addSyncEventListener(eventListener);

          try {
            // Act: Perform profile sync
            const syncResult = await googleProfileSyncService.syncProfile();

            // Assert: Sync flow properties
            if (!googleSignedIn) {
              expect(syncResult.success).toBe(false);
              expect(syncResult.error).toContain('No Google profile available');
              
              const failedEvent = capturedEvents.find(e => e.type === 'sync_failed');
              expect(failedEvent).toBeDefined();
              
            } else if (!userAuthenticated) {
              expect(syncResult.success).toBe(false);
              expect(syncResult.error).toContain('not authenticated');
              
            } else {
              // Both Google and Cognito are available
              expect(GoogleSignin.getCurrentUser).toHaveBeenCalled();
              expect(mockCognitoAuthService.checkStoredAuth).toHaveBeenCalled();

              if (hasConflicts) {
                expect(syncResult.conflicts.length).toBeGreaterThan(0);
                
                const conflictEvent = capturedEvents.find(e => e.type === 'conflict_detected');
                expect(conflictEvent).toBeDefined();
              }

              if (hasConflicts && updateSuccess) {
                expect(syncResult.success).toBe(true);
                expect(syncResult.syncedFields.length).toBeGreaterThan(0);
                
                const completedEvent = capturedEvents.find(e => e.type === 'sync_completed');
                expect(completedEvent).toBeDefined();
                
              } else if (hasConflicts && !updateSuccess) {
                expect(syncResult.success).toBe(false);
                expect(syncResult.error).toBeDefined();
              }
            }

            // Should always emit sync_started event
            const startedEvent = capturedEvents.find(e => e.type === 'sync_started');
            expect(startedEvent).toBeDefined();

          } finally {
            googleProfileSyncService.removeSyncEventListener(eventListener);
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property 16.5: Service Configuration and Lifecycle
   * Service configuration changes should be properly applied and lifecycle managed
   */
  test('Property 16.5: Service configuration and lifecycle management', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          enableAutoSync: fc.boolean(),
          syncIntervalMinutes: fc.integer({ min: 1, max: 120 }),
          conflictResolutionStrategy: fc.constantFrom('google_priority', 'cognito_priority', 'most_recent', 'manual'),
          syncFields: fc.subarray(['name', 'email', 'picture', 'locale'], { minLength: 1, maxLength: 4 }),
          enableConflictLogging: fc.boolean(),
        }),
        async ({ enableAutoSync, syncIntervalMinutes, conflictResolutionStrategy, syncFields, enableConflictLogging }) => {
          // Arrange: Configuration
          const config = {
            enableAutoSync,
            syncIntervalMinutes,
            conflictResolutionStrategy,
            syncFields,
            enableConflictLogging,
          };

          // Act: Start service with configuration
          googleProfileSyncService.start(config);

          // Assert: Configuration should be applied
          const status = googleProfileSyncService.getSyncStatus();
          expect(status.isActive).toBe(enableAutoSync);
          expect(status.config.enableAutoSync).toBe(enableAutoSync);
          expect(status.config.syncIntervalMinutes).toBe(syncIntervalMinutes);
          expect(status.config.conflictResolutionStrategy).toBe(conflictResolutionStrategy);
          expect(status.config.syncFields).toEqual(syncFields);
          expect(status.config.enableConflictLogging).toBe(enableConflictLogging);

          // Act: Update configuration
          const newConfig = {
            syncIntervalMinutes: syncIntervalMinutes + 10,
            conflictResolutionStrategy: 'google_priority' as const,
          };
          googleProfileSyncService.updateConfig(newConfig);

          // Assert: Configuration should be updated
          const updatedStatus = googleProfileSyncService.getSyncStatus();
          expect(updatedStatus.config.syncIntervalMinutes).toBe(syncIntervalMinutes + 10);
          expect(updatedStatus.config.conflictResolutionStrategy).toBe('google_priority');
          // Other config should remain unchanged
          expect(updatedStatus.config.enableAutoSync).toBe(enableAutoSync);
          expect(updatedStatus.config.syncFields).toEqual(syncFields);

          // Act: Stop service
          googleProfileSyncService.stop();

          // Assert: Service should be stopped
          const stoppedStatus = googleProfileSyncService.getSyncStatus();
          expect(stoppedStatus.isActive).toBe(false);
        }
      ),
      { numRuns: 15 }
    );
  });
});

// Helper function to normalize values (same logic as service)
function normalizeValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim().toLowerCase();
}