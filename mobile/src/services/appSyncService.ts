/**
 * ✅ AppSync Service - RESTORED AND OPERATIONAL ✅
 * 
 * WebSocket connections have been restored with enhanced safety features:
 * - Circuit breaker pattern to prevent AWS overload
 * - Exponential backoff for reconnections
 * - 3-layer token caching to minimize Cognito API calls
 * - Comprehensive error handling and recovery
 * 
 * Safety Features Active:
 * - Circuit breaker: Opens after 3 failures or fatal auth errors
 * - Token caching: 30-second cache to prevent rate limiting
 * - Connection limits: Max 5 reconnection attempts with backoff
 * - Emergency stop: Manual circuit breaker reset available
 * 
 * ✅ Service is now safe for production use ✅
 */

/**
 * AWS AppSync GraphQL Service
 * Handles all GraphQL operations with AWS AppSync
 */

import { getAWSConfig } from '../config/aws-config';
import { cognitoAuthService } from './cognitoAuthService';
import { loggingService } from './loggingService';
import { networkService } from './networkService';
import { secureTokenStorage } from './secureTokenStorage';
import { createAppSyncHeader, createAppSyncPayload } from '../utils/jwt-utils';
import { CompatibilityConfig, showDeprecationWarning, isOperationDeprecated, getEnvironmentConfig } from '../config/compatibility-config';

interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
}

interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

class AppSyncService {
  private config = getAWSConfig();
  private graphqlEndpoint: string;

  // Token caching to prevent excessive Cognito API calls
  private cachedToken: string | null = null;
  private tokenCacheExpiry: number = 0;
  private tokenCacheDuration = 60000; // Cache token for 60 seconds (increased for safety)
  private lastTokenFetch: number = 0;
  private minTokenFetchInterval = 2000; // Minimum 2 seconds between token fetches (increased for safety)

  // Circuit Breaker for WebSocket connections
  private circuitBreakerState: 'closed' | 'open' | 'half-open' = 'closed';
  private circuitBreakerOpenUntil: number = 0;
  private circuitBreakerFailureCount: number = 0;
  private circuitBreakerFailureThreshold: number = 3;
  private circuitBreakerTimeout: number = 60000; // 1 minute

  // Connection management
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  private reconnectionAttempts = 0;
  private maxReconnectionAttempts = 5;
  private baseReconnectionDelay = 1000; // Base delay: 1 second
  private maxReconnectionDelay = 30000; // Max delay: 30 seconds
  private connectionStatusCallbacks: ((status: 'disconnected' | 'connecting' | 'connected') => void)[] = [];

  // Active subscriptions tracking
  private activeSubscriptions = new Map<string, {
    cleanup: () => void;
    isActive: boolean;
    subscriptionType: string;
    roomId: string;
  }>();

  constructor() {
    this.graphqlEndpoint = this.config.graphqlEndpoint;

    // Configurar compatibilidad según el entorno
    const envConfig = getEnvironmentConfig();
    if (envConfig.logging.enabled) {
      console.log('🔧 AppSyncService: Compatibility configuration loaded', {
        version: envConfig.compatibility.version,
        transformationsEnabled: envConfig.compatibility.transformations.removeGenrePreferences,
        subscriptionsMode: envConfig.compatibility.subscriptions.useBasicSubscriptions ? 'basic' : 'enhanced'
      });
    }

    loggingService.info('AppSyncService', 'Service initialized', {
      region: this.config.region,
      endpoint: this.graphqlEndpoint,
      compatibilityVersion: envConfig.compatibility.version
    });
  }

  /**
   * Get current authentication token dynamically with caching to prevent rate limiting
   */
  private async getCurrentAuthToken(): Promise<string> {
    try {
      const now = Date.now();

      // Check if we have a valid cached token
      if (this.cachedToken && now < this.tokenCacheExpiry) {
        console.log('✅ AppSyncService: Using cached token (valid for', Math.round((this.tokenCacheExpiry - now) / 1000), 'more seconds)');
        return this.cachedToken;
      }

      // Rate limiting: prevent too frequent token fetches
      if (now - this.lastTokenFetch < this.minTokenFetchInterval) {
        const waitTime = this.minTokenFetchInterval - (now - this.lastTokenFetch);
        console.log('⏳ AppSyncService: Rate limiting token fetch, waiting', waitTime, 'ms');
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      this.lastTokenFetch = Date.now();
      console.log('🔍 AppSyncService: Fetching fresh authentication token...');

      // STRATEGY 1: Try to get tokens from secureTokenStorage first (fastest, no API calls)
      try {
        console.log('🔍 AppSyncService: Trying SecureTokenStorage (no API calls)...');
        const storedTokens = await secureTokenStorage.retrieveTokens();

        if (storedTokens && storedTokens.idToken) {
          // Check if token is still valid (with 5 minute buffer)
          const currentTime = Date.now();
          const tokenExpiryTime = storedTokens.expiresAt * 1000;
          const bufferTime = 5 * 60 * 1000; // 5 minutes

          if (tokenExpiryTime - currentTime > bufferTime) {
            console.log('✅ AppSyncService: Got valid token from SecureTokenStorage (no API call needed)');

            // Cache the token
            this.cachedToken = storedTokens.idToken;
            this.tokenCacheExpiry = Math.min(
              tokenExpiryTime - bufferTime, // Don't cache beyond token expiry
              Date.now() + this.tokenCacheDuration // Don't cache beyond our cache duration
            );

            return storedTokens.idToken;
          } else {
            console.log('⚠️ AppSyncService: SecureTokenStorage token expires soon, need refresh');
          }
        } else {
          console.log('❌ AppSyncService: No tokens in SecureTokenStorage');
        }
      } catch (storageError) {
        console.warn('⚠️ AppSyncService: SecureTokenStorage failed:', storageError);
      }

      // STRATEGY 2: Only if token is expired/missing, use cognitoAuthService (makes API calls)
      try {
        console.log('🔍 AppSyncService: Token refresh needed, using cognitoAuthService...');
        const authResult = await cognitoAuthService.checkStoredAuth();

        if (authResult.isAuthenticated && authResult.tokens && authResult.tokens.idToken) {
          console.log('✅ AppSyncService: Got refreshed token from cognitoAuthService');

          // Cache the new token
          this.cachedToken = authResult.tokens.idToken;
          this.tokenCacheExpiry = Date.now() + this.tokenCacheDuration;

          return authResult.tokens.idToken;
        } else {
          console.log('❌ AppSyncService: No valid tokens from cognitoAuthService');
        }
      } catch (cognitoError: any) {
        console.warn('⚠️ AppSyncService: CognitoAuthService failed:', cognitoError);

        // If it's a SessionRevokedError, clear cache and re-throw
        if (cognitoError.name === 'SessionRevokedError') {
          this.clearTokenCache();
          throw cognitoError;
        }
      }

      // STRATEGY 3: Last resort - check global state
      try {
        console.log('🔍 AppSyncService: Checking global auth state...');
        const globalAuthState = (global as any).currentAuthState;

        if (globalAuthState && globalAuthState.isAuthenticated) {
          console.log('✅ AppSyncService: Found authenticated user in global state, trying SecureTokenStorage once more...');

          // One more attempt at SecureTokenStorage
          const finalStoredTokens = await secureTokenStorage.retrieveTokens();
          if (finalStoredTokens && finalStoredTokens.idToken) {
            console.log('✅ AppSyncService: Final SecureTokenStorage attempt successful!');

            // Even if token is close to expiry, use it (better than failing)
            this.cachedToken = finalStoredTokens.idToken;
            this.tokenCacheExpiry = Date.now() + Math.min(this.tokenCacheDuration, 10000); // Short cache for expiring tokens

            return finalStoredTokens.idToken;
          }
        }
      } catch (globalError) {
        console.warn('⚠️ AppSyncService: Global state check failed:', globalError);
      }

      // Clear cache on failure
      this.clearTokenCache();

      // If all strategies fail, throw authentication error
      throw new Error('No valid authentication tokens found. Please log in again.');

    } catch (error: any) {
      console.error('❌ AppSyncService: Failed to get authentication token:', error);

      // Clear cache on error
      this.clearTokenCache();

      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Clear the token cache (called on logout or auth errors)
   */
  private clearTokenCache(): void {
    this.cachedToken = null;
    this.tokenCacheExpiry = 0;
    console.log('🧹 AppSyncService: Token cache cleared');
  }

  /**
   * Check if an error is fatal and should trigger circuit breaker
   */
  private isFatalError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message || error.toString() || '';
    const errorName = error.name || error.code || '';

    // Fatal authentication errors
    const fatalAuthErrors = [
      'NotAuthorizedException',
      'UnauthorizedException',
      'TokenExpiredException',
      'InvalidTokenException',
      'TooManyRequestsException'
    ];

    // Fatal error messages
    const fatalMessages = [
      'User not authenticated',
      'Authentication failed',
      'Token has expired',
      'Rate exceeded',
      'Too many requests',
      'Refresh Token has been revoked',
      'Access denied'
    ];

    return fatalAuthErrors.includes(errorName) ||
      fatalMessages.some(msg => errorMessage.includes(msg));
  }

  /**
   * Circuit Breaker: Check if we should allow connection attempts
   */
  private canAttemptConnection(): boolean {
    const now = Date.now();

    switch (this.circuitBreakerState) {
      case 'closed':
        return true;

      case 'open':
        if (now >= this.circuitBreakerOpenUntil) {
          console.log('🔄 Circuit breaker transitioning to half-open state');
          this.circuitBreakerState = 'half-open';
          return true;
        }
        console.log('⛔ Circuit breaker is OPEN - blocking connection attempts');
        return false;

      case 'half-open':
        return true;

      default:
        return false;
    }
  }

  /**
   * Circuit Breaker: Record connection failure
   */
  private recordConnectionFailure(error: any): void {
    this.circuitBreakerFailureCount++;

    console.log(`💥 Connection failure recorded (${this.circuitBreakerFailureCount}/${this.circuitBreakerFailureThreshold}):`, error.message);

    // Check if error is fatal or if we've exceeded failure threshold
    if (this.isFatalError(error) || this.circuitBreakerFailureCount >= this.circuitBreakerFailureThreshold) {
      this.openCircuitBreaker(error);
    }
  }

  /**
   * Circuit Breaker: Open the circuit (stop all connection attempts)
   */
  private openCircuitBreaker(error: any): void {
    this.circuitBreakerState = 'open';
    this.circuitBreakerOpenUntil = Date.now() + this.circuitBreakerTimeout;

    console.error('🚨 CIRCUIT BREAKER OPENED - All WebSocket connections suspended for 1 minute');
    console.error('🚨 Reason:', error.message || error.toString());

    // Stop all active subscriptions
    this.stopAllSubscriptions();

    // Clear auth cache if it's an auth error
    if (this.isFatalError(error)) {
      this.clearTokenCache();
    }

    // Update connection status
    this.updateConnectionStatus('disconnected');
  }

  /**
   * Circuit Breaker: Record successful connection
   */
  private recordConnectionSuccess(): void {
    this.circuitBreakerFailureCount = 0;
    this.circuitBreakerState = 'closed';
    console.log('✅ Circuit breaker reset - connection successful');
  }

  /**
   * Stop all active subscriptions
   */
  private stopAllSubscriptions(): void {
    console.log('🛑 Stopping all active subscriptions due to circuit breaker');

    for (const [key, subscription] of this.activeSubscriptions.entries()) {
      try {
        subscription.isActive = false;
        subscription.cleanup();
        console.log(`🧹 Stopped subscription: ${subscription.subscriptionType} for room ${subscription.roomId}`);
      } catch (error) {
        console.warn(`⚠️ Error stopping subscription ${key}:`, error);
      }
    }

    this.activeSubscriptions.clear();
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(
      this.baseReconnectionDelay * Math.pow(2, attempt - 1),
      this.maxReconnectionDelay
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Extract operation name from GraphQL query
   */
  private extractOperationName(query: string): string {
    const operationMatch = query.match(/(?:query|mutation|subscription)\s+(\w+)/);
    if (operationMatch) {
      return operationMatch[1];
    }

    // Fallback: buscar por nombre de campo
    const fieldMatch = query.match(/{\s*(\w+)/);
    return fieldMatch ? fieldMatch[1] : 'unknown';
  }

  /**
   * Make authenticated GraphQL request to AppSync with enhanced error handling and timeout
   */
  private async graphqlRequest<T>(request: GraphQLRequest): Promise<T> {
    // Verificar si la operación está deprecada y mostrar warning
    const operationName = this.extractOperationName(request.query);
    if (isOperationDeprecated(operationName)) {
      showDeprecationWarning(operationName);
    }

    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000); // 10 second timeout

    try {
      // Check network connectivity first
      if (!networkService.isConnected()) {
        throw new Error('No network connection available. Please check your internet connection.');
      }

      // Get current authentication token dynamically
      let authToken: string;
      try {
        authToken = await this.getCurrentAuthToken();
      } catch (authError: any) {
        console.error('❌ Authentication error:', authError);
        throw new Error(`Authentication required: ${authError.message}`);
      }

      loggingService.debug('AppSyncService', 'Making GraphQL request', {
        query: request.query.substring(0, 100) + '...',
        hasVariables: !!request.variables,
        hasToken: !!authToken,
        endpoint: this.graphqlEndpoint
      });

      console.log('🔍 AppSyncService.graphqlRequest - Making authenticated request');
      console.log('🔍 AppSyncService.graphqlRequest - Endpoint:', this.graphqlEndpoint);
      console.log('🔍 AppSyncService.graphqlRequest - Has auth token:', !!authToken);

      // Prepare headers with authentication and proper content types
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        'User-Agent': 'Trinity-Mobile-App/1.0',
      };

      // Add additional headers if needed
      if (this.config.region) {
        headers['x-amz-region'] = this.config.region;
      }

      console.log('🔍 AppSyncService.graphqlRequest - Headers prepared:', {
        'Content-Type': headers['Content-Type'],
        'Accept': headers['Accept'],
        'User-Agent': headers['User-Agent'],
        'x-amz-region': headers['x-amz-region'],
        'hasAuthorization': !!headers['Authorization']
      });

      // Prepare request body
      const requestBody = JSON.stringify(request);
      console.log('🔍 AppSyncService.graphqlRequest - Request body size:', requestBody.length, 'bytes');
      console.log('🔍 AppSyncService.graphqlRequest - Request preview:', requestBody.substring(0, 200) + '...');

      // Make the request with timeout
      console.log('🔍 AppSyncService.graphqlRequest - Starting fetch with 10s timeout...');
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      // Clear timeout since request completed
      clearTimeout(timeoutId);

      console.log('🔍 AppSyncService.graphqlRequest - Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: {
          'content-type': response.headers.get('content-type'),
          'content-length': response.headers.get('content-length'),
        }
      });

      if (!response.ok) {
        // Try to get response body for better error details
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.log('🔍 AppSyncService.graphqlRequest - Error response body:', errorBody);
        } catch (bodyError) {
          console.warn('⚠️ Could not read error response body:', bodyError);
        }

        // Handle specific HTTP errors
        if (response.status === 401) {
          throw new Error('Authentication failed. Please log in again.');
        } else if (response.status === 403) {
          throw new Error('Access denied. You do not have permission to perform this action.');
        } else if (response.status === 429) {
          throw new Error('Too many requests. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error(`Server error (${response.status}). Please try again later.`);
        }

        const errorMessage = errorBody ?
          `Request failed: ${response.status} ${response.statusText} - ${errorBody}` :
          `Request failed: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }

      // Parse JSON response
      let result: GraphQLResponse<T>;
      try {
        result = await response.json();
        console.log('🔍 AppSyncService.graphqlRequest - JSON parsed successfully');
      } catch (jsonError: any) {
        console.error('❌ Failed to parse JSON response:', jsonError);
        throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
      }

      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map(e => e.message).join(', ');

        console.error('❌ AppSyncService: GraphQL errors', result.errors);
        console.error('❌ AppSyncService.graphqlRequest - Full error details:', JSON.stringify(result.errors, null, 2));
        loggingService.error('AppSyncService', 'GraphQL errors', { errors: result.errors });

        // Handle specific GraphQL errors
        if (errorMessages.includes('Unauthorized') || errorMessages.includes('not authenticated')) {
          throw new Error('Authentication expired. Please log in again.');
        }

        throw new Error(`GraphQL errors: ${errorMessages}`);
      }

      // Check if we have data
      if (!result.data) {
        console.warn('⚠️ No data in GraphQL response:', result);
        throw new Error('No data received from server');
      }

      loggingService.debug('AppSyncService', 'GraphQL request successful');
      console.log('✅ AppSyncService.graphqlRequest - Request completed successfully');

      return result.data as T;

    } catch (error: any) {
      // Clear timeout in case of error
      clearTimeout(timeoutId);

      // Enhanced error logging with full error details
      console.error('❌ AppSyncService.graphqlRequest - Full error details:', {
        name: error.name,
        message: error.message,
        cause: error.cause,
        stack: error.stack,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        type: error.type,
        isAbortError: error.name === 'AbortError',
        isNetworkError: error.message?.includes('Network request failed'),
        isTimeoutError: error.name === 'AbortError' && controller.signal.aborted,
      });

      loggingService.error('AppSyncService', 'GraphQL request error', {
        error: error.message,
        errorName: error.name,
        errorCause: error.cause,
        endpoint: this.graphqlEndpoint,
        query: request.query.substring(0, 100) + '...'
      });

      // Provide user-friendly error messages based on error type
      if (error.name === 'AbortError') {
        throw new Error('Request timed out after 10 seconds. Please check your internet connection and try again.');
      } else if (error.message?.includes('Network request failed')) {
        throw new Error('Network connection failed. This might be due to SSL issues on Android emulator or poor connectivity. Please try again.');
      } else if (error.message?.includes('Failed to fetch')) {
        throw new Error('Unable to connect to server. Please check your internet connection and try again.');
      } else {
        // Re-throw the original error if it's already user-friendly
        throw error;
      }
    }
  }

  /**
   * Health check - simple query to test connectivity
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      // Simple query that should always work
      const query = `
        query HealthCheck {
          __typename
        }
      `;

      await this.graphqlRequest({ query });

      return {
        status: 'healthy',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('AppSync health check failed:', error);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get user's rooms
   */
  async getUserRooms(): Promise<{ getUserRooms: any[] }> {
    const query = `
      query GetUserRooms {
        getUserRooms {
          id
          name
          description
          isActive
          memberCount
          matchCount
          createdAt
          updatedAt
        }
      }
    `;

    try {
      const result = await this.graphqlRequest<{ getUserRooms: any[] }>({ query });
      return result;
    } catch (error) {
      console.error('Error getting user rooms:', error);
      // Return empty array as fallback
      return { getUserRooms: [] };
    }
  }

  /**
   * Create a new room (con compatibilidad automática mejorada)
   */
  async createRoom(input: {
    name: string;
    description?: string;
    isPrivate?: boolean;
    maxMembers?: number;
    mediaType?: 'MOVIE' | 'TV'; // NUEVO: Tipo de contenido
    genreIds?: number[]; // NUEVO: IDs de géneros
    genrePreferences?: string[]; // DEPRECATED: Mantener por compatibilidad
  }): Promise<{ createRoom: any }> {
    console.log('🔍 AppSyncService.createRoom - Input received:', JSON.stringify(input, null, 2));

    // Obtener configuración de compatibilidad
    const envConfig = getEnvironmentConfig();

    // Mostrar warning y remover genrePreferences automáticamente si está habilitado
    if (input.genrePreferences && envConfig.compatibility.transformations.removeGenrePreferences) {
      if (envConfig.logging.logCompatibilityWarnings) {
        console.warn('⚠️ Trinity Compatibility: genrePreferences field is deprecated and will be removed automatically');
      }
    }

    const mutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          description
          status
          hostId
          inviteCode
          isActive
          isPrivate
          memberCount
          maxMembers
          mediaType
          genreIds
          genreNames
          contentIds
          createdAt
          updatedAt
        }
      }
    `;

    console.log('🔍 AppSyncService.createRoom - Mutation:', mutation);

    // Remover genrePreferences automáticamente (compatibilidad)
    const { genrePreferences, ...sanitizedInput } = input;
    if (genrePreferences && envConfig.logging.logTransformations) {
      console.log('🔄 Compatibility: Removed genrePreferences:', genrePreferences);
    }

    console.log('🔍 AppSyncService.createRoom - Sanitized Variables:', JSON.stringify({ input: sanitizedInput }, null, 2));

    try {
      const result = await this.graphqlRequest<{ createRoom: any }>({
        query: mutation,
        variables: { input: sanitizedInput }
      });

      console.log('🔍 AppSyncService.createRoom - Result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      // Enhanced error handling with user-friendly messages
      loggingService.error('AppSyncService', 'Room creation failed', {
        input: sanitizedInput,
        error: error.message
      });

      throw new Error('Unable to create room. Please check your connection and try again.');
    }
  }

  /**
   * Create a new room (debug version with only name)
   */
  async createRoomDebug(input: {
    name: string;
  }): Promise<{ createRoomDebug: any }> {
    console.log('🔍 AppSyncService.createRoomDebug - Input received:', JSON.stringify(input, null, 2));

    const mutation = `
      mutation CreateRoomDebug($input: CreateRoomInputDebug!) {
        createRoomDebug(input: $input) {
          id
          name
          description
          isActive
          isPrivate
          memberCount
          createdAt
        }
      }
    `;

    // Hardcoded request to eliminate any possibility of extra fields
    const hardcodedRequest = {
      query: mutation,
      variables: {
        input: {
          name: input.name
        }
      }
    };

    console.log('🔍 AppSyncService.createRoomDebug - Mutation:', mutation);
    console.log('🔍 AppSyncService.createRoomDebug - Hardcoded request:', JSON.stringify(hardcodedRequest, null, 2));

    const result = await this.graphqlRequest<{ createRoomDebug: any }>(hardcodedRequest);

    console.log('🔍 AppSyncService.createRoomDebug - Result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Create a new room (simple version with no input type)
   */
  async createRoomSimple(name: string): Promise<{ createRoomSimple: any }> {
    console.log('🚨🚨🚨 AppSyncService.createRoomSimple - STARTING');
    console.log('🔍 AppSyncService.createRoomSimple - Name received:', name);

    const mutation = `
      mutation CreateRoomSimple($name: String!) {
        createRoomSimple(name: $name) {
          id
          name
          description
          isActive
          isPrivate
          memberCount
          inviteCode
          hostId
          status
          createdAt
        }
      }
    `;

    // Hardcoded request with just a String parameter
    const hardcodedRequest = {
      query: mutation,
      variables: {
        name: name
      }
    };

    console.log('🔍 AppSyncService.createRoomSimple - Mutation:', mutation);
    console.log('🔍 AppSyncService.createRoomSimple - Hardcoded request:', JSON.stringify(hardcodedRequest, null, 2));

    try {
      const result = await this.graphqlRequest<{ createRoomSimple: any }>(hardcodedRequest);
      console.log('✅ AppSyncService.createRoomSimple - SUCCESS:', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('❌ AppSyncService.createRoomSimple - ERROR:', error);
      throw error;
    }
  }

  /**
   * Join a room using invite code with enhanced error handling
   */
  async joinRoomByInvite(inviteCode: string): Promise<{ joinRoomByInvite: any }> {
    const mutation = `
      mutation JoinRoomByInvite($inviteCode: String!) {
        joinRoomByInvite(inviteCode: $inviteCode) {
          id
          name
          description
          status
          hostId
          inviteCode
          isActive
          isPrivate
          memberCount
          maxMembers
          createdAt
          updatedAt
        }
      }
    `;

    console.log('🚪 AppSyncService.joinRoomByInvite - InviteCode:', inviteCode);

    try {
      const result = await this.graphqlRequest<{ joinRoomByInvite: any }>({
        query: mutation,
        variables: { inviteCode }
      });

      console.log('🚪 AppSyncService.joinRoomByInvite - Result:', JSON.stringify(result, null, 2));

      // Return the result directly
      return result;
    } catch (error: any) {
      // Enhanced error handling with context-aware messages
      console.error('❌ AppSyncService.joinRoomByInvite - Full error:', error);
      console.error('❌ AppSyncService.joinRoomByInvite - Error message:', error.message);
      console.error('❌ AppSyncService.joinRoomByInvite - Error stack:', error.stack);

      loggingService.error('AppSyncService', 'Room join failed', {
        inviteCode,
        error: error.message,
        fullError: error
      });

      // Re-throw with more specific error message based on the actual error
      if (error.message.includes('not found') || error.message.includes('invalid') || error.message.includes('Invalid invite code')) {
        throw new Error('Código de invitación inválido o expirado');
      } else if (error.message.includes('full') || error.message.includes('capacity')) {
        throw new Error('La sala está llena');
      } else if (error.message.includes('Authentication') || error.message.includes('Unauthorized')) {
        throw new Error('Tu sesión ha expirado. Por favor, inicia sesión de nuevo.');
      } else {
        // Include the actual error message for debugging
        throw new Error(`Error al unirse a la sala: ${error.message}`);
      }
    }
  }

  /**
   * Get room details with enhanced fields
   */
  async getRoom(roomId: string): Promise<{ getRoom: any }> {
    const query = `
      query GetRoom($roomId: ID!) {
        getRoom(roomId: $roomId) {
          id
          name
          description
          status
          resultMovieId
          hostId
          inviteCode
          isActive
          isPrivate
          memberCount
          maxMembers
          matchCount
          mediaType
          genreIds
          genreNames
          contentIds
          createdAt
          updatedAt
        }
      }
    `;

    try {
      const result = await this.graphqlRequest<{ getRoom: any }>({
        query,
        variables: { roomId }
      });

      return result;
    } catch (error: any) {
      loggingService.error('AppSyncService', 'Get room failed', {
        roomId,
        error: error.message
      });

      if (error.message.includes('not found')) {
        throw new Error('Room not found. It may have been deleted or you may not have access.');
      } else {
        throw new Error('Unable to load room details. Please try again.');
      }
    }
  }

  /**
   * Vote on content with enhanced error handling
   */
  async vote(roomId: string, movieId: string): Promise<{ vote: any }> {
    const mutation = `
      mutation Vote($input: VoteInput!) {
        vote(input: $input) {
          id
          name
          description
          status
          resultMovieId
          hostId
          inviteCode
          isActive
          isPrivate
          memberCount
          maxMembers
          matchCount
          createdAt
          updatedAt
        }
      }
    `;

    const input = {
      roomId,
      movieId,
      voteType: 'LIKE' // Solo procesamos votos LIKE en Stop-on-Match
    };

    console.log('🗳️ AppSyncService.vote - Input:', JSON.stringify(input, null, 2));

    try {
      const result = await this.graphqlRequest<{ vote: any }>({
        query: mutation,
        variables: { input }
      });

      console.log('🗳️ AppSyncService.vote - Result:', JSON.stringify(result, null, 2));
      return result;
    } catch (error: any) {
      loggingService.error('AppSyncService', 'Vote failed', {
        roomId,
        movieId,
        error: error.message
      });

      if (error.message.includes('already voted') || error.message.includes('Ya has votado')) {
        throw new Error('You have already voted on this movie.');
      } else if (error.message.includes('room not active')) {
        throw new Error('This room is no longer active for voting.');
      } else {
        throw new Error(`Unable to register your vote: ${error.message}`);
      }
    }
  }
  /**
   * Get movie details
   */
  async getMovieDetails(movieId: string): Promise<{ getMovieDetails: any }> {
    const query = `
      query GetMovieDetails($movieId: String!) {
        getMovieDetails(movieId: $movieId) {
          id
          title
          overview
          poster
          vote_average
          release_date
          genres {
            id
            name
          }
          runtime
        }
      }
    `;

    const result = await this.graphqlRequest<{ getMovieDetails: any }>({
      query,
      variables: { movieId }
    });

    return result;
  }

  /**
   * Get movies list - con paginación automática mejorada
   */
  async getMovies(genre?: string, page?: number, limit?: number, roomId?: string): Promise<{ getMovies: any[] }> {
    // Obtener configuración de compatibilidad
    const envConfig = getEnvironmentConfig();

    // Agregar paginación por defecto si está habilitado
    const finalPage = page || (envConfig.compatibility.transformations.addDefaultPagination ? 1 : undefined);
    const finalLimit = limit || (envConfig.compatibility.transformations.addDefaultPagination ? 20 : undefined);

    if (envConfig.logging.logTransformations && (finalPage || finalLimit)) {
      console.log('🔄 Compatibility: Added default pagination:', { page: finalPage, limit: finalLimit });
    }

    const query = `
      query GetMovies($genre: String, $page: Int, $limit: Int) {
        getMovies(genre: $genre, page: $page, limit: $limit) {
          id
          title
          overview
          poster
          vote_average
          release_date
        }
      }
    `;

    const variables: any = {};

    // Encode roomId in genre if provided (backend hack to avoid schema change)
    if (roomId) {
      variables.genre = genre ? `${genre}|roomId:${roomId}` : `|roomId:${roomId}`;
    } else if (genre) {
      variables.genre = genre;
    }

    if (finalPage) variables.page = finalPage;
    if (finalLimit) variables.limit = finalLimit;

    const result = await this.graphqlRequest<{ getMovies: any[] }>({
      query,
      variables
    });

    return result;
  }

  /**
   * Get ALL movies - carga todo el contenido disponible
   */
  async getAllMovies(): Promise<{ getMovies: any[] }> {
    const query = `
      query GetMovies {
        getMovies {
          id
          title
          overview
          poster
          vote_average
          release_date
        }
      }
    `;

    // La Lambda ahora devuelve ~500 películas directamente
    const result = await this.graphqlRequest<{ getMovies: any[] }>({ query });
    return result;
  }

  /**
   * NEW: Get filtered content using advanced content filtering system
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  async getFilteredContent(
    mediaType: 'MOVIE' | 'TV',
    genreIds: number[],
    limit: number = 30,
    excludeIds: string[] = []
  ): Promise<{ getFilteredContent: any[] }> {
    console.log(`🎯 AppSyncService: Getting filtered content - ${mediaType}, genres: [${genreIds.join(', ')}], limit: ${limit}`);

    const query = `
      query GetFilteredContent($mediaType: MediaType!, $genreIds: [Int!]!, $limit: Int, $excludeIds: [String!]) {
        getFilteredContent(mediaType: $mediaType, genreIds: $genreIds, limit: $limit, excludeIds: $excludeIds) {
          id
          tmdbId
          title
          originalTitle
          overview
          posterPath
          backdropPath
          releaseDate
          year
          rating
          voteCount
          genres
          mediaType
          runtime
          tagline
          budget
          revenue
          trailerKey
          watchProviders {
            id
            name
            logoPath
            type
          }
          cast {
            id
            name
            character
            profilePath
          }
          director
          creator
        }
      }
    `;

    try {
      const result = await this.graphqlRequest<{ getFilteredContent: any[] }>({
        query,
        variables: {
          mediaType,
          genreIds,
          limit,
          excludeIds
        }
      });

      console.log(`✅ AppSyncService: Filtered content loaded - ${result.getFilteredContent?.length || 0} items`);
      return result;

    } catch (error) {
      console.error('❌ AppSyncService: Error getting filtered content:', error);
      
      // Fallback to regular getMovies for backward compatibility
      console.log('🔄 AppSyncService: Falling back to regular getMovies');
      const fallbackResult = await this.getMovies();
      
      // Transform to expected format
      return {
        getFilteredContent: fallbackResult.getMovies || []
      };
    }
  }

  /**
   * NEW: Get available genres for media type
   * Requirements: 1.4, 2.1
   */
  async getAvailableGenres(mediaType: 'MOVIE' | 'TV'): Promise<{ getAvailableGenres: Array<{id: number, name: string}> }> {
    console.log(`🎭 AppSyncService: Getting available genres for ${mediaType}`);

    const query = `
      query GetAvailableGenres($mediaType: MediaType!) {
        getAvailableGenres(mediaType: $mediaType) {
          id
          name
        }
      }
    `;

    try {
      const result = await this.graphqlRequest<{ getAvailableGenres: Array<{id: number, name: string}> }>({
        query,
        variables: { mediaType }
      });

      console.log(`✅ AppSyncService: Retrieved ${result.getAvailableGenres?.length || 0} genres for ${mediaType}`);
      return result;

    } catch (error) {
      console.error('❌ AppSyncService: Error getting available genres:', error);
      
      // Return empty array as fallback
      return { getAvailableGenres: [] };
    }
  }

  /**
   * Get AI recommendations with enhanced response format
   */
  async getAIRecommendations(input: {
    roomId: string;
    preferences?: string[];
    excludeIds?: string[];
  }): Promise<{ getChatRecommendations: any }> {
    const query = `
      query GetChatRecommendations($text: String!) {
        getChatRecommendations(text: $text) {
          chatResponse
          recommendedGenres
          confidence
          reasoning
          genreAlignment
          fallbackUsed
        }
      }
    `;

    // Build context text for AI
    const contextParts = [`Room: ${input.roomId}`];
    if (input.preferences && input.preferences.length > 0) {
      contextParts.push(`Preferences: ${input.preferences.join(', ')}`);
    }
    if (input.excludeIds && input.excludeIds.length > 0) {
      contextParts.push(`Exclude: ${input.excludeIds.join(', ')}`);
    }

    const text = `Recommend movies for ${contextParts.join('. ')}`;

    try {
      const result = await this.graphqlRequest<{ getChatRecommendations: any }>({
        query,
        variables: { text }
      });

      return result;
    } catch (error: any) {
      loggingService.error('AppSyncService', 'AI recommendations failed', {
        roomId: input.roomId,
        error: error.message
      });

      // Return fallback response
      return {
        getChatRecommendations: {
          chatResponse: 'I\'m having trouble generating recommendations right now. Try browsing popular movies instead.',
          recommendedGenres: input.preferences || [],
          confidence: 0.0,
          reasoning: 'AI service unavailable, using fallback response',
          genreAlignment: 0.0,
          fallbackUsed: true
        }
      };
    }
  }

  /**
   * Get the correct AppSync Realtime WebSocket endpoint
   */
  private getRealtimeEndpoint(): string {
    // Convert HTTP endpoint to WebSocket endpoint
    // Example: https://xxxx.appsync-api.eu-west-1.amazonaws.com/graphql
    // Becomes: wss://xxxx.appsync-realtime-api.eu-west-1.amazonaws.com/graphql

    const wsUrl = this.graphqlEndpoint
      .replace('https://', 'wss://')
      .replace('.appsync-api.', '.appsync-realtime-api.');

    console.log('🔗 WebSocket URL conversion:', {
      original: this.graphqlEndpoint,
      websocket: wsUrl
    });

    return wsUrl;
  }

  /**
   * Helper method to create WebSocket subscriptions with enhanced error handling and exponential backoff
   */
  private async createWebSocketConnection(
    subscription: string,
    variables: Record<string, any>,
    callback: (data: any) => void,
    subscriptionName: string,
    retryAttempt: number = 0
  ): Promise<(() => void) | null> {
    // Check circuit breaker before attempting connection
    if (!this.canAttemptConnection()) {
      console.warn(`⛔ Circuit breaker blocking ${subscriptionName} subscription`);
      return null;
    }

    try {
      console.log(`📡 Creating WebSocket connection for ${subscriptionName} (attempt ${retryAttempt + 1})`);

      // Get authentication token
      const authToken = await this.getCurrentAuthToken();

      // Get WebSocket endpoint
      let wsEndpoint = this.getRealtimeEndpoint();
      const host = this.graphqlEndpoint.replace('https://', '').replace('/graphql', '');

      // Prepare connection URL with required query parameters
      // AppSync Realtime Protocol requires 'header' and 'payload' query params base64 encoded
      const b64Header = createAppSyncHeader(authToken, host);
      const b64Payload = createAppSyncPayload({});

      wsEndpoint = `${wsEndpoint}?header=${encodeURIComponent(b64Header)}&payload=${encodeURIComponent(b64Payload)}`;
      console.log(`🔗 Connecting to AppSync Realtime: ${wsEndpoint.substring(0, 50)}...`);

      // Create WebSocket connection with AppSync Realtime protocol
      // Ensure 'graphql-ws' subprotocol is specified
      // Add User-Agent in options (second argument for some RN implementations, or not, 
      // but standard WebSocket in RN takes protocol as 2nd arg. 
      // Headers in options are not standard in browser WS, but in RN they can be passed in 2nd arg object? 
      // No, legacy RN allowed headers in 2nd arg, modern might not. Use 2nd arg for protocol.
      const ws = new WebSocket(wsEndpoint, 'graphql-ws');

      let isConnected = false;
      let subscriptionId: string | null = null;
      let heartbeatInterval: NodeJS.Timeout | null = null;
      let connectionTimeout: NodeJS.Timeout | null = null;

      // Connection timeout (30 seconds)
      connectionTimeout = setTimeout(() => {
        if (!isConnected) {
          console.error(`⏰ WebSocket connection timeout for ${subscriptionName}`);
          try {
            ws.close();
          } catch (e) {
            // Ignore close errors
          }
        }
      }, 30000);

      // WebSocket event handlers
      ws.onopen = () => {
        console.log(`🔗 WebSocket opened for ${subscriptionName}`);
        this.updateConnectionStatus('connecting');

        // Send connection init message (empty payload as auth is in query params)
        const connectionInit = {
          type: 'connection_init',
          payload: {}
        };

        // Add a small delay to ensure connection is ready
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(connectionInit));
          }
        }, 100);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log(`📨 WebSocket message for ${subscriptionName}:`, message.type);

          switch (message.type) {
            case 'connection_ack':
              console.log(`✅ Connection acknowledged for ${subscriptionName}`);
              isConnected = true;
              this.updateConnectionStatus('connected');

              // Clear connection timeout
              if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
              }

              // Start heartbeat
              heartbeatInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'ping' }));
                }
              }, 30000); // Ping every 30 seconds

              // Send subscription
              // Generate a more unique and robust subscription ID to prevent collisions
              const randomPart = Math.random().toString(36).substring(2, 15);
              const timestamp = Date.now().toString(36);
              subscriptionId = `sub-${timestamp}-${randomPart}`;
              const startMessage = {
                id: subscriptionId,
                type: 'start',
                payload: {
                  data: JSON.stringify({
                    query: subscription,
                    variables: variables
                  }),
                  extensions: {
                    authorization: {
                      Authorization: authToken,
                      host: host
                    }
                  }
                }
              };

              ws.send(JSON.stringify(startMessage));
              console.log(`🚀 Subscription started for ${subscriptionName} with ID: ${subscriptionId}`);
              break;

            case 'ka':
              // Keep-alive message from server, ignore or log at debug level
              // console.debug(`💓 Keep-alive received for ${subscriptionName}`);
              break;

            case 'data':
              if (message.id === subscriptionId && message.payload) {
                console.log(`📊 Data received for ${subscriptionName}:`, message.payload);

                // Reset circuit breaker on successful data
                this.recordConnectionSuccess();

                // Call the callback with the data
                callback(message.payload.data);
              }
              break;

            case 'error':
              console.error(`❌ WebSocket error for ${subscriptionName}:`, message.payload);
              this.recordConnectionFailure(new Error(message.payload?.message || 'WebSocket error'));
              break;

            case 'complete':
              console.log(`✅ Subscription completed for ${subscriptionName}`);
              break;

            case 'pong':
              // Heartbeat response - connection is alive
              break;

            default:
              console.log(`❓ Unknown message type for ${subscriptionName}:`, message.type);
          }
        } catch (parseError) {
          console.error(`❌ Failed to parse WebSocket message for ${subscriptionName}:`, parseError);
        }
      };

      let fatalError = false;

      ws.onerror = (error: any) => {
        console.error(`❌ WebSocket error for ${subscriptionName}:`, error);

        // Check for fatal errors (404, 401, 403) in the error message
        const errorMessage = error?.message || JSON.stringify(error);
        if (errorMessage.includes('404') || errorMessage.includes('401') || errorMessage.includes('403') ||
          errorMessage.includes('Not Found') || errorMessage.includes('Unauthorized')) {
          console.error(`⛔ Fatal WebSocket error detected for ${subscriptionName}. Stopping reconnections.`);
          fatalError = true;
        }

        this.recordConnectionFailure(new Error(`WebSocket error: ${error}`));
        this.updateConnectionStatus('disconnected');
      };

      ws.onclose = (event) => {
        console.log(`🔌 WebSocket closed for ${subscriptionName}:`, event.code, event.reason);
        isConnected = false;
        this.updateConnectionStatus('disconnected');

        // Clear intervals and timeouts
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }

        // Don't reconnect on fatal errors
        if (fatalError) {
          console.log(`🛑 Not reconnecting ${subscriptionName} due to fatal error.`);
          return;
        }

        // Attempt reconnection with exponential backoff if not a clean close
        if (event.code !== 1000 && retryAttempt < this.maxReconnectionAttempts && this.canAttemptConnection()) {
          const delay = this.calculateBackoffDelay(retryAttempt + 1);
          console.log(`🔄 Reconnecting ${subscriptionName} in ${delay}ms (attempt ${retryAttempt + 2})`);

          setTimeout(() => {
            this.createWebSocketConnection(subscription, variables, callback, subscriptionName, retryAttempt + 1);
          }, delay);
        } else if (retryAttempt >= this.maxReconnectionAttempts) {
          console.error(`💥 Max reconnection attempts reached for ${subscriptionName}`);
          this.recordConnectionFailure(new Error('Max reconnection attempts exceeded'));
        }
      };

      // Store subscription for cleanup
      const subscriptionKey = `${subscriptionName}-${variables.roomId || 'global'}`;
      const cleanup = () => {
        console.log(`🧹 Cleaning up ${subscriptionName} subscription`);

        // Send stop message if connected
        if (isConnected && subscriptionId && ws.readyState === WebSocket.OPEN) {
          const stopMessage = {
            id: subscriptionId,
            type: 'stop'
          };
          ws.send(JSON.stringify(stopMessage));
        }

        // Clear intervals and timeouts
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
          connectionTimeout = null;
        }

        // Close WebSocket
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Subscription cancelled');
        }

        // Remove from active subscriptions
        this.activeSubscriptions.delete(subscriptionKey);
      };

      // Store in active subscriptions
      this.activeSubscriptions.set(subscriptionKey, {
        cleanup,
        isActive: true,
        subscriptionType: subscriptionName,
        roomId: variables.roomId || 'global'
      });

      return cleanup;

    } catch (error: any) {
      console.error(`❌ Failed to create WebSocket connection for ${subscriptionName}:`, error);
      this.recordConnectionFailure(error);

      // Attempt retry with exponential backoff
      if (retryAttempt < this.maxReconnectionAttempts && this.canAttemptConnection()) {
        const delay = this.calculateBackoffDelay(retryAttempt + 1);
        console.log(`🔄 Retrying ${subscriptionName} connection in ${delay}ms (attempt ${retryAttempt + 2})`);

        setTimeout(() => {
          this.createWebSocketConnection(subscription, variables, callback, subscriptionName, retryAttempt + 1);
        }, delay);

        // Return a temporary cleanup function
        return () => {
          console.log(`🧹 Temporary cleanup for ${subscriptionName} (retry pending)`);
        };
      }

      return null;
    }
  }

  /**
   * Subscribe to vote updates (Basic/Legacy Mode)
   */
  async subscribeToVoteUpdates(roomId: string, callback: (voteUpdate: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up basic vote updates subscription for room:', roomId);

      const subscription = `
        subscription OnVoteUpdate($roomId: ID!) {
          onVoteUpdate(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            userId
            mediaId
            voteType
            progress {
              totalVotes
              likesCount
              dislikesCount
              skipsCount
              remainingUsers
              percentage
            }
          }
        }
      `;

      return this.createWebSocketConnection(subscription, { roomId }, (data) => {
        // Unwrap and transform data for UI
        const event = data?.onVoteUpdate;
        if (event) {
          const transformed = {
            ...event,
            movieId: event.mediaId, // Map mediaId to movieId
            currentVotes: event.progress?.totalVotes || 0,
            totalMembers: (event.progress?.totalVotes || 0) + (event.progress?.remainingUsers || 0)
          };
          callback(transformed);
        }
      }, 'vote-updates');
    } catch (error) {
      console.error('❌ Failed to setup vote updates subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to match found events (Basic/Legacy Mode)
   */
  async subscribeToMatchFoundEnhanced(roomId: string, callback: (matchData: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up basic match found subscription for room:', roomId);

      // Using onMatchFound (legacy) instead of Enhanced to avoid nullability errors
      const subscription = `
        subscription OnMatchFound($roomId: ID!) {
          onMatchFound(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            matchId
            mediaId
            mediaTitle
            participants
            consensusType
          }
        }
      `;

      return this.createWebSocketConnection(subscription, { roomId }, (data) => {
        // Unwrap and transform data for UI
        const event = data?.onMatchFound;
        if (event) {
          const transformed = {
            ...event,
            movieId: event.mediaId, // Map mediaId to movieId
            movieTitle: event.mediaTitle, // Map mediaTitle to movieTitle
            // participants is already string[] as expected by MatchFound interface in room/[id].tsx (lines 40-46)
          };
          callback(transformed);
        }
      }, 'match-found');
    } catch (error) {
      console.error('❌ Failed to setup match found subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to match found events (Alias for Enhanced)
   * This method provides backward compatibility
   */
  async subscribeToMatchFound(roomId: string, callback: (matchData: any) => void): Promise<(() => void) | null> {
    console.log('📡 Using subscribeToMatchFound (redirecting to Enhanced)');
    return this.subscribeToMatchFoundEnhanced(roomId, callback);
  }

  /**
   * Subscribe to connection status changes
   */
  async subscribeToConnectionStatusChange(roomId: string, callback: (statusData: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up connection status subscription for room:', roomId);

      const subscription = `
        subscription OnConnectionStatusChange($roomId: ID!) {
          onConnectionStatusChange(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            userId
            connectionStatus
          }
        }
      `;

      return this.createWebSocketConnection(subscription, { roomId }, (data) => {
        if (data?.onConnectionStatusChange) {
          callback(data.onConnectionStatusChange);
        }
      }, 'connection-status');
    } catch (error) {
      console.error('❌ Failed to setup connection status subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to room state synchronization events (Basic/Legacy Mode)
   */
  async subscribeToRoomStateSync(roomId: string, callback: (stateData: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up basic room event subscription for room (sync fallback):', roomId);

      // Fallback to onRoomEvent as onRoomStateSync is failing validation
      const subscription = `
        subscription OnRoomEvent($roomId: ID!) {
          onRoomEvent(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            data
          }
        }
      `;

      return this.createWebSocketConnection(subscription, { roomId }, (data) => {
        // Unwrap and transform data for UI
        const event = data?.onRoomEvent;
        if (event) {
          // If it's a generic room update, try to parse data
          try {
            let parsedData = event.data;
            if (typeof event.data === 'string') {
              parsedData = JSON.parse(event.data);
            }

            // If it mimics a room update (member count etc)
            // The UI expects RoomUpdate interface: { id, status, memberCount, currentMovieIndex, totalMovies }
            // We do our best to map from whatever generic event we got
            if (event.eventType === 'ROOM_UPDATE' || event.eventType === 'MEMBER_UPDATE') {
              const transformed = {
                ...parsedData,
                id: event.roomId, // Ensure room ID is present
                // Other fields should be in parsedData if backend follows basic payload structure
              };
              callback(transformed);
            }
          } catch (e) {
            console.warn('⚠️ Failed to parse room event data:', e);
          }
        }
      }, 'room-event');
    } catch (error) {
      console.error('❌ Failed to setup room event subscription:', error);
      return null;
    }
  }

  /**
   * Subscribe to enhanced vote updates with detailed progress information
   */
  async subscribeToVoteUpdatesEnhanced(roomId: string, callback: (voteUpdate: any) => void): Promise<(() => void) | null> {
    try {
      console.log('📡 Setting up enhanced vote updates subscription for room:', roomId);

      const subscription = `
        subscription OnVoteUpdateEnhanced($roomId: ID!) {
          onVoteUpdateEnhanced(roomId: $roomId) {
            id
            timestamp
            roomId
            eventType
            progress {
              totalVotes
              likesCount
              dislikesCount
              skipsCount
              remainingUsers
              percentage
              votingUsers
              pendingUsers
              estimatedTimeToCompletion
              currentMovieInfo {
                id
                title
                poster
                overview
                genres
                year
                rating
                runtime
              }
            }
            movieInfo {
              id
              title
              poster
              overview
              genres
              year
              rating
              runtime
            }
            votingDuration
          }
        }
      `;

      return this.createWebSocketConnection(subscription, { roomId }, callback, 'enhanced-vote-updates');
    } catch (error) {
      console.error('❌ Failed to setup enhanced vote updates subscription:', error);
      return null;
    }
  }


  /**
   * Subscribe to connection status changes
   */
  subscribeToConnectionStatus(callback: (status: 'disconnected' | 'connecting' | 'connected') => void): () => void {
    this.connectionStatusCallbacks.push(callback);

    // Immediately call with current status
    callback(this.connectionStatus);

    // Return cleanup function
    return () => {
      const index = this.connectionStatusCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionStatusCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Update connection status and notify subscribers
   */
  private updateConnectionStatus(status: 'disconnected' | 'connecting' | 'connected'): void {
    if (this.connectionStatus !== status) {
      this.connectionStatus = status;
      console.log(`🔄 Connection status changed to: ${status}`);

      // Notify all subscribers
      this.connectionStatusCallbacks.forEach(callback => {
        try {
          callback(status);
        } catch (error) {
          console.error('Error in connection status callback:', error);
        }
      });
    }
  }

  /**
   * Enhanced subscription with circuit breaker and automatic reconnection
   * Usa configuración de compatibilidad para determinar el tipo de suscripción
   */
  async subscribeWithReconnection(
    roomId: string,
    subscriptionType: 'votes' | 'matches' | 'room' | 'enhanced-votes' | 'enhanced-matches' | 'connection-status' | 'room-state',
    callback: (data: any) => void
  ): Promise<(() => void) | null> {
    // Check circuit breaker before attempting connection
    if (!this.canAttemptConnection()) {
      console.warn(`⛔ Circuit breaker blocking ${subscriptionType} subscription for room ${roomId}`);
      return null;
    }

    // Obtener configuración de compatibilidad
    const envConfig = getEnvironmentConfig();

    // Determinar el tipo de suscripción basado en la configuración
    let finalSubscriptionType = subscriptionType;

    if (envConfig.compatibility.subscriptions.useBasicSubscriptions) {
      // Mapear suscripciones mejoradas a básicas si está configurado
      const basicMapping: Record<string, string> = {
        'enhanced-votes': 'votes',
        'enhanced-matches': 'matches',
        'room-state': 'room'
      };

      if (basicMapping[subscriptionType]) {
        finalSubscriptionType = basicMapping[subscriptionType] as any;
        if (envConfig.logging.logTransformations) {
          console.log(`🔄 Compatibility: Using basic subscription ${finalSubscriptionType} instead of ${subscriptionType}`);
        }
      }
    }

    console.log(`📡 Setting up ${finalSubscriptionType} subscription for room ${roomId}`);

    try {
      // Route to appropriate subscription method
      switch (finalSubscriptionType) {
        case 'enhanced-votes':
          return await this.subscribeToVoteUpdatesEnhanced(roomId, callback);

        case 'enhanced-matches':
          return await this.subscribeToMatchFoundEnhanced(roomId, callback);

        case 'connection-status':
          return await this.subscribeToConnectionStatusChange(roomId, callback);

        case 'room-state':
          return await this.subscribeToRoomStateSync(roomId, callback);

        case 'votes':
          return await this.subscribeToVoteUpdates(roomId, callback);

        case 'matches':
          // Usar enhanced version si está disponible, sino básica
          if (envConfig.compatibility.subscriptions.enableEnhancedSubscriptions) {
            return await this.subscribeToMatchFoundEnhanced(roomId, callback);
          } else {
            return await this.subscribeToMatchFoundEnhanced(roomId, callback); // Fallback a enhanced
          }

        case 'room':
          // Usar room state sync si está disponible, sino fallback
          if (envConfig.compatibility.subscriptions.enableEnhancedSubscriptions) {
            return await this.subscribeToRoomStateSync(roomId, callback);
          } else {
            return await this.subscribeToRoomStateSync(roomId, callback); // Fallback a room state
          }

        default:
          console.error(`❌ Unknown subscription type: ${finalSubscriptionType}`);
          return null;
      }
    } catch (error: any) {
      console.error(`❌ Failed to setup ${finalSubscriptionType} subscription:`, error);
      this.recordConnectionFailure(error);
      return null;
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionStatus;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    openUntil?: number;
  } {
    return {
      state: this.circuitBreakerState,
      failureCount: this.circuitBreakerFailureCount,
      openUntil: this.circuitBreakerState === 'open' ? this.circuitBreakerOpenUntil : undefined
    };
  }

  /**
   * Manually reset circuit breaker (for user-initiated actions)
   */
  resetCircuitBreaker(): void {
    console.log('🔄 Manually resetting circuit breaker');
    this.circuitBreakerState = 'closed';
    this.circuitBreakerFailureCount = 0;
    this.circuitBreakerOpenUntil = 0;
  }

  /**
   * Force reconnection for all active subscriptions (only if circuit breaker allows)
   */
  async forceReconnection(): Promise<void> {
    if (!this.canAttemptConnection()) {
      console.warn('⛔ Circuit breaker prevents forced reconnection');
      return;
    }

    console.log('🔄 Forcing reconnection for all subscriptions...');
    this.updateConnectionStatus('connecting');

    // Reset reconnection attempts
    this.reconnectionAttempts = 0;

    // Note: Individual subscriptions will handle their own reconnection
    // This method just resets the global state
  }

  /**
   * Emergency stop - immediately stop all subscriptions and open circuit breaker
   */
  emergencyStop(reason: string = 'Manual emergency stop'): void {
    console.error('🚨 EMERGENCY STOP:', reason);

    // Open circuit breaker
    this.openCircuitBreaker(new Error(reason));

    // Clear all caches
    this.clearTokenCache();

    console.log('🛑 All WebSocket connections stopped and circuit breaker opened');
  }

  /**
   * Clear authentication cache (call on logout or auth errors)
   */
  clearAuthCache(): void {
    this.clearTokenCache();

    // Also stop all subscriptions on auth errors
    this.stopAllSubscriptions();

    console.log('🧹 AppSyncService: Authentication cache cleared and subscriptions stopped');
  }

  // ============ CONTENT FILTERING METHODS ============

  /**
   * Create room with advanced content filters
   */
  async createRoomWithFilters(input: {
    name: string;
    description?: string;
    mediaType: 'MOVIE' | 'TV';
    genreIds: number[];
    isPrivate?: boolean;
    maxMembers?: number;
  }): Promise<any> {
    const mutation = `
      mutation CreateRoom($input: CreateRoomInput!) {
        createRoom(input: $input) {
          id
          name
          description
          mediaType
          genreIds
          genreNames
          filterCriteria {
            mediaType
            genreIds
            roomId
          }
          isPrivate
          maxMembers
          createdAt
          updatedAt
        }
      }
    `;

    console.log('🎬 AppSyncService.createRoomWithFilters - Input:', JSON.stringify(input, null, 2));

    try {
      const result = await this.graphqlRequest<{ createRoom: any }>({
        query: mutation,
        variables: { input }
      });

      console.log('✅ AppSyncService.createRoomWithFilters - Success:', JSON.stringify(result, null, 2));
      return result.createRoom;
    } catch (error: any) {
      console.error('❌ AppSyncService.createRoomWithFilters - Error:', error);
      loggingService.error('AppSyncService', 'Room creation with filters failed', {
        input,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update room filters (will be rejected due to immutability)
   */
  async updateRoomFilters(roomId: string, input: {
    mediaType: 'MOVIE' | 'TV';
    genreIds: number[];
  }): Promise<any> {
    const mutation = `
      mutation UpdateRoomFilters($roomId: ID!, $input: UpdateRoomFiltersInput!) {
        updateRoomFilters(roomId: $roomId, input: $input) {
          id
          name
          mediaType
          genreIds
          genreNames
          filterCriteria {
            mediaType
            genreIds
            roomId
          }
          updatedAt
        }
      }
    `;

    console.log('🔄 AppSyncService.updateRoomFilters - RoomId:', roomId, 'Input:', JSON.stringify(input, null, 2));

    try {
      const result = await this.graphqlRequest<{ updateRoomFilters: any }>({
        query: mutation,
        variables: { roomId, input }
      });

      console.log('✅ AppSyncService.updateRoomFilters - Success:', JSON.stringify(result, null, 2));
      return result.updateRoomFilters;
    } catch (error: any) {
      console.error('❌ AppSyncService.updateRoomFilters - Error:', error);
      loggingService.error('AppSyncService', 'Room filter update failed', {
        roomId,
        input,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get available genres for media type
   */
  async getAvailableGenres(mediaType: 'MOVIE' | 'TV'): Promise<Array<{ id: number; name: string }>> {
    const query = `
      query GetAvailableGenres($mediaType: MediaType!) {
        getAvailableGenres(mediaType: $mediaType) {
          id
          name
        }
      }
    `;

    console.log('🎭 AppSyncService.getAvailableGenres - MediaType:', mediaType);

    try {
      const result = await this.graphqlRequest<{ getAvailableGenres: Array<{ id: number; name: string }> }>({
        query,
        variables: { mediaType }
      });

      console.log('✅ AppSyncService.getAvailableGenres - Success:', result.getAvailableGenres.length, 'genres loaded');
      return result.getAvailableGenres;
    } catch (error: any) {
      console.error('❌ AppSyncService.getAvailableGenres - Error:', error);
      loggingService.error('AppSyncService', 'Genre loading failed', {
        mediaType,
        error: error.message
      });
      throw error;
    }
  }
}

export const appSyncService = new AppSyncService();
export default appSyncService;