"use strict";
/**
 * Configuration Loading Utilities for Trinity Lambda functions
 * Provides specialized configuration loading patterns and validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.configLoader = exports.ConfigUtils = exports.ConfigLoader = void 0;
const client_ssm_1 = require("@aws-sdk/client-ssm");
const logger_1 = require("./logger");
const config_1 = require("./config");
/**
 * Configuration loader with advanced validation and utilities
 */
class ConfigLoader {
    constructor() {
        this.environment = process.env.TRINITY_ENV || 'dev';
        this.ssmClient = new client_ssm_1.SSMClient({ region: process.env.AWS_REGION || 'eu-west-1' });
    }
    /**
     * Load configuration with comprehensive validation
     */
    async loadValidatedConfig() {
        try {
            logger_1.logger.info('🔧 Loading and validating Trinity configuration');
            const config = await (0, config_1.getTrinityConfig)();
            const validation = await this.validateConfiguration(config);
            if (!validation.isValid) {
                logger_1.logger.warn('⚠️ Configuration validation issues found', {
                    missingParameters: validation.missingParameters,
                    invalidParameters: validation.invalidParameters,
                    errors: validation.errors
                });
            }
            else {
                logger_1.logger.info('✅ Configuration validation passed');
            }
            return { config, validation };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to load validated configuration', err);
            throw error;
        }
    }
    /**
     * Validate configuration completeness and correctness
     */
    async validateConfiguration(config) {
        const result = {
            isValid: true,
            missingParameters: [],
            invalidParameters: [],
            errors: []
        };
        try {
            // Validate critical external parameters
            this.validateExternalConfig(config.external, result);
            // Validate table names
            this.validateTableNames(config.tables, result);
            // Validate application configuration
            this.validateAppConfig(config.app, result);
            // Validate optional configurations
            if (config.lambdaFunctions) {
                this.validateLambdaFunctions(config.lambdaFunctions, result);
            }
            if (config.featureFlags) {
                this.validateFeatureFlags(config.featureFlags, result);
            }
            // Set overall validity
            result.isValid = result.missingParameters.length === 0 &&
                result.invalidParameters.length === 0 &&
                result.errors.length === 0;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            result.errors.push(`Validation error: ${err.message}`);
            result.isValid = false;
        }
        return result;
    }
    /**
     * Validate external service configuration
     */
    validateExternalConfig(external, result) {
        const requiredFields = [
            'tmdbApiKey',
            'cognitoUserPoolId',
            'cognitoClientId',
            'appsyncApiId',
            'appsyncApiUrl',
            'realtimeApiUrl'
        ];
        for (const field of requiredFields) {
            const value = external[field];
            if (!value || value.trim() === '') {
                result.missingParameters.push(`external.${field}`);
            }
            else {
                // Validate specific formats
                if (field === 'appsyncApiUrl' && !value.startsWith('https://')) {
                    result.invalidParameters.push(`external.${field} - must be HTTPS URL`);
                }
                if (field === 'realtimeApiUrl' && !value.startsWith('wss://')) {
                    result.invalidParameters.push(`external.${field} - must be WSS URL`);
                }
                if (field === 'cognitoUserPoolId' && !value.match(/^[a-z0-9-]+_[a-zA-Z0-9]+$/)) {
                    result.invalidParameters.push(`external.${field} - invalid Cognito User Pool ID format`);
                }
            }
        }
    }
    /**
     * Validate DynamoDB table names
     */
    validateTableNames(tables, result) {
        const requiredTables = [
            'users', 'rooms', 'roomMembers', 'roomInvites', 'votes', 'moviesCache',
            'roomMatches', 'connections', 'roomMovieCache', 'roomCacheMetadata',
            'matchmaking', 'filterCache'
        ];
        for (const tableName of requiredTables) {
            const value = tables[tableName];
            if (!value || value.trim() === '') {
                result.missingParameters.push(`tables.${tableName}`);
            }
            else if (!value.startsWith('trinity-')) {
                result.invalidParameters.push(`tables.${tableName} - must start with 'trinity-'`);
            }
        }
    }
    /**
     * Validate application configuration
     */
    validateAppConfig(app, result) {
        // Validate cache configuration
        if (!app.cache) {
            result.missingParameters.push('app.cache');
        }
        else {
            if (app.cache.ttlDays <= 0 || app.cache.ttlDays > 30) {
                result.invalidParameters.push('app.cache.ttlDays - must be between 1 and 30');
            }
            if (app.cache.batchSize <= 0 || app.cache.batchSize > 100) {
                result.invalidParameters.push('app.cache.batchSize - must be between 1 and 100');
            }
        }
        // Validate voting configuration
        if (!app.voting) {
            result.missingParameters.push('app.voting');
        }
        else {
            if (app.voting.maxRoomCapacity < 2 || app.voting.maxRoomCapacity > 10) {
                result.invalidParameters.push('app.voting.maxRoomCapacity - must be between 2 and 10');
            }
            if (app.voting.defaultRoomCapacity < 2 || app.voting.defaultRoomCapacity > app.voting.maxRoomCapacity) {
                result.invalidParameters.push('app.voting.defaultRoomCapacity - must be between 2 and maxRoomCapacity');
            }
        }
        // Validate movies configuration
        if (!app.movies) {
            result.missingParameters.push('app.movies');
        }
        else {
            if (app.movies.cacheSize !== 50) {
                result.invalidParameters.push('app.movies.cacheSize - must be exactly 50 (business requirement)');
            }
            if (app.movies.maxGenres < 1 || app.movies.maxGenres > 3) {
                result.invalidParameters.push('app.movies.maxGenres - must be between 1 and 3');
            }
        }
    }
    /**
     * Validate Lambda function names
     */
    validateLambdaFunctions(lambdaFunctions, result) {
        const requiredFunctions = ['auth', 'room', 'vote', 'movie', 'cache', 'realtime', 'matchmaker'];
        for (const funcName of requiredFunctions) {
            const value = lambdaFunctions[funcName];
            if (!value || value.trim() === '') {
                result.missingParameters.push(`lambdaFunctions.${funcName}`);
            }
            else if (!value.startsWith('trinity-')) {
                result.invalidParameters.push(`lambdaFunctions.${funcName} - must start with 'trinity-'`);
            }
        }
    }
    /**
     * Validate feature flags
     */
    validateFeatureFlags(featureFlags, result) {
        const requiredFlags = [
            'enableRealTimeNotifications',
            'enableCircuitBreaker',
            'enableMetricsLogging',
            'enableGoogleSignin',
            'debugMode'
        ];
        for (const flagName of requiredFlags) {
            const value = featureFlags[flagName];
            if (typeof value !== 'boolean') {
                result.invalidParameters.push(`featureFlags.${flagName} - must be boolean`);
            }
        }
    }
    /**
     * Get parameter information including metadata
     */
    async getParameterInfo(parameterName) {
        try {
            const command = new client_ssm_1.GetParameterCommand({
                Name: parameterName,
                WithDecryption: false // Don't decrypt for metadata
            });
            const response = await this.ssmClient.send(command);
            if (!response.Parameter) {
                return null;
            }
            return {
                name: response.Parameter.Name || parameterName,
                value: response.Parameter.Value || '',
                type: response.Parameter.Type,
                lastModified: response.Parameter.LastModifiedDate,
                version: response.Parameter.Version
            };
        }
        catch (error) {
            logger_1.logger.debug(`Parameter ${parameterName} not found or inaccessible`);
            return null;
        }
    }
    /**
     * List all Trinity parameters for the current environment
     */
    async listTrinityParameters() {
        try {
            const parameterPrefix = `/trinity/${this.environment}`;
            const parameters = [];
            // Define all expected parameter paths
            const expectedPaths = [
                `${parameterPrefix}/external/tmdb-api-key`,
                `${parameterPrefix}/auth/cognito-user-pool-id`,
                `${parameterPrefix}/auth/cognito-client-id`,
                `${parameterPrefix}/auth/google-web-client-id`,
                `${parameterPrefix}/auth/google-client-secret`,
                `${parameterPrefix}/auth/google-android-client-id`,
                `${parameterPrefix}/auth/google-ios-client-id`,
                `${parameterPrefix}/api/appsync-api-id`,
                `${parameterPrefix}/api/appsync-api-url`,
                `${parameterPrefix}/api/realtime-api-url`,
                `${parameterPrefix}/security/jwt-secret`,
                `${parameterPrefix}/dynamodb/table-names`,
                `${parameterPrefix}/lambda/function-names`,
                `${parameterPrefix}/app/config`,
                `${parameterPrefix}/app/feature-flags`
            ];
            // Get information for each parameter
            for (const path of expectedPaths) {
                const info = await this.getParameterInfo(path);
                if (info) {
                    parameters.push(info);
                }
            }
            logger_1.logger.info(`📋 Found ${parameters.length} Trinity parameters for environment ${this.environment}`);
            return parameters;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to list Trinity parameters', err);
            throw error;
        }
    }
    /**
     * Validate parameter store connectivity
     */
    async validateParameterStoreConnectivity() {
        try {
            // Try to get a simple parameter to test connectivity
            const testPath = `/trinity/${this.environment}/external/tmdb-api-key`;
            await this.getParameterInfo(testPath);
            logger_1.logger.info('✅ Parameter Store connectivity validated');
            return true;
        }
        catch (error) {
            logger_1.logger.warn('⚠️ Parameter Store connectivity issue', { error: error.message });
            return false;
        }
    }
    /**
     * Get configuration summary for debugging
     */
    async getConfigurationSummary() {
        try {
            const config = await (0, config_1.getTrinityConfig)();
            const parameters = await this.listTrinityParameters();
            const connectivity = await this.validateParameterStoreConnectivity();
            const validation = await this.validateConfiguration(config);
            return {
                environment: this.environment,
                region: config.region,
                parameterCount: parameters.length,
                connectivity,
                validation
            };
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger_1.logger.error('❌ Failed to get configuration summary', err);
            throw error;
        }
    }
}
exports.ConfigLoader = ConfigLoader;
/**
 * Utility functions for configuration management
 */
exports.ConfigUtils = {
    /**
     * Load configuration with automatic fallback and validation
     */
    loadConfig: async () => {
        const loader = new ConfigLoader();
        const { config, validation } = await loader.loadValidatedConfig();
        if (!validation.isValid) {
            logger_1.logger.warn('⚠️ Configuration has validation issues but proceeding with fallback values');
        }
        return config;
    },
    /**
     * Validate current configuration
     */
    validateConfig: async () => {
        const loader = new ConfigLoader();
        const config = await (0, config_1.getTrinityConfig)();
        return loader.validateConfiguration(config);
    },
    /**
     * Get parameter by path with caching
     */
    getParameterByPath: async (path, decrypt = false) => {
        return (0, config_1.getParameter)(path, decrypt);
    },
    /**
     * Get multiple parameters by paths
     */
    getParametersByPaths: async (paths, decrypt = false) => {
        return (0, config_1.getParameters)(paths, decrypt);
    },
    /**
     * Check if running in development mode
     */
    isDevelopment: () => {
        return process.env.NODE_ENV === 'development' || process.env.TRINITY_ENV === 'dev';
    },
    /**
     * Check if running in production mode
     */
    isProduction: () => {
        return process.env.NODE_ENV === 'production' || process.env.TRINITY_ENV === 'production';
    },
    /**
     * Get environment-specific parameter path
     */
    getParameterPath: (category, paramName, environment) => {
        const env = environment || process.env.TRINITY_ENV || 'dev';
        return `/trinity/${env}/${category}/${paramName}`;
    }
};
// Export singleton instance
exports.configLoader = new ConfigLoader();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnLWxvYWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNvbmZpZy1sb2FkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7R0FHRzs7O0FBRUgsb0RBQTJGO0FBRTNGLHFDQUFrQztBQUNsQyxxQ0FBeUU7QUFpQnpFOztHQUVHO0FBQ0gsTUFBYSxZQUFZO0lBSXZCO1FBQ0UsSUFBSSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSxLQUFLLENBQUM7UUFDcEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLElBQUksV0FBVyxFQUFFLENBQUMsQ0FBQztJQUNwRixDQUFDO0lBRUQ7O09BRUc7SUFDSCxLQUFLLENBQUMsbUJBQW1CO1FBQ3ZCLElBQUksQ0FBQztZQUNILGVBQU0sQ0FBQyxJQUFJLENBQUMsaURBQWlELENBQUMsQ0FBQztZQUUvRCxNQUFNLE1BQU0sR0FBRyxNQUFNLElBQUEseUJBQWdCLEdBQUUsQ0FBQztZQUN4QyxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUU1RCxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO2dCQUN4QixlQUFNLENBQUMsSUFBSSxDQUFDLDBDQUEwQyxFQUFFO29CQUN0RCxpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCO29CQUMvQyxpQkFBaUIsRUFBRSxVQUFVLENBQUMsaUJBQWlCO29CQUMvQyxNQUFNLEVBQUUsVUFBVSxDQUFDLE1BQU07aUJBQzFCLENBQUMsQ0FBQztZQUNMLENBQUM7aUJBQU0sQ0FBQztnQkFDTixlQUFNLENBQUMsSUFBSSxDQUFDLG1DQUFtQyxDQUFDLENBQUM7WUFDbkQsQ0FBQztZQUVELE9BQU8sRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUM7UUFF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QyxXQUFXLEtBQUssWUFBWSxDQUFDO0lBQzNGLENBQUM7SUFFRDs7T0FFRztJQUNILGdCQUFnQixFQUFFLENBQUMsUUFBZ0IsRUFBRSxTQUFpQixFQUFFLFdBQW9CLEVBQVUsRUFBRTtRQUN0RixNQUFNLEdBQUcsR0FBRyxXQUFXLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLElBQUksS0FBSyxDQUFDO1FBQzVELE9BQU8sWUFBWSxHQUFHLElBQUksUUFBUSxJQUFJLFNBQVMsRUFBRSxDQUFDO0lBQ3BELENBQUM7Q0FDRixDQUFDO0FBRUYsNEJBQTRCO0FBQ2YsUUFBQSxZQUFZLEdBQUcsSUFBSSxZQUFZLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBDb25maWd1cmF0aW9uIExvYWRpbmcgVXRpbGl0aWVzIGZvciBUcmluaXR5IExhbWJkYSBmdW5jdGlvbnNcclxuICogUHJvdmlkZXMgc3BlY2lhbGl6ZWQgY29uZmlndXJhdGlvbiBsb2FkaW5nIHBhdHRlcm5zIGFuZCB2YWxpZGF0aW9uXHJcbiAqL1xyXG5cclxuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kLCBHZXRQYXJhbWV0ZXJzQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xyXG5pbXBvcnQgeyBUcmluaXR5Q29uZmlnIH0gZnJvbSAnLi90eXBlcyc7XHJcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4vbG9nZ2VyJztcclxuaW1wb3J0IHsgZ2V0VHJpbml0eUNvbmZpZywgZ2V0UGFyYW1ldGVyLCBnZXRQYXJhbWV0ZXJzIH0gZnJvbSAnLi9jb25maWcnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBDb25maWdWYWxpZGF0aW9uUmVzdWx0IHtcclxuICBpc1ZhbGlkOiBib29sZWFuO1xyXG4gIG1pc3NpbmdQYXJhbWV0ZXJzOiBzdHJpbmdbXTtcclxuICBpbnZhbGlkUGFyYW1ldGVyczogc3RyaW5nW107XHJcbiAgZXJyb3JzOiBzdHJpbmdbXTtcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQYXJhbWV0ZXJJbmZvIHtcclxuICBuYW1lOiBzdHJpbmc7XHJcbiAgdmFsdWU6IHN0cmluZztcclxuICB0eXBlOiAnU3RyaW5nJyB8ICdTZWN1cmVTdHJpbmcnIHwgJ1N0cmluZ0xpc3QnO1xyXG4gIGxhc3RNb2RpZmllZD86IERhdGU7XHJcbiAgdmVyc2lvbj86IG51bWJlcjtcclxufVxyXG5cclxuLyoqXHJcbiAqIENvbmZpZ3VyYXRpb24gbG9hZGVyIHdpdGggYWR2YW5jZWQgdmFsaWRhdGlvbiBhbmQgdXRpbGl0aWVzXHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgQ29uZmlnTG9hZGVyIHtcclxuICBwcml2YXRlIHNzbUNsaWVudDogU1NNQ2xpZW50O1xyXG4gIHByaXZhdGUgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuXHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICB0aGlzLmVudmlyb25tZW50ID0gcHJvY2Vzcy5lbnYuVFJJTklUWV9FTlYgfHwgJ2Rldic7XHJcbiAgICB0aGlzLnNzbUNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ2V1LXdlc3QtMScgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2FkIGNvbmZpZ3VyYXRpb24gd2l0aCBjb21wcmVoZW5zaXZlIHZhbGlkYXRpb25cclxuICAgKi9cclxuICBhc3luYyBsb2FkVmFsaWRhdGVkQ29uZmlnKCk6IFByb21pc2U8eyBjb25maWc6IFRyaW5pdHlDb25maWc7IHZhbGlkYXRpb246IENvbmZpZ1ZhbGlkYXRpb25SZXN1bHQgfT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgbG9nZ2VyLmluZm8oJ/CflKcgTG9hZGluZyBhbmQgdmFsaWRhdGluZyBUcmluaXR5IGNvbmZpZ3VyYXRpb24nKTtcclxuXHJcbiAgICAgIGNvbnN0IGNvbmZpZyA9IGF3YWl0IGdldFRyaW5pdHlDb25maWcoKTtcclxuICAgICAgY29uc3QgdmFsaWRhdGlvbiA9IGF3YWl0IHRoaXMudmFsaWRhdGVDb25maWd1cmF0aW9uKGNvbmZpZyk7XHJcblxyXG4gICAgICBpZiAoIXZhbGlkYXRpb24uaXNWYWxpZCkge1xyXG4gICAgICAgIGxvZ2dlci53YXJuKCfimqDvuI8gQ29uZmlndXJhdGlvbiB2YWxpZGF0aW9uIGlzc3VlcyBmb3VuZCcsIHtcclxuICAgICAgICAgIG1pc3NpbmdQYXJhbWV0ZXJzOiB2YWxpZGF0aW9uLm1pc3NpbmdQYXJhbWV0ZXJzLFxyXG4gICAgICAgICAgaW52YWxpZFBhcmFtZXRlcnM6IHZhbGlkYXRpb24uaW52YWxpZFBhcmFtZXRlcnMsXHJcbiAgICAgICAgICBlcnJvcnM6IHZhbGlkYXRpb24uZXJyb3JzXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgbG9nZ2VyLmluZm8oJ+KchSBDb25maWd1cmF0aW9uIHZhbGlkYXRpb24gcGFzc2VkJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHJldHVybiB7IGNvbmZpZywgdmFsaWRhdGlvbiB9O1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgbG9nZ2VyLmVycm9yKCfinYwgRmFpbGVkIHRvIGxvYWQgdmFsaWRhdGVkIGNvbmZpZ3VyYXRpb24nLCBlcnIpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIGNvbmZpZ3VyYXRpb24gY29tcGxldGVuZXNzIGFuZCBjb3JyZWN0bmVzc1xyXG4gICAqL1xyXG4gIGFzeW5jIHZhbGlkYXRlQ29uZmlndXJhdGlvbihjb25maWc6IFRyaW5pdHlDb25maWcpOiBQcm9taXNlPENvbmZpZ1ZhbGlkYXRpb25SZXN1bHQ+IHtcclxuICAgIGNvbnN0IHJlc3VsdDogQ29uZmlnVmFsaWRhdGlvblJlc3VsdCA9IHtcclxuICAgICAgaXNWYWxpZDogdHJ1ZSxcclxuICAgICAgbWlzc2luZ1BhcmFtZXRlcnM6IFtdLFxyXG4gICAgICBpbnZhbGlkUGFyYW1ldGVyczogW10sXHJcbiAgICAgIGVycm9yczogW11cclxuICAgIH07XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVmFsaWRhdGUgY3JpdGljYWwgZXh0ZXJuYWwgcGFyYW1ldGVyc1xyXG4gICAgICB0aGlzLnZhbGlkYXRlRXh0ZXJuYWxDb25maWcoY29uZmlnLmV4dGVybmFsLCByZXN1bHQpO1xyXG5cclxuICAgICAgLy8gVmFsaWRhdGUgdGFibGUgbmFtZXNcclxuICAgICAgdGhpcy52YWxpZGF0ZVRhYmxlTmFtZXMoY29uZmlnLnRhYmxlcywgcmVzdWx0KTtcclxuXHJcbiAgICAgIC8vIFZhbGlkYXRlIGFwcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb25cclxuICAgICAgdGhpcy52YWxpZGF0ZUFwcENvbmZpZyhjb25maWcuYXBwLCByZXN1bHQpO1xyXG5cclxuICAgICAgLy8gVmFsaWRhdGUgb3B0aW9uYWwgY29uZmlndXJhdGlvbnNcclxuICAgICAgaWYgKGNvbmZpZy5sYW1iZGFGdW5jdGlvbnMpIHtcclxuICAgICAgICB0aGlzLnZhbGlkYXRlTGFtYmRhRnVuY3Rpb25zKGNvbmZpZy5sYW1iZGFGdW5jdGlvbnMsIHJlc3VsdCk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGlmIChjb25maWcuZmVhdHVyZUZsYWdzKSB7XHJcbiAgICAgICAgdGhpcy52YWxpZGF0ZUZlYXR1cmVGbGFncyhjb25maWcuZmVhdHVyZUZsYWdzLCByZXN1bHQpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBTZXQgb3ZlcmFsbCB2YWxpZGl0eVxyXG4gICAgICByZXN1bHQuaXNWYWxpZCA9IHJlc3VsdC5taXNzaW5nUGFyYW1ldGVycy5sZW5ndGggPT09IDAgJiYgXHJcbiAgICAgICAgICAgICAgICAgICAgICByZXN1bHQuaW52YWxpZFBhcmFtZXRlcnMubGVuZ3RoID09PSAwICYmIFxyXG4gICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LmVycm9ycy5sZW5ndGggPT09IDA7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICByZXN1bHQuZXJyb3JzLnB1c2goYFZhbGlkYXRpb24gZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YCk7XHJcbiAgICAgIHJlc3VsdC5pc1ZhbGlkID0gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIGV4dGVybmFsIHNlcnZpY2UgY29uZmlndXJhdGlvblxyXG4gICAqL1xyXG4gIHByaXZhdGUgdmFsaWRhdGVFeHRlcm5hbENvbmZpZyhleHRlcm5hbDogVHJpbml0eUNvbmZpZ1snZXh0ZXJuYWwnXSwgcmVzdWx0OiBDb25maWdWYWxpZGF0aW9uUmVzdWx0KTogdm9pZCB7XHJcbiAgICBjb25zdCByZXF1aXJlZEZpZWxkcyA9IFtcclxuICAgICAgJ3RtZGJBcGlLZXknLFxyXG4gICAgICAnY29nbml0b1VzZXJQb29sSWQnLFxyXG4gICAgICAnY29nbml0b0NsaWVudElkJyxcclxuICAgICAgJ2FwcHN5bmNBcGlJZCcsXHJcbiAgICAgICdhcHBzeW5jQXBpVXJsJyxcclxuICAgICAgJ3JlYWx0aW1lQXBpVXJsJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHJlcXVpcmVkRmllbGRzKSB7XHJcbiAgICAgIGNvbnN0IHZhbHVlID0gZXh0ZXJuYWxbZmllbGQgYXMga2V5b2YgdHlwZW9mIGV4dGVybmFsXTtcclxuICAgICAgaWYgKCF2YWx1ZSB8fCB2YWx1ZS50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgcmVzdWx0Lm1pc3NpbmdQYXJhbWV0ZXJzLnB1c2goYGV4dGVybmFsLiR7ZmllbGR9YCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVmFsaWRhdGUgc3BlY2lmaWMgZm9ybWF0c1xyXG4gICAgICAgIGlmIChmaWVsZCA9PT0gJ2FwcHN5bmNBcGlVcmwnICYmICF2YWx1ZS5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XHJcbiAgICAgICAgICByZXN1bHQuaW52YWxpZFBhcmFtZXRlcnMucHVzaChgZXh0ZXJuYWwuJHtmaWVsZH0gLSBtdXN0IGJlIEhUVFBTIFVSTGApO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZmllbGQgPT09ICdyZWFsdGltZUFwaVVybCcgJiYgIXZhbHVlLnN0YXJ0c1dpdGgoJ3dzczovLycpKSB7XHJcbiAgICAgICAgICByZXN1bHQuaW52YWxpZFBhcmFtZXRlcnMucHVzaChgZXh0ZXJuYWwuJHtmaWVsZH0gLSBtdXN0IGJlIFdTUyBVUkxgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGZpZWxkID09PSAnY29nbml0b1VzZXJQb29sSWQnICYmICF2YWx1ZS5tYXRjaCgvXlthLXowLTktXStfW2EtekEtWjAtOV0rJC8pKSB7XHJcbiAgICAgICAgICByZXN1bHQuaW52YWxpZFBhcmFtZXRlcnMucHVzaChgZXh0ZXJuYWwuJHtmaWVsZH0gLSBpbnZhbGlkIENvZ25pdG8gVXNlciBQb29sIElEIGZvcm1hdGApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgRHluYW1vREIgdGFibGUgbmFtZXNcclxuICAgKi9cclxuICBwcml2YXRlIHZhbGlkYXRlVGFibGVOYW1lcyh0YWJsZXM6IFRyaW5pdHlDb25maWdbJ3RhYmxlcyddLCByZXN1bHQ6IENvbmZpZ1ZhbGlkYXRpb25SZXN1bHQpOiB2b2lkIHtcclxuICAgIGNvbnN0IHJlcXVpcmVkVGFibGVzID0gW1xyXG4gICAgICAndXNlcnMnLCAncm9vbXMnLCAncm9vbU1lbWJlcnMnLCAncm9vbUludml0ZXMnLCAndm90ZXMnLCAnbW92aWVzQ2FjaGUnLFxyXG4gICAgICAncm9vbU1hdGNoZXMnLCAnY29ubmVjdGlvbnMnLCAncm9vbU1vdmllQ2FjaGUnLCAncm9vbUNhY2hlTWV0YWRhdGEnLFxyXG4gICAgICAnbWF0Y2htYWtpbmcnLCAnZmlsdGVyQ2FjaGUnXHJcbiAgICBdO1xyXG5cclxuICAgIGZvciAoY29uc3QgdGFibGVOYW1lIG9mIHJlcXVpcmVkVGFibGVzKSB7XHJcbiAgICAgIGNvbnN0IHZhbHVlID0gdGFibGVzW3RhYmxlTmFtZSBhcyBrZXlvZiB0eXBlb2YgdGFibGVzXTtcclxuICAgICAgaWYgKCF2YWx1ZSB8fCB2YWx1ZS50cmltKCkgPT09ICcnKSB7XHJcbiAgICAgICAgcmVzdWx0Lm1pc3NpbmdQYXJhbWV0ZXJzLnB1c2goYHRhYmxlcy4ke3RhYmxlTmFtZX1gKTtcclxuICAgICAgfSBlbHNlIGlmICghdmFsdWUuc3RhcnRzV2l0aCgndHJpbml0eS0nKSkge1xyXG4gICAgICAgIHJlc3VsdC5pbnZhbGlkUGFyYW1ldGVycy5wdXNoKGB0YWJsZXMuJHt0YWJsZU5hbWV9IC0gbXVzdCBzdGFydCB3aXRoICd0cmluaXR5LSdgKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgYXBwbGljYXRpb24gY29uZmlndXJhdGlvblxyXG4gICAqL1xyXG4gIHByaXZhdGUgdmFsaWRhdGVBcHBDb25maWcoYXBwOiBUcmluaXR5Q29uZmlnWydhcHAnXSwgcmVzdWx0OiBDb25maWdWYWxpZGF0aW9uUmVzdWx0KTogdm9pZCB7XHJcbiAgICAvLyBWYWxpZGF0ZSBjYWNoZSBjb25maWd1cmF0aW9uXHJcbiAgICBpZiAoIWFwcC5jYWNoZSkge1xyXG4gICAgICByZXN1bHQubWlzc2luZ1BhcmFtZXRlcnMucHVzaCgnYXBwLmNhY2hlJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpZiAoYXBwLmNhY2hlLnR0bERheXMgPD0gMCB8fCBhcHAuY2FjaGUudHRsRGF5cyA+IDMwKSB7XHJcbiAgICAgICAgcmVzdWx0LmludmFsaWRQYXJhbWV0ZXJzLnB1c2goJ2FwcC5jYWNoZS50dGxEYXlzIC0gbXVzdCBiZSBiZXR3ZWVuIDEgYW5kIDMwJyk7XHJcbiAgICAgIH1cclxuICAgICAgaWYgKGFwcC5jYWNoZS5iYXRjaFNpemUgPD0gMCB8fCBhcHAuY2FjaGUuYmF0Y2hTaXplID4gMTAwKSB7XHJcbiAgICAgICAgcmVzdWx0LmludmFsaWRQYXJhbWV0ZXJzLnB1c2goJ2FwcC5jYWNoZS5iYXRjaFNpemUgLSBtdXN0IGJlIGJldHdlZW4gMSBhbmQgMTAwJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBWYWxpZGF0ZSB2b3RpbmcgY29uZmlndXJhdGlvblxyXG4gICAgaWYgKCFhcHAudm90aW5nKSB7XHJcbiAgICAgIHJlc3VsdC5taXNzaW5nUGFyYW1ldGVycy5wdXNoKCdhcHAudm90aW5nJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpZiAoYXBwLnZvdGluZy5tYXhSb29tQ2FwYWNpdHkgPCAyIHx8IGFwcC52b3RpbmcubWF4Um9vbUNhcGFjaXR5ID4gMTApIHtcclxuICAgICAgICByZXN1bHQuaW52YWxpZFBhcmFtZXRlcnMucHVzaCgnYXBwLnZvdGluZy5tYXhSb29tQ2FwYWNpdHkgLSBtdXN0IGJlIGJldHdlZW4gMiBhbmQgMTAnKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoYXBwLnZvdGluZy5kZWZhdWx0Um9vbUNhcGFjaXR5IDwgMiB8fCBhcHAudm90aW5nLmRlZmF1bHRSb29tQ2FwYWNpdHkgPiBhcHAudm90aW5nLm1heFJvb21DYXBhY2l0eSkge1xyXG4gICAgICAgIHJlc3VsdC5pbnZhbGlkUGFyYW1ldGVycy5wdXNoKCdhcHAudm90aW5nLmRlZmF1bHRSb29tQ2FwYWNpdHkgLSBtdXN0IGJlIGJldHdlZW4gMiBhbmQgbWF4Um9vbUNhcGFjaXR5Jyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBWYWxpZGF0ZSBtb3ZpZXMgY29uZmlndXJhdGlvblxyXG4gICAgaWYgKCFhcHAubW92aWVzKSB7XHJcbiAgICAgIHJlc3VsdC5taXNzaW5nUGFyYW1ldGVycy5wdXNoKCdhcHAubW92aWVzJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBpZiAoYXBwLm1vdmllcy5jYWNoZVNpemUgIT09IDUwKSB7XHJcbiAgICAgICAgcmVzdWx0LmludmFsaWRQYXJhbWV0ZXJzLnB1c2goJ2FwcC5tb3ZpZXMuY2FjaGVTaXplIC0gbXVzdCBiZSBleGFjdGx5IDUwIChidXNpbmVzcyByZXF1aXJlbWVudCknKTtcclxuICAgICAgfVxyXG4gICAgICBpZiAoYXBwLm1vdmllcy5tYXhHZW5yZXMgPCAxIHx8IGFwcC5tb3ZpZXMubWF4R2VucmVzID4gMykge1xyXG4gICAgICAgIHJlc3VsdC5pbnZhbGlkUGFyYW1ldGVycy5wdXNoKCdhcHAubW92aWVzLm1heEdlbnJlcyAtIG11c3QgYmUgYmV0d2VlbiAxIGFuZCAzJyk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIExhbWJkYSBmdW5jdGlvbiBuYW1lc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgdmFsaWRhdGVMYW1iZGFGdW5jdGlvbnMobGFtYmRhRnVuY3Rpb25zOiBOb25OdWxsYWJsZTxUcmluaXR5Q29uZmlnWydsYW1iZGFGdW5jdGlvbnMnXT4sIHJlc3VsdDogQ29uZmlnVmFsaWRhdGlvblJlc3VsdCk6IHZvaWQge1xyXG4gICAgY29uc3QgcmVxdWlyZWRGdW5jdGlvbnMgPSBbJ2F1dGgnLCAncm9vbScsICd2b3RlJywgJ21vdmllJywgJ2NhY2hlJywgJ3JlYWx0aW1lJywgJ21hdGNobWFrZXInXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGZ1bmNOYW1lIG9mIHJlcXVpcmVkRnVuY3Rpb25zKSB7XHJcbiAgICAgIGNvbnN0IHZhbHVlID0gbGFtYmRhRnVuY3Rpb25zW2Z1bmNOYW1lIGFzIGtleW9mIHR5cGVvZiBsYW1iZGFGdW5jdGlvbnNdO1xyXG4gICAgICBpZiAoIXZhbHVlIHx8IHZhbHVlLnRyaW0oKSA9PT0gJycpIHtcclxuICAgICAgICByZXN1bHQubWlzc2luZ1BhcmFtZXRlcnMucHVzaChgbGFtYmRhRnVuY3Rpb25zLiR7ZnVuY05hbWV9YCk7XHJcbiAgICAgIH0gZWxzZSBpZiAoIXZhbHVlLnN0YXJ0c1dpdGgoJ3RyaW5pdHktJykpIHtcclxuICAgICAgICByZXN1bHQuaW52YWxpZFBhcmFtZXRlcnMucHVzaChgbGFtYmRhRnVuY3Rpb25zLiR7ZnVuY05hbWV9IC0gbXVzdCBzdGFydCB3aXRoICd0cmluaXR5LSdgKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogVmFsaWRhdGUgZmVhdHVyZSBmbGFnc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgdmFsaWRhdGVGZWF0dXJlRmxhZ3MoZmVhdHVyZUZsYWdzOiBOb25OdWxsYWJsZTxUcmluaXR5Q29uZmlnWydmZWF0dXJlRmxhZ3MnXT4sIHJlc3VsdDogQ29uZmlnVmFsaWRhdGlvblJlc3VsdCk6IHZvaWQge1xyXG4gICAgY29uc3QgcmVxdWlyZWRGbGFncyA9IFtcclxuICAgICAgJ2VuYWJsZVJlYWxUaW1lTm90aWZpY2F0aW9ucycsXHJcbiAgICAgICdlbmFibGVDaXJjdWl0QnJlYWtlcicsXHJcbiAgICAgICdlbmFibGVNZXRyaWNzTG9nZ2luZycsXHJcbiAgICAgICdlbmFibGVHb29nbGVTaWduaW4nLFxyXG4gICAgICAnZGVidWdNb2RlJ1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGZsYWdOYW1lIG9mIHJlcXVpcmVkRmxhZ3MpIHtcclxuICAgICAgY29uc3QgdmFsdWUgPSBmZWF0dXJlRmxhZ3NbZmxhZ05hbWUgYXMga2V5b2YgdHlwZW9mIGZlYXR1cmVGbGFnc107XHJcbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdib29sZWFuJykge1xyXG4gICAgICAgIHJlc3VsdC5pbnZhbGlkUGFyYW1ldGVycy5wdXNoKGBmZWF0dXJlRmxhZ3MuJHtmbGFnTmFtZX0gLSBtdXN0IGJlIGJvb2xlYW5gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IHBhcmFtZXRlciBpbmZvcm1hdGlvbiBpbmNsdWRpbmcgbWV0YWRhdGFcclxuICAgKi9cclxuICBhc3luYyBnZXRQYXJhbWV0ZXJJbmZvKHBhcmFtZXRlck5hbWU6IHN0cmluZyk6IFByb21pc2U8UGFyYW1ldGVySW5mbyB8IG51bGw+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7XHJcbiAgICAgICAgTmFtZTogcGFyYW1ldGVyTmFtZSxcclxuICAgICAgICBXaXRoRGVjcnlwdGlvbjogZmFsc2UgLy8gRG9uJ3QgZGVjcnlwdCBmb3IgbWV0YWRhdGFcclxuICAgICAgfSk7XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuc3NtQ2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoIXJlc3BvbnNlLlBhcmFtZXRlcikge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIG5hbWU6IHJlc3BvbnNlLlBhcmFtZXRlci5OYW1lIHx8IHBhcmFtZXRlck5hbWUsXHJcbiAgICAgICAgdmFsdWU6IHJlc3BvbnNlLlBhcmFtZXRlci5WYWx1ZSB8fCAnJyxcclxuICAgICAgICB0eXBlOiByZXNwb25zZS5QYXJhbWV0ZXIuVHlwZSBhcyAnU3RyaW5nJyB8ICdTZWN1cmVTdHJpbmcnIHwgJ1N0cmluZ0xpc3QnLFxyXG4gICAgICAgIGxhc3RNb2RpZmllZDogcmVzcG9uc2UuUGFyYW1ldGVyLkxhc3RNb2RpZmllZERhdGUsXHJcbiAgICAgICAgdmVyc2lvbjogcmVzcG9uc2UuUGFyYW1ldGVyLlZlcnNpb25cclxuICAgICAgfTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBsb2dnZXIuZGVidWcoYFBhcmFtZXRlciAke3BhcmFtZXRlck5hbWV9IG5vdCBmb3VuZCBvciBpbmFjY2Vzc2libGVgKTtcclxuICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMaXN0IGFsbCBUcmluaXR5IHBhcmFtZXRlcnMgZm9yIHRoZSBjdXJyZW50IGVudmlyb25tZW50XHJcbiAgICovXHJcbiAgYXN5bmMgbGlzdFRyaW5pdHlQYXJhbWV0ZXJzKCk6IFByb21pc2U8UGFyYW1ldGVySW5mb1tdPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBwYXJhbWV0ZXJQcmVmaXggPSBgL3RyaW5pdHkvJHt0aGlzLmVudmlyb25tZW50fWA7XHJcbiAgICAgIGNvbnN0IHBhcmFtZXRlcnM6IFBhcmFtZXRlckluZm9bXSA9IFtdO1xyXG5cclxuICAgICAgLy8gRGVmaW5lIGFsbCBleHBlY3RlZCBwYXJhbWV0ZXIgcGF0aHNcclxuICAgICAgY29uc3QgZXhwZWN0ZWRQYXRocyA9IFtcclxuICAgICAgICBgJHtwYXJhbWV0ZXJQcmVmaXh9L2V4dGVybmFsL3RtZGItYXBpLWtleWAsXHJcbiAgICAgICAgYCR7cGFyYW1ldGVyUHJlZml4fS9hdXRoL2NvZ25pdG8tdXNlci1wb29sLWlkYCxcclxuICAgICAgICBgJHtwYXJhbWV0ZXJQcmVmaXh9L2F1dGgvY29nbml0by1jbGllbnQtaWRgLFxyXG4gICAgICAgIGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9nb29nbGUtd2ViLWNsaWVudC1pZGAsXHJcbiAgICAgICAgYCR7cGFyYW1ldGVyUHJlZml4fS9hdXRoL2dvb2dsZS1jbGllbnQtc2VjcmV0YCxcclxuICAgICAgICBgJHtwYXJhbWV0ZXJQcmVmaXh9L2F1dGgvZ29vZ2xlLWFuZHJvaWQtY2xpZW50LWlkYCxcclxuICAgICAgICBgJHtwYXJhbWV0ZXJQcmVmaXh9L2F1dGgvZ29vZ2xlLWlvcy1jbGllbnQtaWRgLFxyXG4gICAgICAgIGAke3BhcmFtZXRlclByZWZpeH0vYXBpL2FwcHN5bmMtYXBpLWlkYCxcclxuICAgICAgICBgJHtwYXJhbWV0ZXJQcmVmaXh9L2FwaS9hcHBzeW5jLWFwaS11cmxgLFxyXG4gICAgICAgIGAke3BhcmFtZXRlclByZWZpeH0vYXBpL3JlYWx0aW1lLWFwaS11cmxgLFxyXG4gICAgICAgIGAke3BhcmFtZXRlclByZWZpeH0vc2VjdXJpdHkvand0LXNlY3JldGAsXHJcbiAgICAgICAgYCR7cGFyYW1ldGVyUHJlZml4fS9keW5hbW9kYi90YWJsZS1uYW1lc2AsXHJcbiAgICAgICAgYCR7cGFyYW1ldGVyUHJlZml4fS9sYW1iZGEvZnVuY3Rpb24tbmFtZXNgLFxyXG4gICAgICAgIGAke3BhcmFtZXRlclByZWZpeH0vYXBwL2NvbmZpZ2AsXHJcbiAgICAgICAgYCR7cGFyYW1ldGVyUHJlZml4fS9hcHAvZmVhdHVyZS1mbGFnc2BcclxuICAgICAgXTtcclxuXHJcbiAgICAgIC8vIEdldCBpbmZvcm1hdGlvbiBmb3IgZWFjaCBwYXJhbWV0ZXJcclxuICAgICAgZm9yIChjb25zdCBwYXRoIG9mIGV4cGVjdGVkUGF0aHMpIHtcclxuICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgdGhpcy5nZXRQYXJhbWV0ZXJJbmZvKHBhdGgpO1xyXG4gICAgICAgIGlmIChpbmZvKSB7XHJcbiAgICAgICAgICBwYXJhbWV0ZXJzLnB1c2goaW5mbyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBsb2dnZXIuaW5mbyhg8J+TiyBGb3VuZCAke3BhcmFtZXRlcnMubGVuZ3RofSBUcmluaXR5IHBhcmFtZXRlcnMgZm9yIGVudmlyb25tZW50ICR7dGhpcy5lbnZpcm9ubWVudH1gKTtcclxuICAgICAgcmV0dXJuIHBhcmFtZXRlcnM7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gbGlzdCBUcmluaXR5IHBhcmFtZXRlcnMnLCBlcnIpO1xyXG4gICAgICB0aHJvdyBlcnJvcjtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIHBhcmFtZXRlciBzdG9yZSBjb25uZWN0aXZpdHlcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZVBhcmFtZXRlclN0b3JlQ29ubmVjdGl2aXR5KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gVHJ5IHRvIGdldCBhIHNpbXBsZSBwYXJhbWV0ZXIgdG8gdGVzdCBjb25uZWN0aXZpdHlcclxuICAgICAgY29uc3QgdGVzdFBhdGggPSBgL3RyaW5pdHkvJHt0aGlzLmVudmlyb25tZW50fS9leHRlcm5hbC90bWRiLWFwaS1rZXlgO1xyXG4gICAgICBhd2FpdCB0aGlzLmdldFBhcmFtZXRlckluZm8odGVzdFBhdGgpO1xyXG4gICAgICBcclxuICAgICAgbG9nZ2VyLmluZm8oJ+KchSBQYXJhbWV0ZXIgU3RvcmUgY29ubmVjdGl2aXR5IHZhbGlkYXRlZCcpO1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBsb2dnZXIud2Fybign4pqg77iPIFBhcmFtZXRlciBTdG9yZSBjb25uZWN0aXZpdHkgaXNzdWUnLCB7IGVycm9yOiAoZXJyb3IgYXMgRXJyb3IpLm1lc3NhZ2UgfSk7XHJcbiAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBjb25maWd1cmF0aW9uIHN1bW1hcnkgZm9yIGRlYnVnZ2luZ1xyXG4gICAqL1xyXG4gIGFzeW5jIGdldENvbmZpZ3VyYXRpb25TdW1tYXJ5KCk6IFByb21pc2U8e1xyXG4gICAgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICAgIHJlZ2lvbjogc3RyaW5nO1xyXG4gICAgcGFyYW1ldGVyQ291bnQ6IG51bWJlcjtcclxuICAgIGNvbm5lY3Rpdml0eTogYm9vbGVhbjtcclxuICAgIHZhbGlkYXRpb246IENvbmZpZ1ZhbGlkYXRpb25SZXN1bHQ7XHJcbiAgfT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgY29uZmlnID0gYXdhaXQgZ2V0VHJpbml0eUNvbmZpZygpO1xyXG4gICAgICBjb25zdCBwYXJhbWV0ZXJzID0gYXdhaXQgdGhpcy5saXN0VHJpbml0eVBhcmFtZXRlcnMoKTtcclxuICAgICAgY29uc3QgY29ubmVjdGl2aXR5ID0gYXdhaXQgdGhpcy52YWxpZGF0ZVBhcmFtZXRlclN0b3JlQ29ubmVjdGl2aXR5KCk7XHJcbiAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSBhd2FpdCB0aGlzLnZhbGlkYXRlQ29uZmlndXJhdGlvbihjb25maWcpO1xyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBlbnZpcm9ubWVudDogdGhpcy5lbnZpcm9ubWVudCxcclxuICAgICAgICByZWdpb246IGNvbmZpZy5yZWdpb24sXHJcbiAgICAgICAgcGFyYW1ldGVyQ291bnQ6IHBhcmFtZXRlcnMubGVuZ3RoLFxyXG4gICAgICAgIGNvbm5lY3Rpdml0eSxcclxuICAgICAgICB2YWxpZGF0aW9uXHJcbiAgICAgIH07XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBsb2dnZXIuZXJyb3IoJ+KdjCBGYWlsZWQgdG8gZ2V0IGNvbmZpZ3VyYXRpb24gc3VtbWFyeScsIGVycik7XHJcbiAgICAgIHRocm93IGVycm9yO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFV0aWxpdHkgZnVuY3Rpb25zIGZvciBjb25maWd1cmF0aW9uIG1hbmFnZW1lbnRcclxuICovXHJcbmV4cG9ydCBjb25zdCBDb25maWdVdGlscyA9IHtcclxuICAvKipcclxuICAgKiBMb2FkIGNvbmZpZ3VyYXRpb24gd2l0aCBhdXRvbWF0aWMgZmFsbGJhY2sgYW5kIHZhbGlkYXRpb25cclxuICAgKi9cclxuICBsb2FkQ29uZmlnOiBhc3luYyAoKTogUHJvbWlzZTxUcmluaXR5Q29uZmlnPiA9PiB7XHJcbiAgICBjb25zdCBsb2FkZXIgPSBuZXcgQ29uZmlnTG9hZGVyKCk7XHJcbiAgICBjb25zdCB7IGNvbmZpZywgdmFsaWRhdGlvbiB9ID0gYXdhaXQgbG9hZGVyLmxvYWRWYWxpZGF0ZWRDb25maWcoKTtcclxuICAgIFxyXG4gICAgaWYgKCF2YWxpZGF0aW9uLmlzVmFsaWQpIHtcclxuICAgICAgbG9nZ2VyLndhcm4oJ+KaoO+4jyBDb25maWd1cmF0aW9uIGhhcyB2YWxpZGF0aW9uIGlzc3VlcyBidXQgcHJvY2VlZGluZyB3aXRoIGZhbGxiYWNrIHZhbHVlcycpO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gY29uZmlnO1xyXG4gIH0sXHJcblxyXG4gIC8qKlxyXG4gICAqIFZhbGlkYXRlIGN1cnJlbnQgY29uZmlndXJhdGlvblxyXG4gICAqL1xyXG4gIHZhbGlkYXRlQ29uZmlnOiBhc3luYyAoKTogUHJvbWlzZTxDb25maWdWYWxpZGF0aW9uUmVzdWx0PiA9PiB7XHJcbiAgICBjb25zdCBsb2FkZXIgPSBuZXcgQ29uZmlnTG9hZGVyKCk7XHJcbiAgICBjb25zdCBjb25maWcgPSBhd2FpdCBnZXRUcmluaXR5Q29uZmlnKCk7XHJcbiAgICByZXR1cm4gbG9hZGVyLnZhbGlkYXRlQ29uZmlndXJhdGlvbihjb25maWcpO1xyXG4gIH0sXHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBwYXJhbWV0ZXIgYnkgcGF0aCB3aXRoIGNhY2hpbmdcclxuICAgKi9cclxuICBnZXRQYXJhbWV0ZXJCeVBhdGg6IGFzeW5jIChwYXRoOiBzdHJpbmcsIGRlY3J5cHQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8c3RyaW5nPiA9PiB7XHJcbiAgICByZXR1cm4gZ2V0UGFyYW1ldGVyKHBhdGgsIGRlY3J5cHQpO1xyXG4gIH0sXHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBtdWx0aXBsZSBwYXJhbWV0ZXJzIGJ5IHBhdGhzXHJcbiAgICovXHJcbiAgZ2V0UGFyYW1ldGVyc0J5UGF0aHM6IGFzeW5jIChwYXRoczogc3RyaW5nW10sIGRlY3J5cHQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4gPT4ge1xyXG4gICAgcmV0dXJuIGdldFBhcmFtZXRlcnMocGF0aHMsIGRlY3J5cHQpO1xyXG4gIH0sXHJcblxyXG4gIC8qKlxyXG4gICAqIENoZWNrIGlmIHJ1bm5pbmcgaW4gZGV2ZWxvcG1lbnQgbW9kZVxyXG4gICAqL1xyXG4gIGlzRGV2ZWxvcG1lbnQ6ICgpOiBib29sZWFuID0+IHtcclxuICAgIHJldHVybiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JyB8fCBwcm9jZXNzLmVudi5UUklOSVRZX0VOViA9PT0gJ2Rldic7XHJcbiAgfSxcclxuXHJcbiAgLyoqXHJcbiAgICogQ2hlY2sgaWYgcnVubmluZyBpbiBwcm9kdWN0aW9uIG1vZGVcclxuICAgKi9cclxuICBpc1Byb2R1Y3Rpb246ICgpOiBib29sZWFuID0+IHtcclxuICAgIHJldHVybiBwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nIHx8IHByb2Nlc3MuZW52LlRSSU5JVFlfRU5WID09PSAncHJvZHVjdGlvbic7XHJcbiAgfSxcclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IGVudmlyb25tZW50LXNwZWNpZmljIHBhcmFtZXRlciBwYXRoXHJcbiAgICovXHJcbiAgZ2V0UGFyYW1ldGVyUGF0aDogKGNhdGVnb3J5OiBzdHJpbmcsIHBhcmFtTmFtZTogc3RyaW5nLCBlbnZpcm9ubWVudD86IHN0cmluZyk6IHN0cmluZyA9PiB7XHJcbiAgICBjb25zdCBlbnYgPSBlbnZpcm9ubWVudCB8fCBwcm9jZXNzLmVudi5UUklOSVRZX0VOViB8fCAnZGV2JztcclxuICAgIHJldHVybiBgL3RyaW5pdHkvJHtlbnZ9LyR7Y2F0ZWdvcnl9LyR7cGFyYW1OYW1lfWA7XHJcbiAgfVxyXG59O1xyXG5cclxuLy8gRXhwb3J0IHNpbmdsZXRvbiBpbnN0YW5jZVxyXG5leHBvcnQgY29uc3QgY29uZmlnTG9hZGVyID0gbmV3IENvbmZpZ0xvYWRlcigpOyJdfQ==