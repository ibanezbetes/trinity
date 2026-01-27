/**
 * Session Cleanup Service
 * Handles proper session cleanup on sign out, including token revocation
 * and notification of all app components
 */

import { cognitoAuthService } from './cognitoAuthService';
import { federatedAuthService } from './federatedAuthService';
import { secureTokenStorage } from './secureTokenStorage';
import { backgroundTokenRefreshService } from './backgroundTokenRefreshService';
import { loggingService } from './loggingService';

export interface CleanupResult {
  success: boolean;
  errors: string[];
  completedSteps: string[];
  skippedSteps: string[];
}

export interface CleanupOptions {
  revokeTokens?: boolean;
  clearSecureStorage?: boolean;
  stopBackgroundServices?: boolean;
  notifyComponents?: boolean;
  forceCleanup?: boolean; // Continue cleanup even if some steps fail
}

class SessionCleanupService {
  private cleanupListeners: Array<() => void | Promise<void>> = [];

  constructor() {
    loggingService.info('SessionCleanup', 'Session cleanup service initialized');
  }

  /**
   * Perform comprehensive session cleanup on sign out
   */
  async performSignOutCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const defaultOptions: CleanupOptions = {
      revokeTokens: true,
      clearSecureStorage: true,
      stopBackgroundServices: true,
      notifyComponents: true,
      forceCleanup: true,
      ...options,
    };

    const result: CleanupResult = {
      success: true,
      errors: [],
      completedSteps: [],
      skippedSteps: [],
    };

    loggingService.logAuth('session_cleanup_start', {
      options: defaultOptions,
    });

    try {
      // Step 1: Stop background services
      if (defaultOptions.stopBackgroundServices) {
        try {
          await this.stopBackgroundServices();
          result.completedSteps.push('stop_background_services');
          loggingService.debug('SessionCleanup', 'Background services stopped');
        } catch (error: any) {
          const errorMsg = `Failed to stop background services: ${error.message}`;
          result.errors.push(errorMsg);
          loggingService.error('SessionCleanup', errorMsg, { error: error.message });
          
          if (!defaultOptions.forceCleanup) {
            result.success = false;
            return result;
          }
        }
      } else {
        result.skippedSteps.push('stop_background_services');
      }

      // Step 2: Revoke tokens with Cognito
      if (defaultOptions.revokeTokens) {
        try {
          await this.revokeAuthenticationTokens();
          result.completedSteps.push('revoke_tokens');
          loggingService.debug('SessionCleanup', 'Tokens revoked');
        } catch (error: any) {
          const errorMsg = `Failed to revoke tokens: ${error.message}`;
          result.errors.push(errorMsg);
          loggingService.error('SessionCleanup', errorMsg, { error: error.message });
          
          if (!defaultOptions.forceCleanup) {
            result.success = false;
            return result;
          }
        }
      } else {
        result.skippedSteps.push('revoke_tokens');
      }

      // Step 3: Clear secure storage
      if (defaultOptions.clearSecureStorage) {
        try {
          await this.clearSecureStorage();
          result.completedSteps.push('clear_secure_storage');
          loggingService.debug('SessionCleanup', 'Secure storage cleared');
        } catch (error: any) {
          const errorMsg = `Failed to clear secure storage: ${error.message}`;
          result.errors.push(errorMsg);
          loggingService.error('SessionCleanup', errorMsg, { error: error.message });
          
          if (!defaultOptions.forceCleanup) {
            result.success = false;
            return result;
          }
        }
      } else {
        result.skippedSteps.push('clear_secure_storage');
      }

      // Step 4: Clear application cache and temporary data
      try {
        await this.clearApplicationCache();
        result.completedSteps.push('clear_application_cache');
        loggingService.debug('SessionCleanup', 'Application cache cleared');
      } catch (error: any) {
        const errorMsg = `Failed to clear application cache: ${error.message}`;
        result.errors.push(errorMsg);
        loggingService.error('SessionCleanup', errorMsg, { error: error.message });
        
        if (!defaultOptions.forceCleanup) {
          result.success = false;
          return result;
        }
      }

      // Step 5: Notify components of sign out
      if (defaultOptions.notifyComponents) {
        try {
          await this.notifySignOutComponents();
          result.completedSteps.push('notify_components');
          loggingService.debug('SessionCleanup', 'Components notified');
        } catch (error: any) {
          const errorMsg = `Failed to notify components: ${error.message}`;
          result.errors.push(errorMsg);
          loggingService.error('SessionCleanup', errorMsg, { error: error.message });
          
          // Component notification failure shouldn't stop cleanup
          if (!defaultOptions.forceCleanup) {
            result.success = false;
            return result;
          }
        }
      } else {
        result.skippedSteps.push('notify_components');
      }

      // Step 6: Reset service states
      try {
        await this.resetServiceStates();
        result.completedSteps.push('reset_service_states');
        loggingService.debug('SessionCleanup', 'Service states reset');
      } catch (error: any) {
        const errorMsg = `Failed to reset service states: ${error.message}`;
        result.errors.push(errorMsg);
        loggingService.error('SessionCleanup', errorMsg, { error: error.message });
        
        if (!defaultOptions.forceCleanup) {
          result.success = false;
          return result;
        }
      }

      // Determine final success status
      result.success = result.errors.length === 0 || defaultOptions.forceCleanup;

      loggingService.logAuth('session_cleanup_complete', {
        success: result.success,
        completedSteps: result.completedSteps.length,
        errors: result.errors.length,
        skippedSteps: result.skippedSteps.length,
      });

      return result;

    } catch (error: any) {
      console.error('Session cleanup failed:', error);
      
      result.success = false;
      result.errors.push(`Cleanup process failed: ${error.message}`);
      
      loggingService.logAuth('session_cleanup_error', {
        error: error.message,
        completedSteps: result.completedSteps,
      });

      return result;
    }
  }

  /**
   * Emergency cleanup - force cleanup even if some steps fail
   */
  async emergencyCleanup(): Promise<CleanupResult> {
    loggingService.warn('SessionCleanup', 'Performing emergency cleanup');
    
    return await this.performSignOutCleanup({
      revokeTokens: false, // Skip token revocation in emergency
      clearSecureStorage: true,
      stopBackgroundServices: true,
      notifyComponents: true,
      forceCleanup: true,
    });
  }

  /**
   * Add listener for cleanup events
   */
  addCleanupListener(listener: () => void | Promise<void>): void {
    this.cleanupListeners.push(listener);
  }

  /**
   * Remove cleanup listener
   */
  removeCleanupListener(listener: () => void | Promise<void>): void {
    const index = this.cleanupListeners.indexOf(listener);
    if (index > -1) {
      this.cleanupListeners.splice(index, 1);
    }
  }

  /**
   * Check if cleanup is needed (detect stale sessions)
   */
  async isCleanupNeeded(): Promise<{
    needed: boolean;
    reasons: string[];
    recommendations: string[];
  }> {
    const reasons: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check for stored tokens
      const hasStoredTokens = await secureTokenStorage.hasStoredTokens();
      if (hasStoredTokens) {
        const tokens = await secureTokenStorage.retrieveTokens();
        if (tokens) {
          // Check if tokens are expired
          const accessTokenPayload = this.parseJWT(tokens.accessToken);
          if (accessTokenPayload && accessTokenPayload.exp) {
            const now = Date.now();
            const expiryTime = accessTokenPayload.exp * 1000;
            
            if (now > expiryTime) {
              reasons.push('Access token is expired');
              recommendations.push('Clear expired tokens');
            }
          }
        }
      }

      // Check background service status
      const refreshStatus = backgroundTokenRefreshService.getStatus();
      if (refreshStatus.isActive && refreshStatus.errorCount > 5) {
        reasons.push('Background refresh service has too many errors');
        recommendations.push('Reset background service state');
      }

      // Check storage info
      const storageInfo = await secureTokenStorage.getStorageInfo();
      if (storageInfo.hasTokens && storageInfo.age && storageInfo.age > 30 * 24 * 60 * 60 * 1000) {
        reasons.push('Stored tokens are very old (>30 days)');
        recommendations.push('Refresh or clear old tokens');
      }

      return {
        needed: reasons.length > 0,
        reasons,
        recommendations,
      };

    } catch (error: any) {
      console.error('Error checking cleanup needs:', error);
      return {
        needed: true,
        reasons: ['Error checking session state'],
        recommendations: ['Perform emergency cleanup'],
      };
    }
  }

  // Private helper methods

  private async stopBackgroundServices(): Promise<void> {
    try {
      // Stop background token refresh
      backgroundTokenRefreshService.stop();
      
      // Add other background services here as needed
      
      loggingService.debug('SessionCleanup', 'All background services stopped');
    } catch (error) {
      throw new Error(`Failed to stop background services: ${error}`);
    }
  }

  private async revokeAuthenticationTokens(): Promise<void> {
    try {
      // Get current tokens for revocation
      const storedTokens = await secureTokenStorage.retrieveTokens();
      
      if (storedTokens) {
        // Revoke tokens with Cognito
        const cognitoResult = await cognitoAuthService.signOut(storedTokens.accessToken);
        if (!cognitoResult.success) {
          console.warn('Cognito sign out warning:', cognitoResult.error);
          // Don't throw error, continue with cleanup
        }

        // Sign out from federated services
        const federatedResult = await federatedAuthService.signOut(storedTokens.accessToken);
        if (!federatedResult.success) {
          console.warn('Federated sign out warning:', federatedResult.error);
          // Don't throw error, continue with cleanup
        }
      }

      loggingService.debug('SessionCleanup', 'Authentication tokens revoked');
    } catch (error) {
      // Log error but don't fail cleanup for token revocation issues
      console.warn('Token revocation failed:', error);
      loggingService.warn('SessionCleanup', 'Token revocation failed, continuing cleanup', { error });
    }
  }

  private async clearSecureStorage(): Promise<void> {
    try {
      // Clear secure token storage
      await secureTokenStorage.clearTokens();
      
      // Clear Cognito service tokens
      await cognitoAuthService.clearTokens();
      
      loggingService.debug('SessionCleanup', 'Secure storage cleared');
    } catch (error) {
      throw new Error(`Failed to clear secure storage: ${error}`);
    }
  }

  private async clearApplicationCache(): Promise<void> {
    try {
      // Clear any application-specific cache
      // This could include user preferences, cached API responses, etc.
      
      // For now, just clear any temporary authentication data
      if (global.currentAuthState) {
        delete global.currentAuthState;
      }
      
      loggingService.debug('SessionCleanup', 'Application cache cleared');
    } catch (error) {
      throw new Error(`Failed to clear application cache: ${error}`);
    }
  }

  private async notifySignOutComponents(): Promise<void> {
    try {
      // Notify all registered cleanup listeners
      const notificationPromises = this.cleanupListeners.map(async (listener) => {
        try {
          await listener();
        } catch (error) {
          console.warn('Cleanup listener error:', error);
          // Don't fail the whole process for individual listener errors
        }
      });

      await Promise.allSettled(notificationPromises);
      
      // Broadcast sign out event globally
      if (global.currentAuthState) {
        global.currentAuthState = { isAuthenticated: false, user: null };
      }
      
      loggingService.debug('SessionCleanup', `Notified ${this.cleanupListeners.length} components`);
    } catch (error) {
      throw new Error(`Failed to notify components: ${error}`);
    }
  }

  private async resetServiceStates(): Promise<void> {
    try {
      // Reset background token refresh statistics
      backgroundTokenRefreshService.resetStats();
      
      // Clear logging user context
      loggingService.clearUserId();
      
      // Reset any other service states as needed
      
      loggingService.debug('SessionCleanup', 'Service states reset');
    } catch (error) {
      throw new Error(`Failed to reset service states: ${error}`);
    }
  }

  private parseJWT(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error parsing JWT:', error);
      return null;
    }
  }
}

export const sessionCleanupService = new SessionCleanupService();
export type { CleanupResult, CleanupOptions };