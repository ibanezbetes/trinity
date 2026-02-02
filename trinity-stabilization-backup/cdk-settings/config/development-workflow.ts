/**
 * Trinity Development Workflow Configuration
 * 
 * Optimized workflows for different development scenarios
 */

export interface WorkflowConfig {
  name: string;
  description: string;
  commands: string[];
  estimatedTime: string;
  useCase: string;
}

/**
 * Development Workflows
 */
export const DEVELOPMENT_WORKFLOWS: WorkflowConfig[] = [
  {
    name: 'Quick Lambda Update',
    description: 'Fastest deployment for Lambda function changes only',
    commands: [
      'npm run build',
      'npm run hotswap:lambda'
    ],
    estimatedTime: '15-30 seconds',
    useCase: 'Lambda function code changes during active development'
  },
  {
    name: 'Full Hotswap',
    description: 'Fast deployment for all hotswap-compatible resources',
    commands: [
      'npm run validate:pre',
      'npm run build',
      'npm run hotswap:all'
    ],
    estimatedTime: '1-2 minutes',
    useCase: 'Multiple resource changes that support hotswap'
  },
  {
    name: 'Watch Mode Development',
    description: 'Continuous deployment on file changes',
    commands: [
      'npm run hotswap:watch'
    ],
    estimatedTime: 'Continuous (15-30s per change)',
    useCase: 'Active development with frequent Lambda changes'
  },
  {
    name: 'Standard Development Deploy',
    description: 'Full deployment with validation for development',
    commands: [
      'npm run validate:pre',
      'npm run build',
      'npm run deploy:lambda'
    ],
    estimatedTime: '3-5 minutes',
    useCase: 'Infrastructure changes that require full deployment'
  },
  {
    name: 'Safe Production Deploy',
    description: 'Full deployment with comprehensive validation',
    commands: [
      'npm run validate:pre',
      'npm run build',
      'npm run deploy:all',
      'npm run validate'
    ],
    estimatedTime: '10-15 minutes',
    useCase: 'Production deployments with full validation'
  }
];

/**
 * Hotswap Compatibility Matrix
 */
export const HOTSWAP_COMPATIBILITY = {
  'AWS::Lambda::Function': {
    supported: true,
    properties: ['Code', 'Environment', 'Description', 'Timeout', 'MemorySize'],
    limitations: 'Runtime and handler changes require full deployment'
  },
  'AWS::StepFunctions::StateMachine': {
    supported: true,
    properties: ['Definition', 'DefinitionString'],
    limitations: 'Role changes require full deployment'
  },
  'AWS::ECS::Service': {
    supported: true,
    properties: ['TaskDefinition', 'DesiredCount'],
    limitations: 'Network configuration changes require full deployment'
  },
  'AWS::DynamoDB::Table': {
    supported: false,
    properties: [],
    limitations: 'DynamoDB changes always require full deployment'
  },
  'AWS::AppSync::GraphQLApi': {
    supported: false,
    properties: [],
    limitations: 'AppSync changes always require full deployment'
  },
  'AWS::Cognito::UserPool': {
    supported: false,
    properties: [],
    limitations: 'Cognito changes always require full deployment'
  }
};

/**
 * Development Environment Recommendations
 */
export const DEV_RECOMMENDATIONS = {
  'Lambda Development': {
    workflow: 'Quick Lambda Update',
    tools: ['hotswap:lambda', 'hotswap:watch'],
    tips: [
      'Use watch mode for continuous development',
      'Test locally with SAM CLI when possible',
      'Keep Lambda functions small for faster deployments'
    ]
  },
  'API Development': {
    workflow: 'Standard Development Deploy',
    tools: ['deploy:api', 'validate'],
    tips: [
      'AppSync schema changes require full deployment',
      'Test GraphQL queries in AppSync console',
      'Use CDK diff to preview changes'
    ]
  },
  'Database Schema Changes': {
    workflow: 'Safe Production Deploy',
    tools: ['validate:pre', 'deploy:database', 'validate'],
    tips: [
      'Always backup before schema changes',
      'Test migrations in development first',
      'Use CDK import for existing tables'
    ]
  },
  'Infrastructure Changes': {
    workflow: 'Standard Development Deploy',
    tools: ['deploy:all', 'validate'],
    tips: [
      'Review CDK diff output carefully',
      'Test in development environment first',
      'Use rollback scripts if needed'
    ]
  }
};

/**
 * Performance Optimization Tips
 */
export const PERFORMANCE_TIPS = [
  {
    category: 'Build Optimization',
    tips: [
      'Use TypeScript incremental compilation',
      'Enable CDK asset caching',
      'Minimize Lambda bundle sizes with esbuild'
    ]
  },
  {
    category: 'Deployment Speed',
    tips: [
      'Use hotswap for Lambda-only changes',
      'Deploy specific stacks instead of --all',
      'Skip validation for trusted changes'
    ]
  },
  {
    category: 'Development Workflow',
    tips: [
      'Use watch mode for active development',
      'Test locally before deployment',
      'Use CDK diff to preview changes'
    ]
  }
];

/**
 * Get recommended workflow for change type
 */
export function getRecommendedWorkflow(changeType: string): WorkflowConfig | null {
  const workflows: Record<string, WorkflowConfig> = {
    'lambda': DEVELOPMENT_WORKFLOWS[0], // Quick Lambda Update
    'api': DEVELOPMENT_WORKFLOWS[3],    // Standard Development Deploy
    'database': DEVELOPMENT_WORKFLOWS[4], // Safe Production Deploy
    'infrastructure': DEVELOPMENT_WORKFLOWS[3], // Standard Development Deploy
    'hotswap': DEVELOPMENT_WORKFLOWS[1], // Full Hotswap
    'watch': DEVELOPMENT_WORKFLOWS[2],   // Watch Mode Development
  };

  return workflows[changeType.toLowerCase()] || null;
}

/**
 * Check if resource supports hotswap
 */
export function supportsHotswap(resourceType: string): boolean {
  return (HOTSWAP_COMPATIBILITY as Record<string, any>)[resourceType]?.supported || false;
}

/**
 * Get hotswap limitations for resource
 */
export function getHotswapLimitations(resourceType: string): string {
  return (HOTSWAP_COMPATIBILITY as Record<string, any>)[resourceType]?.limitations || 'Resource does not support hotswap';
}