/**
 * Property Test: Secure Token Storage
 * 
 * This test validates that secure token storage works correctly
 * across different storage methods and scenarios.
 * 
 * Validates Requirements: 4.3, 5.1, 10.1
 */

import { secureTokenStorage, SecureStorageOptions } from '../services/secureTokenStorage';
import { CognitoTokens } from '../services/cognitoAuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import fc from 'fast-check';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock Expo SecureStore
const mockSecureStore = {
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
};

jest.mock('expo-secure-store', () => mockSecureStore);

// Mock logging service
jest.mock('../services/loggingService', () => ({
  loggingService: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    logAuth: jest.fn(),
  },
}));

describe('Property Test: Secure Token Storage', () => {
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset SecureStore mocks
    mockSecureStore.setItemAsync.mockClear();
    mockSecureStore.getItemAsync.mockClear();
    mockSecureStore.deleteItemAsync.mockClear();
  });

  // Generators for test data
  const validTokensArbitrary = fc.record({
    accessToken: fc.string({ minLength: 100, maxLength: 2000 }),
    idToken: fc.string({ minLength: 100, maxLength: 2000 }),
    refreshToken: fc.string({ minLength: 50, maxLength: 500 }),
  });

  const storageOptionsArbitrary = fc.record({
    requireAuthentication: fc.boolean(),
    keychainService: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
    accessGroup: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
  });

  /**
   * Property: Tokens should be stored and retrieved correctly with keychain
   */
  test('Property: Keychain storage should store and retrieve tokens correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        storageOptionsArbitrary,
        async (tokens, options) => {
          // Setup: Mock successful keychain operations
          mockSecureStore.setItemAsync.mockResolvedValue(undefined);
          mockSecureStore.getItemAsync.mockResolvedValue(JSON.stringify(tokens));
          mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);

          // Mock metadata storage
          mockAsyncStorage.setItem.mockResolvedValue(undefined);
          mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify({
            timestamp: Date.now(),
            version: '1.0.0',
            encrypted: true,
            method: 'keychain',
          }));

          // Execute: Store and retrieve tokens
          await secureTokenStorage.storeTokens(tokens, options);
          const retrievedTokens = await secureTokenStorage.retrieveTokens();

          // Verify: Tokens should match
          expect(retrievedTokens).toEqual(tokens);
          
          // Verify keychain was used
          expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
            'cognito_tokens_secure',
            JSON.stringify(tokens),
            expect.objectContaining({
              keychainService: options.keychainService || 'trinity-auth',
            })
          );
          expect(mockSecureStore.getItemAsync).toHaveBeenCalledWith('cognito_tokens_secure');
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property: Fallback to encrypted storage when keychain fails
   */
  test('Property: Should fallback to encrypted storage when keychain fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        async (tokens) => {
          // Setup: Mock keychain failure, encrypted storage success
          mockSecureStore.setItemAsync.mockRejectedValue(new Error('Keychain not available'));
          mockAsyncStorage.setItem.mockResolvedValue(undefined);
          
          // Mock encrypted storage retrieval
          const encryptedData = btoa('encrypted_data'); // Simplified mock
          mockAsyncStorage.getItem
            .mockResolvedValueOnce(JSON.stringify({
              timestamp: Date.now(),
              version: '1.0.0',
              encrypted: true,
              method: 'encrypted_storage',
            }))
            .mockResolvedValueOnce(encryptedData);

          // Execute: Store tokens (should fallback)
          await secureTokenStorage.storeTokens(tokens);

          // Verify: Should have attempted keychain first, then fallback
          expect(mockSecureStore.setItemAsync).toHaveBeenCalled();
          expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
            'cognito_tokens_secure_encrypted',
            expect.any(String)
          );
          
          // Verify metadata indicates encrypted storage
          const metadataCall = mockAsyncStorage.setItem.mock.calls.find(
            call => call[0] === 'token_storage_metadata'
          );
          expect(metadataCall).toBeDefined();
          const metadata = JSON.parse(metadataCall![1]);
          expect(metadata.method).toBe('encrypted_storage');
          expect(metadata.encrypted).toBe(true);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Should use plain storage as last resort
   */
  test('Property: Should use plain storage as last resort', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        async (tokens) => {
          // Setup: Mock all secure methods failing
          mockSecureStore.setItemAsync.mockRejectedValue(new Error('Keychain not available'));
          mockAsyncStorage.setItem
            .mockRejectedValueOnce(new Error('Encrypted storage failed'))
            .mockResolvedValue(undefined); // Plain storage succeeds

          // Execute: Store tokens (should fallback to plain)
          await secureTokenStorage.storeTokens(tokens);

          // Verify: Should have tried all methods
          expect(mockSecureStore.setItemAsync).toHaveBeenCalled();
          
          // Verify plain storage was used
          expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
            'cognito_tokens_secure_plain',
            JSON.stringify(tokens)
          );
          
          // Verify metadata indicates plain storage
          const metadataCall = mockAsyncStorage.setItem.mock.calls.find(
            call => call[0] === 'token_storage_metadata'
          );
          expect(metadataCall).toBeDefined();
          const metadata = JSON.parse(metadataCall![1]);
          expect(metadata.method).toBe('plain_storage');
          expect(metadata.encrypted).toBe(false);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Clear tokens should remove from all storage locations
   */
  test('Property: Clear tokens should remove from all storage locations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (keychainSuccess, encryptedSuccess, plainSuccess) => {
          // Setup: Mock clear operations
          if (keychainSuccess) {
            mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
          } else {
            mockSecureStore.deleteItemAsync.mockRejectedValue(new Error('Keychain clear failed'));
          }

          if (encryptedSuccess) {
            mockAsyncStorage.removeItem.mockResolvedValue(undefined);
          } else {
            mockAsyncStorage.removeItem.mockRejectedValue(new Error('Storage clear failed'));
          }

          // Execute: Clear tokens
          await secureTokenStorage.clearTokens();

          // Verify: All clear methods should be attempted
          expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('cognito_tokens_secure');
          
          // Should attempt to clear all AsyncStorage keys
          expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('cognito_tokens_secure_encrypted');
          expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('cognito_tokens_secure_plain');
          expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('token_storage_metadata');
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Storage info should accurately reflect current state
   */
  test('Property: Storage info should accurately reflect current state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.constantFrom('keychain', 'encrypted_storage', 'plain_storage'),
        fc.boolean(),
        async (hasTokens, method, encrypted) => {
          // Setup: Mock storage state
          if (hasTokens) {
            const metadata = {
              timestamp: Date.now() - 1000, // 1 second ago
              version: '1.0.0',
              encrypted,
              method,
            };
            mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(metadata));
          } else {
            mockAsyncStorage.getItem.mockResolvedValue(null);
          }

          // Mock keychain availability test
          if (method === 'keychain') {
            mockSecureStore.setItemAsync.mockResolvedValue(undefined);
            mockSecureStore.getItemAsync.mockResolvedValue('test');
            mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
          } else {
            mockSecureStore.setItemAsync.mockRejectedValue(new Error('Not available'));
          }

          // Execute: Get storage info
          const info = await secureTokenStorage.getStorageInfo();

          // Verify: Info should match setup
          expect(info.hasTokens).toBe(hasTokens);
          
          if (hasTokens) {
            expect(info.method).toBe(method);
            expect(info.encrypted).toBe(encrypted);
            expect(info.age).toBeGreaterThan(0);
            expect(info.age).toBeLessThan(5000); // Should be recent
          }

          // Verify capabilities
          expect(info.storageCapabilities.encryptedStorage).toBe(true);
          expect(info.storageCapabilities.plainStorage).toBe(true);
          expect(info.storageCapabilities.keychain).toBe(method === 'keychain');
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  /**
   * Property: Corrupted data should be handled gracefully
   */
  test('Property: Corrupted data should be handled gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'invalid-json',
          '{"incomplete": true',
          '',
          'null',
          '{"wrong": "format"}'
        ),
        fc.constantFrom('keychain', 'encrypted_storage', 'plain_storage'),
        async (corruptedData, storageMethod) => {
          // Setup: Mock corrupted data in storage
          const metadata = {
            timestamp: Date.now(),
            version: '1.0.0',
            encrypted: false,
            method: storageMethod,
          };
          
          mockAsyncStorage.getItem
            .mockResolvedValueOnce(JSON.stringify(metadata))
            .mockResolvedValueOnce(corruptedData);

          if (storageMethod === 'keychain') {
            mockSecureStore.getItemAsync.mockResolvedValue(corruptedData);
          }

          // Mock clear operations for cleanup
          mockSecureStore.deleteItemAsync.mockResolvedValue(undefined);
          mockAsyncStorage.removeItem.mockResolvedValue(undefined);

          // Execute: Try to retrieve tokens
          const tokens = await secureTokenStorage.retrieveTokens();

          // Verify: Should return null and clean up
          expect(tokens).toBeNull();
          
          // Verify cleanup was called
          expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('token_storage_metadata');
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  /**
   * Property: Storage should handle concurrent operations safely
   */
  test('Property: Storage should handle concurrent operations safely', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(validTokensArbitrary, { minLength: 2, maxLength: 5 }),
        async (tokenSets) => {
          // Setup: Mock successful operations
          mockSecureStore.setItemAsync.mockResolvedValue(undefined);
          mockSecureStore.getItemAsync.mockImplementation(async () => {
            // Return the last stored tokens
            const lastCall = mockSecureStore.setItemAsync.mock.calls.slice(-1)[0];
            return lastCall ? lastCall[1] : null;
          });
          mockAsyncStorage.setItem.mockResolvedValue(undefined);
          mockAsyncStorage.getItem.mockImplementation(async (key) => {
            if (key === 'token_storage_metadata') {
              return JSON.stringify({
                timestamp: Date.now(),
                version: '1.0.0',
                encrypted: true,
                method: 'keychain',
              });
            }
            return null;
          });

          // Execute: Concurrent store operations
          const storePromises = tokenSets.map(tokens => 
            secureTokenStorage.storeTokens(tokens)
          );
          
          await Promise.all(storePromises);

          // Execute: Retrieve tokens
          const retrievedTokens = await secureTokenStorage.retrieveTokens();

          // Verify: Should have valid tokens (one of the stored sets)
          expect(retrievedTokens).toBeDefined();
          expect(retrievedTokens).toHaveProperty('accessToken');
          expect(retrievedTokens).toHaveProperty('idToken');
          expect(retrievedTokens).toHaveProperty('refreshToken');
          
          // Verify the retrieved tokens match one of the input sets
          const isValidTokenSet = tokenSets.some(tokenSet => 
            JSON.stringify(tokenSet) === JSON.stringify(retrievedTokens)
          );
          expect(isValidTokenSet).toBe(true);
        }
      ),
      { numRuns: 15, timeout: 15000 }
    );
  });

  /**
   * Property: Storage options should be respected
   */
  test('Property: Storage options should be respected', async () => {
    await fc.assert(
      fc.asyncProperty(
        validTokensArbitrary,
        storageOptionsArbitrary,
        async (tokens, options) => {
          // Setup: Mock successful keychain operations
          mockSecureStore.setItemAsync.mockResolvedValue(undefined);
          mockAsyncStorage.setItem.mockResolvedValue(undefined);

          // Execute: Store tokens with options
          await secureTokenStorage.storeTokens(tokens, options);

          // Verify: Options should be passed to keychain
          expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
            'cognito_tokens_secure',
            JSON.stringify(tokens),
            expect.objectContaining({
              keychainService: options.keychainService || 'trinity-auth',
              ...(options.requireAuthentication && {
                requireAuthentication: true,
                authenticationPrompt: 'Authenticate to access your account',
              }),
            })
          );
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });
});