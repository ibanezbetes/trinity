#!/usr/bin/env node
"use strict";
/**
 * Trinity SSM Parameter Store Hydration Script
 * Reads .env file and creates/updates AWS Systems Manager parameters
 * Follows strict naming pattern: /trinity/{env}/{category}/{param}
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
exports.SSMHydrator = void 0;
const client_ssm_1 = require("@aws-sdk/client-ssm");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SSMHydrator {
    constructor() {
        this.envVars = {};
        // Parameter mappings following /trinity/{env}/{category}/{param} pattern
        this.parameterMappings = [
            // External API Keys (SecureString)
            {
                envVar: 'TMDB_API_KEY',
                ssmPath: '/trinity/{env}/external/tmdb-api-key',
                type: client_ssm_1.ParameterType.SECURE_STRING,
                description: 'TMDB API key for movie data retrieval'
            },
            // Authentication (String)
            {
                envVar: 'COGNITO_USER_POOL_ID',
                ssmPath: '/trinity/{env}/auth/cognito-user-pool-id',
                type: client_ssm_1.ParameterType.STRING,
                description: 'Cognito User Pool ID for authentication'
            },
            {
                envVar: 'COGNITO_CLIENT_ID',
                ssmPath: '/trinity/{env}/auth/cognito-client-id',
                type: client_ssm_1.ParameterType.STRING,
                description: 'Cognito User Pool Client ID'
            },
            // Google OAuth (SecureString)
            {
                envVar: 'GOOGLE_WEB_CLIENT_ID',
                ssmPath: '/trinity/{env}/auth/google-web-client-id',
                type: client_ssm_1.ParameterType.SECURE_STRING,
                description: 'Google OAuth Web Client ID'
            },
            {
                envVar: 'GOOGLE_CLIENT_SECRET',
                ssmPath: '/trinity/{env}/auth/google-client-secret',
                type: client_ssm_1.ParameterType.SECURE_STRING,
                description: 'Google OAuth Client Secret'
            },
            {
                envVar: 'GOOGLE_ANDROID_CLIENT_ID',
                ssmPath: '/trinity/{env}/auth/google-android-client-id',
                type: client_ssm_1.ParameterType.SECURE_STRING,
                description: 'Google OAuth Android Client ID'
            },
            {
                envVar: 'GOOGLE_IOS_CLIENT_ID',
                ssmPath: '/trinity/{env}/auth/google-ios-client-id',
                type: client_ssm_1.ParameterType.SECURE_STRING,
                description: 'Google OAuth iOS Client ID'
            },
            // AppSync APIs (String)
            {
                envVar: 'GRAPHQL_API_ID',
                ssmPath: '/trinity/{env}/api/appsync-api-id',
                type: client_ssm_1.ParameterType.STRING,
                description: 'AppSync GraphQL API ID'
            },
            {
                envVar: 'GRAPHQL_API_URL',
                ssmPath: '/trinity/{env}/api/appsync-api-url',
                type: client_ssm_1.ParameterType.STRING,
                description: 'AppSync GraphQL API URL'
            },
            {
                envVar: 'GRAPHQL_REALTIME_URL',
                ssmPath: '/trinity/{env}/api/realtime-api-url',
                type: client_ssm_1.ParameterType.STRING,
                description: 'AppSync Real-time API URL for subscriptions'
            },
            // Security (SecureString)
            {
                envVar: 'JWT_SECRET',
                ssmPath: '/trinity/{env}/security/jwt-secret',
                type: client_ssm_1.ParameterType.SECURE_STRING,
                description: 'JWT secret key for token signing'
            },
        ];
        this.environment = process.env.TRINITY_ENV || 'dev';
        this.ssmClient = new client_ssm_1.SSMClient({ region: process.env.AWS_REGION || 'eu-west-1' });
    }
    /**
     * Load environment variables from .env file
     */
    loadEnvFile() {
        const envPath = path.resolve(process.cwd(), '../../.env');
        if (!fs.existsSync(envPath)) {
            throw new Error(`❌ .env file not found at ${envPath}`);
        }
        console.log(`📋 Loading environment variables from ${envPath}`);
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            // Skip comments and empty lines
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').trim();
                this.envVars[key.trim()] = value;
            }
        }
        console.log(`✅ Loaded ${Object.keys(this.envVars).length} environment variables`);
    }
    /**
     * Create or update a single parameter in SSM
     */
    async putParameter(mapping, value) {
        const ssmPath = mapping.ssmPath.replace('{env}', this.environment);
        try {
            const command = new client_ssm_1.PutParameterCommand({
                Name: ssmPath,
                Value: value,
                Type: mapping.type,
                Description: mapping.description,
                Overwrite: true, // Allow updates
                Tier: 'Standard',
            });
            await this.ssmClient.send(command);
            const typeLabel = mapping.type === client_ssm_1.ParameterType.SECURE_STRING ? '🔒 SecureString' : '📝 String';
            console.log(`✅ ${typeLabel} ${ssmPath}`);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error(`❌ Failed to create parameter ${ssmPath}: ${err.message}`);
            throw error;
        }
    }
    /**
     * Create composite JSON parameters
     */
    async createCompositeParameters() {
        console.log('\n📦 Creating composite JSON parameters...');
        // DynamoDB Table Names
        const tableNames = {
            users: this.envVars.USERS_TABLE || 'trinity-users-dev',
            rooms: this.envVars.ROOMS_TABLE || 'trinity-rooms-dev-v2',
            roomMembers: this.envVars.ROOM_MEMBERS_TABLE || 'trinity-room-members-dev',
            roomInvites: this.envVars.ROOM_INVITES_TABLE || 'trinity-room-invites-dev-v2',
            votes: this.envVars.VOTES_TABLE || 'trinity-votes-dev',
            moviesCache: this.envVars.MOVIES_CACHE_TABLE || 'trinity-movies-cache-dev',
            roomMatches: 'trinity-room-matches-dev',
            connections: 'trinity-connections-dev',
            chatSessions: 'trinity-chat-sessions-dev',
            roomMovieCache: 'trinity-room-movie-cache-dev',
            roomCacheMetadata: 'trinity-room-cache-metadata-dev',
            matchmaking: 'trinity-matchmaking-dev',
            filterCache: 'trinity-filter-cache',
        };
        await this.putParameter({
            envVar: 'TABLE_NAMES',
            ssmPath: `/trinity/${this.environment}/dynamodb/table-names`,
            type: client_ssm_1.ParameterType.STRING,
            description: 'DynamoDB table names configuration'
        }, JSON.stringify(tableNames));
        // Lambda Function Names
        const lambdaFunctionNames = {
            auth: this.envVars.AUTH_HANDLER_NAME || 'trinity-auth-dev',
            room: this.envVars.ROOM_HANDLER_NAME || 'trinity-room-dev',
            vote: this.envVars.VOTE_HANDLER_NAME || 'trinity-vote-dev',
            movie: this.envVars.MOVIE_HANDLER_NAME || 'trinity-movie-dev',
            cache: this.envVars.CACHE_HANDLER_NAME || 'trinity-cache-dev',
            realtime: this.envVars.REALTIME_HANDLER_NAME || 'trinity-realtime-dev',
            matchmaker: this.envVars.MATCHMAKER_HANDLER_NAME || 'trinity-vote-consensus-dev',
        };
        await this.putParameter({
            envVar: 'LAMBDA_FUNCTION_NAMES',
            ssmPath: `/trinity/${this.environment}/lambda/function-names`,
            type: client_ssm_1.ParameterType.STRING,
            description: 'Lambda function names configuration'
        }, JSON.stringify(lambdaFunctionNames));
        // Application Configuration
        const appConfig = {
            cache: {
                ttlDays: parseInt(this.envVars.CACHE_TTL_DAYS || '7'),
                batchSize: parseInt(this.envVars.BATCH_SIZE || '30'),
                maxBatches: parseInt(this.envVars.MAX_BATCHES || '10'),
                movieCacheSize: 50,
            },
            voting: {
                maxRoomCapacity: parseInt(this.envVars.MAX_ROOM_CAPACITY || '10'),
                defaultRoomCapacity: 2,
            },
            movies: {
                cacheSize: 50,
                maxGenres: 2,
            },
            performance: {
                lambdaMemorySize: parseInt(this.envVars.LAMBDA_MEMORY_SIZE || '512'),
                lambdaTimeoutSeconds: parseInt(this.envVars.LAMBDA_TIMEOUT_SECONDS || '30'),
                circuitBreakerFailureThreshold: parseInt(this.envVars.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
                circuitBreakerTimeoutMs: parseInt(this.envVars.CIRCUIT_BREAKER_TIMEOUT_MS || '60000'),
                circuitBreakerResetTimeoutMs: parseInt(this.envVars.CIRCUIT_BREAKER_RESET_TIMEOUT_MS || '30000'),
            },
            monitoring: {
                logLevel: this.envVars.LOG_LEVEL || 'info',
                enableMetrics: this.envVars.ENABLE_METRICS === 'true',
                enableXRayTracing: this.envVars.ENABLE_XRAY_TRACING === 'true',
                verboseLogging: this.envVars.VERBOSE_LOGGING === 'true',
            },
        };
        await this.putParameter({
            envVar: 'APP_CONFIG',
            ssmPath: `/trinity/${this.environment}/app/config`,
            type: client_ssm_1.ParameterType.STRING,
            description: 'Application configuration settings'
        }, JSON.stringify(appConfig));
        // Feature Flags
        const featureFlags = {
            enableRealTimeNotifications: this.envVars.ENABLE_REAL_TIME_NOTIFICATIONS === 'true',
            enableCircuitBreaker: this.envVars.ENABLE_CIRCUIT_BREAKER === 'true',
            enableMetricsLogging: this.envVars.ENABLE_METRICS_LOGGING === 'true',
            enableGoogleSignin: this.envVars.ENABLE_GOOGLE_SIGNIN === 'true',
            debugMode: this.envVars.DEBUG_MODE === 'true',
        };
        await this.putParameter({
            envVar: 'FEATURE_FLAGS',
            ssmPath: `/trinity/${this.environment}/app/feature-flags`,
            type: client_ssm_1.ParameterType.STRING,
            description: 'Feature flags configuration'
        }, JSON.stringify(featureFlags));
    }
    /**
     * Hydrate all parameters from .env to SSM
     */
    async hydrate() {
        console.log('🚀 Trinity SSM Parameter Store Hydration');
        console.log(`Environment: ${this.environment}`);
        console.log(`Region: ${process.env.AWS_REGION || 'eu-west-1'}`);
        console.log('─'.repeat(60));
        try {
            // Load .env file
            this.loadEnvFile();
            console.log('\n🔑 Creating individual parameters...');
            // Process individual parameter mappings
            for (const mapping of this.parameterMappings) {
                const value = this.envVars[mapping.envVar];
                if (!value) {
                    console.warn(`⚠️ Environment variable ${mapping.envVar} not found, skipping...`);
                    continue;
                }
                await this.putParameter(mapping, value);
            }
            // Create composite JSON parameters
            await this.createCompositeParameters();
            console.log('\n✅ SSM Parameter Store hydration completed successfully!');
            console.log(`📊 Total parameters created: ${this.parameterMappings.length + 4} (individual + composite)`);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.error('\n❌ SSM hydration failed:', err.message);
            process.exit(1);
        }
    }
    /**
     * Validate that all critical parameters exist
     */
    async validate() {
        console.log('\n🔍 Validating critical parameters...');
        const criticalParams = [
            `/trinity/${this.environment}/external/tmdb-api-key`,
            `/trinity/${this.environment}/auth/cognito-user-pool-id`,
            `/trinity/${this.environment}/auth/cognito-client-id`,
            `/trinity/${this.environment}/api/appsync-api-url`,
            `/trinity/${this.environment}/api/realtime-api-url`,
        ];
        for (const paramPath of criticalParams) {
            try {
                const { GetParameterCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ssm')));
                const command = new GetParameterCommand({ Name: paramPath });
                await this.ssmClient.send(command);
                console.log(`✅ ${paramPath}`);
            }
            catch (error) {
                console.error(`❌ ${paramPath} - NOT FOUND`);
                throw new Error(`Critical parameter ${paramPath} not found`);
            }
        }
        console.log('✅ All critical parameters validated successfully!');
    }
}
exports.SSMHydrator = SSMHydrator;
// CLI execution
if (require.main === module) {
    const hydrator = new SSMHydrator();
    const command = process.argv[2];
    if (command === 'validate') {
        hydrator.validate().catch(error => {
            console.error('❌ Validation failed:', error);
            process.exit(1);
        });
    }
    else {
        hydrator.hydrate().then(() => {
            console.log('\n🎉 Run "npm run validate-ssm" to verify all parameters were created correctly.');
        }).catch(error => {
            console.error('❌ Hydration failed:', error);
            process.exit(1);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaHlkcmF0ZS1zc20uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJoeWRyYXRlLXNzbS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUNBOzs7O0dBSUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILG9EQUFvRjtBQUNwRix1Q0FBeUI7QUFDekIsMkNBQTZCO0FBUzdCLE1BQU0sV0FBVztJQW9GZjtRQWpGUSxZQUFPLEdBQTJCLEVBQUUsQ0FBQztRQUU3Qyx5RUFBeUU7UUFDakUsc0JBQWlCLEdBQXVCO1lBQzlDLG1DQUFtQztZQUNuQztnQkFDRSxNQUFNLEVBQUUsY0FBYztnQkFDdEIsT0FBTyxFQUFFLHNDQUFzQztnQkFDL0MsSUFBSSxFQUFFLDBCQUFhLENBQUMsYUFBYTtnQkFDakMsV0FBVyxFQUFFLHVDQUF1QzthQUNyRDtZQUVELDBCQUEwQjtZQUMxQjtnQkFDRSxNQUFNLEVBQUUsc0JBQXNCO2dCQUM5QixPQUFPLEVBQUUsMENBQTBDO2dCQUNuRCxJQUFJLEVBQUUsMEJBQWEsQ0FBQyxNQUFNO2dCQUMxQixXQUFXLEVBQUUseUNBQXlDO2FBQ3ZEO1lBQ0Q7Z0JBQ0UsTUFBTSxFQUFFLG1CQUFtQjtnQkFDM0IsT0FBTyxFQUFFLHVDQUF1QztnQkFDaEQsSUFBSSxFQUFFLDBCQUFhLENBQUMsTUFBTTtnQkFDMUIsV0FBVyxFQUFFLDZCQUE2QjthQUMzQztZQUVELDhCQUE4QjtZQUM5QjtnQkFDRSxNQUFNLEVBQUUsc0JBQXNCO2dCQUM5QixPQUFPLEVBQUUsMENBQTBDO2dCQUNuRCxJQUFJLEVBQUUsMEJBQWEsQ0FBQyxhQUFhO2dCQUNqQyxXQUFXLEVBQUUsNEJBQTRCO2FBQzFDO1lBQ0Q7Z0JBQ0UsTUFBTSxFQUFFLHNCQUFzQjtnQkFDOUIsT0FBTyxFQUFFLDBDQUEwQztnQkFDbkQsSUFBSSxFQUFFLDBCQUFhLENBQUMsYUFBYTtnQkFDakMsV0FBVyxFQUFFLDRCQUE0QjthQUMxQztZQUNEO2dCQUNFLE1B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LE9BQU8sS0FBSyxVQUFVLEVBQUUsQ0FBQztRQUMzQixRQUFRLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ2hDLE9BQU8sQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0MsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7U0FBTSxDQUFDO1FBQ04sUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDM0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrRkFBa0YsQ0FBQyxDQUFDO1FBQ2xHLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMscUJBQXFCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNsQixDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxyXG4vKipcclxuICogVHJpbml0eSBTU00gUGFyYW1ldGVyIFN0b3JlIEh5ZHJhdGlvbiBTY3JpcHRcclxuICogUmVhZHMgLmVudiBmaWxlIGFuZCBjcmVhdGVzL3VwZGF0ZXMgQVdTIFN5c3RlbXMgTWFuYWdlciBwYXJhbWV0ZXJzXHJcbiAqIEZvbGxvd3Mgc3RyaWN0IG5hbWluZyBwYXR0ZXJuOiAvdHJpbml0eS97ZW52fS97Y2F0ZWdvcnl9L3twYXJhbX1cclxuICovXHJcblxyXG5pbXBvcnQgeyBTU01DbGllbnQsIFB1dFBhcmFtZXRlckNvbW1hbmQsIFBhcmFtZXRlclR5cGUgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3NtJztcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuaW50ZXJmYWNlIFBhcmFtZXRlck1hcHBpbmcge1xyXG4gIGVudlZhcjogc3RyaW5nO1xyXG4gIHNzbVBhdGg6IHN0cmluZztcclxuICB0eXBlOiBQYXJhbWV0ZXJUeXBlO1xyXG4gIGRlc2NyaXB0aW9uOiBzdHJpbmc7XHJcbn1cclxuXHJcbmNsYXNzIFNTTUh5ZHJhdG9yIHtcclxuICBwcml2YXRlIHNzbUNsaWVudDogU1NNQ2xpZW50O1xyXG4gIHByaXZhdGUgZW52aXJvbm1lbnQ6IHN0cmluZztcclxuICBwcml2YXRlIGVudlZhcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcclxuXHJcbiAgLy8gUGFyYW1ldGVyIG1hcHBpbmdzIGZvbGxvd2luZyAvdHJpbml0eS97ZW52fS97Y2F0ZWdvcnl9L3twYXJhbX0gcGF0dGVyblxyXG4gIHByaXZhdGUgcGFyYW1ldGVyTWFwcGluZ3M6IFBhcmFtZXRlck1hcHBpbmdbXSA9IFtcclxuICAgIC8vIEV4dGVybmFsIEFQSSBLZXlzIChTZWN1cmVTdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgIGVudlZhcjogJ1RNREJfQVBJX0tFWScsXHJcbiAgICAgIHNzbVBhdGg6ICcvdHJpbml0eS97ZW52fS9leHRlcm5hbC90bWRiLWFwaS1rZXknLFxyXG4gICAgICB0eXBlOiBQYXJhbWV0ZXJUeXBlLlNFQ1VSRV9TVFJJTkcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVE1EQiBBUEkga2V5IGZvciBtb3ZpZSBkYXRhIHJldHJpZXZhbCdcclxuICAgIH0sXHJcblxyXG4gICAgLy8gQXV0aGVudGljYXRpb24gKFN0cmluZylcclxuICAgIHtcclxuICAgICAgZW52VmFyOiAnQ09HTklUT19VU0VSX1BPT0xfSUQnLFxyXG4gICAgICBzc21QYXRoOiAnL3RyaW5pdHkve2Vudn0vYXV0aC9jb2duaXRvLXVzZXItcG9vbC1pZCcsXHJcbiAgICAgIHR5cGU6IFBhcmFtZXRlclR5cGUuU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEIGZvciBhdXRoZW50aWNhdGlvbidcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgIGVudlZhcjogJ0NPR05JVE9fQ0xJRU5UX0lEJyxcclxuICAgICAgc3NtUGF0aDogJy90cmluaXR5L3tlbnZ9L2F1dGgvY29nbml0by1jbGllbnQtaWQnLFxyXG4gICAgICB0eXBlOiBQYXJhbWV0ZXJUeXBlLlNUUklORyxcclxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBDbGllbnQgSUQnXHJcbiAgICB9LFxyXG5cclxuICAgIC8vIEdvb2dsZSBPQXV0aCAoU2VjdXJlU3RyaW5nKVxyXG4gICAge1xyXG4gICAgICBlbnZWYXI6ICdHT09HTEVfV0VCX0NMSUVOVF9JRCcsXHJcbiAgICAgIHNzbVBhdGg6ICcvdHJpbml0eS97ZW52fS9hdXRoL2dvb2dsZS13ZWItY2xpZW50LWlkJyxcclxuICAgICAgdHlwZTogUGFyYW1ldGVyVHlwZS5TRUNVUkVfU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBXZWIgQ2xpZW50IElEJ1xyXG4gICAgfSxcclxuICAgIHtcclxuICAgICAgZW52VmFyOiAnR09PR0xFX0NMSUVOVF9TRUNSRVQnLFxyXG4gICAgICBzc21QYXRoOiAnL3RyaW5pdHkve2Vudn0vYXV0aC9nb29nbGUtY2xpZW50LXNlY3JldCcsXHJcbiAgICAgIHR5cGU6IFBhcmFtZXRlclR5cGUuU0VDVVJFX1NUUklORyxcclxuICAgICAgZGVzY3JpcHRpb246ICdHb29nbGUgT0F1dGggQ2xpZW50IFNlY3JldCdcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgIGVudlZhcjogJ0dPT0dMRV9BTkRST0lEX0NMSUVOVF9JRCcsXHJcbiAgICAgIHNzbVBhdGg6ICcvdHJpbml0eS97ZW52fS9hdXRoL2dvb2dsZS1hbmRyb2lkLWNsaWVudC1pZCcsXHJcbiAgICAgIHR5cGU6IFBhcmFtZXRlclR5cGUuU0VDVVJFX1NUUklORyxcclxuICAgICAgZGVzY3JpcHRpb246ICdHb29nbGUgT0F1dGggQW5kcm9pZCBDbGllbnQgSUQnXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBlbnZWYXI6ICdHT09HTEVfSU9TX0NMSUVOVF9JRCcsXHJcbiAgICAgIHNzbVBhdGg6ICcvdHJpbml0eS97ZW52fS9hdXRoL2dvb2dsZS1pb3MtY2xpZW50LWlkJyxcclxuICAgICAgdHlwZTogUGFyYW1ldGVyVHlwZS5TRUNVUkVfU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0dvb2dsZSBPQXV0aCBpT1MgQ2xpZW50IElEJ1xyXG4gICAgfSxcclxuXHJcbiAgICAvLyBBcHBTeW5jIEFQSXMgKFN0cmluZylcclxuICAgIHtcclxuICAgICAgZW52VmFyOiAnR1JBUEhRTF9BUElfSUQnLFxyXG4gICAgICBzc21QYXRoOiAnL3RyaW5pdHkve2Vudn0vYXBpL2FwcHN5bmMtYXBpLWlkJyxcclxuICAgICAgdHlwZTogUGFyYW1ldGVyVHlwZS5TVFJJTkcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwU3luYyBHcmFwaFFMIEFQSSBJRCdcclxuICAgIH0sXHJcbiAgICB7XHJcbiAgICAgIGVudlZhcjogJ0dSQVBIUUxfQVBJX1VSTCcsXHJcbiAgICAgIHNzbVBhdGg6ICcvdHJpbml0eS97ZW52fS9hcGkvYXBwc3luYy1hcGktdXJsJyxcclxuICAgICAgdHlwZTogUGFyYW1ldGVyVHlwZS5TVFJJTkcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwU3luYyBHcmFwaFFMIEFQSSBVUkwnXHJcbiAgICB9LFxyXG4gICAge1xyXG4gICAgICBlbnZWYXI6ICdHUkFQSFFMX1JFQUxUSU1FX1VSTCcsXHJcbiAgICAgIHNzbVBhdGg6ICcvdHJpbml0eS97ZW52fS9hcGkvcmVhbHRpbWUtYXBpLXVybCcsXHJcbiAgICAgIHR5cGU6IFBhcmFtZXRlclR5cGUuU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0FwcFN5bmMgUmVhbC10aW1lIEFQSSBVUkwgZm9yIHN1YnNjcmlwdGlvbnMnXHJcbiAgICB9LFxyXG5cclxuICAgIC8vIFNlY3VyaXR5IChTZWN1cmVTdHJpbmcpXHJcbiAgICB7XHJcbiAgICAgIGVudlZhcjogJ0pXVF9TRUNSRVQnLFxyXG4gICAgICBzc21QYXRoOiAnL3RyaW5pdHkve2Vudn0vc2VjdXJpdHkvand0LXNlY3JldCcsXHJcbiAgICAgIHR5cGU6IFBhcmFtZXRlclR5cGUuU0VDVVJFX1NUUklORyxcclxuICAgICAgZGVzY3JpcHRpb246ICdKV1Qgc2VjcmV0IGtleSBmb3IgdG9rZW4gc2lnbmluZydcclxuICAgIH0sXHJcbiAgXTtcclxuXHJcbiAgY29uc3RydWN0b3IoKSB7XHJcbiAgICB0aGlzLmVudmlyb25tZW50ID0gcHJvY2Vzcy5lbnYuVFJJTklUWV9FTlYgfHwgJ2Rldic7XHJcbiAgICB0aGlzLnNzbUNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgJ2V1LXdlc3QtMScgfSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBMb2FkIGVudmlyb25tZW50IHZhcmlhYmxlcyBmcm9tIC5lbnYgZmlsZVxyXG4gICAqL1xyXG4gIHByaXZhdGUgbG9hZEVudkZpbGUoKTogdm9pZCB7XHJcbiAgICBjb25zdCBlbnZQYXRoID0gcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksICcuLi8uLi8uZW52Jyk7XHJcbiAgICBcclxuICAgIGlmICghZnMuZXhpc3RzU3luYyhlbnZQYXRoKSkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYOKdjCAuZW52IGZpbGUgbm90IGZvdW5kIGF0ICR7ZW52UGF0aH1gKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zb2xlLmxvZyhg8J+TiyBMb2FkaW5nIGVudmlyb25tZW50IHZhcmlhYmxlcyBmcm9tICR7ZW52UGF0aH1gKTtcclxuICAgIFxyXG4gICAgY29uc3QgZW52Q29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhlbnZQYXRoLCAndXRmOCcpO1xyXG4gICAgY29uc3QgbGluZXMgPSBlbnZDb250ZW50LnNwbGl0KCdcXG4nKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcclxuICAgICAgY29uc3QgdHJpbW1lZExpbmUgPSBsaW5lLnRyaW0oKTtcclxuICAgICAgXHJcbiAgICAgIC8vIFNraXAgY29tbWVudHMgYW5kIGVtcHR5IGxpbmVzXHJcbiAgICAgIGlmICghdHJpbW1lZExpbmUgfHwgdHJpbW1lZExpbmUuc3RhcnRzV2l0aCgnIycpKSB7XHJcbiAgICAgICAgY29udGludWU7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IFtrZXksIC4uLnZhbHVlUGFydHNdID0gdHJpbW1lZExpbmUuc3BsaXQoJz0nKTtcclxuICAgICAgaWYgKGtleSAmJiB2YWx1ZVBhcnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICBjb25zdCB2YWx1ZSA9IHZhbHVlUGFydHMuam9pbignPScpLnRyaW0oKTtcclxuICAgICAgICB0aGlzLmVudlZhcnNba2V5LnRyaW0oKV0gPSB2YWx1ZTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKGDinIUgTG9hZGVkICR7T2JqZWN0LmtleXModGhpcy5lbnZWYXJzKS5sZW5ndGh9IGVudmlyb25tZW50IHZhcmlhYmxlc2ApO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogQ3JlYXRlIG9yIHVwZGF0ZSBhIHNpbmdsZSBwYXJhbWV0ZXIgaW4gU1NNXHJcbiAgICovXHJcbiAgcHJpdmF0ZSBhc3luYyBwdXRQYXJhbWV0ZXIobWFwcGluZzogUGFyYW1ldGVyTWFwcGluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3Qgc3NtUGF0aCA9IG1hcHBpbmcuc3NtUGF0aC5yZXBsYWNlKCd7ZW52fScsIHRoaXMuZW52aXJvbm1lbnQpO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFB1dFBhcmFtZXRlckNvbW1hbmQoe1xyXG4gICAgICAgIE5hbWU6IHNzbVBhdGgsXHJcbiAgICAgICAgVmFsdWU6IHZhbHVlLFxyXG4gICAgICAgIFR5cGU6IG1hcHBpbmcudHlwZSxcclxuICAgICAgICBEZXNjcmlwdGlvbjogbWFwcGluZy5kZXNjcmlwdGlvbixcclxuICAgICAgICBPdmVyd3JpdGU6IHRydWUsIC8vIEFsbG93IHVwZGF0ZXNcclxuICAgICAgICBUaWVyOiAnU3RhbmRhcmQnLFxyXG4gICAgICB9KTtcclxuXHJcbiAgICAgIGF3YWl0IHRoaXMuc3NtQ2xpZW50LnNlbmQoY29tbWFuZCk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCB0eXBlTGFiZWwgPSBtYXBwaW5nLnR5cGUgPT09IFBhcmFtZXRlclR5cGUuU0VDVVJFX1NUUklORyA/ICfwn5SSIFNlY3VyZVN0cmluZycgOiAn8J+TnSBTdHJpbmcnO1xyXG4gICAgICBjb25zb2xlLmxvZyhg4pyFICR7dHlwZUxhYmVsfSAke3NzbVBhdGh9YCk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKGDinYwgRmFpbGVkIHRvIGNyZWF0ZSBwYXJhbWV0ZXIgJHtzc21QYXRofTogJHtlcnIubWVzc2FnZX1gKTtcclxuICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBDcmVhdGUgY29tcG9zaXRlIEpTT04gcGFyYW1ldGVyc1xyXG4gICAqL1xyXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlQ29tcG9zaXRlUGFyYW1ldGVycygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OmIENyZWF0aW5nIGNvbXBvc2l0ZSBKU09OIHBhcmFtZXRlcnMuLi4nKTtcclxuXHJcbiAgICAvLyBEeW5hbW9EQiBUYWJsZSBOYW1lc1xyXG4gICAgY29uc3QgdGFibGVOYW1lcyA9IHtcclxuICAgICAgdXNlcnM6IHRoaXMuZW52VmFycy5VU0VSU19UQUJMRSB8fCAndHJpbml0eS11c2Vycy1kZXYnLFxyXG4gICAgICByb29tczogdGhpcy5lbnZWYXJzLlJPT01TX1RBQkxFIHx8ICd0cmluaXR5LXJvb21zLWRldi12MicsXHJcbiAgICAgIHJvb21NZW1iZXJzOiB0aGlzLmVudlZhcnMuUk9PTV9NRU1CRVJTX1RBQkxFIHx8ICd0cmluaXR5LXJvb20tbWVtYmVycy1kZXYnLFxyXG4gICAgICByb29tSW52aXRlczogdGhpcy5lbnZWYXJzLlJPT01fSU5WSVRFU19UQUJMRSB8fCAndHJpbml0eS1yb29tLWludml0ZXMtZGV2LXYyJyxcclxuICAgICAgdm90ZXM6IHRoaXMuZW52VmFycy5WT1RFU19UQUJMRSB8fCAndHJpbml0eS12b3Rlcy1kZXYnLFxyXG4gICAgICBtb3ZpZXNDYWNoZTogdGhpcy5lbnZWYXJzLk1PVklFU19DQUNIRV9UQUJMRSB8fCAndHJpbml0eS1tb3ZpZXMtY2FjaGUtZGV2JyxcclxuICAgICAgcm9vbU1hdGNoZXM6ICd0cmluaXR5LXJvb20tbWF0Y2hlcy1kZXYnLFxyXG4gICAgICBjb25uZWN0aW9uczogJ3RyaW5pdHktY29ubmVjdGlvbnMtZGV2JyxcclxuICAgICAgY2hhdFNlc3Npb25zOiAndHJpbml0eS1jaGF0LXNlc3Npb25zLWRldicsXHJcbiAgICAgIHJvb21Nb3ZpZUNhY2hlOiAndHJpbml0eS1yb29tLW1vdmllLWNhY2hlLWRldicsXHJcbiAgICAgIHJvb21DYWNoZU1ldGFkYXRhOiAndHJpbml0eS1yb29tLWNhY2hlLW1ldGFkYXRhLWRldicsXHJcbiAgICAgIG1hdGNobWFraW5nOiAndHJpbml0eS1tYXRjaG1ha2luZy1kZXYnLFxyXG4gICAgICBmaWx0ZXJDYWNoZTogJ3RyaW5pdHktZmlsdGVyLWNhY2hlJyxcclxuICAgIH07XHJcblxyXG4gICAgYXdhaXQgdGhpcy5wdXRQYXJhbWV0ZXIoe1xyXG4gICAgICBlbnZWYXI6ICdUQUJMRV9OQU1FUycsXHJcbiAgICAgIHNzbVBhdGg6IGAvdHJpbml0eS8ke3RoaXMuZW52aXJvbm1lbnR9L2R5bmFtb2RiL3RhYmxlLW5hbWVzYCxcclxuICAgICAgdHlwZTogUGFyYW1ldGVyVHlwZS5TVFJJTkcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgdGFibGUgbmFtZXMgY29uZmlndXJhdGlvbidcclxuICAgIH0sIEpTT04uc3RyaW5naWZ5KHRhYmxlTmFtZXMpKTtcclxuXHJcbiAgICAvLyBMYW1iZGEgRnVuY3Rpb24gTmFtZXNcclxuICAgIGNvbnN0IGxhbWJkYUZ1bmN0aW9uTmFtZXMgPSB7XHJcbiAgICAgIGF1dGg6IHRoaXMuZW52VmFycy5BVVRIX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS1hdXRoLWRldicsXHJcbiAgICAgIHJvb206IHRoaXMuZW52VmFycy5ST09NX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS1yb29tLWRldicsXHJcbiAgICAgIHZvdGU6IHRoaXMuZW52VmFycy5WT1RFX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS12b3RlLWRldicsXHJcbiAgICAgIG1vdmllOiB0aGlzLmVudlZhcnMuTU9WSUVfSEFORExFUl9OQU1FIHx8ICd0cmluaXR5LW1vdmllLWRldicsXHJcbiAgICAgIGNhY2hlOiB0aGlzLmVudlZhcnMuQ0FDSEVfSEFORExFUl9OQU1FIHx8ICd0cmluaXR5LWNhY2hlLWRldicsXHJcbiAgICAgIHJlYWx0aW1lOiB0aGlzLmVudlZhcnMuUkVBTFRJTUVfSEFORExFUl9OQU1FIHx8ICd0cmluaXR5LXJlYWx0aW1lLWRldicsXHJcbiAgICAgIG1hdGNobWFrZXI6IHRoaXMuZW52VmFycy5NQVRDSE1BS0VSX0hBTkRMRVJfTkFNRSB8fCAndHJpbml0eS12b3RlLWNvbnNlbnN1cy1kZXYnLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCB0aGlzLnB1dFBhcmFtZXRlcih7XHJcbiAgICAgIGVudlZhcjogJ0xBTUJEQV9GVU5DVElPTl9OQU1FUycsXHJcbiAgICAgIHNzbVBhdGg6IGAvdHJpbml0eS8ke3RoaXMuZW52aXJvbm1lbnR9L2xhbWJkYS9mdW5jdGlvbi1uYW1lc2AsXHJcbiAgICAgIHR5cGU6IFBhcmFtZXRlclR5cGUuU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0xhbWJkYSBmdW5jdGlvbiBuYW1lcyBjb25maWd1cmF0aW9uJ1xyXG4gICAgfSwgSlNPTi5zdHJpbmdpZnkobGFtYmRhRnVuY3Rpb25OYW1lcykpO1xyXG5cclxuICAgIC8vIEFwcGxpY2F0aW9uIENvbmZpZ3VyYXRpb25cclxuICAgIGNvbnN0IGFwcENvbmZpZyA9IHtcclxuICAgICAgY2FjaGU6IHtcclxuICAgICAgICB0dGxEYXlzOiBwYXJzZUludCh0aGlzLmVudlZhcnMuQ0FDSEVfVFRMX0RBWVMgfHwgJzcnKSxcclxuICAgICAgICBiYXRjaFNpemU6IHBhcnNlSW50KHRoaXMuZW52VmFycy5CQVRDSF9TSVpFIHx8ICczMCcpLFxyXG4gICAgICAgIG1heEJhdGNoZXM6IHBhcnNlSW50KHRoaXMuZW52VmFycy5NQVhfQkFUQ0hFUyB8fCAnMTAnKSxcclxuICAgICAgICBtb3ZpZUNhY2hlU2l6ZTogNTAsXHJcbiAgICAgIH0sXHJcbiAgICAgIHZvdGluZzoge1xyXG4gICAgICAgIG1heFJvb21DYXBhY2l0eTogcGFyc2VJbnQodGhpcy5lbnZWYXJzLk1BWF9ST09NX0NBUEFDSVRZIHx8ICcxMCcpLFxyXG4gICAgICAgIGRlZmF1bHRSb29tQ2FwYWNpdHk6IDIsXHJcbiAgICAgIH0sXHJcbiAgICAgIG1vdmllczoge1xyXG4gICAgICAgIGNhY2hlU2l6ZTogNTAsXHJcbiAgICAgICAgbWF4R2VucmVzOiAyLFxyXG4gICAgICB9LFxyXG4gICAgICBwZXJmb3JtYW5jZToge1xyXG4gICAgICAgIGxhbWJkYU1lbW9yeVNpemU6IHBhcnNlSW50KHRoaXMuZW52VmFycy5MQU1CREFfTUVNT1JZX1NJWkUgfHwgJzUxMicpLFxyXG4gICAgICAgIGxhbWJkYVRpbWVvdXRTZWNvbmRzOiBwYXJzZUludCh0aGlzLmVudlZhcnMuTEFNQkRBX1RJTUVPVVRfU0VDT05EUyB8fCAnMzAnKSxcclxuICAgICAgICBjaXJjdWl0QnJlYWtlckZhaWx1cmVUaHJlc2hvbGQ6IHBhcnNlSW50KHRoaXMuZW52VmFycy5DSVJDVUlUX0JSRUFLRVJfRkFJTFVSRV9USFJFU0hPTEQgfHwgJzUnKSxcclxuICAgICAgICBjaXJjdWl0QnJlYWtlclRpbWVvdXRNczogcGFyc2VJbnQodGhpcy5lbnZWYXJzLkNJUkNVSVRfQlJFQUtFUl9USU1FT1VUX01TIHx8ICc2MDAwMCcpLFxyXG4gICAgICAgIGNpcmN1aXRCcmVha2VyUmVzZXRUaW1lb3V0TXM6IHBhcnNlSW50KHRoaXMuZW52VmFycy5DSVJDVUlUX0JSRUFLRVJfUkVTRVRfVElNRU9VVF9NUyB8fCAnMzAwMDAnKSxcclxuICAgICAgfSxcclxuICAgICAgbW9uaXRvcmluZzoge1xyXG4gICAgICAgIGxvZ0xldmVsOiB0aGlzLmVudlZhcnMuTE9HX0xFVkVMIHx8ICdpbmZvJyxcclxuICAgICAgICBlbmFibGVNZXRyaWNzOiB0aGlzLmVudlZhcnMuRU5BQkxFX01FVFJJQ1MgPT09ICd0cnVlJyxcclxuICAgICAgICBlbmFibGVYUmF5VHJhY2luZzogdGhpcy5lbnZWYXJzLkVOQUJMRV9YUkFZX1RSQUNJTkcgPT09ICd0cnVlJyxcclxuICAgICAgICB2ZXJib3NlTG9nZ2luZzogdGhpcy5lbnZWYXJzLlZFUkJPU0VfTE9HR0lORyA9PT0gJ3RydWUnLFxyXG4gICAgICB9LFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCB0aGlzLnB1dFBhcmFtZXRlcih7XHJcbiAgICAgIGVudlZhcjogJ0FQUF9DT05GSUcnLFxyXG4gICAgICBzc21QYXRoOiBgL3RyaW5pdHkvJHt0aGlzLmVudmlyb25tZW50fS9hcHAvY29uZmlnYCxcclxuICAgICAgdHlwZTogUGFyYW1ldGVyVHlwZS5TVFJJTkcsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwbGljYXRpb24gY29uZmlndXJhdGlvbiBzZXR0aW5ncydcclxuICAgIH0sIEpTT04uc3RyaW5naWZ5KGFwcENvbmZpZykpO1xyXG5cclxuICAgIC8vIEZlYXR1cmUgRmxhZ3NcclxuICAgIGNvbnN0IGZlYXR1cmVGbGFncyA9IHtcclxuICAgICAgZW5hYmxlUmVhbFRpbWVOb3RpZmljYXRpb25zOiB0aGlzLmVudlZhcnMuRU5BQkxFX1JFQUxfVElNRV9OT1RJRklDQVRJT05TID09PSAndHJ1ZScsXHJcbiAgICAgIGVuYWJsZUNpcmN1aXRCcmVha2VyOiB0aGlzLmVudlZhcnMuRU5BQkxFX0NJUkNVSVRfQlJFQUtFUiA9PT0gJ3RydWUnLFxyXG4gICAgICBlbmFibGVNZXRyaWNzTG9nZ2luZzogdGhpcy5lbnZWYXJzLkVOQUJMRV9NRVRSSUNTX0xPR0dJTkcgPT09ICd0cnVlJyxcclxuICAgICAgZW5hYmxlR29vZ2xlU2lnbmluOiB0aGlzLmVudlZhcnMuRU5BQkxFX0dPT0dMRV9TSUdOSU4gPT09ICd0cnVlJyxcclxuICAgICAgZGVidWdNb2RlOiB0aGlzLmVudlZhcnMuREVCVUdfTU9ERSA9PT0gJ3RydWUnLFxyXG4gICAgfTtcclxuXHJcbiAgICBhd2FpdCB0aGlzLnB1dFBhcmFtZXRlcih7XHJcbiAgICAgIGVudlZhcjogJ0ZFQVRVUkVfRkxBR1MnLFxyXG4gICAgICBzc21QYXRoOiBgL3RyaW5pdHkvJHt0aGlzLmVudmlyb25tZW50fS9hcHAvZmVhdHVyZS1mbGFnc2AsXHJcbiAgICAgIHR5cGU6IFBhcmFtZXRlclR5cGUuU1RSSU5HLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0ZlYXR1cmUgZmxhZ3MgY29uZmlndXJhdGlvbidcclxuICAgIH0sIEpTT04uc3RyaW5naWZ5KGZlYXR1cmVGbGFncykpO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogSHlkcmF0ZSBhbGwgcGFyYW1ldGVycyBmcm9tIC5lbnYgdG8gU1NNXHJcbiAgICovXHJcbiAgYXN5bmMgaHlkcmF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn5qAIFRyaW5pdHkgU1NNIFBhcmFtZXRlciBTdG9yZSBIeWRyYXRpb24nKTtcclxuICAgIGNvbnNvbGUubG9nKGBFbnZpcm9ubWVudDogJHt0aGlzLmVudmlyb25tZW50fWApO1xyXG4gICAgY29uc29sZS5sb2coYFJlZ2lvbjogJHtwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8ICdldS13ZXN0LTEnfWApO1xyXG4gICAgY29uc29sZS5sb2coJ+KUgCcucmVwZWF0KDYwKSk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgLy8gTG9hZCAuZW52IGZpbGVcclxuICAgICAgdGhpcy5sb2FkRW52RmlsZSgpO1xyXG5cclxuICAgICAgY29uc29sZS5sb2coJ1xcbvCflJEgQ3JlYXRpbmcgaW5kaXZpZHVhbCBwYXJhbWV0ZXJzLi4uJyk7XHJcblxyXG4gICAgICAvLyBQcm9jZXNzIGluZGl2aWR1YWwgcGFyYW1ldGVyIG1hcHBpbmdzXHJcbiAgICAgIGZvciAoY29uc3QgbWFwcGluZyBvZiB0aGlzLnBhcmFtZXRlck1hcHBpbmdzKSB7XHJcbiAgICAgICAgY29uc3QgdmFsdWUgPSB0aGlzLmVudlZhcnNbbWFwcGluZy5lbnZWYXJdO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmICghdmFsdWUpIHtcclxuICAgICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIEVudmlyb25tZW50IHZhcmlhYmxlICR7bWFwcGluZy5lbnZWYXJ9IG5vdCBmb3VuZCwgc2tpcHBpbmcuLi5gKTtcclxuICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgdGhpcy5wdXRQYXJhbWV0ZXIobWFwcGluZywgdmFsdWUpO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBDcmVhdGUgY29tcG9zaXRlIEpTT04gcGFyYW1ldGVyc1xyXG4gICAgICBhd2FpdCB0aGlzLmNyZWF0ZUNvbXBvc2l0ZVBhcmFtZXRlcnMoKTtcclxuXHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7inIUgU1NNIFBhcmFtZXRlciBTdG9yZSBoeWRyYXRpb24gY29tcGxldGVkIHN1Y2Nlc3NmdWxseSEnKTtcclxuICAgICAgY29uc29sZS5sb2coYPCfk4ogVG90YWwgcGFyYW1ldGVycyBjcmVhdGVkOiAke3RoaXMucGFyYW1ldGVyTWFwcGluZ3MubGVuZ3RoICsgNH0gKGluZGl2aWR1YWwgKyBjb21wb3NpdGUpYCk7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICBjb25zb2xlLmVycm9yKCdcXG7inYwgU1NNIGh5ZHJhdGlvbiBmYWlsZWQ6JywgZXJyLm1lc3NhZ2UpO1xyXG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSB0aGF0IGFsbCBjcml0aWNhbCBwYXJhbWV0ZXJzIGV4aXN0XHJcbiAgICovXHJcbiAgYXN5bmMgdmFsaWRhdGUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+UjSBWYWxpZGF0aW5nIGNyaXRpY2FsIHBhcmFtZXRlcnMuLi4nKTtcclxuICAgIFxyXG4gICAgY29uc3QgY3JpdGljYWxQYXJhbXMgPSBbXHJcbiAgICAgIGAvdHJpbml0eS8ke3RoaXMuZW52aXJvbm1lbnR9L2V4dGVybmFsL3RtZGItYXBpLWtleWAsXHJcbiAgICAgIGAvdHJpbml0eS8ke3RoaXMuZW52aXJvbm1lbnR9L2F1dGgvY29nbml0by11c2VyLXBvb2wtaWRgLFxyXG4gICAgICBgL3RyaW5pdHkvJHt0aGlzLmVudmlyb25tZW50fS9hdXRoL2NvZ25pdG8tY2xpZW50LWlkYCxcclxuICAgICAgYC90cmluaXR5LyR7dGhpcy5lbnZpcm9ubWVudH0vYXBpL2FwcHN5bmMtYXBpLXVybGAsXHJcbiAgICAgIGAvdHJpbml0eS8ke3RoaXMuZW52aXJvbm1lbnR9L2FwaS9yZWFsdGltZS1hcGktdXJsYCxcclxuICAgIF07XHJcblxyXG4gICAgZm9yIChjb25zdCBwYXJhbVBhdGggb2YgY3JpdGljYWxQYXJhbXMpIHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCB7IEdldFBhcmFtZXRlckNvbW1hbmQgfSA9IGF3YWl0IGltcG9ydCgnQGF3cy1zZGsvY2xpZW50LXNzbScpO1xyXG4gICAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6IHBhcmFtUGF0aCB9KTtcclxuICAgICAgICBhd2FpdCB0aGlzLnNzbUNsaWVudC5zZW5kKGNvbW1hbmQpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDinIUgJHtwYXJhbVBhdGh9YCk7XHJcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MICR7cGFyYW1QYXRofSAtIE5PVCBGT1VORGApO1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ3JpdGljYWwgcGFyYW1ldGVyICR7cGFyYW1QYXRofSBub3QgZm91bmRgKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnNvbGUubG9nKCfinIUgQWxsIGNyaXRpY2FsIHBhcmFtZXRlcnMgdmFsaWRhdGVkIHN1Y2Nlc3NmdWxseSEnKTtcclxuICB9XHJcbn1cclxuXHJcbi8vIENMSSBleGVjdXRpb25cclxuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XHJcbiAgY29uc3QgaHlkcmF0b3IgPSBuZXcgU1NNSHlkcmF0b3IoKTtcclxuICBcclxuICBjb25zdCBjb21tYW5kID0gcHJvY2Vzcy5hcmd2WzJdO1xyXG4gIFxyXG4gIGlmIChjb21tYW5kID09PSAndmFsaWRhdGUnKSB7XHJcbiAgICBoeWRyYXRvci52YWxpZGF0ZSgpLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIFZhbGlkYXRpb24gZmFpbGVkOicsIGVycm9yKTtcclxuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gICAgfSk7XHJcbiAgfSBlbHNlIHtcclxuICAgIGh5ZHJhdG9yLmh5ZHJhdGUoKS50aGVuKCgpID0+IHtcclxuICAgICAgY29uc29sZS5sb2coJ1xcbvCfjokgUnVuIFwibnBtIHJ1biB2YWxpZGF0ZS1zc21cIiB0byB2ZXJpZnkgYWxsIHBhcmFtZXRlcnMgd2VyZSBjcmVhdGVkIGNvcnJlY3RseS4nKTtcclxuICAgIH0pLmNhdGNoKGVycm9yID0+IHtcclxuICAgICAgY29uc29sZS5lcnJvcign4p2MIEh5ZHJhdGlvbiBmYWlsZWQ6JywgZXJyb3IpO1xyXG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCB7IFNTTUh5ZHJhdG9yIH07Il19