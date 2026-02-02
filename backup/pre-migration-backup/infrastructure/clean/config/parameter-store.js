"use strict";
/**
 * Trinity Parameter Store Configuration
 * Manages environment-specific parameters with proper hierarchy
 * Hierarchy: /trinity/{env}/category/parameter
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParameterStoreUtils = exports.TrinityParameterStore = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
const constructs_1 = require("constructs");
/**
 * Create or import Parameter Store parameters for Trinity
 */
class TrinityParameterStore extends constructs_1.Construct {
    constructor(scope, id, config) {
        super(scope, id);
        // Initialize parameters object
        this.parameters = {};
        const parameterPrefix = `/trinity/${config.environment}`;
        // External API Keys (SecureString)
        this.parameters.tmdbApiKey = new ssm.StringParameter(this, 'TmdbApiKey', {
            parameterName: `${parameterPrefix}/external/tmdb-api-key`,
            stringValue: process.env.TMDB_API_KEY || 'placeholder-tmdb-key',
            type: ssm.ParameterType.SECURE_STRING,
            description: 'TMDB API key for movie data retrieval',
            tier: ssm.ParameterTier.STANDARD,
        });
        // AWS Service Configuration
        this.parameters.cognitoUserPoolId = new ssm.StringParameter(this, 'CognitoUserPoolId', {
            parameterName: `${parameterPrefix}/auth/cognito-user-pool-id`,
            stringValue: process.env.COGNITO_USER_POOL_ID || 'placeholder-user-pool-id',
            description: 'Cognito User Pool ID for authentication',
            tier: ssm.ParameterTier.STANDARD,
        });
        this.parameters.cognitoClientId = new ssm.StringParameter(this, 'CognitoClientId', {
            parameterName: `${parameterPrefix}/auth/cognito-client-id`,
            stringValue: process.env.COGNITO_CLIENT_ID || 'placeholder-client-id',
            description: 'Cognito User Pool Client ID',
            tier: ssm.ParameterTier.STANDARD,
        });
        this.parameters.appsyncApiId = new ssm.StringParameter(this, 'AppSyncApiId', {
            parameterName: `${parameterPrefix}/api/appsync-api-id`,
            stringValue: process.env.GRAPHQL_API_ID || 'placeholder-api-id',
            description: 'AppSync GraphQL API ID',
            tier: ssm.ParameterTier.STANDARD,
        });
        this.parameters.appsyncApiUrl = new ssm.StringParameter(this, 'AppSyncApiUrl', {
            parameterName: `${parameterPrefix}/api/appsync-api-url`,
            stringValue: process.env.GRAPHQL_API_URL || 'https://placeholder.appsync-api.eu-west-1.amazonaws.com/graphql',
            description: 'AppSync GraphQL API URL',
            tier: ssm.ParameterTier.STANDARD,
        });
        this.parameters.realtimeApiUrl = new ssm.StringParameter(this, 'RealtimeApiUrl', {
            parameterName: `${parameterPrefix}/api/realtime-api-url`,
            stringValue: process.env.GRAPHQL_REALTIME_URL || 'wss://placeholder.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
            description: 'AppSync Real-time API URL for subscriptions',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Google OAuth Configuration (SecureString)
        this.parameters.googleWebClientId = new ssm.StringParameter(this, 'GoogleWebClientId', {
            parameterName: `${parameterPrefix}/auth/google-web-client-id`,
            stringValue: process.env.GOOGLE_WEB_CLIENT_ID || 'placeholder-google-web-client-id',
            type: ssm.ParameterType.SECURE_STRING,
            description: 'Google OAuth Web Client ID',
            tier: ssm.ParameterTier.STANDARD,
        });
        this.parameters.googleClientSecret = new ssm.StringParameter(this, 'GoogleClientSecret', {
            parameterName: `${parameterPrefix}/auth/google-client-secret`,
            stringValue: process.env.GOOGLE_CLIENT_SECRET || 'placeholder-google-client-secret',
            type: ssm.ParameterType.SECURE_STRING,
            description: 'Google OAuth Client Secret',
            tier: ssm.ParameterTier.STANDARD,
        });
        this.parameters.googleAndroidClientId = new ssm.StringParameter(this, 'GoogleAndroidClientId', {
            parameterName: `${parameterPrefix}/auth/google-android-client-id`,
            stringValue: process.env.GOOGLE_ANDROID_CLIENT_ID || 'placeholder-google-android-client-id',
            type: ssm.ParameterType.SECURE_STRING,
            description: 'Google OAuth Android Client ID',
            tier: ssm.ParameterTier.STANDARD,
        });
        this.parameters.googleIosClientId = new ssm.StringParameter(this, 'GoogleIosClientId', {
            parameterName: `${parameterPrefix}/auth/google-ios-client-id`,
            stringValue: process.env.GOOGLE_IOS_CLIENT_ID || 'placeholder-google-ios-client-id',
            type: ssm.ParameterType.SECURE_STRING,
            description: 'Google OAuth iOS Client ID',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Security Configuration (SecureString)
        this.parameters.jwtSecret = new ssm.StringParameter(this, 'JwtSecret', {
            parameterName: `${parameterPrefix}/security/jwt-secret`,
            stringValue: process.env.JWT_SECRET || 'placeholder-jwt-secret-key',
            type: ssm.ParameterType.SECURE_STRING,
            description: 'JWT secret key for token signing',
            tier: ssm.ParameterTier.STANDARD,
        });
        // DynamoDB Table Names (JSON String)
        const tableNames = {
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
        };
        this.parameters.tableNames = new ssm.StringParameter(this, 'TableNames', {
            parameterName: `${parameterPrefix}/dynamodb/table-names`,
            stringValue: JSON.stringify(tableNames),
            description: 'DynamoDB table names configuration',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Lambda Function Names (JSON String)
        const lambdaFunctionNames = {
            auth: process.env.AUTH_HANDLER_NAME || 'trinity-auth-dev',
            room: process.env.ROOM_HANDLER_NAME || 'trinity-room-dev',
            vote: process.env.VOTE_HANDLER_NAME || 'trinity-vote-dev',
            movie: process.env.MOVIE_HANDLER_NAME || 'trinity-movie-dev',
            cache: process.env.CACHE_HANDLER_NAME || 'trinity-cache-dev',
            realtime: process.env.REALTIME_HANDLER_NAME || 'trinity-realtime-dev',
            matchmaker: process.env.MATCHMAKER_HANDLER_NAME || 'trinity-vote-consensus-dev', // Note: deployed name
        };
        this.parameters.lambdaFunctionNames = new ssm.StringParameter(this, 'LambdaFunctionNames', {
            parameterName: `${parameterPrefix}/lambda/function-names`,
            stringValue: JSON.stringify(lambdaFunctionNames),
            description: 'Lambda function names configuration',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Application Configuration (JSON String)
        const appConfig = {
            cache: {
                ttlDays: 7,
                batchSize: 30,
                maxBatches: 10,
                movieCacheSize: 50,
            },
            voting: {
                maxRoomCapacity: parseInt(process.env.MAX_ROOM_CAPACITY || '10'),
                defaultRoomCapacity: 2,
            },
            movies: {
                cacheSize: 50,
                maxGenres: 2,
            },
            performance: {
                lambdaMemorySize: parseInt(process.env.LAMBDA_MEMORY_SIZE || '512'),
                lambdaTimeoutSeconds: parseInt(process.env.LAMBDA_TIMEOUT_SECONDS || '30'),
                circuitBreakerFailureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
                circuitBreakerTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '60000'),
                circuitBreakerResetTimeoutMs: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS || '30000'),
            },
            monitoring: {
                logLevel: process.env.LOG_LEVEL || 'info',
                enableMetrics: process.env.ENABLE_METRICS === 'true',
                enableXRayTracing: process.env.ENABLE_XRAY_TRACING === 'true',
                verboseLogging: process.env.VERBOSE_LOGGING === 'true',
            },
        };
        this.parameters.appConfig = new ssm.StringParameter(this, 'AppConfig', {
            parameterName: `${parameterPrefix}/app/config`,
            stringValue: JSON.stringify(appConfig),
            description: 'Application configuration settings',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Feature Flags (JSON String)
        const featureFlags = {
            enableRealTimeNotifications: process.env.ENABLE_REAL_TIME_NOTIFICATIONS === 'true',
            enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER === 'true',
            enableMetricsLogging: process.env.ENABLE_METRICS_LOGGING === 'true',
            enableGoogleSignin: process.env.ENABLE_GOOGLE_SIGNIN === 'true',
            debugMode: process.env.DEBUG_MODE === 'true',
        };
        this.parameters.featureFlags = new ssm.StringParameter(this, 'FeatureFlags', {
            parameterName: `${parameterPrefix}/app/feature-flags`,
            stringValue: JSON.stringify(featureFlags),
            description: 'Feature flags configuration',
            tier: ssm.ParameterTier.STANDARD,
        });
        // Add tags to all parameters
        const allParameters = Object.values(this.parameters);
        allParameters.forEach(param => {
            cdk.Tags.of(param).add('Project', 'Trinity');
            cdk.Tags.of(param).add('Environment', config.environment);
            cdk.Tags.of(param).add('ManagedBy', 'CDK');
        });
    }
    /**
     * Grant read access to parameters for Lambda functions
     */
    grantReadAccess(grantee) {
        Object.values(this.parameters).forEach(parameter => {
            parameter.grantRead(grantee);
        });
    }
}
exports.TrinityParameterStore = TrinityParameterStore;
/**
 * Utility functions for accessing parameters in Lambda functions
 */
exports.ParameterStoreUtils = {
    /**
     * Get parameter path for environment
     */
    getParameterPath: (environment, category, name) => {
        return `/trinity/${environment}/${category}/${name}`;
    },
    /**
     * Get all parameter paths for an environment
     */
    getAllParameterPaths: (environment) => ({
        // External APIs
        tmdbApiKey: `/trinity/${environment}/external/tmdb-api-key`,
        // Authentication
        cognitoUserPoolId: `/trinity/${environment}/auth/cognito-user-pool-id`,
        cognitoClientId: `/trinity/${environment}/auth/cognito-client-id`,
        googleWebClientId: `/trinity/${environment}/auth/google-web-client-id`,
        googleClientSecret: `/trinity/${environment}/auth/google-client-secret`,
        googleAndroidClientId: `/trinity/${environment}/auth/google-android-client-id`,
        googleIosClientId: `/trinity/${environment}/auth/google-ios-client-id`,
        // APIs
        appsyncApiId: `/trinity/${environment}/api/appsync-api-id`,
        appsyncApiUrl: `/trinity/${environment}/api/appsync-api-url`,
        realtimeApiUrl: `/trinity/${environment}/api/realtime-api-url`,
        // Security
        jwtSecret: `/trinity/${environment}/security/jwt-secret`,
        // Configuration
        tableNames: `/trinity/${environment}/dynamodb/table-names`,
        lambdaFunctionNames: `/trinity/${environment}/lambda/function-names`,
        appConfig: `/trinity/${environment}/app/config`,
        featureFlags: `/trinity/${environment}/app/feature-flags`,
    }),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyYW1ldGVyLXN0b3JlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGFyYW1ldGVyLXN0b3JlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMseURBQTJDO0FBQzNDLDJDQUF1QztBQW9DdkM7O0dBRUc7QUFDSCxNQUFhLHFCQUFzQixTQUFRLHNCQUFTO0lBR2xELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsTUFBZ0M7UUFDeEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwrQkFBK0I7UUFDL0IsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUEwQixDQUFDO1FBRTdDLE1BQU0sZUFBZSxHQUFHLFlBQVksTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBRXpELG1DQUFtQztRQUNuQyxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN2RSxhQUFhLEVBQUUsR0FBRyxlQUFlLHdCQUF3QjtZQUN6RCxXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFZLElBQUksc0JBQXNCO1lBQy9ELElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLGFBQWE7WUFDckMsV0FBVyxFQUFFLHVDQUF1QztZQUNwRCxJQUFJLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxRQUFRO1NBQ2pDLENBQUMsQ0FBQztRQUVILDRCQUE0QjtRQUM1QixJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixHQUFHLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDckYsYUFBYSxFQUFFLEdBQUcsZUFBZSw0QkFBNEI7WUFDN0QsV0FBVyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLElBQUks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VHJpbml0eSBQYXJhbWV0ZXIgU3RvcmUgQ29uZmlndXJhdGlvblxyXG4gKiBNYW5hZ2VzIGVudmlyb25tZW50LXNwZWNpZmljIHBhcmFtZXRlcnMgd2l0aCBwcm9wZXIgaGllcmFyY2h5XHJcbiAqIEhpZXJhcmNoeTogL3RyaW5pdHkve2Vudn0vY2F0ZWdvcnkvcGFyYW1ldGVyXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgVHJpbml0eUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi9lbnZpcm9ubWVudHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQYXJhbWV0ZXJTdG9yZUNvbmZpZyB7XHJcbiAgLy8gRXh0ZXJuYWwgQVBJIEtleXMgKFNlY3VyZVN0cmluZylcclxuICB0bWRiQXBpS2V5OiBzc20uSVBhcmFtZXRlcjtcclxuICBcclxuICAvLyBBV1MgU2VydmljZSBDb25maWd1cmF0aW9uIChTdHJpbmcpXHJcbiAgY29nbml0b1VzZXJQb29sSWQ6IHNzbS5JUGFyYW1ldGVyO1xyXG4gIGNvZ25pdG9DbGllbnRJZDogc3NtLklQYXJhbWV0ZXI7XHJcbiAgYXBwc3luY0FwaUlkOiBzc20uSVBhcmFtZXRlcjtcclxuICBhcHBzeW5jQXBpVXJsOiBzc20uSVBhcmFtZXRlcjtcclxuICByZWFsdGltZUFwaVVybDogc3NtLklQYXJhbWV0ZXI7XHJcbiAgXHJcbiAgLy8gR29vZ2xlIE9BdXRoIENvbmZpZ3VyYXRpb24gKFNlY3VyZVN0cmluZylcclxuICBnb29nbGVXZWJDbGllbnRJZDogc3NtLklQYXJhbWV0ZXI7XHJcbiAgZ29vZ2xlQ2xpZW50U2VjcmV0OiBzc20uSVBhcmFtZXRlcjtcclxuICBnb29nbGVBbmRyb2lkQ2xpZW50SWQ6IHNzbS5JUGFyYW1ldGVyO1xyXG4gIGdvb2dsZUlvc0NsaWVudElkOiBzc20uSVBhcmFtZXRlcjtcclxuICBcclxuICAvLyBTZWN1cml0eSBDb25maWd1cmF0aW9uIChTZWN1cmVTdHJpbmcpXHJcbiAgand0U2VjcmV0OiBzc20uSVBhcmFtZXRlcjtcclxuICBcclxuICAvLyBEeW5hbW9EQiBUYWJsZSBOYW1lcyAoSlNPTiBTdHJpbmcpXHJcbiAgdGFibGVOYW1lczogc3NtLklQYXJhbWV0ZXI7XHJcbiAgXHJcbiAgLy8gTGFtYmRhIEZ1bmN0aW9uIE5hbWVzIChKU09OIFN0cmluZylcclxuICBsYW1iZGFGdW5jdGlvbk5hbWVzOiBzc20uSVBhcmFtZXRlcjtcclxuICBcclxuICAvLyBBcHBsaWNhdGlvbiBDb25maWd1cmF0aW9uIChKU09OIFN0cmluZylcclxuICBhcHBDb25maWc6IHNzbS5JUGFyYW1ldGVyO1xyXG4gIFxyXG4gIC8vIEZlYXR1cmUgRmxhZ3MgKEpTT04gU3RyaW5nKVxyXG4gIGZlYXR1cmVGbGFnczogc3NtLklQYXJhbWV0ZXI7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgb3IgaW1wb3J0IFBhcmFtZXRlciBTdG9yZSBwYXJhbWV0ZXJzIGZvciBUcmluaXR5XHJcbiAqL1xyXG5leHBvcnQgY2xhc3MgVHJpbml0eVBhcmFtZXRlclN0b3JlIGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgcGFyYW1ldGVyczogUGFyYW1ldGVyU3RvcmVDb25maWc7XHJcbiAgXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgY29uZmlnOiBUcmluaXR5RW52aXJvbm1lbnRDb25maWcpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCk7XHJcbiAgICBcclxuICAgIC8vIEluaXRpYWxpemUgcGFyYW1ldGVycyBvYmplY3RcclxuICAgIHRoaXMucGFyYW1ldGVycyA9IHt9IGFzIFBhcmFtZXRlclN0b3JlQ29uZmlnO1xyXG4gICAgXHJcbiAgICBjb25zdCBwYXJhbWV0ZXJQcmVmaXggPSBgL3RyaW5pdHkvJHtjb25maWcuZW52aXJvbm1lbnR9YDtcclxuICAgIFxyXG4gICAgLy8gRXh0ZXJuYWwgQVBJIEtleXMgKFNlY3VyZVN0cmluZylcclxuICAgIHRoaXMucGFyYW1ldGVycy50bWRiQXBpS2V5ID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ1RtZGJBcGlLZXknLCB7XHJcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAke3BhcmFtZXRlclByZWZpeH0vZXh0ZXJuYWwvdG1kYi1hcGkta2V5YCxcclxuICAgICAgc3RyaW5nVmFsdWU6IHByb2Nlc3MuZW52LlRNREJfQVBJX0tFWSB8fCAncGxhY2Vob2xkZXItdG1kYi1rZXknLFxyXG4gICAgICB0eXBlOiBzc20uUGFyYW1ldGVyVHlwZS5TRUNVUkVfU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1RNREIgQVBJIGtleSBmb3IgbW92aWUgZGF0YSByZXRyaWV2YWwnLFxyXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBBV1MgU2VydmljZSBDb25maWd1cmF0aW9uXHJcbiAgICB0aGlzLnBhcmFtZXRlcnMuY29nbml0b1VzZXJQb29sSWQgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQ29nbml0b1VzZXJQb29sSWQnLCB7XHJcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9jb2duaXRvLXVzZXItcG9vbC1pZGAsXHJcbiAgICAgIHN0cmluZ1ZhbHVlOiBwcm9jZXNzLmVudi5DT0dOSVRPX1VTRVJfUE9PTF9JRCB8fCAncGxhY2Vob2xkZXItdXNlci1wb29sLWlkJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCBmb3IgYXV0aGVudGljYXRpb24nLFxyXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICB0aGlzLnBhcmFtZXRlcnMuY29nbml0b0NsaWVudElkID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0NvZ25pdG9DbGllbnRJZCcsIHtcclxuICAgICAgcGFyYW1ldGVyTmFtZTogYCR7cGFyYW1ldGVyUHJlZml4fS9hdXRoL2NvZ25pdG8tY2xpZW50LWlkYCxcclxuICAgICAgc3RyaW5nVmFsdWU6IHByb2Nlc3MuZW52LkNPR05JVE9fQ0xJRU5UX0lEIHx8ICdwbGFjZWhvbGRlci1jbGllbnQtaWQnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXHJcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHRoaXMucGFyYW1ldGVycy5hcHBzeW5jQXBpSWQgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQXBwU3luY0FwaUlkJywge1xyXG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgJHtwYXJhbWV0ZXJQcmVmaXh9L2FwaS9hcHBzeW5jLWFwaS1pZGAsXHJcbiAgICAgIHN0cmluZ1ZhbHVlOiBwcm9jZXNzLmVudi5HUkFQSFFMX0FQSV9JRCB8fCAncGxhY2Vob2xkZXItYXBpLWlkJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdBcHBTeW5jIEdyYXBoUUwgQVBJIElEJyxcclxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJhbWV0ZXJzLmFwcHN5bmNBcGlVcmwgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQXBwU3luY0FwaVVybCcsIHtcclxuICAgICAgcGFyYW1ldGVyTmFtZTogYCR7cGFyYW1ldGVyUHJlZml4fS9hcGkvYXBwc3luYy1hcGktdXJsYCxcclxuICAgICAgc3RyaW5nVmFsdWU6IHByb2Nlc3MuZW52LkdSQVBIUUxfQVBJX1VSTCB8fCAnaHR0cHM6Ly9wbGFjZWhvbGRlci5hcHBzeW5jLWFwaS5ldS13ZXN0LTEuYW1hem9uYXdzLmNvbS9ncmFwaHFsJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdBcHBTeW5jIEdyYXBoUUwgQVBJIFVSTCcsXHJcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHRoaXMucGFyYW1ldGVycy5yZWFsdGltZUFwaVVybCA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdSZWFsdGltZUFwaVVybCcsIHtcclxuICAgICAgcGFyYW1ldGVyTmFtZTogYCR7cGFyYW1ldGVyUHJlZml4fS9hcGkvcmVhbHRpbWUtYXBpLXVybGAsXHJcbiAgICAgIHN0cmluZ1ZhbHVlOiBwcm9jZXNzLmVudi5HUkFQSFFMX1JFQUxUSU1FX1VSTCB8fCAnd3NzOi8vcGxhY2Vob2xkZXIuYXBwc3luYy1yZWFsdGltZS1hcGkuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb20vZ3JhcGhxbCcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwU3luYyBSZWFsLXRpbWUgQVBJIFVSTCBmb3Igc3Vic2NyaXB0aW9ucycsXHJcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIC8vIEdvb2dsZSBPQXV0aCBDb25maWd1cmF0aW9uIChTZWN1cmVTdHJpbmcpXHJcbiAgICB0aGlzLnBhcmFtZXRlcnMuZ29vZ2xlV2ViQ2xpZW50SWQgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnR29vZ2xlV2ViQ2xpZW50SWQnLCB7XHJcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9nb29nbGUtd2ViLWNsaWVudC1pZGAsXHJcbiAgICAgIHN0cmluZ1ZhbHVlOiBwcm9jZXNzLmVudi5HT09HTEVfV0VCX0NMSUVOVF9JRCB8fCAncGxhY2Vob2xkZXItZ29vZ2xlLXdlYi1jbGllbnQtaWQnLFxyXG4gICAgICB0eXBlOiBzc20uUGFyYW1ldGVyVHlwZS5TRUNVUkVfU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBXZWIgQ2xpZW50IElEJyxcclxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJhbWV0ZXJzLmdvb2dsZUNsaWVudFNlY3JldCA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdHb29nbGVDbGllbnRTZWNyZXQnLCB7XHJcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9nb29nbGUtY2xpZW50LXNlY3JldGAsXHJcbiAgICAgIHN0cmluZ1ZhbHVlOiBwcm9jZXNzLmVudi5HT09HTEVfQ0xJRU5UX1NFQ1JFVCB8fCAncGxhY2Vob2xkZXItZ29vZ2xlLWNsaWVudC1zZWNyZXQnLFxyXG4gICAgICB0eXBlOiBzc20uUGFyYW1ldGVyVHlwZS5TRUNVUkVfU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBDbGllbnQgU2VjcmV0JyxcclxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJhbWV0ZXJzLmdvb2dsZUFuZHJvaWRDbGllbnRJZCA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdHb29nbGVBbmRyb2lkQ2xpZW50SWQnLCB7XHJcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAke3BhcmFtZXRlclByZWZpeH0vYXV0aC9nb29nbGUtYW5kcm9pZC1jbGllbnQtaWRgLFxyXG4gICAgICBzdHJpbmdWYWx1ZTogcHJvY2Vzcy5lbnYuR09PR0xFX0FORFJPSURfQ0xJRU5UX0lEIHx8ICdwbGFjZWhvbGRlci1nb29nbGUtYW5kcm9pZC1jbGllbnQtaWQnLFxyXG4gICAgICB0eXBlOiBzc20uUGFyYW1ldGVyVHlwZS5TRUNVUkVfU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBBbmRyb2lkIENsaWVudCBJRCcsXHJcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHRoaXMucGFyYW1ldGVycy5nb29nbGVJb3NDbGllbnRJZCA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdHb29nbGVJb3NDbGllbnRJZCcsIHtcclxuICAgICAgcGFyYW1ldGVyTmFtZTogYCR7cGFyYW1ldGVyUHJlZml4fS9hdXRoL2dvb2dsZS1pb3MtY2xpZW50LWlkYCxcclxuICAgICAgc3RyaW5nVmFsdWU6IHByb2Nlc3MuZW52LkdPT0dMRV9JT1NfQ0xJRU5UX0lEIHx8ICdwbGFjZWhvbGRlci1nb29nbGUtaW9zLWNsaWVudC1pZCcsXHJcbiAgICAgIHR5cGU6IHNzbS5QYXJhbWV0ZXJUeXBlLlNFQ1VSRV9TVFJJTkcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnR29vZ2xlIE9BdXRoIGlPUyBDbGllbnQgSUQnLFxyXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBTZWN1cml0eSBDb25maWd1cmF0aW9uIChTZWN1cmVTdHJpbmcpXHJcbiAgICB0aGlzLnBhcmFtZXRlcnMuand0U2VjcmV0ID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0p3dFNlY3JldCcsIHtcclxuICAgICAgcGFyYW1ldGVyTmFtZTogYCR7cGFyYW1ldGVyUHJlZml4fS9zZWN1cml0eS9qd3Qtc2VjcmV0YCxcclxuICAgICAgc3RyaW5nVmFsdWU6IHByb2Nlc3MuZW52LkpXVF9TRUNSRVQgfHwgJ3BsYWNlaG9sZGVyLWp3dC1zZWNyZXQta2V5JyxcclxuICAgICAgdHlwZTogc3NtLlBhcmFtZXRlclR5cGUuU0VDVVJFX1NUUklORyxcclxuICAgICAgZGVzY3JpcHRpb246ICdKV1Qgc2VjcmV0IGtleSBmb3IgdG9rZW4gc2lnbmluZycsXHJcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIC8vIER5bmFtb0RCIFRhYmxlIE5hbWVzIChKU09OIFN0cmluZylcclxuICAgIGNvbnN0IHRhYmxlTmFtZXMgPSB7XHJcbiAgICAgIHVzZXJzOiBwcm9jZXNzLmVudi5VU0VSU19UQUJMRSB8fCAndHJpbml0eS11c2Vycy1kZXYnLFxyXG4gICAgICByb29tczogcHJvY2Vzcy5lbnYuUk9PTVNfVEFCTEUgfHwgJ3RyaW5pdHktcm9vbXMtZGV2LXYyJyxcclxuICAgICAgcm9vbU1lbWJlcnM6IHByb2Nlc3MuZW52LlJPT01fTUVNQkVSU19UQUJMRSB8fCAndHJpbml0eS1yb29tLW1lbWJlcnMtZGV2JyxcclxuICAgICAgcm9vbUludml0ZXM6IHByb2Nlc3MuZW52LlJPT01fSU5WSVRFU19UQUJMRSB8fCAndHJpbml0eS1yb29tLWludml0ZXMtZGV2LXYyJyxcclxuICAgICAgdm90ZXM6IHByb2Nlc3MuZW52LlZPVEVTX1RBQkxFIHx8ICd0cmluaXR5LXZvdGVzLWRldicsXHJcbiAgICAgIG1vdmllc0NhY2hlOiBwcm9jZXNzLmVudi5NT1ZJRVNfQ0FDSEVfVEFCTEUgfHwgJ3RyaW5pdHktbW92aWVzLWNhY2hlLWRldicsXHJcbiAgICAgIHJvb21NYXRjaGVzOiAndHJpbml0eS1yb29tLW1hdGNoZXMtZGV2JyxcclxuICAgICAgY29ubmVjdGlvbnM6ICd0cmluaXR5LWNvbm5lY3Rpb25zLWRldicsXHJcbiAgICAgIGNoYXRTZXNzaW9uczogJ3RyaW5pdHktY2hhdC1zZXNzaW9ucy1kZXYnLFxyXG4gICAgICByb29tTW92aWVDYWNoZTogJ3RyaW5pdHktcm9vbS1tb3ZpZS1jYWNoZS1kZXYnLFxyXG4gICAgICByb29tQ2FjaGVNZXRhZGF0YTogJ3RyaW5pdHktcm9vbS1jYWNoZS1tZXRhZGF0YS1kZXYnLFxyXG4gICAgICBtYXRjaG1ha2luZzogJ3RyaW5pdHktbWF0Y2htYWtpbmctZGV2JyxcclxuICAgICAgZmlsdGVyQ2FjaGU6ICd0cmluaXR5LWZpbHRlci1jYWNoZScsXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB0aGlzLnBhcmFtZXRlcnMudGFibGVOYW1lcyA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdUYWJsZU5hbWVzJywge1xyXG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgJHtwYXJhbWV0ZXJQcmVmaXh9L2R5bmFtb2RiL3RhYmxlLW5hbWVzYCxcclxuICAgICAgc3RyaW5nVmFsdWU6IEpTT04uc3RyaW5naWZ5KHRhYmxlTmFtZXMpLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIHRhYmxlIG5hbWVzIGNvbmZpZ3VyYXRpb24nLFxyXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBMYW1iZGEgRnVuY3Rpb24gTmFtZXMgKEpTT04gU3RyaW5nKVxyXG4gICAgY29uc3QgbGFtYmRhRnVuY3Rpb25OYW1lcyA9IHtcclxuICAgICAgYXV0aDogcHJvY2Vzcy5lbnYuQVVUSF9IQU5ETEVSX05BTUUgfHwgJ3RyaW5pdHktYXV0aC1kZXYnLFxyXG4gICAgICByb29tOiBwcm9jZXNzLmVudi5ST09NX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS1yb29tLWRldicsXHJcbiAgICAgIHZvdGU6IHByb2Nlc3MuZW52LlZPVEVfSEFORExFUl9OQU1FIHx8ICd0cmluaXR5LXZvdGUtZGV2JyxcclxuICAgICAgbW92aWU6IHByb2Nlc3MuZW52Lk1PVklFX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS1tb3ZpZS1kZXYnLFxyXG4gICAgICBjYWNoZTogcHJvY2Vzcy5lbnYuQ0FDSEVfSEFORExFUl9OQU1FIHx8ICd0cmluaXR5LWNhY2hlLWRldicsXHJcbiAgICAgIHJlYWx0aW1lOiBwcm9jZXNzLmVudi5SRUFMVElNRV9IQU5ETEVSX05BTUUgfHwgJ3RyaW5pdHktcmVhbHRpbWUtZGV2JyxcclxuICAgICAgbWF0Y2htYWtlcjogcHJvY2Vzcy5lbnYuTUFUQ0hNQUtFUl9IQU5ETEVSX05BTUUgfHwgJ3RyaW5pdHktdm90ZS1jb25zZW5zdXMtZGV2JywgLy8gTm90ZTogZGVwbG95ZWQgbmFtZVxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJhbWV0ZXJzLmxhbWJkYUZ1bmN0aW9uTmFtZXMgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnTGFtYmRhRnVuY3Rpb25OYW1lcycsIHtcclxuICAgICAgcGFyYW1ldGVyTmFtZTogYCR7cGFyYW1ldGVyUHJlZml4fS9sYW1iZGEvZnVuY3Rpb24tbmFtZXNgLFxyXG4gICAgICBzdHJpbmdWYWx1ZTogSlNPTi5zdHJpbmdpZnkobGFtYmRhRnVuY3Rpb25OYW1lcyksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnTGFtYmRhIGZ1bmN0aW9uIG5hbWVzIGNvbmZpZ3VyYXRpb24nLFxyXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBBcHBsaWNhdGlvbiBDb25maWd1cmF0aW9uIChKU09OIFN0cmluZylcclxuICAgIGNvbnN0IGFwcENvbmZpZyA9IHtcclxuICAgICAgY2FjaGU6IHtcclxuICAgICAgICB0dGxEYXlzOiA3LFxyXG4gICAgICAgIGJhdGNoU2l6ZTogMzAsXHJcbiAgICAgICAgbWF4QmF0Y2hlczogMTAsXHJcbiAgICAgICAgbW92aWVDYWNoZVNpemU6IDUwLFxyXG4gICAgICB9LFxyXG4gICAgICB2b3Rpbmc6IHtcclxuICAgICAgICBtYXhSb29tQ2FwYWNpdHk6IHBhcnNlSW50KHByb2Nlc3MuZW52Lk1BWF9ST09NX0NBUEFDSVRZIHx8ICcxMCcpLFxyXG4gICAgICAgIGRlZmF1bHRSb29tQ2FwYWNpdHk6IDIsXHJcbiAgICAgIH0sXHJcbiAgICAgIG1vdmllczoge1xyXG4gICAgICAgIGNhY2hlU2l6ZTogNTAsXHJcbiAgICAgICAgbWF4R2VucmVzOiAyLFxyXG4gICAgICB9LFxyXG4gICAgICBwZXJmb3JtYW5jZToge1xyXG4gICAgICAgIGxhbWJkYU1lbW9yeVNpemU6IHBhcnNlSW50KHByb2Nlc3MuZW52LkxBTUJEQV9NRU1PUllfU0laRSB8fCAnNTEyJyksXHJcbiAgICAgICAgbGFtYmRhVGltZW91dFNlY29uZHM6IHBhcnNlSW50KHByb2Nlc3MuZW52LkxBTUJEQV9USU1FT1VUX1NFQ09ORFMgfHwgJzMwJyksXHJcbiAgICAgICAgY2lyY3VpdEJyZWFrZXJGYWlsdXJlVGhyZXNob2xkOiBwYXJzZUludChwcm9jZXNzLmVudi5DSVJDVUlUX0JSRUFLRVJfRkFJTFVSRV9USFJFU0hPTEQgfHwgJzUnKSxcclxuICAgICAgICBjaXJjdWl0QnJlYWtlclRpbWVvdXRNczogcGFyc2VJbnQocHJvY2Vzcy5lbnYuQ0lSQ1VJVF9CUkVBS0VSX1RJTUVPVVRfTVMgfHwgJzYwMDAwJyksXHJcbiAgICAgICAgY2lyY3VpdEJyZWFrZXJSZXNldFRpbWVvdXRNczogcGFyc2VJbnQocHJvY2Vzcy5lbnYuQ0lSQ1VJVF9CUkVBS0VSX1JFU0VUX1RJTUVPVVRfTVMgfHwgJzMwMDAwJyksXHJcbiAgICAgIH0sXHJcbiAgICAgIG1vbml0b3Jpbmc6IHtcclxuICAgICAgICBsb2dMZXZlbDogcHJvY2Vzcy5lbnYuTE9HX0xFVkVMIHx8ICdpbmZvJyxcclxuICAgICAgICBlbmFibGVNZXRyaWNzOiBwcm9jZXNzLmVudi5FTkFCTEVfTUVUUklDUyA9PT0gJ3RydWUnLFxyXG4gICAgICAgIGVuYWJsZVhSYXlUcmFjaW5nOiBwcm9jZXNzLmVudi5FTkFCTEVfWFJBWV9UUkFDSU5HID09PSAndHJ1ZScsXHJcbiAgICAgICAgdmVyYm9zZUxvZ2dpbmc6IHByb2Nlc3MuZW52LlZFUkJPU0VfTE9HR0lORyA9PT0gJ3RydWUnLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdGhpcy5wYXJhbWV0ZXJzLmFwcENvbmZpZyA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsICdBcHBDb25maWcnLCB7XHJcbiAgICAgIHBhcmFtZXRlck5hbWU6IGAke3BhcmFtZXRlclByZWZpeH0vYXBwL2NvbmZpZ2AsXHJcbiAgICAgIHN0cmluZ1ZhbHVlOiBKU09OLnN0cmluZ2lmeShhcHBDb25maWcpLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FwcGxpY2F0aW9uIGNvbmZpZ3VyYXRpb24gc2V0dGluZ3MnLFxyXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBGZWF0dXJlIEZsYWdzIChKU09OIFN0cmluZylcclxuICAgIGNvbnN0IGZlYXR1cmVGbGFncyA9IHtcclxuICAgICAgZW5hYmxlUmVhbFRpbWVOb3RpZmljYXRpb25zOiBwcm9jZXNzLmVudi5FTkFCTEVfUkVBTF9USU1FX05PVElGSUNBVElPTlMgPT09ICd0cnVlJyxcclxuICAgICAgZW5hYmxlQ2lyY3VpdEJyZWFrZXI6IHByb2Nlc3MuZW52LkVOQUJMRV9DSVJDVUlUX0JSRUFLRVIgPT09ICd0cnVlJyxcclxuICAgICAgZW5hYmxlTWV0cmljc0xvZ2dpbmc6IHByb2Nlc3MuZW52LkVOQUJMRV9NRVRSSUNTX0xPR0dJTkcgPT09ICd0cnVlJyxcclxuICAgICAgZW5hYmxlR29vZ2xlU2lnbmluOiBwcm9jZXNzLmVudi5FTkFCTEVfR09PR0xFX1NJR05JTiA9PT0gJ3RydWUnLFxyXG4gICAgICBkZWJ1Z01vZGU6IHByb2Nlc3MuZW52LkRFQlVHX01PREUgPT09ICd0cnVlJyxcclxuICAgIH07XHJcbiAgICBcclxuICAgIHRoaXMucGFyYW1ldGVycy5mZWF0dXJlRmxhZ3MgPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnRmVhdHVyZUZsYWdzJywge1xyXG4gICAgICBwYXJhbWV0ZXJOYW1lOiBgJHtwYXJhbWV0ZXJQcmVmaXh9L2FwcC9mZWF0dXJlLWZsYWdzYCxcclxuICAgICAgc3RyaW5nVmFsdWU6IEpTT04uc3RyaW5naWZ5KGZlYXR1cmVGbGFncyksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRmVhdHVyZSBmbGFncyBjb25maWd1cmF0aW9uJyxcclxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXHJcbiAgICB9KTtcclxuICAgIFxyXG4gICAgLy8gQWRkIHRhZ3MgdG8gYWxsIHBhcmFtZXRlcnNcclxuICAgIGNvbnN0IGFsbFBhcmFtZXRlcnMgPSBPYmplY3QudmFsdWVzKHRoaXMucGFyYW1ldGVycyk7XHJcbiAgICBhbGxQYXJhbWV0ZXJzLmZvckVhY2gocGFyYW0gPT4ge1xyXG4gICAgICBjZGsuVGFncy5vZihwYXJhbSkuYWRkKCdQcm9qZWN0JywgJ1RyaW5pdHknKTtcclxuICAgICAgY2RrLlRhZ3Mub2YocGFyYW0pLmFkZCgnRW52aXJvbm1lbnQnLCBjb25maWcuZW52aXJvbm1lbnQpO1xyXG4gICAgICBjZGsuVGFncy5vZihwYXJhbSkuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XHJcbiAgICB9KTtcclxuICB9XHJcbiAgXHJcbiAgLyoqXHJcbiAgICogR3JhbnQgcmVhZCBhY2Nlc3MgdG8gcGFyYW1ldGVycyBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xyXG4gICAqL1xyXG4gIHB1YmxpYyBncmFudFJlYWRBY2Nlc3MoZ3JhbnRlZTogY2RrLmF3c19pYW0uSUdyYW50YWJsZSk6IHZvaWQge1xyXG4gICAgT2JqZWN0LnZhbHVlcyh0aGlzLnBhcmFtZXRlcnMpLmZvckVhY2gocGFyYW1ldGVyID0+IHtcclxuICAgICAgcGFyYW1ldGVyLmdyYW50UmVhZChncmFudGVlKTtcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFV0aWxpdHkgZnVuY3Rpb25zIGZvciBhY2Nlc3NpbmcgcGFyYW1ldGVycyBpbiBMYW1iZGEgZnVuY3Rpb25zXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgUGFyYW1ldGVyU3RvcmVVdGlscyA9IHtcclxuICAvKipcclxuICAgKiBHZXQgcGFyYW1ldGVyIHBhdGggZm9yIGVudmlyb25tZW50XHJcbiAgICovXHJcbiAgZ2V0UGFyYW1ldGVyUGF0aDogKGVudmlyb25tZW50OiBzdHJpbmcsIGNhdGVnb3J5OiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IHN0cmluZyA9PiB7XHJcbiAgICByZXR1cm4gYC90cmluaXR5LyR7ZW52aXJvbm1lbnR9LyR7Y2F0ZWdvcnl9LyR7bmFtZX1gO1xyXG4gIH0sXHJcbiAgXHJcbiAgLyoqXHJcbiAgICogR2V0IGFsbCBwYXJhbWV0ZXIgcGF0aHMgZm9yIGFuIGVudmlyb25tZW50XHJcbiAgICovXHJcbiAgZ2V0QWxsUGFyYW1ldGVyUGF0aHM6IChlbnZpcm9ubWVudDogc3RyaW5nKSA9PiAoe1xyXG4gICAgLy8gRXh0ZXJuYWwgQVBJc1xyXG4gICAgdG1kYkFwaUtleTogYC90cmluaXR5LyR7ZW52aXJvbm1lbnR9L2V4dGVybmFsL3RtZGItYXBpLWtleWAsXHJcbiAgICBcclxuICAgIC8vIEF1dGhlbnRpY2F0aW9uXHJcbiAgICBjb2duaXRvVXNlclBvb2xJZDogYC90cmluaXR5LyR7ZW52aXJvbm1lbnR9L2F1dGgvY29nbml0by11c2VyLXBvb2wtaWRgLFxyXG4gICAgY29nbml0b0NsaWVudElkOiBgL3RyaW5pdHkvJHtlbnZpcm9ubWVudH0vYXV0aC9jb2duaXRvLWNsaWVudC1pZGAsXHJcbiAgICBnb29nbGVXZWJDbGllbnRJZDogYC90cmluaXR5LyR7ZW52aXJvbm1lbnR9L2F1dGgvZ29vZ2xlLXdlYi1jbGllbnQtaWRgLFxyXG4gICAgZ29vZ2xlQ2xpZW50U2VjcmV0OiBgL3RyaW5pdHkvJHtlbnZpcm9ubWVudH0vYXV0aC9nb29nbGUtY2xpZW50LXNlY3JldGAsXHJcbiAgICBnb29nbGVBbmRyb2lkQ2xpZW50SWQ6IGAvdHJpbml0eS8ke2Vudmlyb25tZW50fS9hdXRoL2dvb2dsZS1hbmRyb2lkLWNsaWVudC1pZGAsXHJcbiAgICBnb29nbGVJb3NDbGllbnRJZDogYC90cmluaXR5LyR7ZW52aXJvbm1lbnR9L2F1dGgvZ29vZ2xlLWlvcy1jbGllbnQtaWRgLFxyXG4gICAgXHJcbiAgICAvLyBBUElzXHJcbiAgICBhcHBzeW5jQXBpSWQ6IGAvdHJpbml0eS8ke2Vudmlyb25tZW50fS9hcGkvYXBwc3luYy1hcGktaWRgLFxyXG4gICAgYXBwc3luY0FwaVVybDogYC90cmluaXR5LyR7ZW52aXJvbm1lbnR9L2FwaS9hcHBzeW5jLWFwaS11cmxgLFxyXG4gICAgcmVhbHRpbWVBcGlVcmw6IGAvdHJpbml0eS8ke2Vudmlyb25tZW50fS9hcGkvcmVhbHRpbWUtYXBpLXVybGAsXHJcbiAgICBcclxuICAgIC8vIFNlY3VyaXR5XHJcbiAgICBqd3RTZWNyZXQ6IGAvdHJpbml0eS8ke2Vudmlyb25tZW50fS9zZWN1cml0eS9qd3Qtc2VjcmV0YCxcclxuICAgIFxyXG4gICAgLy8gQ29uZmlndXJhdGlvblxyXG4gICAgdGFibGVOYW1lczogYC90cmluaXR5LyR7ZW52aXJvbm1lbnR9L2R5bmFtb2RiL3RhYmxlLW5hbWVzYCxcclxuICAgIGxhbWJkYUZ1bmN0aW9uTmFtZXM6IGAvdHJpbml0eS8ke2Vudmlyb25tZW50fS9sYW1iZGEvZnVuY3Rpb24tbmFtZXNgLFxyXG4gICAgYXBwQ29uZmlnOiBgL3RyaW5pdHkvJHtlbnZpcm9ubWVudH0vYXBwL2NvbmZpZ2AsXHJcbiAgICBmZWF0dXJlRmxhZ3M6IGAvdHJpbml0eS8ke2Vudmlyb25tZW50fS9hcHAvZmVhdHVyZS1mbGFnc2AsXHJcbiAgfSksXHJcbn07Il19