/**
 * Secure Token Storage Service
 * Handles secure storage and retrieval of authentication tokens using Expo SecureStore
 * Provides encryption and secure storage for sensitive authentication data
 * Falls back to localStorage on web platform
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { CognitoTokens } from './cognitoAuthService';

interface StorageKeys {
  ACCESS_TOKEN: string;
  ID_TOKEN: string;
  REFRESH_TOKEN: string;
  TOKEN_EXPIRY: string;
  USER_DATA: string;
  LEGACY_TOKENS: string;
}

class SecureTokenStorage {
  private readonly STORAGE_KEYS: StorageKeys = {
    ACCESS_TOKEN: 'trinity_access_token',
    ID_TOKEN: 'trinity_id_token', 
    REFRESH_TOKEN: 'trinity_refresh_token',
    TOKEN_EXPIRY: 'trinity_token_expiry',
    USER_DATA: 'trinity_user_data',
    LEGACY_TOKENS: 'trinity_legacy_tokens',
  };

  private readonly STORAGE_OPTIONS = {
    requireAuthentication: false, // Set to true if device has biometric auth
    keychainService: 'trinity-keychain',
    touchPrompt: 'Authenticate to access your account',
  };

  private readonly isWeb = Platform.OS === 'web';

  /**
   * Platform-agnostic storage methods
   */
  private async setItem(key: string, value: string): Promise<void> {
    if (this.isWeb) {
      // Use localStorage for web
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      } else {
        throw new Error('localStorage is not available');
      }
    } else {
      // Use SecureStore for native
      await SecureStore.setItemAsync(key, value, this.STORAGE_OPTIONS);
    }
  }

  private async getItem(key: string): Promise<string | null> {
    if (this.isWeb) {
      // Use localStorage for web
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } else {
      // Use SecureStore for native
      return await SecureStore.getItemAsync(key, this.STORAGE_OPTIONS);
    }
  }

  private async deleteItem(key: string): Promise<void> {
    if (this.isWeb) {
      // Use localStorage for web
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } else {
      // Use SecureStore for native
      await SecureStore.deleteItemAsync(key);
    }
  }

  /**
   * Store authentication tokens securely
   */
  async storeTokens(tokens: CognitoTokens): Promise<void> {
    try {
      console.log('🔐 SecureTokenStorage: Storing tokens securely (Platform:', Platform.OS, ')');
      console.log('🔍 SecureTokenStorage: Input tokens debug:', {
        hasAccessToken: !!tokens?.accessToken,
        hasIdToken: !!tokens?.idToken,
        hasRefreshToken: !!tokens?.refreshToken,
        expiresAtValue: tokens?.expiresAt,
        expiresAtType: typeof tokens?.expiresAt,
        isExpiresAtValid: !!(tokens?.expiresAt && typeof tokens?.expiresAt === 'number' && !isNaN(tokens?.expiresAt))
      });

      // Validate tokens before storing
      if (!tokens) {
        throw new Error('Tokens object is null or undefined');
      }

      const storePromises: Promise<void>[] = [];

      // Store access token if it exists
      if (tokens.accessToken && typeof tokens.accessToken === 'string') {
        storePromises.push(this.setItem(this.STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken));
        console.log('✅ SecureTokenStorage: Access token will be stored');
      } else {
        console.warn('⚠️ SecureTokenStorage: Skipping undefined/invalid access token');
        // Remove existing access token if it's invalid
        storePromises.push(this.deleteItem(this.STORAGE_KEYS.ACCESS_TOKEN).catch(() => {}));
      }

      // Store ID token if it exists
      if (tokens.idToken && typeof tokens.idToken === 'string') {
        storePromises.push(this.setItem(this.STORAGE_KEYS.ID_TOKEN, tokens.idToken));
        console.log('✅ SecureTokenStorage: ID token will be stored');
      } else {
        console.warn('⚠️ SecureTokenStorage: Skipping undefined/invalid ID token');
        // Remove existing ID token if it's invalid
        storePromises.push(this.deleteItem(this.STORAGE_KEYS.ID_TOKEN).catch(() => {}));
      }

      // Store refresh token if it exists (refresh token can be optional in some flows)
      if (tokens.refreshToken && typeof tokens.refreshToken === 'string') {
        storePromises.push(this.setItem(this.STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken));
        console.log('✅ SecureTokenStorage: Refresh token will be stored');
      } else {
        console.warn('⚠️ SecureTokenStorage: Skipping undefined/invalid refresh token');
        // Remove existing refresh token if it's invalid
        storePromises.push(this.deleteItem(this.STORAGE_KEYS.REFRESH_TOKEN).catch(() => {}));
      }

      // Store expiry time with fallback calculation
      let expiresAt = tokens.expiresAt;
      
      // If expiresAt is missing or invalid, calculate a reasonable default (1 hour from now)
      if (!expiresAt || typeof expiresAt !== 'number' || isNaN(expiresAt)) {
        console.warn('⚠️ SecureTokenStorage: Invalid or missing expiresAt, calculating fallback');
        console.log('🔍 SecureTokenStorage: Original expiresAt value:', expiresAt);
        
        // Default to 1 hour from now (3600 seconds)
        expiresAt = Math.floor(Date.now() / 1000) + 3600;
        console.log('✅ SecureTokenStorage: Using fallback expiresAt:', expiresAt);
      }
      
      storePromises.push(this.setItem(this.STORAGE_KEYS.TOKEN_EXPIRY, expiresAt.toString()));
      console.log('✅ SecureTokenStorage: Token expiry will be stored:', expiresAt);

      // Execute all storage operations
      await Promise.all(storePromises);

      console.log('✅ SecureTokenStorage: Tokens stored successfully');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to store tokens:', error);
      throw new Error(`Failed to store authentication tokens securely: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve authentication tokens from secure storage with permissive validation
   */
  async retrieveTokens(): Promise<CognitoTokens | null> {
    try {
      console.log('🔍 SecureTokenStorage: Retrieving tokens from secure storage (Platform:', Platform.OS, ')');

      const [accessToken, idToken, refreshToken, expiryString] = await Promise.all([
        this.getItem(this.STORAGE_KEYS.ACCESS_TOKEN),
        this.getItem(this.STORAGE_KEYS.ID_TOKEN),
        this.getItem(this.STORAGE_KEYS.REFRESH_TOKEN),
        this.getItem(this.STORAGE_KEYS.TOKEN_EXPIRY),
      ]);

      // Detailed logging of what tokens are available
      console.log('🔍 SecureTokenStorage: Token availability check:', {
        hasAccessToken: !!accessToken,
        hasIdToken: !!idToken,
        hasRefreshToken: !!refreshToken,
        hasExpiry: !!expiryString
      });

      // PERMISSIVE VALIDATION: Only require the essential tokens (accessToken and idToken)
      const missingEssentialTokens: string[] = [];
      if (!accessToken) missingEssentialTokens.push('accessToken');
      if (!idToken) missingEssentialTokens.push('idToken');

      if (missingEssentialTokens.length > 0) {
        console.log(`❌ SecureTokenStorage: Missing essential tokens: ${missingEssentialTokens.join(', ')}`);
        return null;
      }

      // Log optional missing tokens but don't fail
      const missingOptionalTokens: string[] = [];
      if (!refreshToken) missingOptionalTokens.push('refreshToken');
      if (!expiryString) missingOptionalTokens.push('expiryString');

      if (missingOptionalTokens.length > 0) {
        console.warn(`⚠️ SecureTokenStorage: Missing optional tokens (will use defaults): ${missingOptionalTokens.join(', ')}`);
      }

      // Handle expiry with fallback
      let expiresAt: number;
      if (expiryString) {
        expiresAt = parseInt(expiryString, 10);
        if (isNaN(expiresAt)) {
          console.warn('⚠️ SecureTokenStorage: Invalid expiry time format, using fallback');
          expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        }
      } else {
        console.warn('⚠️ SecureTokenStorage: No expiry time found, using fallback');
        expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      }

      const tokens: CognitoTokens = {
        accessToken: accessToken || '',
        idToken: idToken || '',
        refreshToken: refreshToken || '', // Provide empty string if missing
        expiresAt,
      };

      console.log('✅ SecureTokenStorage: Tokens retrieved successfully (permissive mode)');
      console.log('🔍 SecureTokenStorage: Final token summary:', {
        hasAccessToken: !!tokens.accessToken,
        hasIdToken: !!tokens.idToken,
        hasRefreshToken: !!tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        expiresAtDate: new Date(tokens.expiresAt * 1000).toISOString()
      });
      
      return tokens;

    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to retrieve tokens:', error);
      return null;
    }
  }

  /**
   * Store user data securely
   */
  async storeUserData(userData: any): Promise<void> {
    try {
      if (!userData) {
        console.warn('⚠️ SecureTokenStorage: Skipping undefined/null user data');
        // Remove existing user data if it's invalid
        await this.deleteItem(this.STORAGE_KEYS.USER_DATA).catch(() => {});
        return;
      }

      const userDataString = JSON.stringify(userData);
      await this.setItem(this.STORAGE_KEYS.USER_DATA, userDataString);
      console.log('✅ SecureTokenStorage: User data stored successfully');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to store user data:', error);
      throw new Error(`Failed to store user data securely: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve user data from secure storage
   */
  async retrieveUserData(): Promise<any | null> {
    try {
      const userDataString = await this.getItem(this.STORAGE_KEYS.USER_DATA);
      
      if (!userDataString) {
        return null;
      }

      return JSON.parse(userDataString);
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to retrieve user data:', error);
      return null;
    }
  }

  /**
   * Clear all stored authentication data
   */
  async clearAllTokens(): Promise<void> {
    try {
      console.log('🧹 SecureTokenStorage: Clearing all stored tokens');

      await Promise.all([
        this.deleteItem(this.STORAGE_KEYS.ACCESS_TOKEN),
        this.deleteItem(this.STORAGE_KEYS.ID_TOKEN),
        this.deleteItem(this.STORAGE_KEYS.REFRESH_TOKEN),
        this.deleteItem(this.STORAGE_KEYS.TOKEN_EXPIRY),
        this.deleteItem(this.STORAGE_KEYS.USER_DATA),
      ]);

      console.log('✅ SecureTokenStorage: All tokens cleared successfully');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to clear tokens:', error);
      // Don't throw error for cleanup operations
    }
  }

  /**
   * Check if tokens exist in storage
   */
  async hasStoredTokens(): Promise<boolean> {
    try {
      const accessToken = await this.getItem(this.STORAGE_KEYS.ACCESS_TOKEN);
      return !!accessToken;
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to check stored tokens:', error);
      return false;
    }
  }

  /**
   * Store legacy tokens for migration purposes
   */
  async storeLegacyTokens(tokens: any): Promise<void> {
    try {
      if (!tokens) {
        console.warn('⚠️ SecureTokenStorage: Skipping undefined/null legacy tokens');
        // Remove existing legacy tokens if they're invalid
        await this.deleteItem(this.STORAGE_KEYS.LEGACY_TOKENS).catch(() => {});
        return;
      }

      const tokensString = JSON.stringify(tokens);
      await this.setItem(this.STORAGE_KEYS.LEGACY_TOKENS, tokensString);
      console.log('✅ SecureTokenStorage: Legacy tokens stored for migration');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to store legacy tokens:', error);
      throw new Error(`Failed to store legacy tokens: ${(error as Error).message}`);
    }
  }

  /**
   * Retrieve legacy tokens for migration
   */
  async retrieveLegacyTokens(): Promise<any | null> {
    try {
      const tokensString = await this.getItem(this.STORAGE_KEYS.LEGACY_TOKENS);
      
      if (!tokensString) {
        return null;
      }

      return JSON.parse(tokensString);
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to retrieve legacy tokens:', error);
      return null;
    }
  }

  /**
   * Clear legacy tokens after successful migration
   */
  async clearLegacyTokens(): Promise<void> {
    try {
      await this.deleteItem(this.STORAGE_KEYS.LEGACY_TOKENS);
      console.log('✅ SecureTokenStorage: Legacy tokens cleared after migration');
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to clear legacy tokens:', error);
    }
  }

  /**
   * Get storage statistics for debugging
   */
  async getStorageStats(): Promise<{
    hasAccessToken: boolean;
    hasIdToken: boolean;
    hasRefreshToken: boolean;
    hasUserData: boolean;
    hasLegacyTokens: boolean;
  }> {
    try {
      const [accessToken, idToken, refreshToken, userData, legacyTokens] = await Promise.all([
        this.getItem(this.STORAGE_KEYS.ACCESS_TOKEN),
        this.getItem(this.STORAGE_KEYS.ID_TOKEN),
        this.getItem(this.STORAGE_KEYS.REFRESH_TOKEN),
        this.getItem(this.STORAGE_KEYS.USER_DATA),
        this.getItem(this.STORAGE_KEYS.LEGACY_TOKENS),
      ]);

      return {
        hasAccessToken: !!accessToken,
        hasIdToken: !!idToken,
        hasRefreshToken: !!refreshToken,
        hasUserData: !!userData,
        hasLegacyTokens: !!legacyTokens,
      };
    } catch (error) {
      console.error('❌ SecureTokenStorage: Failed to get storage stats:', error);
      return {
        hasAccessToken: false,
        hasIdToken: false,
        hasRefreshToken: false,
        hasUserData: false,
        hasLegacyTokens: false,
      };
    }
  }

  /**
   * Test secure storage functionality
   */
  async testSecureStorage(): Promise<boolean> {
    try {
      const testKey = 'trinity_test_key';
      const testValue = 'test_value_' + Date.now();

      // Test write
      await this.setItem(testKey, testValue);
      
      // Test read
      const retrievedValue = await this.getItem(testKey);
      
      // Test delete
      await this.deleteItem(testKey);

      const success = retrievedValue === testValue;
      console.log(`🧪 SecureTokenStorage: Test ${success ? 'passed' : 'failed'}`);
      
      return success;
    } catch (error) {
      console.error('❌ SecureTokenStorage: Test failed:', error);
      return false;
    }
  }
}

export const secureTokenStorage = new SecureTokenStorage();
export default secureTokenStorage;