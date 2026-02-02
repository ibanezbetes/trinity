"use strict";
/**
 * Configuration management for Trinity Lambda functions
 * Loads configuration from AWS Systems Manager Parameter Store with in-memory caching
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationManager = void 0;
exports.getTrinityConfig = getTrinityConfig;
exports.getParameter = getParameter;
exports.getParameters = getParameters;
exports.clearConfigCache = clearConfigCache;
const client_ssm_1 = require("@aws-sdk/client-ssm");
const logger_1 = require("./logger");
class ConfigurationManager {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL to avoid saturating SSM calls
        this.configCache = null;
        this.configCacheExpiry = 0;
        this.ssmClient = new client_ssm_1.SSMClient({ region: process.env.AWS_REGION || 'eu-west-1' });
    }
    /**
     * Get a single parameter from Parameter Store with caching
     */
    async getParameter(parameterName, decrypt = false) {
        const cacheKey = `${parameterName}:${decrypt}`;
        // Check cache first
        if (this.isCacheValid(cacheKey)) {
            logger_1.logger.debug('📦 Parameter cache hit', { parameterName });
            return this.cache.get(cacheKey);
        }
        try {
            logger_1.logger.debug('🔍 Fetching parameter from SSM', { parameterName });
            const command = new client_ssm_1.GetParameterCommand({
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
            logger_1.logger.debug('✅ Parameter fetched successfully', { parameterName });
            return value;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error(`❌ Failed to fetch parameter: ${parameterName}`, err);
            throw error;
        }
    }
    /**
     * Get multiple parameters from Parameter Store with caching
     */
    async getParameters(parameterNames, decrypt = false) {
        const uncachedParams = [];
        const result = {};
        // Check cache for each parameter
        for (const paramName of parameterNames) {
            const cacheKey = `${paramName}:${decrypt}`;
            if (this.isCacheValid(cacheKey)) {
                result[paramName] = this.cache.get(cacheKey);
            }
            else {
                uncachedParams.push(paramName);
            }
        }
        // Fetch uncached parameters
        if (uncachedParams.length > 0) {
            try {
                logger_1.logger.debug('🔍 Fetching multiple parameters from SSM', {
                    count: uncachedParams.length,
                    parameters: uncachedParams
                });
                const command = new client_ssm_1.GetParametersCommand({
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
                    logger_1.logger.warn('⚠️ Some parameters were invalid', {
                        invalidParameters: response.InvalidParameters
                    });
                }
                logger_1.logger.debug('✅ Multiple parameters fetched successfully', {
                    fetched: Object.keys(result).length
                });
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger_1.logger.error('❌ Failed to fetch multiple parameters', err);
                throw error;
            }
        }
        return result;
    }
    /**
     * Load complete Trinity configuration with caching
     */
    async loadTrinityConfig() {
        // Check if cached config is still valid
        if (this.configCache && Date.now() < this.configCacheExpiry) {
            logger_1.logger.debug('📦 Configuration cache hit');
            return this.configCache;
        }
        const environment = process.env.TRINITY_ENV || 'dev';
        const parameterPrefix = `/trinity/${environment}`;
        try {
            logger_1.logger.info('🔧 Loading Trinity configuration', { environment });
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
            const config = {
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
            logger_1.logger.info('✅ Trinity configuration loaded successfully', { environment });
            return config;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to load Trinity configuration', err, { environment });
            throw error;
        }
    }
    /**
     * Get configuration with fallback to environment variables
     */
    async getConfigWithFallback() {
        try {
            return await this.loadTrinityConfig();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.warn('⚠️ Failed to load from Parameter Store, using environment variables', { error: errorMessage });
            // Fallback to environment variables
            return this.loadFromEnvironmentVariables();
        }
    }
    /**
     * Load configuration from environment variables (fallback)
     */
    loadFromEnvironmentVariables() {
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
    isCacheValid(cacheKey) {
        if (!this.cache.has(cacheKey))
            return false;
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
    clearCache() {
        this.cache.clear();
        this.cacheExpiry.clear();
        this.configCache = null;
        this.configCacheExpiry = 0;
        logger_1.logger.debug('🧹 Configuration cache cleared');
    }
}
exports.ConfigurationManager = ConfigurationManager;
// Singleton instance
const configManager = new ConfigurationManager();
// Export convenience functions
async function getTrinityConfig() {
    return configManager.getConfigWithFallback();
}
async function getParameter(parameterName, decrypt = false) {
    return configManager.getParameter(parameterName, decrypt);
}
async function getParameters(parameterNames, decrypt = false) {
    return configManager.getParameters(parameterNames, decrypt);
}
function clearConfigCache() {
    configManager.clearCache();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29uZmlnLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7O0dBR0c7OztBQXVZSCw0Q0FFQztBQUVELG9DQUVDO0FBRUQsc0NBRUM7QUFFRCw0Q0FFQztBQW5aRCxvREFBMkY7QUFFM0YscUNBQWtDO0FBRWxDLE1BQU0sb0JBQW9CO0lBUXhCO1FBTlEsVUFBSyxHQUFxQixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3BDLGdCQUFXLEdBQXdCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDcEMsY0FBUyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUMsOENBQThDO1FBQ2xGLGdCQUFXLEdBQXlCLElBQUksQ0FBQztRQUN6QyxzQkFBaUIsR0FBVyxDQUFDLENBQUM7UUFHcEMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztJQUNwRixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsWUFBWSxDQUFDLGFBQXFCLEVBQUUsVUFBbUIsS0FBSztRQUNoRSxNQUFNLFFBQVEsR0FBRyxHQUFHLGFBQWEsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUUvQyxvQkFBb0I7UUFDcEIsSUFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7WUFDaEMsZUFBTSxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7WUFDMUQsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNsQyxDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0gsZUFBTSxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7WUFFbEUsTUFB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QUN4QixLQUFLLFVBQVUsZ0JBQWdCO0lBQ3BDLE9BQU8sYUFBYSxDQUFDLHFCQUFxQixFQUFFLENBQUM7QUFDL0MsQ0FBQztBQUVNLEtBQUssVUFBVSxZQUFZLENBQUMsYUFBcUIsRUFBRSxVQUFtQixLQUFLO0lBQ2hGLE9BQU8sYUFBYSxDQUFDLFlBQVksQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDNUQsQ0FBQztBQUVNLEtBQUssVUFBVSxhQUFhLENBQUMsY0FBd0IsRUFBRSxVQUFtQixLQUFLO0lBQ3BGLE9BQU8sYUFBYSxDQUFDLGFBQWEsQ0FBQyxjQUFjLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUVELFNBQWdCLGdCQUFnQjtJQUM5QixhQUFhLENBQUMsVUFBVSxFQUFFLENBQUM7QUFDN0IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBDb25maWd1cmF0aW9uIG1hbmFnZW1lbnQgZm9yIFRyaW5pdHkgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gKiBMb2FkcyBjb25maWd1cmF0aW9uIGZyb20gQVdTIFN5c3RlbXMgTWFuYWdlciBQYXJhbWV0ZXIgU3RvcmUgd2l0aCBpbi1tZW1vcnkgY2FjaGluZ1xyXG4gKi9cclxuXHJcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCwgR2V0UGFyYW1ldGVyc0NvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3NtJztcclxuaW1wb3J0IHsgVHJpbml0eUNvbmZpZyB9IGZyb20gJy4vdHlwZXMnO1xyXG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XHJcblxyXG5jbGFzcyBDb25maWd1cmF0aW9uTWFuYWdlciB7XHJcbiAgcHJpdmF0ZSBzc21DbGllbnQ6IFNTTUNsaWVudDtcclxuICBwcml2YXRlIGNhY2hlOiBNYXA8c3RyaW5nLCBhbnk+ID0gbmV3IE1hcCgpO1xyXG4gIHByaXZhdGUgY2FjaGVFeHBpcnk6IE1hcDxzdHJpbmcsIG51bWJlcj4gPSBuZXcgTWFwKCk7XHJcbiAgcHJpdmF0ZSByZWFkb25seSBDQUNIRV9UVEwgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXMgVFRMIHRvIGF2b2lkIHNhdHVyYXRpbmcgU1NNIGNhbGxzXHJcbiAgcHJpdmF0ZSBjb25maWdDYWNoZTogVHJpbml0eUNvbmZpZyB8IG51bGwgPSBudWxsO1xyXG4gIHByaXZhdGUgY29uZmlnQ2FjaGVFeHBpcnk6IG51bWJlciA9IDA7XHJcblxyXG4gIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgdGhpcy5zc21DbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICdldS13ZXN0LTEnIH0pO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGEgc2luZ2xlIHBhcmFtZXRlciBmcm9tIFBhcmFtZXRlciBTdG9yZSB3aXRoIGNhY2hpbmdcclxuICAgKi9cclxuICBhc3luYyBnZXRQYXJhbWV0ZXIocGFyYW1ldGVyTmFtZTogc3RyaW5nLCBkZWNyeXB0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgY29uc3QgY2FjaGVLZXkgPSBgJHtwYXJhbWV0ZXJOYW1lfToke2RlY3J5cHR9YDtcclxuICAgIFxyXG4gICAgLy8gQ2hlY2sgY2FjaGUgZmlyc3RcclxuICAgIGlmICh0aGlzLmlzQ2FjaGVWYWxpZChjYWNoZUtleSkpIHtcclxuICAgICAgbG9nZ2VyLmRlYnVnKCfwn5OmIFBhcmFtZXRlciBjYWNoZSBoaXQnLCB7IHBhcmFtZXRlck5hbWUgfSk7XHJcbiAgICAgIHJldHVybiB0aGlzLmNhY2hlLmdldChjYWNoZUtleSk7XHJcbiAgICB9XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgbG9nZ2VyLmRlYnVnKCfwn5SNIEZldGNoaW5nIHBhcmFtZXRlciBmcm9tIFNTTScsIHsgcGFyYW1ldGVyTmFtZSB9KTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7XHJcbiAgICAgICAgTmFtZTogcGFyYW1ldGVyTmFtZSxcclxuICAgICAgICBXaXRoRGVjcnlwdGlvbjogZGVjcnlwdCxcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc3NtQ2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZTtcclxuXHJcbiAgICAgIGlmICghdmFsdWUpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBhcmFtZXRlciAke3BhcmFtZXRlck5hbWV9IG5vdCBmb3VuZCBvciBoYXMgbm8gdmFsdWVgKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gQ2FjaGUgdGhlIHJlc3VsdFxyXG4gICAgICB0aGlzLmNhY2hlLnNldChjYWNoZUtleSwgdmFsdWUpO1xyXG4gICAgICB0aGlzLmNhY2hlRXhwaXJ5LnNldChjYWNoZUtleSwgRGF0ZS5ub3coKSArIHRoaXMuQ0FDSEVfVFRMKTtcclxuXHJcbiAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIFBhcmFtZXRlciBmZXRjaGVkIHN1Y2Nlc3NmdWxseScsIHsgcGFyYW1ldGVyTmFtZSB9KTtcclxuICAgICAgcmV0dXJuIHZhbHVlO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgbG9nZ2VyLmVycm9yKGDinYwgRmFpbGVkIHRvIGZldGNoIHBhcmFtZXRlcjogJHtwYXJhbWV0ZXJOYW1lfWAsIGVycik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IG11bHRpcGxlIHBhcmFtZXRlcnMgZnJvbSBQYXJhbWV0ZXIgU3RvcmUgd2l0aCBjYWNoaW5nXHJcbiAgICovXHJcbiAgYXN5bmMgZ2V0UGFyYW1ldGVycyhwYXJhbWV0ZXJOYW1lczogc3RyaW5nW10sIGRlY3J5cHQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4ge1xyXG4gICAgY29uc3QgdW5jYWNoZWRQYXJhbXM6IHN0cmluZ1tdID0gW107XHJcbiAgICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcclxuXHJcbiAgICAvLyBDaGVjayBjYWNoZSBmb3IgZWFjaCBwYXJhbWV0ZXJcclxuICAgIGZvciAoY29uc3QgcGFyYW1OYW1lIG9mIHBhcmFtZXRlck5hbWVzKSB7XHJcbiAgICAgIGNvbnN0IGNhY2hlS2V5ID0gYCR7cGFyYW1OYW1lfToke2RlY3J5cHR9YDtcclxuICAgICAgaWYgKHRoaXMuaXNDYWNoZVZhbGlkKGNhY2hlS2V5KSkge1xyXG4gICAgICAgIHJlc3VsdFtwYXJhbU5hbWVdID0gdGhpcy5jYWNoZS5nZXQoY2FjaGVLZXkpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHVuY2FjaGVkUGFyYW1zLnB1c2gocGFyYW1OYW1lKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZldGNoIHVuY2FjaGVkIHBhcmFtZXRlcnNcclxuICAgIGlmICh1bmNhY2hlZFBhcmFtcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgbG9nZ2VyLmRlYnVnKCfwn5SNIEZldGNoaW5nIG11bHRpcGxlIHBhcmFtZXRlcnMgZnJvbSBTU00nLCB7IFxyXG4gICAgICAgICAgY291bnQ6IHVuY2FjaGVkUGFyYW1zLmxlbmd0aCxcclxuICAgICAgICAgIHBhcmFtZXRlcnM6IHVuY2FjaGVkUGFyYW1zIFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldFBhcmFtZXRlcnNDb21tYW5kKHtcclxuICAgICAgICAgIE5hbWVzOiB1bmNhY2hlZFBhcmFtcyxcclxuICAgICAgICAgIFdpdGhEZWNyeXB0aW9uOiBkZWNyeXB0LFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc3NtQ2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gUHJvY2VzcyBzdWNjZXNzZnVsIHBhcmFtZXRlcnNcclxuICAgICAgICBmb3IgKGNvbnN0IHBhcmFtIG9mIHJlc3BvbnNlLlBhcmFtZXRlcnMgfHwgW10pIHtcclxuICAgICAgICAgIGlmIChwYXJhbS5OYW1lICYmIHBhcmFtLlZhbHVlKSB7XHJcbiAgICAgICAgICAgIHJlc3VsdFtwYXJhbS5OYW1lXSA9IHBhcmFtLlZhbHVlO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgLy8gQ2FjaGUgdGhlIHJlc3VsdFxyXG4gICAgICAgICAgICBjb25zdCBjYWNoZUtleSA9IGAke3BhcmFtLk5hbWV9OiR7ZGVjcnlwdH1gO1xyXG4gICAgICAgICAgICB0aGlzLmNhY2hlLnNldChjYWNoZUtleSwgcGFyYW0uVmFsdWUpO1xyXG4gICAgICAgICAgICB0aGlzLmNhY2hlRXhwaXJ5LnNldChjYWNoZUtleSwgRGF0ZS5ub3coKSArIHRoaXMuQ0FDSEVfVFRMKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIExvZyBhbnkgaW52YWxpZCBwYXJhbWV0ZXJzXHJcbiAgICAgICAgaWYgKHJlc3BvbnNlLkludmFsaWRQYXJhbWV0ZXJzICYmIHJlc3BvbnNlLkludmFsaWRQYXJhbWV0ZXJzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgIGxvZ2dlci53YXJuKCfimqDvuI8gU29tZSBwYXJhbWV0ZXJzIHdlcmUgaW52YWxpZCcsIHtcclxuICAgICAgICAgICAgaW52YWxpZFBhcmFtZXRlcnM6IHJlc3BvbnNlLkludmFsaWRQYXJhbWV0ZXJzXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGxvZ2dlci5kZWJ1Zygn4pyFIE11bHRpcGxlIHBhcmFtZXRlcnMgZmV0Y2hlZCBzdWNjZXNzZnVsbHknLCB7IFxyXG4gICAgICAgICAgZmV0Y2hlZDogT2JqZWN0LmtleXMocmVzdWx0KS5sZW5ndGggXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZmV0Y2ggbXVsdGlwbGUgcGFyYW1ldGVycycsIGVycik7XHJcbiAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogTG9hZCBjb21wbGV0ZSBUcmluaXR5IGNvbmZpZ3VyYXRpb24gd2l0aCBjYWNoaW5nXHJcbiAgICovXHJcbiAgYXN5bmMgbG9hZFRyaW5pdHlDb25maWcoKTogUHJvbWlzZTxUcmluaXR5Q29uZmlnPiB7XHJcbiAgICAvLyBDaGVjayBpZiBjYWNoZWQgY29uZmlnIGlzIHN0aWxsIHZhbGlkXHJcbiAgICBpZiAodGhpcy5jb25maWdDYWNoZSAmJiBEYXRlLm5vdygpIDwgdGhpcy5jb25maWdDYWNoZUV4cGlyeSkge1xyXG4gICAgICBsb2dnZXIuZGVidWcoJ/Cfk6YgQ29uZmlndXJhdGlvbiBjYWNoZSBoaXQnKTtcclxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnQ2FjaGU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSBwcm9jZXNzLmVudi5UUklOSVRZX0VOViB8fCAnZGV2JztcclxuICAgIGNvbnN0IHBhcmFtZXRlclByZWZpeCA9IGAvdHJpbml0eS8ke2Vudmlyb25tZW50fWA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgbG9nZ2VyLmluZm8oJ/CflKcgTG9hZGluZyBUcmluaXR5IGNvbmZpZ3VyYXRpb24nLCB7IGVudmlyb25tZW50IH0pO1xyXG5cclxuICAgICAgLy8gRGVmaW5lIGFsbCBwYXJhbWV0ZXIgcGF0aHMgdXNpbmcgdGhlIG5ldyBoaWVyYXJjaHlcclxuICAgICAgY29uc3QgcGFyYW1ldGVyUGF0aHMgPSB7XHJcbiAgICAgICAgLy8gRXh0ZXJuYWwgc2VydmljZXMgKFNlY3VyZVN0cmluZylcclxuICAgICAgICB0bWRiQXBpS2V5OiBgJHtwYXJhbWV0ZXJQcmVmaXh9L2V4dGVybmFsL3RtZGItYXBpLWtleWAsXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQXV0aGVudGljYXRpb25cclxuICAgICAgICBjb2duaXRvVXNlclBvb2xJZDogYCR7cGFyYW1ldGVyUHJlZml4fS9hdXRoL2NvZ25pdG8tdXNlci1wb29sLWlkYCxcclxuICAgICAgICBjb2duaXRvQ2xpZW50SWQ6IGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9jb2duaXRvLWNsaWVudC1pZGAsXHJcbiAgICAgICAgZ29vZ2xlV2ViQ2xpZW50SWQ6IGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9nb29nbGUtd2ViLWNsaWVudC1pZGAsXHJcbiAgICAgICAgZ29vZ2xlQ2xpZW50U2VjcmV0OiBgJHtwYXJhbWV0ZXJQcmVmaXh9L2F1dGgvZ29vZ2xlLWNsaWVudC1zZWNyZXRgLFxyXG4gICAgICAgIGdvb2dsZUFuZHJvaWRDbGllbnRJZDogYCR7cGFyYW1ldGVyUHJlZml4fS9hdXRoL2dvb2dsZS1hbmRyb2lkLWNsaWVudC1pZGAsXHJcbiAgICAgICAgZ29vZ2xlSW9zQ2xpZW50SWQ6IGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9nb29nbGUtaW9zLWNsaWVudC1pZGAsXHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQVBJc1xyXG4gICAgICAgIGFwcHN5bmNBcGlJZDogYCR7cGFyYW1ldGVyUHJlZml4fS9hcGkvYXBwc3luYy1hcGktaWRgLFxyXG4gICAgICAgIGFwcHN5bmNBcGlVcmw6IGAke3BhcmFtZXRlclByZWZpeH0vYXBpL2FwcHN5bmMtYXBpLXVybGAsXHJcbiAgICAgICAgcmVhbHRpbWVBcGlVcmw6IGAke3BhcmFtZXRlclByZWZpeH0vYXBpL3JlYWx0aW1lLWFwaS11cmxgLFxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIFNlY3VyaXR5XHJcbiAgICAgICAgand0U2VjcmV0OiBgJHtwYXJhbWV0ZXJQcmVmaXh9L3NlY3VyaXR5L2p3dC1zZWNyZXRgLFxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENvbmZpZ3VyYXRpb24gb2JqZWN0c1xyXG4gICAgICAgIHRhYmxlTmFtZXM6IGAke3BhcmFtZXRlclByZWZpeH0vZHluYW1vZGIvdGFibGUtbmFtZXNgLFxyXG4gICAgICAgIGxhbWJkYUZ1bmN0aW9uTmFtZXM6IGAke3BhcmFtZXRlclByZWZpeH0vbGFtYmRhL2Z1bmN0aW9uLW5hbWVzYCxcclxuICAgICAgICBhcHBDb25maWc6IGAke3BhcmFtZXRlclByZWZpeH0vYXBwL2NvbmZpZ2AsXHJcbiAgICAgICAgZmVhdHVyZUZsYWdzOiBgJHtwYXJhbWV0ZXJQcmVmaXh9L2FwcC9mZWF0dXJlLWZsYWdzYCxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIEZldGNoIHNlY3VyZSBwYXJhbWV0ZXJzIChTZWN1cmVTdHJpbmcpXHJcbiAgICAgIGNvbnN0IHNlY3VyZVBhcmFtcyA9IGF3YWl0IHRoaXMuZ2V0UGFyYW1ldGVycyhbXHJcbiAgICAgICAgcGFyYW1ldGVyUGF0aHMudG1kYkFwaUtleSxcclxuICAgICAgICBwYXJhbWV0ZXJQYXRocy5nb29nbGVXZWJDbGllbnRJZCxcclxuICAgICAgICBwYXJhbWV0ZXJQYXRocy5nb29nbGVDbGllbnRTZWNyZXQsXHJcbiAgICAgICAgcGFyYW1ldGVyUGF0aHMuZ29vZ2xlQW5kcm9pZENsaWVudElkLFxyXG4gICAgICAgIHBhcmFtZXRlclBhdGhzLmdvb2dsZUlvc0NsaWVudElkLFxyXG4gICAgICAgIHBhcmFtZXRlclBhdGhzLmp3dFNlY3JldCxcclxuICAgICAgXSwgdHJ1ZSk7XHJcblxyXG4gICAgICAvLyBGZXRjaCByZWd1bGFyIHBhcmFtZXRlcnMgKFN0cmluZylcclxuICAgICAgY29uc3QgcmVndWxhclBhcmFtcyA9IGF3YWl0IHRoaXMuZ2V0UGFyYW1ldGVycyhbXHJcbiAgICAgICAgcGFyYW1ldGVyUGF0aHMuY29nbml0b1VzZXJQb29sSWQsXHJcbiAgICAgICAgcGFyYW1ldGVyUGF0aHMuY29nbml0b0NsaWVudElkLFxyXG4gICAgICAgIHBhcmFtZXRlclBhdGhzLmFwcHN5bmNBcGlJZCxcclxuICAgICAgICBwYXJhbWV0ZXJQYXRocy5hcHBzeW5jQXBpVXJsLFxyXG4gICAgICAgIHBhcmFtZXRlclBhdGhzLnJlYWx0aW1lQXBpVXJsLFxyXG4gICAgICAgIHBhcmFtZXRlclBhdGhzLnRhYmxlTmFtZXMsXHJcbiAgICAgICAgcGFyYW1ldGVyUGF0aHMubGFtYmRhRnVuY3Rpb25OYW1lcyxcclxuICAgICAgICBwYXJhbWV0ZXJQYXRocy5hcHBDb25maWcsXHJcbiAgICAgICAgcGFyYW1ldGVyUGF0aHMuZmVhdHVyZUZsYWdzLFxyXG4gICAgICBdKTtcclxuXHJcbiAgICAgIC8vIFBhcnNlIEpTT04gY29uZmlndXJhdGlvbnNcclxuICAgICAgY29uc3QgdGFibGVOYW1lcyA9IEpTT04ucGFyc2UocmVndWxhclBhcmFtc1twYXJhbWV0ZXJQYXRocy50YWJsZU5hbWVzXSk7XHJcbiAgICAgIGNvbnN0IGxhbWJkYUZ1bmN0aW9uTmFtZXMgPSBKU09OLnBhcnNlKHJlZ3VsYXJQYXJhbXNbcGFyYW1ldGVyUGF0aHMubGFtYmRhRnVuY3Rpb25OYW1lc10pO1xyXG4gICAgICBjb25zdCBhcHBDb25maWcgPSBKU09OLnBhcnNlKHJlZ3VsYXJQYXJhbXNbcGFyYW1ldGVyUGF0aHMuYXBwQ29uZmlnXSk7XHJcbiAgICAgIGNvbnN0IGZlYXR1cmVGbGFncyA9IEpTT04ucGFyc2UocmVndWxhclBhcmFtc1twYXJhbWV0ZXJQYXRocy5mZWF0dXJlRmxhZ3NdKTtcclxuXHJcbiAgICAgIC8vIEJ1aWxkIGNvbXBsZXRlIGNvbmZpZ3VyYXRpb25cclxuICAgICAgY29uc3QgY29uZmlnOiBUcmluaXR5Q29uZmlnID0ge1xyXG4gICAgICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAnZXUtd2VzdC0xJyxcclxuICAgICAgICBlbnZpcm9ubWVudCxcclxuICAgICAgICBcclxuICAgICAgICB0YWJsZXM6IHRhYmxlTmFtZXMsXHJcbiAgICAgICAgXHJcbiAgICAgICAgZXh0ZXJuYWw6IHtcclxuICAgICAgICAgIHRtZGJBcGlLZXk6IHNlY3VyZVBhcmFtc1twYXJhbWV0ZXJQYXRocy50bWRiQXBpS2V5XSxcclxuICAgICAgICAgIGNvZ25pdG9Vc2VyUG9vbElkOiByZWd1bGFyUGFyYW1zW3BhcmFtZXRlclBhdGhzLmNvZ25pdG9Vc2VyUG9vbElkXSxcclxuICAgICAgICAgIGNvZ25pdG9DbGllbnRJZDogcmVndWxhclBhcmFtc1twYXJhbWV0ZXJQYXRocy5jb2duaXRvQ2xpZW50SWRdLFxyXG4gICAgICAgICAgYXBwc3luY0FwaUlkOiByZWd1bGFyUGFyYW1zW3BhcmFtZXRlclBhdGhzLmFwcHN5bmNBcGlJZF0sXHJcbiAgICAgICAgICBhcHBzeW5jQXBpVXJsOiByZWd1bGFyUGFyYW1zW3BhcmFtZXRlclBhdGhzLmFwcHN5bmNBcGlVcmxdLFxyXG4gICAgICAgICAgcmVhbHRpbWVBcGlVcmw6IHJlZ3VsYXJQYXJhbXNbcGFyYW1ldGVyUGF0aHMucmVhbHRpbWVBcGlVcmxdLFxyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIC8vIEFwcFN5bmMgY29uZmlndXJhdGlvbiBmb3IgcmVhbC10aW1lIHN1YnNjcmlwdGlvbnNcclxuICAgICAgICBhcHBTeW5jOiB7XHJcbiAgICAgICAgICBlbmRwb2ludDogcmVndWxhclBhcmFtc1twYXJhbWV0ZXJQYXRocy5hcHBzeW5jQXBpVXJsXSxcclxuICAgICAgICAgIGFwaUtleTogcHJvY2Vzcy5lbnYuQVBQU1lOQ19BUElfS0VZLCAvLyBPcHRpb25hbCBBUEkga2V5IGZvciBtdXRhdGlvbnNcclxuICAgICAgICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAnZXUtd2VzdC0xJyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIFxyXG4gICAgICAgIGFwcDogYXBwQ29uZmlnLFxyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIEFkZGl0aW9uYWwgY29uZmlndXJhdGlvbiBmcm9tIFBhcmFtZXRlciBTdG9yZVxyXG4gICAgICAgIGxhbWJkYUZ1bmN0aW9uczogbGFtYmRhRnVuY3Rpb25OYW1lcyxcclxuICAgICAgICBmZWF0dXJlRmxhZ3M6IGZlYXR1cmVGbGFncyxcclxuICAgICAgICBcclxuICAgICAgICAvLyBHb29nbGUgT0F1dGggY29uZmlndXJhdGlvblxyXG4gICAgICAgIGdvb2dsZU9BdXRoOiB7XHJcbiAgICAgICAgICB3ZWJDbGllbnRJZDogc2VjdXJlUGFyYW1zW3BhcmFtZXRlclBhdGhzLmdvb2dsZVdlYkNsaWVudElkXSxcclxuICAgICAgICAgIGNsaWVudFNlY3JldDogc2VjdXJlUGFyYW1zW3BhcmFtZXRlclBhdGhzLmdvb2dsZUNsaWVudFNlY3JldF0sXHJcbiAgICAgICAgICBhbmRyb2lkQ2xpZW50SWQ6IHNlY3VyZVBhcmFtc1twYXJhbWV0ZXJQYXRocy5nb29nbGVBbmRyb2lkQ2xpZW50SWRdLFxyXG4gICAgICAgICAgaW9zQ2xpZW50SWQ6IHNlY3VyZVBhcmFtc1twYXJhbWV0ZXJQYXRocy5nb29nbGVJb3NDbGllbnRJZF0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBcclxuICAgICAgICAvLyBTZWN1cml0eSBjb25maWd1cmF0aW9uXHJcbiAgICAgICAgc2VjdXJpdHk6IHtcclxuICAgICAgICAgIGp3dFNlY3JldDogc2VjdXJlUGFyYW1zW3BhcmFtZXRlclBhdGhzLmp3dFNlY3JldF0sXHJcbiAgICAgICAgfSxcclxuICAgICAgfTtcclxuXHJcbiAgICAgIC8vIENhY2hlIHRoZSBjb25maWd1cmF0aW9uXHJcbiAgICAgIHRoaXMuY29uZmlnQ2FjaGUgPSBjb25maWc7XHJcbiAgICAgIHRoaXMuY29uZmlnQ2FjaGVFeHBpcnkgPSBEYXRlLm5vdygpICsgdGhpcy5DQUNIRV9UVEw7XHJcblxyXG4gICAgICBsb2dnZXIuaW5mbygn4pyFIFRyaW5pdHkgY29uZmlndXJhdGlvbiBsb2FkZWQgc3VjY2Vzc2Z1bGx5JywgeyBlbnZpcm9ubWVudCB9KTtcclxuICAgICAgcmV0dXJuIGNvbmZpZztcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICAgIGxvZ2dlci5lcnJvcign4p2MIEZhaWxlZCB0byBsb2FkIFRyaW5pdHkgY29uZmlndXJhdGlvbicsIGVyciwgeyBlbnZpcm9ubWVudCB9KTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBHZXQgY29uZmlndXJhdGlvbiB3aXRoIGZhbGxiYWNrIHRvIGVudmlyb25tZW50IHZhcmlhYmxlc1xyXG4gICAqL1xyXG4gIGFzeW5jIGdldENvbmZpZ1dpdGhGYWxsYmFjaygpOiBQcm9taXNlPFRyaW5pdHlDb25maWc+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIHJldHVybiBhd2FpdCB0aGlzLmxvYWRUcmluaXR5Q29uZmlnKCk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJztcclxuICAgICAgbG9nZ2VyLndhcm4oJ+KaoO+4jyBGYWlsZWQgdG8gbG9hZCBmcm9tIFBhcmFtZXRlciBTdG9yZSwgdXNpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzJywgeyBlcnJvcjogZXJyb3JNZXNzYWdlIH0pO1xyXG4gICAgICBcclxuICAgICAgLy8gRmFsbGJhY2sgdG8gZW52aXJvbm1lbnQgdmFyaWFibGVzXHJcbiAgICAgIHJldHVybiB0aGlzLmxvYWRGcm9tRW52aXJvbm1lbnRWYXJpYWJsZXMoKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIExvYWQgY29uZmlndXJhdGlvbiBmcm9tIGVudmlyb25tZW50IHZhcmlhYmxlcyAoZmFsbGJhY2spXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBsb2FkRnJvbUVudmlyb25tZW50VmFyaWFibGVzKCk6IFRyaW5pdHlDb25maWcge1xyXG4gICAgY29uc3QgZW52aXJvbm1lbnQgPSBwcm9jZXNzLmVudi5UUklOSVRZX0VOViB8fCAnZGV2JztcclxuICAgIFxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICdldS13ZXN0LTEnLFxyXG4gICAgICBlbnZpcm9ubWVudCxcclxuICAgICAgXHJcbiAgICAgIHRhYmxlczoge1xyXG4gICAgICAgIHVzZXJzOiBwcm9jZXNzLmVudi5VU0VSU19UQUJMRSB8fCAndHJpbml0eS11c2Vycy1kZXYnLFxyXG4gICAgICAgIHJvb21zOiBwcm9jZXNzLmVudi5ST09NU19UQUJMRSB8fCAndHJpbml0eS1yb29tcy1kZXYtdjInLFxyXG4gICAgICAgIHJvb21NZW1iZXJzOiBwcm9jZXNzLmVudi5ST09NX01FTUJFUlNfVEFCTEUgfHwgJ3RyaW5pdHktcm9vbS1tZW1iZXJzLWRldicsXHJcbiAgICAgICAgcm9vbUludml0ZXM6IHByb2Nlc3MuZW52LlJPT01fSU5WSVRFU19UQUJMRSB8fCAndHJpbml0eS1yb29tLWludml0ZXMtZGV2LXYyJyxcclxuICAgICAgICB2b3RlczogcHJvY2Vzcy5lbnYuVk9URVNfVEFCTEUgfHwgJ3RyaW5pdHktdm90ZXMtZGV2JyxcclxuICAgICAgICBtb3ZpZXNDYWNoZTogcHJvY2Vzcy5lbnYuTU9WSUVTX0NBQ0hFX1RBQkxFIHx8ICd0cmluaXR5LW1vdmllcy1jYWNoZS1kZXYnLFxyXG4gICAgICAgIHJvb21NYXRjaGVzOiAndHJpbml0eS1yb29tLW1hdGNoZXMtZGV2JyxcclxuICAgICAgICBjb25uZWN0aW9uczogJ3RyaW5pdHktY29ubmVjdGlvbnMtZGV2JyxcclxuICAgICAgICBjaGF0U2Vzc2lvbnM6ICd0cmluaXR5LWNoYXQtc2Vzc2lvbnMtZGV2JyxcclxuICAgICAgICByb29tTW92aWVDYWNoZTogJ3RyaW5pdHktcm9vbS1tb3ZpZS1jYWNoZS1kZXYnLFxyXG4gICAgICAgIHJvb21DYWNoZU1ldGFkYXRhOiAndHJpbml0eS1yb29tLWNhY2hlLW1ldGFkYXRhLWRldicsXHJcbiAgICAgICAgbWF0Y2htYWtpbmc6ICd0cmluaXR5LW1hdGNobWFraW5nLWRldicsXHJcbiAgICAgICAgZmlsdGVyQ2FjaGU6ICd0cmluaXR5LWZpbHRlci1jYWNoZScsXHJcbiAgICAgIH0sXHJcbiAgICAgIFxyXG4gICAgICBleHRlcm5hbDoge1xyXG4gICAgICAgIHRtZGJBcGlLZXk6IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWSB8fCAnJyxcclxuICAgICAgICBjb2duaXRvVXNlclBvb2xJZDogcHJvY2Vzcy5lbnYuQ09HTklUT19VU0VSX1BPT0xfSUQgfHwgJycsXHJcbiAgICAgICAgY29nbml0b0NsaWVudElkOiBwcm9jZXNzLmVudi5DT0dOSVRPX0NMSUVOVF9JRCB8fCAnJyxcclxuICAgICAgICBhcHBzeW5jQXBpSWQ6IHByb2Nlc3MuZW52LkdSQVBIUUxfQVBJX0lEIHx8ICcnLFxyXG4gICAgICAgIGFwcHN5bmNBcGlVcmw6IHByb2Nlc3MuZW52LkdSQVBIUUxfQVBJX1VSTCB8fCAnJyxcclxuICAgICAgICByZWFsdGltZUFwaVVybDogcHJvY2Vzcy5lbnYuR1JBUEhRTF9SRUFMVElNRV9VUkwgfHwgJycsXHJcbiAgICAgIH0sXHJcblxyXG4gICAgICAvLyBBcHBTeW5jIGNvbmZpZ3VyYXRpb24gZm9yIHJlYWwtdGltZSBzdWJzY3JpcHRpb25zXHJcbiAgICAgIGFwcFN5bmM6IHtcclxuICAgICAgICBlbmRwb2ludDogcHJvY2Vzcy5lbnYuR1JBUEhRTF9BUElfVVJMIHx8ICcnLFxyXG4gICAgICAgIGFwaUtleTogcHJvY2Vzcy5lbnYuQVBQU1lOQ19BUElfS0VZLFxyXG4gICAgICAgIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCAnZXUtd2VzdC0xJyxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIGFwcDoge1xyXG4gICAgICAgIGNhY2hlOiB7XHJcbiAgICAgICAgICB0dGxEYXlzOiBwYXJzZUludChwcm9jZXNzLmVudi5DQUNIRV9UVExfREFZUyB8fCAnNycpLFxyXG4gICAgICAgICAgYmF0Y2hTaXplOiBwYXJzZUludChwcm9jZXNzLmVudi5CQVRDSF9TSVpFIHx8ICczMCcpLFxyXG4gICAgICAgICAgbWF4QmF0Y2hlczogcGFyc2VJbnQocHJvY2Vzcy5lbnYuTUFYX0JBVENIRVMgfHwgJzEwJyksXHJcbiAgICAgICAgfSxcclxuICAgICAgICB2b3Rpbmc6IHtcclxuICAgICAgICAgIG1heFJvb21DYXBhY2l0eTogcGFyc2VJbnQocHJvY2Vzcy5lbnYuTUFYX1JPT01fQ0FQQUNJVFkgfHwgJzEwJyksXHJcbiAgICAgICAgICBkZWZhdWx0Um9vbUNhcGFjaXR5OiBwYXJzZUludChwcm9jZXNzLmVudi5ERUZBVUxUX1JPT01fQ0FQQUNJVFkgfHwgJzInKSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIG1vdmllczoge1xyXG4gICAgICAgICAgY2FjaGVTaXplOiBwYXJzZUludChwcm9jZXNzLmVudi5NT1ZJRV9DQUNIRV9TSVpFIHx8ICc1MCcpLFxyXG4gICAgICAgICAgbWF4R2VucmVzOiBwYXJzZUludChwcm9jZXNzLmVudi5NQVhfR0VOUkVTIHx8ICcyJyksXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIC8vIEFkZGl0aW9uYWwgZmFsbGJhY2sgY29uZmlndXJhdGlvbnNcclxuICAgICAgbGFtYmRhRnVuY3Rpb25zOiB7XHJcbiAgICAgICAgYXV0aDogcHJvY2Vzcy5lbnYuQVVUSF9IQU5ETEVSX05BTUUgfHwgJ3RyaW5pdHktYXV0aC1kZXYnLFxyXG4gICAgICAgIHJvb206IHByb2Nlc3MuZW52LlJPT01fSEFORExFUl9OQU1FIHx8ICd0cmluaXR5LXJvb20tZGV2JyxcclxuICAgICAgICB2b3RlOiBwcm9jZXNzLmVudi5WT1RFX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS12b3RlLWRldicsXHJcbiAgICAgICAgbW92aWU6IHByb2Nlc3MuZW52Lk1PVklFX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS1tb3ZpZS1kZXYnLFxyXG4gICAgICAgIGNhY2hlOiBwcm9jZXNzLmVudi5DQUNIRV9IQU5ETEVSX05BTUUgfHwgJ3RyaW5pdHktY2FjaGUtZGV2JyxcclxuICAgICAgICByZWFsdGltZTogcHJvY2Vzcy5lbnYuUkVBTFRJTUVfSEFORExFUl9OQU1FIHx8ICd0cmluaXR5LXJlYWx0aW1lLWRldicsXHJcbiAgICAgICAgbWF0Y2htYWtlcjogcHJvY2Vzcy5lbnYuTUFUQ0hNQUtFUl9IQU5ETEVSX05BTUUgfHwgJ3RyaW5pdHktdm90ZS1jb25zZW5zdXMtZGV2JyxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIGZlYXR1cmVGbGFnczoge1xyXG4gICAgICAgIGVuYWJsZVJlYWxUaW1lTm90aWZpY2F0aW9uczogcHJvY2Vzcy5lbnYuRU5BQkxFX1JFQUxfVElNRV9OT1RJRklDQVRJT05TID09PSAndHJ1ZScsXHJcbiAgICAgICAgZW5hYmxlQ2lyY3VpdEJyZWFrZXI6IHByb2Nlc3MuZW52LkVOQUJMRV9DSVJDVUlUX0JSRUFLRVIgPT09ICd0cnVlJyxcclxuICAgICAgICBlbmFibGVNZXRyaWNzTG9nZ2luZzogcHJvY2Vzcy5lbnYuRU5BQkxFX01FVFJJQ1NfTE9HR0lORyA9PT0gJ3RydWUnLFxyXG4gICAgICAgIGVuYWJsZUdvb2dsZVNpZ25pbjogcHJvY2Vzcy5lbnYuRU5BQkxFX0dPT0dMRV9TSUdOSU4gPT09ICd0cnVlJyxcclxuICAgICAgICBkZWJ1Z01vZGU6IHByb2Nlc3MuZW52LkRFQlVHX01PREUgPT09ICd0cnVlJyxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIGdvb2dsZU9BdXRoOiB7XHJcbiAgICAgICAgd2ViQ2xpZW50SWQ6IHByb2Nlc3MuZW52LkdPT0dMRV9XRUJfQ0xJRU5UX0lEIHx8ICcnLFxyXG4gICAgICAgIGNsaWVudFNlY3JldDogcHJvY2Vzcy5lbnYuR09PR0xFX0NMSUVOVF9TRUNSRVQgfHwgJycsXHJcbiAgICAgICAgYW5kcm9pZENsaWVudElkOiBwcm9jZXNzLmVudi5HT09HTEVfQU5EUk9JRF9DTElFTlRfSUQgfHwgJycsXHJcbiAgICAgICAgaW9zQ2xpZW50SWQ6IHByb2Nlc3MuZW52LkdPT0dMRV9JT1NfQ0xJRU5UX0lEIHx8ICcnLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgc2VjdXJpdHk6IHtcclxuICAgICAgICBqd3RTZWNyZXQ6IHByb2Nlc3MuZW52LkpXVF9TRUNSRVQgfHwgJycsXHJcbiAgICAgIH0sXHJcbiAgICB9O1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgY2FjaGVkIHZhbHVlIGlzIHN0aWxsIHZhbGlkXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBpc0NhY2hlVmFsaWQoY2FjaGVLZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgaWYgKCF0aGlzLmNhY2hlLmhhcyhjYWNoZUtleSkpIHJldHVybiBmYWxzZTtcclxuICAgIFxyXG4gICAgY29uc3QgZXhwaXJ5ID0gdGhpcy5jYWNoZUV4cGlyeS5nZXQoY2FjaGVLZXkpO1xyXG4gICAgaWYgKCFleHBpcnkgfHwgRGF0ZS5ub3coKSA+IGV4cGlyeSkge1xyXG4gICAgICB0aGlzLmNhY2hlLmRlbGV0ZShjYWNoZUtleSk7XHJcbiAgICAgIHRoaXMuY2FjaGVFeHBpcnkuZGVsZXRlKGNhY2hlS2V5KTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gdHJ1ZTtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIENsZWFyIGNvbmZpZ3VyYXRpb24gY2FjaGUgKHVzZWZ1bCBmb3IgdGVzdGluZyBvciBmb3JjZWQgcmVmcmVzaClcclxuICAgKi9cclxuICBjbGVhckNhY2hlKCk6IHZvaWQge1xyXG4gICAgdGhpcy5jYWNoZS5jbGVhcigpO1xyXG4gICAgdGhpcy5jYWNoZUV4cGlyeS5jbGVhcigpO1xyXG4gICAgdGhpcy5jb25maWdDYWNoZSA9IG51bGw7XHJcbiAgICB0aGlzLmNvbmZpZ0NhY2hlRXhwaXJ5ID0gMDtcclxuICAgIGxvZ2dlci5kZWJ1Zygn8J+nuSBDb25maWd1cmF0aW9uIGNhY2hlIGNsZWFyZWQnKTtcclxuICB9XHJcbn1cclxuXHJcbi8vIFNpbmdsZXRvbiBpbnN0YW5jZVxyXG5jb25zdCBjb25maWdNYW5hZ2VyID0gbmV3IENvbmZpZ3VyYXRpb25NYW5hZ2VyKCk7XHJcblxyXG4vLyBFeHBvcnQgY29udmVuaWVuY2UgZnVuY3Rpb25zXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRUcmluaXR5Q29uZmlnKCk6IFByb21pc2U8VHJpbml0eUNvbmZpZz4ge1xyXG4gIHJldHVybiBjb25maWdNYW5hZ2VyLmdldENvbmZpZ1dpdGhGYWxsYmFjaygpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0UGFyYW1ldGVyKHBhcmFtZXRlck5hbWU6IHN0cmluZywgZGVjcnlwdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICByZXR1cm4gY29uZmlnTWFuYWdlci5nZXRQYXJhbWV0ZXIocGFyYW1ldGVyTmFtZSwgZGVjcnlwdCk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRQYXJhbWV0ZXJzKHBhcmFtZXRlck5hbWVzOiBzdHJpbmdbXSwgZGVjcnlwdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PiB7XHJcbiAgcmV0dXJuIGNvbmZpZ01hbmFnZXIuZ2V0UGFyYW1ldGVycyhwYXJhbWV0ZXJOYW1lcywgZGVjcnlwdCk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjbGVhckNvbmZpZ0NhY2hlKCk6IHZvaWQge1xyXG4gIGNvbmZpZ01hbmFnZXIuY2xlYXJDYWNoZSgpO1xyXG59XHJcblxyXG5leHBvcnQgeyBDb25maWd1cmF0aW9uTWFuYWdlciB9OyJdfQ==