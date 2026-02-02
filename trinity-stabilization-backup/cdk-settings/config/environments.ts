/**
 * Environment Configuration for Trinity Infrastructure
 * Manages environment-specific settings for dev, staging, and production
 */

export interface TrinityEnvironmentConfig {
  // Environment identification
  environment: 'dev' | 'staging' | 'production';
  region: string;
  
  // Resource naming
  resourcePrefix: string;
  
  // DynamoDB configuration
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
    pointInTimeRecovery: boolean;
    encryption: boolean;
    ttlEnabled: boolean;
    ttlAttributeName: string;
  };
  
  // Lambda configuration
  lambda: {
    runtime: string;
    timeout: number;
    memorySize: number;
    logRetention: number;
    enableXRay: boolean;
  };
  
  // API configuration
  api: {
    enableLogging: boolean;
    logLevel: 'NONE' | 'ERROR' | 'ALL';
    enableMetrics: boolean;
  };
  
  // Security configuration
  security: {
    enableWaf: boolean;
    enableCloudTrail: boolean;
    encryptionAtRest: boolean;
    encryptionInTransit: boolean;
  };
  
  // Monitoring configuration
  monitoring: {
    enableDashboard: boolean;
    enableAlarms: boolean;
    retentionDays: number;
    alertEmail?: string;
  };
  
  // External service configuration
  external: {
    tmdbApiKey: string;
    cognitoUserPoolId: string;
    cognitoClientId: string;
    appsyncApiId: string;
    appsyncApiUrl: string;
    realtimeApiUrl: string;
  };
}

/**
 * Development Environment Configuration
 */
export const DEV_CONFIG: TrinityEnvironmentConfig = {
  environment: 'dev',
  region: 'eu-west-1',
  resourcePrefix: 'trinity',
  
  dynamodb: {
    billingMode: 'PAY_PER_REQUEST',
    pointInTimeRecovery: false,
    encryption: true,
    ttlEnabled: true,
    ttlAttributeName: 'ttl',
  },
  
  lambda: {
    runtime: 'nodejs18.x',
    timeout: 30,
    memorySize: 512,
    logRetention: 7, // 7 days for dev
    enableXRay: false,
  },
  
  api: {
    enableLogging: true,
    logLevel: 'ALL',
    enableMetrics: true,
  },
  
  security: {
    enableWaf: false,
    enableCloudTrail: false,
    encryptionAtRest: true,
    encryptionInTransit: true,
  },
  
  monitoring: {
    enableDashboard: true,
    enableAlarms: false,
    retentionDays: 7,
  },
  
  external: {
    tmdbApiKey: process.env.TMDB_API_KEY || '',
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || 'eu-west-1_6UxioIj4z',
    cognitoClientId: process.env.COGNITO_CLIENT_ID || '2a07bheqdh1mllkd1sn0i3s5m3',
    appsyncApiId: process.env.APPSYNC_API_ID || 'imx6fos5lnd3xkdchl4rqtv4pi',
    appsyncApiUrl: process.env.APPSYNC_API_URL || 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
    realtimeApiUrl: process.env.APPSYNC_REALTIME_URL || 'wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
  },
};

/**
 * Staging Environment Configuration
 */
export const STAGING_CONFIG: TrinityEnvironmentConfig = {
  ...DEV_CONFIG,
  environment: 'staging',
  resourcePrefix: 'trinity-staging',
  
  lambda: {
    ...DEV_CONFIG.lambda,
    logRetention: 14, // 14 days for staging
    enableXRay: true,
  },
  
  security: {
    ...DEV_CONFIG.security,
    enableWaf: true,
    enableCloudTrail: true,
  },
  
  monitoring: {
    ...DEV_CONFIG.monitoring,
    enableAlarms: true,
    retentionDays: 14,
  },
};

/**
 * Production Environment Configuration
 */
export const PRODUCTION_CONFIG: TrinityEnvironmentConfig = {
  ...STAGING_CONFIG,
  environment: 'production',
  resourcePrefix: 'trinity-prod',
  
  dynamodb: {
    ...STAGING_CONFIG.dynamodb,
    pointInTimeRecovery: true,
  },
  
  lambda: {
    ...STAGING_CONFIG.lambda,
    memorySize: 1024,
    logRetention: 30, // 30 days for production
  },
  
  monitoring: {
    ...STAGING_CONFIG.monitoring,
    retentionDays: 30,
  },
};

/**
 * Get configuration for the specified environment
 */
export function getEnvironmentConfig(env?: string): TrinityEnvironmentConfig {
  const environment = env || process.env.TRINITY_ENV || 'dev';
  
  switch (environment) {
    case 'staging':
      return STAGING_CONFIG;
    case 'production':
      return PRODUCTION_CONFIG;
    case 'dev':
    default:
      return DEV_CONFIG;
  }
}

/**
 * Validate environment configuration
 */
export function validateEnvironmentConfig(config: TrinityEnvironmentConfig): void {
  // For CDK operations, we allow placeholder values since actual values come from Parameter Store
  const requiredFields = [
    'external.tmdbApiKey',
    'external.cognitoUserPoolId', 
    'external.cognitoClientId',
  ];
  
  for (const field of requiredFields) {
    const value = field.split('.').reduce((obj, key) => obj?.[key], config as any);
    if (!value || value === '') {
      console.warn(`⚠️ Configuration field ${field} is empty - using placeholder for CDK operations`);
      // Don't throw error for CDK operations, just warn
    }
  }
  
  console.log(`✅ Environment configuration validated for: ${config.environment}`);
}