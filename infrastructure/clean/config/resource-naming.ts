/**
 * Trinity Resource Naming Conventions
 * 
 * Centralized naming conventions and utilities for all Trinity resources
 * Ensures consistent naming across all AWS resources
 */

export interface NamingConfig {
  project: string;
  environment: string;
  region: string;
  version?: string;
}

export interface ResourceNaming {
  // DynamoDB Tables
  tables: {
    users: string;
    rooms: string;
    roomMembers: string;
    roomInvites: string;
    votes: string;
    moviesCache: string;
    roomMatches: string;
    connections: string;
    roomMovieCache: string;
    roomCacheMetadata: string;
    matchmaking: string;
    filterCache: string;
  };
  
  // Lambda Functions
  lambdas: {
    auth: string;
    cache: string;
    vote: string;
    room: string;
    movie: string;
    realtime: string;
    matchmaker: string;
  };
  
  // AppSync APIs
  apis: {
    main: string;
    realtime: string;
  };
  
  // Cognito Resources
  cognito: {
    userPool: string;
    userPoolClient: string;
    identityPool: string;
  };
  
  // CloudFormation Stacks
  stacks: {
    config: string;
    database: string;
    lambda: string;
    api: string;
    cognito: string;
    main: string;
  };
  
  // CloudWatch Resources
  cloudWatch: {
    logGroups: {
      lambda: (functionName: string) => string;
      api: (apiName: string) => string;
    };
    dashboards: {
      main: string;
      lambda: string;
      database: string;
      api: string;
    };
    alarms: {
      lambdaErrors: (functionName: string) => string;
      lambdaDuration: (functionName: string) => string;
      dynamodbThrottles: (tableName: string) => string;
      apiErrors: (apiName: string) => string;
    };
  };
}

/**
 * Generate resource names based on naming conventions
 */
export function generateResourceNames(config: NamingConfig): ResourceNaming {
  const { project, environment, version } = config;
  const prefix = project.toLowerCase();
  const env = environment.toLowerCase();
  const versionSuffix = version ? `-${version}` : '';

  return {
    tables: {
      users: `${prefix}-users-${env}`,
      rooms: `${prefix}-rooms-${env}${versionSuffix}`,
      roomMembers: `${prefix}-room-members-${env}`,
      roomInvites: `${prefix}-room-invites-${env}${versionSuffix}`,
      votes: `${prefix}-votes-${env}`,
      moviesCache: `${prefix}-movies-cache-${env}`,
      roomMatches: `${prefix}-room-matches-${env}`,
      connections: `${prefix}-connections-${env}`,
      roomMovieCache: `${prefix}-room-movie-cache-${env}`,
      roomCacheMetadata: `${prefix}-room-cache-metadata-${env}`,
      matchmaking: `${prefix}-matchmaking-${env}`,
      filterCache: `${prefix}-filter-cache`,
    },
    
    lambdas: {
      auth: `${prefix}-auth-${env}`,
      cache: `${prefix}-cache-${env}`,
      vote: `${prefix}-vote-${env}`,
      room: `${prefix}-room-${env}`,
      movie: `${prefix}-movie-${env}`,
      realtime: `${prefix}-realtime-${env}`,
      matchmaker: `${prefix}-vote-consensus-${env}`, // Note: deployed as vote-consensus, not matchmaker
    },
    
    apis: {
      main: `${prefix}-api-${env}`,
      realtime: `${prefix}-realtime-api`,
    },
    
    cognito: {
      userPool: `${prefix}-users-${env}`,
      userPoolClient: `${prefix}-client-${env}`,
      identityPool: `${prefix}-identity-${env}`,
    },
    
    stacks: {
      config: `Trinity${capitalize(environment)}ConfigStack`,
      database: `Trinity${capitalize(environment)}DatabaseStack`,
      lambda: `Trinity${capitalize(environment)}LambdaStack`,
      api: `Trinity${capitalize(environment)}ApiStack`,
      cognito: `Trinity${capitalize(environment)}CognitoStack`,
      main: `Trinity${capitalize(environment)}MainStack`,
    },
    
    cloudWatch: {
      logGroups: {
        lambda: (functionName: string) => `/aws/lambda/${functionName}`,
        api: (apiName: string) => `/aws/appsync/apis/${apiName}`,
      },
      dashboards: {
        main: `${prefix}-${env}-overview`,
        lambda: `${prefix}-${env}-lambda-metrics`,
        database: `${prefix}-${env}-dynamodb-metrics`,
        api: `${prefix}-${env}-api-metrics`,
      },
      alarms: {
        lambdaErrors: (functionName: string) => `${functionName}-errors`,
        lambdaDuration: (functionName: string) => `${functionName}-duration`,
        dynamodbThrottles: (tableName: string) => `${tableName}-throttles`,
        apiErrors: (apiName: string) => `${apiName}-errors`,
      },
    },
  };
}

/**
 * Validate resource name against conventions
 */
export function validateResourceName(resourceName: string, resourceType: string, config: NamingConfig): {
  valid: boolean;
  issues: string[];
  expected?: string;
} {
  const issues: string[] = [];
  const { project, environment } = config;
  const prefix = project.toLowerCase();
  const env = environment.toLowerCase();

  // Check basic format
  if (!resourceName.startsWith(prefix)) {
    issues.push(`Resource name should start with '${prefix}'`);
  }

  if (!resourceName.includes(env)) {
    issues.push(`Resource name should include environment '${env}'`);
  }

  // Check for invalid characters
  if (!/^[a-z0-9-]+$/.test(resourceName)) {
    issues.push('Resource name should only contain lowercase letters, numbers, and hyphens');
  }

  // Check length constraints
  if (resourceName.length > 63) {
    issues.push('Resource name should not exceed 63 characters');
  }

  // Resource-specific validations
  switch (resourceType) {
    case 'dynamodb-table':
      if (resourceName.length > 255) {
        issues.push('DynamoDB table name should not exceed 255 characters');
      }
      break;
      
    case 'lambda-function':
      if (resourceName.length > 64) {
        issues.push('Lambda function name should not exceed 64 characters');
      }
      break;
      
    case 'cloudformation-stack':
      if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(resourceName)) {
        issues.push('CloudFormation stack name should start with a letter and contain only alphanumeric characters and hyphens');
      }
      break;
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Get expected resource names for current configuration
 */
export function getExpectedResourceNames(): ResourceNaming {
  const config: NamingConfig = {
    project: 'trinity',
    environment: 'dev',
    region: 'eu-west-1',
    version: 'v2', // For versioned resources like rooms and invites
  };

  return generateResourceNames(config);
}

/**
 * Naming convention rules
 */
export const NAMING_RULES = {
  general: [
    'Use lowercase letters, numbers, and hyphens only',
    'Start with project name (trinity)',
    'Include environment (dev, staging, production)',
    'Use descriptive, consistent naming',
    'Avoid abbreviations unless widely understood',
  ],
  
  dynamodb: [
    'Format: trinity-[purpose]-[environment][-version]',
    'Examples: trinity-users-dev, trinity-rooms-dev-v2',
    'Use singular nouns for entity tables',
    'Use descriptive names for cache and metadata tables',
  ],
  
  lambda: [
    'Format: trinity-[purpose]-[environment]',
    'Examples: trinity-auth-dev, trinity-movie-dev',
    'Use verb-based names for action functions',
    'Keep names concise but descriptive',
  ],
  
  cloudformation: [
    'Format: Trinity[Environment][Purpose]Stack',
    'Examples: TrinityDevDatabaseStack, TrinityProdApiStack',
    'Use PascalCase for stack names',
    'Include environment and purpose clearly',
  ],
  
  cloudwatch: [
    'Dashboards: trinity-[env]-[purpose]-metrics',
    'Alarms: [resource-name]-[metric-type]',
    'Log groups: Follow AWS conventions (/aws/lambda/[function-name])',
  ],
};

/**
 * Helper functions
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Generate tags for resources
 */
export function generateResourceTags(config: NamingConfig, resourceType: string, resourceName: string): Record<string, string> {
  return {
    Project: config.project,
    Environment: config.environment,
    ResourceType: resourceType,
    ResourceName: resourceName,
    ManagedBy: 'CDK',
    CreatedBy: 'Trinity-Infrastructure',
  };
}

/**
 * Validate all resource names in a stack
 */
export function validateStackResourceNames(stackResources: Record<string, string>, config: NamingConfig): {
  valid: boolean;
  issues: Array<{ resource: string; issues: string[] }>;
} {
  const allIssues: Array<{ resource: string; issues: string[] }> = [];

  for (const [resourceKey, resourceName] of Object.entries(stackResources)) {
    const resourceType = inferResourceType(resourceKey);
    const validation = validateResourceName(resourceName, resourceType, config);
    
    if (!validation.valid) {
      allIssues.push({
        resource: resourceKey,
        issues: validation.issues,
      });
    }
  }

  return {
    valid: allIssues.length === 0,
    issues: allIssues,
  };
}

/**
 * Infer resource type from resource key
 */
function inferResourceType(resourceKey: string): string {
  if (resourceKey.includes('table') || resourceKey.includes('Table')) {
    return 'dynamodb-table';
  }
  if (resourceKey.includes('lambda') || resourceKey.includes('Lambda') || resourceKey.includes('function')) {
    return 'lambda-function';
  }
  if (resourceKey.includes('stack') || resourceKey.includes('Stack')) {
    return 'cloudformation-stack';
  }
  if (resourceKey.includes('api') || resourceKey.includes('Api')) {
    return 'appsync-api';
  }
  return 'unknown';
}