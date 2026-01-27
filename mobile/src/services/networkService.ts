/**
 * Network Service
 * Handles network connectivity detection and resilience
 */

import NetInfo from '@react-native-community/netinfo';
import { Alert } from 'react-native';

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  details: any;
}

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

class NetworkService {
  private networkState: NetworkState = {
    isConnected: false,
    isInternetReachable: null,
    type: 'unknown',
    details: null
  };

  private listeners: ((state: NetworkState) => void)[] = [];
  private retryConfig: RetryConfig = {
    maxAttempts: 5,
    baseDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    backoffFactor: 2
  };

  constructor() {
    this.initializeNetworkMonitoring();
  }

  /**
   * Initialize network state monitoring
   */
  private async initializeNetworkMonitoring(): Promise<void> {
    try {
      // Get initial network state
      const state = await NetInfo.fetch();
      this.updateNetworkState(state);

      // Subscribe to network state changes
      NetInfo.addEventListener(this.updateNetworkState.bind(this));

      console.log('🌐 Network monitoring initialized');
    } catch (error) {
      console.error('❌ Failed to initialize network monitoring:', error);
    }
  }

  /**
   * Update network state and notify listeners
   */
  private updateNetworkState(state: any): void {
    const newState: NetworkState = {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable,
      type: state.type || 'unknown',
      details: state.details
    };

    const wasConnected = this.networkState.isConnected;
    const isNowConnected = newState.isConnected;

    this.networkState = newState;

    // Log network state changes
    if (wasConnected !== isNowConnected) {
      if (isNowConnected) {
        console.log('🟢 Network connection restored');
      } else {
        console.log('🔴 Network connection lost');
      }
    }

    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(newState);
      } catch (error) {
        console.error('❌ Error in network state listener:', error);
      }
    });
  }

  /**
   * Get current network state
   */
  getNetworkState(): NetworkState {
    return { ...this.networkState };
  }

  /**
   * Check if device is connected to internet
   */
  isConnected(): boolean {
    return this.networkState.isConnected && 
           (this.networkState.isInternetReachable !== false);
  }

  /**
   * Add network state change listener
   */
  addNetworkListener(listener: (state: NetworkState) => void): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Execute function with retry logic and exponential backoff
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'Network Operation',
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customConfig };
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        // Check network connectivity before attempting
        if (!this.isConnected()) {
          throw new Error('No network connection available');
        }

        console.log(`🔄 ${operationName} - Attempt ${attempt}/${config.maxAttempts}`);
        
        const result = await operation();
        
        if (attempt > 1) {
          console.log(`✅ ${operationName} succeeded after ${attempt} attempts`);
        }
        
        return result;

      } catch (error) {
        lastError = error as Error;
        console.error(`❌ ${operationName} failed (attempt ${attempt}):`, error);

        // Don't retry on final attempt
        if (attempt === config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        );

        console.log(`⏳ Retrying ${operationName} in ${delay}ms...`);
        await this.delay(delay);
      }
    }

    // All attempts failed
    console.error(`❌ ${operationName} failed after ${config.maxAttempts} attempts`);
    throw lastError || new Error(`${operationName} failed after maximum retry attempts`);
  }

  /**
   * Handle token refresh failures with network resilience
   */
  async handleTokenRefreshFailure(
    refreshOperation: () => Promise<any>,
    onSuccess: (tokens: any) => void,
    onFailure: () => void
  ): Promise<void> {
    try {
      const tokens = await this.executeWithRetry(
        refreshOperation,
        'Token Refresh',
        {
          maxAttempts: 3,
          baseDelay: 2000, // 2 seconds
          maxDelay: 10000  // 10 seconds
        }
      );

      onSuccess(tokens);

    } catch (error) {
      console.error('❌ Token refresh failed after all retry attempts:', error);
      
      // Show user-friendly message
      this.showNetworkErrorMessage(
        'Error de Autenticación',
        'No se pudo renovar la sesión. Por favor, inicia sesión nuevamente.',
        [
          {
            text: 'Reintentar',
            onPress: () => {
              // Retry token refresh one more time
              this.handleTokenRefreshFailure(refreshOperation, onSuccess, onFailure);
            }
          },
          {
            text: 'Iniciar Sesión',
            onPress: onFailure,
            style: 'default'
          }
        ]
      );
    }
  }

  /**
   * Show network-related error message to user
   */
  showNetworkErrorMessage(
    title: string,
    message: string,
    buttons?: Array<{
      text: string;
      onPress?: () => void;
      style?: 'default' | 'cancel' | 'destructive';
    }>
  ): void {
    const defaultButtons = [
      {
        text: 'Entendido',
        style: 'default' as const
      }
    ];

    Alert.alert(
      title,
      message,
      buttons || defaultButtons,
      { cancelable: false }
    );
  }

  /**
   * Show offline message to user
   */
  showOfflineMessage(): void {
    this.showNetworkErrorMessage(
      'Sin Conexión',
      'No hay conexión a internet. Algunas funciones pueden no estar disponibles.',
      [
        {
          text: 'Reintentar',
          onPress: async () => {
            // Force network state check
            try {
              const state = await NetInfo.fetch();
              this.updateNetworkState(state);
              
              if (this.isConnected()) {
                console.log('✅ Connection restored');
              } else {
                this.showOfflineMessage();
              }
            } catch (error) {
              console.error('❌ Failed to check network state:', error);
            }
          }
        },
        {
          text: 'Continuar Sin Conexión',
          style: 'cancel'
        }
      ]
    );
  }

  /**
   * Wait for network connection to be restored
   */
  async waitForConnection(timeoutMs: number = 30000): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      const unsubscribe = this.addNetworkListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  /**
   * Execute operation with network availability check
   */
  async executeWhenOnline<T>(
    operation: () => Promise<T>,
    operationName: string = 'Operation',
    showOfflineMessage: boolean = true
  ): Promise<T | null> {
    // Check if already online
    if (this.isConnected()) {
      try {
        return await operation();
      } catch (error) {
        console.error(`❌ ${operationName} failed:`, error);
        throw error;
      }
    }

    // Show offline message if requested
    if (showOfflineMessage) {
      this.showOfflineMessage();
    }

    // Wait for connection
    console.log(`⏳ Waiting for network connection to execute ${operationName}...`);
    const connectionRestored = await this.waitForConnection();

    if (connectionRestored) {
      console.log(`🟢 Connection restored, executing ${operationName}`);
      try {
        return await operation();
      } catch (error) {
        console.error(`❌ ${operationName} failed after connection restored:`, error);
        throw error;
      }
    } else {
      console.log(`❌ ${operationName} cancelled - connection not restored`);
      return null;
    }
  }

  /**
   * Get network quality indicator
   */
  getNetworkQuality(): 'excellent' | 'good' | 'poor' | 'offline' {
    if (!this.networkState.isConnected) {
      return 'offline';
    }

    const { type, details } = this.networkState;

    // WiFi connections are generally good
    if (type === 'wifi') {
      return 'excellent';
    }

    // Cellular connections depend on generation
    if (type === 'cellular' && details) {
      const cellularGeneration = details.cellularGeneration;
      
      switch (cellularGeneration) {
        case '5g':
          return 'excellent';
        case '4g':
          return 'good';
        case '3g':
          return 'poor';
        default:
          return 'poor';
      }
    }

    // Unknown or other connection types
    return 'good';
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
    console.log('🔧 Network retry configuration updated:', this.retryConfig);
  }

  /**
   * Get network statistics for debugging
   */
  getNetworkStats(): {
    isConnected: boolean;
    isInternetReachable: boolean | null;
    connectionType: string;
    quality: string;
    retryConfig: RetryConfig;
    listenerCount: number;
  } {
    return {
      isConnected: this.networkState.isConnected,
      isInternetReachable: this.networkState.isInternetReachable,
      connectionType: this.networkState.type,
      quality: this.getNetworkQuality(),
      retryConfig: { ...this.retryConfig },
      listenerCount: this.listeners.length
    };
  }
}

export const networkService = new NetworkService();
export default networkService;