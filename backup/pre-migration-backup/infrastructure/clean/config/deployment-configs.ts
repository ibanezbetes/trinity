/**
 * Trinity Deployment Configurations
 * 
 * Environment-specific deployment configurations for Trinity infrastructure
 */

export interface DeploymentEnvironmentConfig {
  environment: 'dev' | 'staging' | 'production';
  region: string;
  stacks: string[];
  validation: {
    preDeployment: boolean;
    postDeployment: boolean;
    importCompatibility: boolean;
  };
  deployment: {
    requireApproval: boolean;
    hotswapEnabled: boolean;
    rollbackOnFailure: boolean;
    timeoutMinutes: number;
  };
  monitoring: {
    enableCloudWatch: boolean;
    enableXRay: boolean;
    logRetentionDays: number;
  };
  security: {
    enableEncryption: boolean;
    enablePointInTimeRecovery: boolean;
    enableVpcEndpoints: boolean;
  };
}

/**
 * Development Environment Configuration
 */
export const DEV_CONFIG: DeploymentEnvironmentConfig = {
  environment: 'dev',
  region: 'eu-west-1',
  stacks: [
    'TrinityConfigStack',
    'TrinityDatabaseStack',
    'TrinityLambdaStack',
    'TrinityApiStack',
    'TrinityMainStack'
  ],
  validation: {
    preDeployment: true,
    postDeployment: true,
    importCompatibility: true,
  },
  deployment: {
    requireApproval: false,
    hotswapEnabled: true,
    rollbackOnFailure: true,
    timeoutMinutes: 30,
  },
  monitoring: {
    enableCloudWatch: true,
    enableXRay: false,
    logRetentionDays: 7,
  },
  security: {
    enableEncryption: false,
    enablePointInTimeRecovery: false,
    enableVpcEndpoints: false,
  },
};

/**
 * Staging Environment Configuration
 */
export const STAGING_CONFIG: DeploymentEnvironmentConfig = {
  environment: 'staging',
  region: 'eu-west-1',
  stacks: [
    'TrinityConfigStack',
    'TrinityDatabaseStack',
    'TrinityLambdaStack',
    'TrinityApiStack',
    'TrinityMainStack'
  ],
  validation: {
    preDeployment: true,
    postDeployment: true,
    importCompatibility: true,
  },
  deployment: {
    requireApproval: true,
    hotswapEnabled: false,
    rollbackOnFailure: true,
    timeoutMinutes: 45,
  },
  monitoring: {
    enableCloudWatch: true,
    enableXRay: true,
    logRetentionDays: 30,
  },
  security: {
    enableEncryption: true,
    enablePointInTimeRecovery: true,
    enableVpcEndpoints: false,
  },
};

/**
 * Production Environment Configuration
 */
export const PRODUCTION_CONFIG: DeploymentEnvironmentConfig = {
  environment: 'production',
  region: 'eu-west-1',
  stacks: [
    'TrinityConfigStack',
    'TrinityDatabaseStack',
    'TrinityLambdaStack',
    'TrinityApiStack',
    'TrinityMainStack'
  ],
  validation: {
    preDeployment: true,
    postDeployment: true,
    importCompatibility: true,
  },
  deployment: {
    requireApproval: true,
    hotswapEnabled: false,
    rollbackOnFailure: true,
    timeoutMinutes: 60,
  },
  monitoring: {
    enableCloudWatch: true,
    enableXRay: true,
    logRetentionDays: 90,
  },
  security: {
    enableEncryption: true,
    enablePointInTimeRecovery: true,
    enableVpcEndpoints: true,
  },
};

/**
 * Get deployment configuration for environment
 */
export function getDeploymentConfig(environment: string): DeploymentEnvironmentConfig {
  switch (environment.toLowerCase()) {
    case 'dev':
    case 'development':
      return DEV_CONFIG;
    case 'staging':
    case 'stage':
      return STAGING_CONFIG;
    case 'prod':
    case 'production':
      return PRODUCTION_CONFIG;
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

/**
 * Validate deployment configuration
 */
export function validateDeploymentConfig(config: DeploymentEnvironmentConfig): string[] {
  const issues: string[] = [];

  // Validate required fields
  if (!config.environment) {
    issues.push('Environment is required');
  }

  if (!config.region) {
    issues.push('Region is required');
  }

  if (!config.stacks || config.stacks.length === 0) {
    issues.push('At least one stack must be specified');
  }

  // Validate production constraints
  if (config.environment === 'production') {
    if (!config.deployment.requireApproval) {
      issues.push('Production deployments must require approval');
    }

    if (config.deployment.hotswapEnabled) {
      issues.push('Hotswap should not be enabled in production');
    }

    if (!config.security.enableEncryption) {
      issues.push('Encryption must be enabled in production');
    }

    if (!config.security.enablePointInTimeRecovery) {
      issues.push('Point-in-time recovery must be enabled in production');
    }

    if (config.monitoring.logRetentionDays < 30) {
      issues.push('Production log retention should be at least 30 days');
    }
  }

  // Validate timeout
  if (config.deployment.timeoutMinutes < 10 || config.deployment.timeoutMinutes > 120) {
    issues.push('Deployment timeout must be between 10 and 120 minutes');
  }

  return issues;
}

/**
 * Import-specific configurations
 */
export interface ImportConfig {
  databaseStack: {
    enabled: boolean;
    tables: string[];
    validateSchema: boolean;
  };
  apiStack: {
    enabled: boolean;
    apis: string[];
    validateEndpoints: boolean;
  };
  cognitoStack: {
    enabled: boolean;
    userPools: string[];
    validateConfiguration: boolean;
  };
}

export const IMPORT_CONFIG: ImportConfig = {
  databaseStack: {
    enabled: true,
    tables: [
      'trinity-users-dev',
      'trinity-rooms-dev-v2',
      'trinity-room-members-dev',
      'trinity-votes-dev',
      'trinity-movies-cache-dev',
      'trinity-room-matches-dev',
      'trinity-room-invites-dev-v2',
      'trinity-connections-dev',
      'trinity-room-movie-cache-dev',
      'trinity-room-cache-metadata-dev',
      'trinity-matchmaking-dev',
      'trinity-filter-cache'
    ],
    validateSchema: true,
  },
  apiStack: {
    enabled: true,
    apis: [
      'trinity-api-dev',
      'trinity-realtime-api'
    ],
    validateEndpoints: true,
  },
  cognitoStack: {
    enabled: true,
    userPools: [
      'trinity-users-dev'
    ],
    validateConfiguration: true,
  },
};