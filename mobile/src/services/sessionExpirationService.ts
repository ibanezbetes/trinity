/**
 * Session Expiration Service
 * Handles session expiration detection and provides clear re-authentication prompts
 */

import { cognitoAuthService, CognitoTokens } from './cognitoAuthService';
import { secureTokenStorage } from './secureTokenStorage';
import { backgroundTokenRefreshService } from './backgroundTokenRefreshService';
import { loggingService } from './loggingService';
import { Alert } from 'react-native';

export interface SessionExpirationConfig {
  warningThresholdMinutes: number; // Show warning when session expires within this time
  checkIntervalMinutes: number; // How often to check for expiration
  enableWarnings: boolean; // Whether to show expiration warnings
  autoRefreshEnabled: boolean; // Whether to attempt automatic refresh
}

export interface SessionStatus {
  isValid: boolean;
  isExpired: boolean;
  expiresAt?: number;
  timeUntilExpiry?: number; // milliseconds
  needsRefresh: boolean;
  needsReauth: boolean;
}

export interface ExpirationEvent {
  type: 'warning' | 'expired' | 'refreshed' | 'reauth_required';
  timeUntilExpiry?: number;
  message: string;
  action?: 'refresh' | 'reauth' | 'none';
}

class SessionExpirationService {
  private config: SessionExpirationConfig = {
    warningThresholdMinutes: 10, // Warn 10 minutes before expiry
    checkIntervalMinutes: 2, // Check every 2 minutes
    enableWarnings: true,
    autoRefreshEnabled: true,
  };

  private checkInterval: NodeJS.Timeout | null = null;
  private lastWarningTime: number = 0;
  private warningCooldownMs = 5 * 60 * 1000; // 5 minutes between warnings

  // Event listeners for expiration events
  private expirationListeners: Array<(event: ExpirationEvent) => void> = [];

  constructor() {
    loggingService.info('SessionExpiration', 'Session expiration service initialized', {
      config: this.config,
    });
  }

  /**
   * Start session expiration monitoring
   */
  start(customConfig?: Partial<SessionExpirationConfig>): void {
    try {
      // Update config if provided
      if (customConfig) {
        this.config = { ...this.config, ...customConfig };
      }

      // Stop existing monitoring
      this.stop();

      loggingService.info('SessionExpiration', 'Starting session expiration monitoring', {
        checkIntervalMinutes: this.config.checkIntervalMinutes,
        warningThresholdMinutes: this.config.warningThresholdMinutes,
      });

      // Set up periodic expiration check
      const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
      this.checkInterval = setInterval(() => {
        this.checkSessionExpiration();
      }, intervalMs);

      // Perform initial check
      setTimeout(() => this.checkSessionExpiration(), 1000);

    } catch (error: any) {
      console.error('Error starting session expiration monitoring:', error);
      loggingService.error('SessionExpiration', 'Failed to start monitoring', { error: error.message });
    }
  }

  /**
   * Stop session expiration monitoring
   */
  stop(): void {
    try {
      loggingService.info('SessionExpiration', 'Stopping session expiration monitoring');

      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }

    } catch (error: any) {
      console.error('Error stopping session expiration monitoring:', error);
      loggingService.error('SessionExpiration', 'Failed to stop monitoring', { error: error.message });
    }
  }

  /**
   * Manually check session status
   */
  async checkSessionStatus(): Promise<SessionStatus> {
    return await this.performSessionCheck();
  }

  /**
   * Handle session expiration with user prompt
   */
  async handleSessionExpiration(): Promise<{ action: 'refresh' | 'reauth' | 'ignore'; success?: boolean }> {
    try {
      loggingService.logAuth('session_expiration_handled', {});

      // First, try automatic refresh if enabled
      if (this.config.autoRefreshEnabled) {
        const refreshResult = await backgroundTokenRefreshService.refreshNow();
        
        if (refreshResult.success && refreshResult.refreshed) {
          loggingService.logAuth('session_expiration_auto_refresh_success', {});
          
          this.notifyListeners({
            type: 'refreshed',
            message: 'Sesión renovada automáticamente',
            action: 'refresh',
          });
          
          return { action: 'refresh', success: true };
        }
      }

      // If auto refresh failed or is disabled, prompt user
      return await this.promptUserForReauth();

    } catch (error: any) {
      console.error('Error handling session expiration:', error);
      loggingService.error('SessionExpiration', 'Failed to handle expiration', { error: error.message });
      
      return { action: 'reauth', success: false };
    }
  }

  /**
   * Show expiration warning to user
   */
  showExpirationWarning(timeUntilExpiry: number): void {
    try {
      const now = Date.now();
      
      // Check cooldown to avoid spam
      if (now - this.lastWarningTime < this.warningCooldownMs) {
        return;
      }
      
      this.lastWarningTime = now;
      
      const minutesUntilExpiry = Math.ceil(timeUntilExpiry / (60 * 1000));
      
      loggingService.logAuth('session_expiration_warning_shown', {
        minutesUntilExpiry,
      });

      Alert.alert(
        'Sesión por Expirar',
        `Tu sesión expirará en ${minutesUntilExpiry} minuto${minutesUntilExpiry !== 1 ? 's' : ''}. ¿Quieres renovarla?`,
        [
          {
            text: 'Más Tarde',
            style: 'cancel',
            onPress: () => {
              this.notifyListeners({
                type: 'warning',
                timeUntilExpiry,
                message: 'Usuario pospuso renovación de sesión',
                action: 'none',
              });
            },
          },
          {
            text: 'Renovar Ahora',
            style: 'default',
            onPress: () => {
              this.handleSessionExpiration();
            },
          },
        ],
        { cancelable: false }
      );

    } catch (error: any) {
      console.error('Error showing expiration warning:', error);
      loggingService.error('SessionExpiration', 'Failed to show warning', { error: error.message });
    }
  }

  /**
   * Add listener for expiration events
   */
  addExpirationListener(listener: (event: ExpirationEvent) => void): void {
    this.expirationListeners.push(listener);
  }

  /**
   * Remove expiration listener
   */
  removeExpirationListener(listener: (event: ExpirationEvent) => void): void {
    const index = this.expirationListeners.indexOf(listener);
    if (index > -1) {
      this.expirationListeners.splice(index, 1);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SessionExpirationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    loggingService.info('SessionExpiration', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });

    // Restart if interval changed and service is running
    if (this.checkInterval && oldConfig.checkIntervalMinutes !== this.config.checkIntervalMinutes) {
      this.start();
    }
  }

  /**
   * Get current monitoring status
   */
  getMonitoringStatus(): {
    isActive: boolean;
    config: SessionExpirationConfig;
    lastWarningTime: number;
    listenerCount: number;
  } {
    return {
      isActive: !!this.checkInterval,
      config: { ...this.config },
      lastWarningTime: this.lastWarningTime,
      listenerCount: this.expirationListeners.length,
    };
  }

  // Private helper methods

  private async checkSessionExpiration(): Promise<void> {
    try {
      const sessionStatus = await this.performSessionCheck();
      
      loggingService.debug('SessionExpiration', 'Session check completed', {
        isValid: sessionStatus.isValid,
        isExpired: sessionStatus.isExpired,
        timeUntilExpiry: sessionStatus.timeUntilExpiry,
        needsRefresh: sessionStatus.needsRefresh,
      });

      if (sessionStatus.isExpired) {
        // Session has expired
        loggingService.warn('SessionExpiration', 'Session has expired');
        
        this.notifyListeners({
          type: 'expired',
          message: 'La sesión ha expirado',
          action: 'reauth',
        });
        
        await this.handleSessionExpiration();
        
      } else if (sessionStatus.needsRefresh && this.config.enableWarnings && sessionStatus.timeUntilExpiry) {
        // Session will expire soon, show warning
        loggingService.info('SessionExpiration', 'Session expiring soon, showing warning', {
          timeUntilExpiry: sessionStatus.timeUntilExpiry,
        });
        
        this.showExpirationWarning(sessionStatus.timeUntilExpiry);
      }

    } catch (error: any) {
      console.error('Error during session expiration check:', error);
      loggingService.error('SessionExpiration', 'Session check failed', { error: error.message });
    }
  }

  private async performSessionCheck(): Promise<SessionStatus> {
    try {
      // Get stored tokens
      const tokens = await secureTokenStorage.retrieveTokens();
      
      if (!tokens) {
        return {
          isValid: false,
          isExpired: true,
          needsRefresh: false,
          needsReauth: true,
        };
      }

      // Parse access token to check expiration
      const accessTokenPayload = this.parseJWT(tokens.accessToken);
      
      if (!accessTokenPayload || !accessTokenPayload.exp) {
        return {
          isValid: false,
          isExpired: true,
          needsRefresh: false,
          needsReauth: true,
        };
      }

      const now = Date.now();
      const expiryTime = accessTokenPayload.exp * 1000;
      const timeUntilExpiry = expiryTime - now;
      const warningThreshold = this.config.warningThresholdMinutes * 60 * 1000;

      const isExpired = timeUntilExpiry <= 0;
      const needsRefresh = timeUntilExpiry <= warningThreshold && timeUntilExpiry > 0;
      const isValid = timeUntilExpiry > 0;

      return {
        isValid,
        isExpired,
        expiresAt: expiryTime,
        timeUntilExpiry: Math.max(0, timeUntilExpiry),
        needsRefresh,
        needsReauth: isExpired,
      };

    } catch (error: any) {
      console.error('Error performing session check:', error);
      
      return {
        isValid: false,
        isExpired: true,
        needsRefresh: false,
        needsReauth: true,
      };
    }
  }

  private async promptUserForReauth(): Promise<{ action: 'refresh' | 'reauth' | 'ignore'; success?: boolean }> {
    return new Promise((resolve) => {
      try {
        Alert.alert(
          'Sesión Expirada',
          'Tu sesión ha expirado. Necesitas iniciar sesión nuevamente para continuar.',
          [
            {
              text: 'Más Tarde',
              style: 'cancel',
              onPress: () => {
                loggingService.logAuth('session_expiration_user_ignored', {});
                
                this.notifyListeners({
                  type: 'expired',
                  message: 'Usuario ignoró expiración de sesión',
                  action: 'none',
                });
                
                resolve({ action: 'ignore' });
              },
            },
            {
              text: 'Iniciar Sesión',
              style: 'default',
              onPress: () => {
                loggingService.logAuth('session_expiration_user_reauth', {});
                
                this.notifyListeners({
                  type: 'reauth_required',
                  message: 'Usuario eligió re-autenticarse',
                  action: 'reauth',
                });
                
                resolve({ action: 'reauth', success: true });
              },
            },
          ],
          { cancelable: false }
        );

      } catch (error: any) {
        console.error('Error showing reauth prompt:', error);
        resolve({ action: 'reauth', success: false });
      }
    });
  }

  private notifyListeners(event: ExpirationEvent): void {
    try {
      this.expirationListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('Error in expiration listener:', error);
        }
      });
    } catch (error) {
      console.error('Error notifying expiration listeners:', error);
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

export const sessionExpirationService = new SessionExpirationService();