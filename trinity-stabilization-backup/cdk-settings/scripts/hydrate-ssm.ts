#!/usr/bin/env node
/**
 * Trinity SSM Parameter Store Hydration Script
 * Reads .env file and creates/updates AWS Systems Manager parameters
 * Follows strict naming pattern: /trinity/{env}/{category}/{param}
 */

import { SSMClient, PutParameterCommand, ParameterType } from '@aws-sdk/client-ssm';
import * as fs from 'fs';
import * as path from 'path';

interface ParameterMapping {
  envVar: string;
  ssmPath: string;
  type: ParameterType;
  description: string;
}

class SSMHydrator {
  private ssmClient: SSMClient;
  private environment: string;
  private envVars: Record<string, string> = {};

  // Parameter mappings following /trinity/{env}/{category}/{param} pattern
  private parameterMappings: ParameterMapping[] = [
    // External API Keys (SecureString)
    {
      envVar: 'TMDB_API_KEY',
      ssmPath: '/trinity/{env}/external/tmdb-api-key',
      type: ParameterType.SECURE_STRING,
      description: 'TMDB API key for movie data retrieval'
    },

    // Authentication (String)
    {
      envVar: 'COGNITO_USER_POOL_ID',
      ssmPath: '/trinity/{env}/auth/cognito-user-pool-id',
      type: ParameterType.STRING,
      description: 'Cognito User Pool ID for authentication'
    },
    {
      envVar: 'COGNITO_CLIENT_ID',
      ssmPath: '/trinity/{env}/auth/cognito-client-id',
      type: ParameterType.STRING,
      description: 'Cognito User Pool Client ID'
    },

    // Google OAuth (SecureString)
    {
      envVar: 'GOOGLE_WEB_CLIENT_ID',
      ssmPath: '/trinity/{env}/auth/google-web-client-id',
      type: ParameterType.SECURE_STRING,
      description: 'Google OAuth Web Client ID'
    },
    {
      envVar: 'GOOGLE_CLIENT_SECRET',
      ssmPath: '/trinity/{env}/auth/google-client-secret',
      type: ParameterType.SECURE_STRING,
      description: 'Google OAuth Client Secret'
    },
    {
      envVar: 'GOOGLE_ANDROID_CLIENT_ID',
      ssmPath: '/trinity/{env}/auth/google-android-client-id',
      type: ParameterType.SECURE_STRING,
      description: 'Google OAuth Android Client ID'
    },
    {
      envVar: 'GOOGLE_IOS_CLIENT_ID',
      ssmPath: '/trinity/{env}/auth/google-ios-client-id',
      type: ParameterType.SECURE_STRING,
      description: 'Google OAuth iOS Client ID'
    },

    // AppSync APIs (String)
    {
      envVar: 'GRAPHQL_API_ID',
      ssmPath: '/trinity/{env}/api/appsync-api-id',
      type: ParameterType.STRING,
      description: 'AppSync GraphQL API ID'
    },
    {
      envVar: 'GRAPHQL_API_URL',
      ssmPath: '/trinity/{env}/api/appsync-api-url',
      type: ParameterType.STRING,
      description: 'AppSync GraphQL API URL'
    },
    {
      envVar: 'GRAPHQL_REALTIME_URL',
      ssmPath: '/trinity/{env}/api/realtime-api-url',
      type: ParameterType.STRING,
      description: 'AppSync Real-time API URL for subscriptions'
    },

    // Security (SecureString)
    {
      envVar: 'JWT_SECRET',
      ssmPath: '/trinity/{env}/security/jwt-secret',
      type: ParameterType.SECURE_STRING,
      description: 'JWT secret key for token signing'
    },
  ];

  constructor() {
    this.environment = process.env.TRINITY_ENV || 'dev';
    this.ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'eu-west-1' });
  }

  /**
   * Load environment variables from .env file
   */
  private loadEnvFile(): void {
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
  private async putParameter(mapping: ParameterMapping, value: string): Promise<void> {
    const ssmPath = mapping.ssmPath.replace('{env}', this.environment);
    
    try {
      const command = new PutParameterCommand({
        Name: ssmPath,
        Value: value,
        Type: mapping.type,
        Description: mapping.description,
        Overwrite: true, // Allow updates
        Tier: 'Standard',
      });

      await this.ssmClient.send(command);
      
      const typeLabel = mapping.type === ParameterType.SECURE_STRING ? '🔒 SecureString' : '📝 String';
      console.log(`✅ ${typeLabel} ${ssmPath}`);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Failed to create parameter ${ssmPath}: ${err.message}`);
      throw error;
    }
  }

  /**
   * Create composite JSON parameters
   */
  private async createCompositeParameters(): Promise<void> {
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
      type: ParameterType.STRING,
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
      type: ParameterType.STRING,
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
      type: ParameterType.STRING,
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
      type: ParameterType.STRING,
      description: 'Feature flags configuration'
    }, JSON.stringify(featureFlags));
  }

  /**
   * Hydrate all parameters from .env to SSM
   */
  async hydrate(): Promise<void> {
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

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('\n❌ SSM hydration failed:', err.message);
      process.exit(1);
    }
  }

  /**
   * Validate that all critical parameters exist
   */
  async validate(): Promise<void> {
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
        const { GetParameterCommand } = await import('@aws-sdk/client-ssm');
        const command = new GetParameterCommand({ Name: paramPath });
        await this.ssmClient.send(command);
        console.log(`✅ ${paramPath}`);
      } catch (error) {
        console.error(`❌ ${paramPath} - NOT FOUND`);
        throw new Error(`Critical parameter ${paramPath} not found`);
      }
    }

    console.log('✅ All critical parameters validated successfully!');
  }
}

// CLI execution
if (require.main === module) {
  const hydrator = new SSMHydrator();
  
  const command = process.argv[2];
  
  if (command === 'validate') {
    hydrator.validate().catch(error => {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    });
  } else {
    hydrator.hydrate().then(() => {
      console.log('\n🎉 Run "npm run validate-ssm" to verify all parameters were created correctly.');
    }).catch(error => {
      console.error('❌ Hydration failed:', error);
      process.exit(1);
    });
  }
}

export { SSMHydrator };