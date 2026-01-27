/**
 * Migration Service
 * Handles migration from legacy NestJS authentication to AWS Cognito
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

interface LegacyTokens {
  authToken?: string;
  refreshToken?: string;
  user?: any;
  expiresAt?: string;
}

interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

class MigrationService {
  private readonly LEGACY_TOKEN_KEYS = [
    'authToken',
    'refreshToken', 
    'user',
    'userToken',
    'nestjs_token',
    'api_token',
    'trinity_auth_token'
  ];

  private readonly COGNITO_TOKEN_KEY = 'cognitoTokens';
  private readonly MIGRATION_FLAG_KEY = 'migration_completed';

  /**
   * Detect if user has legacy tokens that need migration
   */
  async hasLegacyTokens(): Promise<boolean> {
    try {
      for (const key of this.LEGACY_TOKEN_KEYS) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          console.log(`🔍 Found legacy token: ${key}`);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('❌ Error checking for legacy tokens:', error);
      return false;
    }
  }

  /**
   * Get all legacy tokens for analysis
   */
  async getLegacyTokens(): Promise<LegacyTokens> {
    const legacyTokens: LegacyTokens = {};

    try {
      for (const key of this.LEGACY_TOKEN_KEYS) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          try {
            // Try to parse as JSON first
            legacyTokens[key as keyof LegacyTokens] = JSON.parse(value);
          } catch {
            // If not JSON, store as string
            legacyTokens[key as keyof LegacyTokens] = value;
          }
        }
      }
    } catch (error) {
      console.error('❌ Error retrieving legacy tokens:', error);
    }

    return legacyTokens;
  }

  /**
   * Check if legacy tokens are expired
   */
  isLegacyTokenExpired(legacyTokens: LegacyTokens): boolean {
    if (!legacyTokens.expiresAt) {
      // If no expiration info, assume expired for safety
      return true;
    }

    try {
      const expirationDate = new Date(legacyTokens.expiresAt);
      const now = new Date();
      return expirationDate <= now;
    } catch (error) {
      console.error('❌ Error checking token expiration:', error);
      return true; // Assume expired on error
    }
  }

  /**
   * Clean up all legacy tokens
   */
  async cleanupLegacyTokens(): Promise<void> {
    console.log('🧹 Starting legacy token cleanup...');

    try {
      const removedKeys: string[] = [];

      for (const key of this.LEGACY_TOKEN_KEYS) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          await AsyncStorage.removeItem(key);
          removedKeys.push(key);
          console.log(`🗑️ Removed legacy token: ${key}`);
        }
      }

      if (removedKeys.length > 0) {
        console.log(`✅ Cleaned up ${removedKeys.length} legacy tokens:`, removedKeys);
      } else {
        console.log('ℹ️ No legacy tokens found to clean up');
      }

      // Mark migration as completed
      await this.markMigrationCompleted();

    } catch (error) {
      console.error('❌ Error during legacy token cleanup:', error);
      throw error;
    }
  }

  /**
   * Check if user has valid Cognito tokens
   */
  async hasValidCognitoTokens(): Promise<boolean> {
    try {
      const cognitoTokensStr = await AsyncStorage.getItem(this.COGNITO_TOKEN_KEY);
      if (!cognitoTokensStr) {
        return false;
      }

      const cognitoTokens: CognitoTokens = JSON.parse(cognitoTokensStr);
      
      // Check if tokens exist
      if (!cognitoTokens.accessToken || !cognitoTokens.idToken) {
        return false;
      }

      // Check if tokens are expired
      const now = Date.now() / 1000; // Convert to seconds
      if (cognitoTokens.expiresAt && cognitoTokens.expiresAt <= now) {
        console.log('⏰ Cognito tokens are expired');
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ Error checking Cognito tokens:', error);
      return false;
    }
  }

  /**
   * Perform complete migration check and cleanup
   */
  async performMigrationCheck(): Promise<'no_migration_needed' | 'migration_completed' | 'relogin_required'> {
    try {
      // Check if migration was already completed
      const migrationCompleted = await this.isMigrationCompleted();
      if (migrationCompleted) {
        console.log('ℹ️ Migration already completed');
        return 'no_migration_needed';
      }

      // Check for legacy tokens
      const hasLegacy = await this.hasLegacyTokens();
      if (!hasLegacy) {
        console.log('ℹ️ No legacy tokens found');
        await this.markMigrationCompleted();
        return 'no_migration_needed';
      }

      // Get legacy tokens for analysis
      const legacyTokens = await this.getLegacyTokens();
      console.log('🔍 Found legacy tokens, analyzing...');

      // Check if user has valid Cognito tokens
      const hasValidCognito = await this.hasValidCognitoTokens();
      
      if (hasValidCognito) {
        // User already has Cognito tokens, just cleanup legacy
        console.log('✅ User has valid Cognito tokens, cleaning up legacy tokens');
        await this.cleanupLegacyTokens();
        return 'migration_completed';
      } else {
        // User needs to re-login with Cognito
        console.log('🔄 User needs to re-login with Cognito');
        await this.cleanupLegacyTokens();
        return 'relogin_required';
      }

    } catch (error) {
      console.error('❌ Error during migration check:', error);
      // On error, assume re-login is required for safety
      return 'relogin_required';
    }
  }

  /**
   * Show re-login message to user
   */
  showReloginMessage(): void {
    try {
      Alert.alert(
        'Actualización de Seguridad',
        'Hemos actualizado nuestro sistema de autenticación para mayor seguridad. Por favor, inicia sesión nuevamente.',
        [
          {
            text: 'Entendido',
            style: 'default'
          }
        ],
        { cancelable: false }
      );
    } catch (error) {
      console.error('❌ Error showing re-login message:', error);
      // Fallback to console message if Alert fails
      console.log('🔄 Re-login required: Please sign in again due to authentication system update');
    }
  }

  /**
   * Mark migration as completed
   */
  private async markMigrationCompleted(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.MIGRATION_FLAG_KEY, JSON.stringify({
        completed: true,
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }));
      console.log('✅ Migration marked as completed');
    } catch (error) {
      console.error('❌ Error marking migration as completed:', error);
    }
  }

  /**
   * Check if migration was already completed
   */
  private async isMigrationCompleted(): Promise<boolean> {
    try {
      const migrationFlag = await AsyncStorage.getItem(this.MIGRATION_FLAG_KEY);
      if (!migrationFlag) {
        return false;
      }

      const migrationData = JSON.parse(migrationFlag);
      return migrationData.completed === true;
    } catch (error) {
      console.error('❌ Error checking migration status:', error);
      return false;
    }
  }

  /**
   * Reset migration status (for testing purposes)
   */
  async resetMigrationStatus(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.MIGRATION_FLAG_KEY);
      console.log('🔄 Migration status reset');
    } catch (error) {
      console.error('❌ Error resetting migration status:', error);
    }
  }

  /**
   * Get migration statistics for debugging
   */
  async getMigrationStats(): Promise<{
    hasLegacyTokens: boolean;
    hasValidCognitoTokens: boolean;
    migrationCompleted: boolean;
    legacyTokenCount: number;
    legacyTokenKeys: string[];
  }> {
    const hasLegacy = await this.hasLegacyTokens();
    const hasValidCognito = await this.hasValidCognitoTokens();
    const migrationCompleted = await this.isMigrationCompleted();
    const legacyTokens = await this.getLegacyTokens();
    const legacyTokenKeys = Object.keys(legacyTokens);

    return {
      hasLegacyTokens: hasLegacy,
      hasValidCognitoTokens: hasValidCognito,
      migrationCompleted,
      legacyTokenCount: legacyTokenKeys.length,
      legacyTokenKeys
    };
  }
}

export const migrationService = new MigrationService();
export default migrationService;