/**
 * Background Token Refresh Service
 * Handles automatic token refresh in the background without user intervention
 * Updates all services with new tokens after refresh
 */

import { cognitoAuthService, CognitoTokens } from './cognitoAuthService';
import { secureTokenStorage } from './secureTokenStorage';
import { loggingService } from './loggingService';
import { networkService } from './networkService';
import { AppState, AppStateStatus } from 'react-native';

export interface TokenRefreshConfig {
  refreshThresholdMinutes: number; // Refresh when token expires within this time
  backgroundRefreshIntervalMinutes: number; // How often to check in background
  maxRetryAttempts: number;
  retryDelaySeconds: number;
  enableBackgroundRefresh: boolean;
}

export interface TokenRefreshResult {
  success: boolean;
  refreshed: boolean;
  error?: string;
  newTokens?: CognitoTokens;
  nextRefreshTime?: number;
}

export interface TokenRefreshStatus {
  isActive: boolean;
  lastRefreshTime?: number;
  nextRefreshTime?: number;
  refreshCount: number;
  errorCount: number;
  lastError?: string;
}

class BackgroundTokenRefreshService {
  private config: TokenRefreshConfig = {
    refreshThresholdMinutes: 15, // Refresh 15 minutes before expiry
    backgroundRefreshIntervalMinutes: 5, // Check every 5 minutes
    maxRetryAttempts: 3,
    retryDelaySeconds: 30,
    enableBackgroundRefresh: true,
  };

  private refreshInterval: NodeJS.Timeout | null = null;
  private isRefreshing = false;
  private refreshCount = 0;
  private errorCount = 0;
  private lastRefreshTime?: number;
  private lastError?: string;
  private appStateSubscription: any = null;

  // Event listeners for token refresh events
  private refreshListeners: Array<(result: TokenRefreshResult) => void> = [];

  constructor() {
    loggingService.info('BackgroundTokenRefresh', 'Background token refresh service initialized', {
      config: this.config,
    });
  }

  /**
   * Start background token refresh
   */
  start(customConfig?: Partial<TokenRefreshConfig>): void {
    try {
      // Update config if provided
      if (customConfig) {
        this.config = { ...this.config, ...customConfig };
      }

      if (!this.config.enableBackgroundRefresh) {
        loggingService.info('BackgroundTokenRefresh', 'Background refresh disabled');
        return;
      }

      // Stop existing interval if running
      this.stop();

      loggingService.info('BackgroundTokenRefresh', 'Starting background token refresh', {
        intervalMinutes: this.config.backgroundRefreshIntervalMinutes,
        thresholdMinutes: this.config.refreshThresholdMinutes,
      });

      // Set up periodic refresh check
      const intervalMs = this.config.backgroundRefreshIntervalMinutes * 60 * 1000;
      this.refreshInterval = setInterval(() => {
        this.checkAndRefreshTokens();
      }, intervalMs);

      // Set up app state listener for foreground refresh
      this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange.bind(this));

      // Perform initial check
      setTimeout(() => this.checkAndRefreshTokens(), 1000);

    } catch (error: any) {
      console.error('Error starting background token refresh:', error);
      loggingService.error('BackgroundTokenRefresh', 'Failed to start service', { error: error.message });
    }
  }

  /**
   * Stop background token refresh
   */
  stop(): void {
    try {
      loggingService.info('BackgroundTokenRefresh', 'Stopping background token refresh');

      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }

      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
        this.appStateSubscription = null;
      }

    } catch (error: any) {
      console.error('Error stopping background token refresh:', error);
      loggingService.error('BackgroundTokenRefresh', 'Failed to stop service', { error: error.message });
    }
  }

  /**
   * Manually trigger token refresh check
   */
  async refreshNow(): Promise<TokenRefreshResult> {
    return await this.checkAndRefreshTokens(true);
  }

  /**
   * Check if tokens need refresh and refresh if necessary
   */
  private async checkAndRefreshTokens(forceCheck = false): Promise<TokenRefreshResult> {
    if (this.isRefreshing && !forceCheck) {
      return {
        success: false,
        refreshed: false,
        error: 'Refresh already in progress',
      };
    }

    try {
      this.isRefreshing = true;

      loggingService.debug('BackgroundTokenRefresh', 'Checking tokens for refresh', { forceCheck });

      // Check if we have stored tokens
      const storedTokens = await secureTokenStorage.retrieveTokens();
      if (!storedTokens) {
        loggingService.debug('BackgroundTokenRefresh', 'No stored tokens found');
        return {
          success: true,
          refreshed: false,
        };
      }

      // Parse access token to check expiration
      const accessTokenPayload = this.parseJWT(storedTokens.accessToken);
      if (!accessTokenPayload || !accessTokenPayload.exp) {
        loggingService.warn('BackgroundTokenRefresh', 'Invalid access token format');
        return {
          success: false,
          refreshed: false,
          error: 'Invalid token format',
        };
      }

      const now = Date.now();
      const tokenExpiryTime = accessTokenPayload.exp * 1000;
      const refreshThresholdTime = tokenExpiryTime - (this.config.refreshThresholdMinutes * 60 * 1000);

      loggingService.debug('BackgroundTokenRefresh', 'Token expiry check', {
        tokenExpiryTime: new Date(tokenExpiryTime).toISOString(),
        refreshThresholdTime: new Date(refreshThresholdTime).toISOString(),
        needsRefresh: now >= refreshThresholdTime,
        minutesUntilExpiry: Math.round((tokenExpiryTime - now) / (60 * 1000)),
      });

      // Check if token needs refresh
      if (now < refreshThresholdTime && !forceCheck) {
        const nextRefreshTime = refreshThresholdTime;
        return {
          success: true,
          refreshed: false,
          nextRefreshTime,
        };
      }

      // Check network connectivity
      if (!networkService.isConnected()) {
        loggingService.warn('BackgroundTokenRefresh', 'No network connection for token refresh');
        return {
          success: false,
          refreshed: false,
          error: 'No network connection',
        };
      }

      // Perform token refresh
      const refreshResult = await this.performTokenRefresh(storedTokens.refreshToken);
      
      if (refreshResult.success && refreshResult.newTokens) {
        // Store new tokens securely
        await secureTokenStorage.storeTokens(refreshResult.newTokens);
        
        // Update refresh statistics
        this.refreshCount++;
        this.lastRefreshTime = now;
        this.lastError = undefined;

        // Notify listeners
        this.notifyRefreshListeners(refreshResult);

        loggingService.logAuth('token_refresh', {
          refreshCount: this.refreshCount,
        });

        return refreshResult;
      } else {
        // Handle refresh failure
        this.errorCount++;
        this.lastError = refreshResult.error;

        loggingService.logAuth('auth_error', {
          error: refreshResult.error,
          errorCount: this.errorCount,
        });

        return refreshResult;
      }

    } catch (error: any) {
      console.error('Background token refresh error:', error);
      
      this.errorCount++;
      this.lastError = error.message;

      loggingService.error('BackgroundTokenRefresh', 'Token refresh check failed', {
        error: error.message,
        errorCount: this.errorCount,
      });

      return {
        success: false,
        refreshed: false,
        error: error.message || 'Unknown error during token refresh',
      };

    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Perform the actual token refresh with retry logic
   */
  private async performTokenRefresh(refreshToken: string): Promise<TokenRefreshResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetryAttempts; attempt++) {
      try {
        loggingService.debug('BackgroundTokenRefresh', `Token refresh attempt ${attempt}/${this.config.maxRetryAttempts}`);

        const result = await cognitoAuthService.refreshToken(refreshToken);
        
        if (result.success && result.tokens) {
          loggingService.debug('BackgroundTokenRefresh', 'Token refresh successful', { attempt });
          
          return {
            success: true,
            refreshed: true,
            newTokens: result.tokens,
          };
        } else {
          lastError = result.error || 'Token refresh failed';
          loggingService.warn('BackgroundTokenRefresh', `Token refresh attempt ${attempt} failed`, {
            error: lastError,
          });
        }

      } catch (error: any) {
        lastError = error.message || 'Network error during token refresh';
        loggingService.warn('BackgroundTokenRefresh', `Token refresh attempt ${attempt} threw error`, {
          error: lastError,
        });
      }

      // Wait before retry (except on last attempt)
      if (attempt < this.config.maxRetryAttempts) {
        const delayMs = this.config.retryDelaySeconds * 1000 * attempt; // Exponential backoff
        loggingService.debug('BackgroundTokenRefresh', `Waiting ${delayMs}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return {
      success: false,
      refreshed: false,
      error: lastError || 'All refresh attempts failed',
    };
  }

  /**
   * Handle app state changes (foreground/background)
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    try {
      loggingService.debug('BackgroundTokenRefresh', 'App state changed', { nextAppState });

      if (nextAppState === 'active') {
        // App came to foreground, check tokens immediately
        setTimeout(() => this.checkAndRefreshTokens(), 500);
      }

    } catch (error: any) {
      console.error('Error handling app state change:', error);
      loggingService.error('BackgroundTokenRefresh', 'App state change handler failed', { error: error.message });
    }
  }

  /**
   * Add listener for token refresh events
   */
  addRefreshListener(listener: (result: TokenRefreshResult) => void): void {
    this.refreshListeners.push(listener);
  }

  /**
   * Remove token refresh listener
   */
  removeRefreshListener(listener: (result: TokenRefreshResult) => void): void {
    const index = this.refreshListeners.indexOf(listener);
    if (index > -1) {
      this.refreshListeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of token refresh
   */
  private notifyRefreshListeners(result: TokenRefreshResult): void {
    try {
      this.refreshListeners.forEach(listener => {
        try {
          listener(result);
        } catch (error) {
          console.error('Error in token refresh listener:', error);
        }
      });
    } catch (error) {
      console.error('Error notifying refresh listeners:', error);
    }
  }

  /**
   * Get current refresh status
   */
  getStatus(): TokenRefreshStatus {
    return {
      isActive: !!this.refreshInterval,
      lastRefreshTime: this.lastRefreshTime,
      refreshCount: this.refreshCount,
      errorCount: this.errorCount,
      lastError: this.lastError,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<TokenRefreshConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('BackgroundTokenRefresh', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });

    // Restart if interval changed and service is running
    if (this.refreshInterval && oldConfig.backgroundRefreshIntervalMinutes !== this.config.backgroundRefreshIntervalMinutes) {
      this.start();
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.refreshCount = 0;
    this.errorCount = 0;
    this.lastRefreshTime = undefined;
    this.lastError = undefined;
    
    loggingService.info('BackgroundTokenRefresh', 'Statistics reset');
  }

  /**
   * Parse JWT token (simplified version)
   */
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

export const backgroundTokenRefreshService = new BackgroundTokenRefreshService();