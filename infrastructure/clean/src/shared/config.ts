/**
 * Configuration management for Trinity Lambda functions
 * Loads configuration from AWS Systems Manager Parameter Store with in-memory caching
 */

import { SSMClient, GetParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';
import { TrinityConfig } from './types';
import { logger } from './logger';

class ConfigurationManager {
  private ssmClient: SSMClient;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL to avoid saturating SSM calls
  private configCache: TrinityConfig | null = null;
  private configCacheExpiry: number = 0;

  constructor() {
    this.ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'eu-west-1' });
  }

  /**
   * Get a single parameter from Parameter Store with caching
   */
  async getParameter(parameterName: string, decrypt: boolean = false): Promise<string> {
    const cacheKey = `${parameterName}:${decrypt}`;
    
    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      logger.debug('📦 Parameter cache hit', { parameterName });
      return this.cache.get(cacheKey);
    }

    try {
      logger.debug('🔍 Fetching parameter from SSM', { parameterName });
      
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: decrypt,
      });

      const response = await this.ssmClient.send(command);
      const value = response.Parameter?.Value;

      if (!value) {
        throw new Error(`Parameter ${parameterName} not found or has no value`);
      }

      // Cache the result
      this.cache.set(cacheKey, value);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

      logger.debug('✅ Parameter fetched successfully', { parameterName });
      return value;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Failed to fetch parameter: ${parameterName}`, err);
      throw error;
    }
  }

  /**
   * Get multiple parameters from Parameter Store with caching
   */
  async getParameters(parameterNames: string[], decrypt: boolean = false): Promise<Record<string, string>> {
    const uncachedParams: string[] = [];
    const result: Record<string, string> = {};

    // Check cache for each parameter
    for (const paramName of parameterNames) {
      const cacheKey = `${paramName}:${decrypt}`;
      if (this.isCacheValid(cacheKey)) {
        result[paramName] = this.cache.get(cacheKey);
      } else {
        uncachedParams.push(paramName);
      }
    }

    // Fetch uncached parameters
    if (uncachedParams.length > 0) {
      try {
        logger.debug('🔍 Fetching multiple parameters from SSM', { 
          count: uncachedParams.length,
          parameters: uncachedParams 
        });

        const command = new GetParametersCommand({
          Names: uncachedParams,
          WithDecryption: decrypt,
        });

        const response = await this.ssmClient.send(command);
        
        // Process successful parameters
        for (const param of response.Parameters || []) {
          if (param.Name && param.Value) {
            result[param.Name] = param.Value;
            
            // Cache the result
            const cacheKey = `${param.Name}:${decrypt}`;
            this.cache.set(cacheKey, param.Value);
            this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);
          }
        }

        // Log any invalid parameters
        if (response.InvalidParameters && response.InvalidParameters.length > 0) {
          logger.warn('⚠️ Some parameters were invalid', {
            invalidParameters: response.InvalidParameters
          });
        }

        logger.debug('✅ Multiple parameters fetched successfully', { 
          fetched: Object.keys(result).length 
        });

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('❌ Failed to fetch multiple parameters', err);
        throw error;
      }
    }

    return result;
  }

  /**
   * Load complete Trinity configuration with caching
   */
  async loadTrinityConfig(): Promise<TrinityConfig> {
    // Check if cached config is still valid
    if (this.configCache && Date.now() < this.configCacheExpiry) {
      logger.debug('📦 Configuration cache hit');
      return this.configCache;
    }

    const environment = process.env.TRINITY_ENV || 'dev';
    const parameterPrefix = `/trinity/${environment}`;

    try {
      logger.info('🔧 Loading Trinity configuration', { environment });

      // Define all parameter paths using the new hierarchy
      const parameterPaths = {
        // External services (SecureString)
        tmdbApiKey: `${parameterPrefix}/external/tmdb-api-key`,
        
        // Authentication
        cognitoUserPoolId: `${parameterPrefix}/auth/cognito-user-pool-id`,
        cognitoClientId: `${parameterPrefix}/auth/cognito-client-id`,
        googleWebClientId: `${parameterPrefix}/auth/google-web-client-id`,
        googleClientSecret: `${parameterPrefix}/auth/google-client-secret`,
        googleAndroidClientId: `${parameterPrefix}/auth/google-android-client-id`,
        googleIosClientId: `${parameterPrefix}/auth/google-ios-client-id`,
        
        // APIs
        appsyncApiId: `${parameterPrefix}/api/appsync-api-id`,
        appsyncApiUrl: `${parameterPrefix}/api/appsync-api-url`,
        realtimeApiUrl: `${parameterPrefix}/api/realtime-api-url`,
        
        // Security
        jwtSecret: `${parameterPrefix}/security/jwt-secret`,
        
        // Configuration objects
        tableNames: `${parameterPrefix}/dynamodb/table-names`,
        lambdaFunctionNames: `${parameterPrefix}/lambda/function-names`,
        appConfig: `${parameterPrefix}/app/config`,
        featureFlags: `${parameterPrefix}/app/feature-flags`,
      };

      // Fetch secure parameters (SecureString)
      const secureParams = await this.getParameters([
        parameterPaths.tmdbApiKey,
        parameterPaths.googleWebClientId,
        parameterPaths.googleClientSecret,
        parameterPaths.googleAndroidClientId,
        parameterPaths.googleIosClientId,
        parameterPaths.jwtSecret,
      ], true);

      // Fetch regular parameters (String)
      const regularParams = await this.getParameters([
        parameterPaths.cognitoUserPoolId,
        parameterPaths.cognitoClientId,
        parameterPaths.appsyncApiId,
        parameterPaths.appsyncApiUrl,
        parameterPaths.realtimeApiUrl,
        parameterPaths.tableNames,
        parameterPaths.lambdaFunctionNames,
        parameterPaths.appConfig,
        parameterPaths.featureFlags,
      ]);

      // Parse JSON configurations
      const tableNames = JSON.parse(regularParams[parameterPaths.tableNames]);
      const lambdaFunctionNames = JSON.parse(regularParams[parameterPaths.lambdaFunctionNames]);
      const appConfig = JSON.parse(regularParams[parameterPaths.appConfig]);
      const featureFlags = JSON.parse(regularParams[parameterPaths.featureFlags]);

      // Build complete configuration
      const config: TrinityConfig = {
        region: process.env.AWS_REGION || 'eu-west-1',
        environment,
        
        tables: tableNames,
        
        external: {
          tmdbApiKey: secureParams[parameterPaths.tmdbApiKey],
          cognitoUserPoolId: regularParams[parameterPaths.cognitoUserPoolId],
          cognitoClientId: regularParams[parameterPaths.cognitoClientId],
          appsyncApiId: regularParams[parameterPaths.appsyncApiId],
          appsyncApiUrl: regularParams[parameterPaths.appsyncApiUrl],
          realtimeApiUrl: regularParams[parameterPaths.realtimeApiUrl],
        },

        // AppSync configuration for real-time subscriptions
        appSync: {
          endpoint: regularParams[parameterPaths.appsyncApiUrl],
          apiKey: process.env.APPSYNC_API_KEY, // Optional API key for mutations
          region: process.env.AWS_REGION || 'eu-west-1',
        },
        
        app: appConfig,
        
        // Additional configuration from Parameter Store
        lambdaFunctions: lambdaFunctionNames,
        featureFlags: featureFlags,
        
        // Google OAuth configuration
        googleOAuth: {
          webClientId: secureParams[parameterPaths.googleWebClientId],
          clientSecret: secureParams[parameterPaths.googleClientSecret],
          androidClientId: secureParams[parameterPaths.googleAndroidClientId],
          iosClientId: secureParams[parameterPaths.googleIosClientId],
        },
        
        // Security configuration
        security: {
          jwtSecret: secureParams[parameterPaths.jwtSecret],
        },
      };

      // Cache the configuration
      this.configCache = config;
      this.configCacheExpiry = Date.now() + this.CACHE_TTL;

      logger.info('✅ Trinity configuration loaded successfully', { environment });
      return config;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to load Trinity configuration', err, { environment });
      throw error;
    }
  }

  /**
   * Get configuration with fallback to environment variables
   */
  async getConfigWithFallback(): Promise<TrinityConfig> {
    try {
      return await this.loadTrinityConfig();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn('⚠️ Failed to load from Parameter Store, using environment variables', { error: errorMessage });
      
      // Fallback to environment variables
      return this.loadFromEnvironmentVariables();
    }
  }

  /**
   * Load configuration from environment variables (fallback)
   */
  private loadFromEnvironmentVariables(): TrinityConfig {
    const environment = process.env.TRINITY_ENV || 'dev';
    
    return {
      region: process.env.AWS_REGION || 'eu-west-1',
      environment,
      
      tables: {
        users: process.env.USERS_TABLE || 'trinity-users-dev',
        rooms: process.env.ROOMS_TABLE || 'trinity-rooms-dev-v2',
        roomMembers: process.env.ROOM_MEMBERS_TABLE || 'trinity-room-members-dev',
        roomInvites: process.env.ROOM_INVITES_TABLE || 'trinity-room-invites-dev-v2',
        votes: process.env.VOTES_TABLE || 'trinity-votes-dev',
        moviesCache: process.env.MOVIES_CACHE_TABLE || 'trinity-movies-cache-dev',
        roomMatches: 'trinity-room-matches-dev',
        connections: 'trinity-connections-dev',
        chatSessions: 'trinity-chat-sessions-dev',
        roomMovieCache: 'trinity-room-movie-cache-dev',
        roomCacheMetadata: 'trinity-room-cache-metadata-dev',
        matchmaking: 'trinity-matchmaking-dev',
        filterCache: 'trinity-filter-cache',
      },
      
      external: {
        tmdbApiKey: process.env.TMDB_API_KEY || '',
        cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
        cognitoClientId: process.env.COGNITO_CLIENT_ID || '',
        appsyncApiId: process.env.GRAPHQL_API_ID || '',
        appsyncApiUrl: process.env.GRAPHQL_API_URL || '',
        realtimeApiUrl: process.env.GRAPHQL_REALTIME_URL || '',
      },

      // AppSync configuration for real-time subscriptions
      appSync: {
        endpoint: process.env.GRAPHQL_API_URL || '',
        apiKey: process.env.APPSYNC_API_KEY,
        region: process.env.AWS_REGION || 'eu-west-1',
      },
      
      app: {
        cache: {
          ttlDays: parseInt(process.env.CACHE_TTL_DAYS || '7'),
          batchSize: parseInt(process.env.BATCH_SIZE || '30'),
          maxBatches: parseInt(process.env.MAX_BATCHES || '10'),
        },
        voting: {
          maxRoomCapacity: parseInt(process.env.MAX_ROOM_CAPACITY || '10'),
          defaultRoomCapacity: parseInt(process.env.DEFAULT_ROOM_CAPACITY || '2'),
        },
        movies: {
          cacheSize: parseInt(process.env.MOVIE_CACHE_SIZE || '50'),
          maxGenres: parseInt(process.env.MAX_GENRES || '2'),
        },
      },
      
      // Additional fallback configurations
      lambdaFunctions: {
        auth: process.env.AUTH_HANDLER_NAME || 'trinity-auth-dev',
        room: process.env.ROOM_HANDLER_NAME || 'trinity-room-dev',
        vote: process.env.VOTE_HANDLER_NAME || 'trinity-vote-dev',
        movie: process.env.MOVIE_HANDLER_NAME || 'trinity-movie-dev',
        cache: process.env.CACHE_HANDLER_NAME || 'trinity-cache-dev',
        realtime: process.env.REALTIME_HANDLER_NAME || 'trinity-realtime-dev',
        matchmaker: process.env.MATCHMAKER_HANDLER_NAME || 'trinity-vote-consensus-dev',
      },
      
      featureFlags: {
        enableRealTimeNotifications: process.env.ENABLE_REAL_TIME_NOTIFICATIONS === 'true',
        enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER === 'true',
        enableMetricsLogging: process.env.ENABLE_METRICS_LOGGING === 'true',
        enableGoogleSignin: process.env.ENABLE_GOOGLE_SIGNIN === 'true',
        debugMode: process.env.DEBUG_MODE === 'true',
      },
      
      googleOAuth: {
        webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
        iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
      },
      
      security: {
        jwtSecret: process.env.JWT_SECRET || '',
      },
    };
  }

  /**
   * Check if cached value is still valid
   */
  private isCacheValid(cacheKey: string): boolean {
    if (!this.cache.has(cacheKey)) return false;
    
    const expiry = this.cacheExpiry.get(cacheKey);
    if (!expiry || Date.now() > expiry) {
      this.cache.delete(cacheKey);
      this.cacheExpiry.delete(cacheKey);
      return false;
    }
    
    return true;
  }

  /**
   * Clear configuration cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    this.configCache = null;
    this.configCacheExpiry = 0;
    logger.debug('🧹 Configuration cache cleared');
  }
}

// Singleton instance
const configManager = new ConfigurationManager();

// Export convenience functions
export async function getTrinityConfig(): Promise<TrinityConfig> {
  return configManager.getConfigWithFallback();
}

export async function getParameter(parameterName: string, decrypt: boolean = false): Promise<string> {
  return configManager.getParameter(parameterName, decrypt);
}

export async function getParameters(parameterNames: string[], decrypt: boolean = false): Promise<Record<string, string>> {
  return configManager.getParameters(parameterNames, decrypt);
}

export function clearConfigCache(): void {
  configManager.clearCache();
}

export { ConfigurationManager };