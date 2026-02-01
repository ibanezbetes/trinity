/**
 * Trinity Parameter Store Configuration
 * Manages environment-specific parameters with proper hierarchy
 * Hierarchy: /trinity/{env}/category/parameter
 */

import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from './environments';

export interface ParameterStoreConfig {
  // External API Keys (SecureString)
  tmdbApiKey: ssm.IParameter;
  
  // AWS Service Configuration (String)
  cognitoUserPoolId: ssm.IParameter;
  cognitoClientId: ssm.IParameter;
  appsyncApiId: ssm.IParameter;
  appsyncApiUrl: ssm.IParameter;
  realtimeApiUrl: ssm.IParameter;
  
  // Google OAuth Configuration (SecureString)
  googleWebClientId: ssm.IParameter;
  googleClientSecret: ssm.IParameter;
  googleAndroidClientId: ssm.IParameter;
  googleIosClientId: ssm.IParameter;
  
  // Security Configuration (SecureString)
  jwtSecret: ssm.IParameter;
  
  // DynamoDB Table Names (JSON String)
  tableNames: ssm.IParameter;
  
  // Lambda Function Names (JSON String)
  lambdaFunctionNames: ssm.IParameter;
  
  // Application Configuration (JSON String)
  appConfig: ssm.IParameter;
  
  // Feature Flags (JSON String)
  featureFlags: ssm.IParameter;
}

/**
 * Create or import Parameter Store parameters for Trinity
 */
export class TrinityParameterStore extends Construct {
  public readonly parameters: ParameterStoreConfig;
  
  constructor(scope: Construct, id: string, config: TrinityEnvironmentConfig) {
    super(scope, id);
    
    // Initialize parameters object
    this.parameters = {} as ParameterStoreConfig;
    
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
  public grantReadAccess(grantee: cdk.aws_iam.IGrantable): void {
    Object.values(this.parameters).forEach(parameter => {
      parameter.grantRead(grantee);
    });
  }
}

/**
 * Utility functions for accessing parameters in Lambda functions
 */
export const ParameterStoreUtils = {
  /**
   * Get parameter path for environment
   */
  getParameterPath: (environment: string, category: string, name: string): string => {
    return `/trinity/${environment}/${category}/${name}`;
  },
  
  /**
   * Get all parameter paths for an environment
   */
  getAllParameterPaths: (environment: string) => ({
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