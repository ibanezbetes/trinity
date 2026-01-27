/**
 * Network Resilience Service
 * Handles authentication state synchronization when network connectivity is restored
 * and provides offline authentication state management
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { cognitoAuthService, CognitoTokens } from './cognitoAuthService';
import { secureTokenStorage } from './secureTokenStorage';
import { backgroundTokenRefreshService } from './backgroundTokenRefreshService';
import { loggingService } from './loggingService';

export interface NetworkResilienceConfig {
  enableOfflineMode: boolean;
  syncRetryAttempts: number;
  syncRetryDelayMs: number;
  offlineTokenValidityHours: number;
  enableConnectivityMonitoring: boolean;
}

export interface NetworkSyncResult {
  success: boolean;
  syncedTokens: boolean;
  syncedUserData: boolean;
  error?: string;
  retryCount: number;
}

export interface OfflineAuthState {
  isOffline: boolean;
  lastSyncTime: number;
  offlineTokensValid: boolean;
  pendingSyncOperations: string[];
}

class NetworkResilienceService {
  private config: NetworkResilienceConfig = {
    enableOfflineMode: true,
    syncRetryAttempts: 3,
    syncRetryDelayMs: 2000,
    offlineTokenValidityHours: 24,
    enableConnectivityMonitoring: true,
  };

  private isOnline: boolean = true;
  private lastSyncTime: number = 0;
  private pendingSyncOperations: Set<string> = new Set();
  private connectivityListener: (() => void) | null = null;
  private syncInProgress: boolean = false;

  // Event listeners for network events
  private networkEventListeners: Array<(event: { type: 'online' | 'offline' | 'sync_completed' | 'sync_failed'; data?: any }) => void> = [];

  constructor() {
    loggingService.info('NetworkResilience', 'Network resilience service initialized', {
      config: this.config,
    });
  }

  /**
   * Start network monitoring and resilience features
   */
  async start(customConfig?: Partial<NetworkResilienceConfig>): Promise<void> {
    try {
      // Update config if provided
      if (customConfig) {
        this.config = { ...this.config, ...customConfig };
      }

      loggingService.info('NetworkResilience', 'Starting network resilience monitoring', {
        config: this.config,
      });

      // Check initial network state
      const netInfoState = await NetInfo.fetch();
      this.isOnline = netInfoState.isConnected ?? false;

      loggingService.info('NetworkResilience', 'Initial network state', {
        isOnline: this.isOnline,
        connectionType: netInfoState.type,
      });

      // Set up connectivity monitoring if enabled
      if (this.config.enableConnectivityMonitoring) {
        this.connectivityListener = NetInfo.addEventListener(this.handleConnectivityChange.bind(this));
      }

      // If we're online, perform initial sync
      if (this.isOnline) {
        await this.performAuthSync();
      }

    } catch (error: any) {
      console.error('Error starting network resilience service:', error);
      loggingService.error('NetworkResilience', 'Failed to start service', { error: error.message });
    }
  }

  /**
   * Stop network monitoring
   */
  stop(): void {
    try {
      loggingService.info('NetworkResilience', 'Stopping network resilience monitoring');

      if (this.connectivityListener) {
        this.connectivityListener();
        this.connectivityListener = null;
      }

      this.pendingSyncOperations.clear();
      this.syncInProgress = false;

    } catch (error: any) {
      console.error('Error stopping network resilience service:', error);
      loggingService.error('NetworkResilience', 'Failed to stop service', { error: error.message });
    }
  }

  /**
   * Manually trigger authentication sync
   */
  async syncAuthState(): Promise<NetworkSyncResult> {
    return await this.performAuthSync();
  }

  /**
   * Check if offline authentication is valid
   */
  async isOfflineAuthValid(): Promise<boolean> {
    try {
      if (!this.config.enableOfflineMode) {
        return false;
      }

      // Check if we have stored tokens
      const tokens = await secureTokenStorage.retrieveTokens();
      if (!tokens) {
        return false;
      }

      // Check token expiration
      const accessTokenPayload = this.parseJWT(tokens.accessToken);
      if (!accessTokenPayload || !accessTokenPayload.exp) {
        return false;
      }

      const now = Date.now();
      const expiryTime = accessTokenPayload.exp * 1000;
      const offlineValidityMs = this.config.offlineTokenValidityHours * 60 * 60 * 1000;

      // Token is valid if it hasn't expired and is within offline validity window
      const isValid = expiryTime > now && (now - this.lastSyncTime) < offlineValidityMs;

      loggingService.debug('NetworkResilience', 'Offline auth validity check', {
        isValid,
        expiryTime,
        lastSyncTime: this.lastSyncTime,
        timeSinceSync: now - this.lastSyncTime,
      });

      return isValid;

    } catch (error: any) {
      console.error('Error checking offline auth validity:', error);
      loggingService.error('NetworkResilience', 'Failed to check offline auth validity', { error: error.message });
      return false;
    }
  }

  /**
   * Get current offline authentication state
   */
  async getOfflineAuthState(): Promise<OfflineAuthState> {
    const offlineTokensValid = await this.isOfflineAuthValid();

    return {
      isOffline: !this.isOnline,
      lastSyncTime: this.lastSyncTime,
      offlineTokensValid,
      pendingSyncOperations: Array.from(this.pendingSyncOperations),
    };
  }

  /**
   * Add retry logic for failed authentication operations
   */
  async retryAuthOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.config.syncRetryAttempts
  ): Promise<{ success: boolean; result?: T; error?: string; retryCount: number }> {
    let lastError: any;
    let retryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        loggingService.debug('NetworkResilience', `Attempting ${operationName}`, {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        const result = await operation();
        
        loggingService.info('NetworkResilience', `${operationName} succeeded`, {
          attempt: attempt + 1,
          retryCount,
        });

        return { success: true, result, retryCount };

      } catch (error: any) {
        lastError = error;
        retryCount = attempt;

        loggingService.warn('NetworkResilience', `${operationName} failed`, {
          attempt: attempt + 1,
          error: error.message,
          willRetry: attempt < maxRetries,
        });

        // Don't retry on certain errors
        if (this.isNonRetryableError(error)) {
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = this.config.syncRetryDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Operation failed after retries',
      retryCount,
    };
  }

  /**
   * Add network event listener
   */
  addNetworkEventListener(listener: (event: { type: 'online' | 'offline' | 'sync_completed' | 'sync_failed'; data?: any }) => void): void {
    this.networkEventListeners.push(listener);
  }

  /**
   * Remove network event listener
   */
  removeNetworkEventListener(listener: (event: { type: 'online' | 'offline' | 'sync_completed' | 'sync_failed'; data?: any }) => void): void {
    const index = this.networkEventListeners.indexOf(listener);
    if (index > -1) {
      this.networkEventListeners.splice(index, 1);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<NetworkResilienceConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('NetworkResilience', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current network and sync status
   */
  getNetworkStatus(): {
    isOnline: boolean;
    lastSyncTime: number;
    syncInProgress: boolean;
    pendingOperations: string[];
    config: NetworkResilienceConfig;
  } {
    return {
      isOnline: this.isOnline,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      pendingOperations: Array.from(this.pendingSyncOperations),
      config: { ...this.config },
    };
  }

  // Private helper methods

  private async handleConnectivityChange(state: NetInfoState): Promise<void> {
    try {
      const wasOnline = this.isOnline;
      this.isOnline = state.isConnected ?? false;

      loggingService.info('NetworkResilience', 'Network connectivity changed', {
        wasOnline,
        isOnline: this.isOnline,
        connectionType: state.type,
      });

      if (!wasOnline && this.isOnline) {
        // Just came back online
        this.notifyNetworkEventListeners({ type: 'online' });
        
        // Perform authentication sync
        await this.performAuthSync();
        
      } else if (wasOnline && !this.isOnline) {
        // Just went offline
        this.notifyNetworkEventListeners({ type: 'offline' });
      }

    } catch (error: any) {
      console.error('Error handling connectivity change:', error);
      loggingService.error('NetworkResilience', 'Failed to handle connectivity change', { error: error.message });
    }
  }

  private async performAuthSync(): Promise<NetworkSyncResult> {
    if (this.syncInProgress) {
      loggingService.debug('NetworkResilience', 'Sync already in progress, skipping');
      return {
        success: false,
        syncedTokens: false,
        syncedUserData: false,
        error: 'Sync already in progress',
        retryCount: 0,
      };
    }

    this.syncInProgress = true;
    let syncedTokens = false;
    let syncedUserData = false;
    let retryCount = 0;

    try {
      loggingService.info('NetworkResilience', 'Starting authentication sync');

      // 1. Sync token refresh if needed
      const tokenSyncResult = await this.retryAuthOperation(
        async () => {
          const refreshResult = await backgroundTokenRefreshService.refreshNow();
          if (!refreshResult.success) {
            throw new Error(refreshResult.error || 'Token refresh failed');
          }
          return refreshResult;
        },
        'token_refresh_sync'
      );

      if (tokenSyncResult.success) {
        syncedTokens = true;
        this.pendingSyncOperations.delete('token_refresh');
      } else {
        this.pendingSyncOperations.add('token_refresh');
      }

      retryCount = Math.max(retryCount, tokenSyncResult.retryCount);

      // 2. Sync user data if needed
      const userDataSyncResult = await this.retryAuthOperation(
        async () => {
          const authState = await cognitoAuthService.checkStoredAuth();
          if (!authState.isAuthenticated) {
            throw new Error('No authenticated user to sync');
          }
          return authState;
        },
        'user_data_sync'
      );

      if (userDataSyncResult.success) {
        syncedUserData = true;
        this.pendingSyncOperations.delete('user_data');
      } else {
        this.pendingSyncOperations.add('user_data');
      }

      retryCount = Math.max(retryCount, userDataSyncResult.retryCount);

      // Update last sync time
      this.lastSyncTime = Date.now();

      const result: NetworkSyncResult = {
        success: syncedTokens || syncedUserData,
        syncedTokens,
        syncedUserData,
        retryCount,
      };

      loggingService.info('NetworkResilience', 'Authentication sync completed', result);

      // Notify listeners
      this.notifyNetworkEventListeners({ 
        type: 'sync_completed', 
        data: result 
      });

      return result;

    } catch (error: any) {
      console.error('Error during authentication sync:', error);
      
      const result: NetworkSyncResult = {
        success: false,
        syncedTokens,
        syncedUserData,
        error: error.message,
        retryCount,
      };

      loggingService.error('NetworkResilience', 'Authentication sync failed', result);

      // Notify listeners
      this.notifyNetworkEventListeners({ 
        type: 'sync_failed', 
        data: result 
      });

      return result;

    } finally {
      this.syncInProgress = false;
    }
  }

  private isNonRetryableError(error: any): boolean {
    if (!error || !error.message) {
      return false;
    }

    const message = error.message.toLowerCase();
    
    // Don't retry on authentication errors that indicate invalid credentials
    const nonRetryablePatterns = [
      'notauthorizedexception',
      'invalid_grant',
      'invalid_client',
      'access_denied',
      'user not found',
      'incorrect username or password',
    ];

    return nonRetryablePatterns.some(pattern => message.includes(pattern));
  }

  private notifyNetworkEventListeners(event: { type: 'online' | 'offline' | 'sync_completed' | 'sync_failed'; data?: any }): void {
    try {
      this.networkEventListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in network event listener:', error);
        }
      });
    } catch (error) {
      console.error('Error notifying network event listeners:', error);
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

export const networkResilienceService = new NetworkResilienceService();
export type { NetworkResilienceConfig, NetworkSyncResult, OfflineAuthState };