/**
 * API Compatibility Analysis Entities
 * 
 * Defines the data structures for API compatibility analysis,
 * gap identification, and migration recommendations.
 */

export interface ApiEndpoint {
  id: string;
  name: string;
  type: 'graphql' | 'rest' | 'websocket';
  method?: string; // For REST endpoints
  path?: string;   // For REST endpoints
  operation?: string; // For GraphQL operations
  parameters: Record<string, any>;
  responseFormat: Record<string, any>;
  deprecated: boolean;
  version: string;
}

export interface GraphQLOperation {
  name: string;
  type: 'query' | 'mutation' | 'subscription';
  parameters: Record<string, any>;
  responseFields: string[];
  deprecated: boolean;
  enhancedVersion?: string;
}

export interface RestEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  parameters: Record<string, any>;
  responseFormat: Record<string, any>;
  deprecated: boolean;
  replacementGraphQL?: string;
}

export enum CompatibilityLevel {
  FULLY_COMPATIBLE = 'fully_compatible',
  REQUIRES_ADAPTATION = 'requires_adaptation',
  DEPRECATED = 'deprecated',
  INCOMPATIBLE = 'incompatible'
}

export interface CompatibilityGap {
  id: string;
  operationType: 'graphql' | 'rest' | 'subscription';
  operationName: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  impact: string;
  suggestedFix: string;
  affectedClients?: string[];
  estimatedFixTime?: number; // in hours
}

export interface MigrationRecommendation {
  id: string;
  operationName: string;
  recommendationType: 'adapt_operation' | 'migrate_to_new_operation' | 'implement_new_operation' | 'upgrade_to_enhanced' | 'migrate_to_graphql';
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimatedEffort: 'low' | 'medium' | 'high';
  implementationSteps: string[];
  dependencies?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface ApiVersionRequirement {
  operationName: string;
  minimumVersion: string;
  recommendedVersion: string;
  deprecationDate: Date | null;
  migrationDeadline: Date | null;
  breakingChanges?: string[];
}

export interface ApiCompatibilityReport {
  id: string;
  timestamp: Date;
  overallCompatibility: CompatibilityLevel;
  compatibilityGaps: CompatibilityGap[];
  migrationRecommendations: MigrationRecommendation[];
  versionRequirements: ApiVersionRequirement[];
  analysisDetails: {
    totalOperations: number;
    compatibleOperations: number;
    incompatibleOperations: number;
    requiresAdaptation: number;
  };
}

export interface ApiMappingRule {
  sourceOperation: string;
  targetService: string;
  targetMethod: string;
  parameterMappings: Record<string, string>;
  responseTransformations: Record<string, any>;
  validationRules: string[];
}

export interface CompatibilityMiddlewareConfig {
  enableCompatibilityLayer: boolean;
  strictMode: boolean;
  logDeprecationWarnings: boolean;
  transformationEnabled: boolean;
  allowedDeprecatedOperations: string[];
  transformationRules: TransformationRule[];
  deprecationWarnings: DeprecationWarning[];
}

export interface TransformationRule {
  operationName: string;
  transformationType: 'parameter_mapping' | 'response_transformation' | 'field_addition' | 'field_removal';
  rules: {
    inputTransformation?: any;
    outputTransformation?: any;
    fieldMappings?: Record<string, string>;
    addFields?: Record<string, any>;
    removeFields?: string[];
    addDefaults?: Record<string, any>;
  };
}

export interface DeprecationWarning {
  operationName: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  migrationDeadline?: Date;
  replacementOperation?: string;
  documentationUrl?: string;
}

export interface ServiceMapping {
  legacyEndpoint: string;
  newService: string;
  newMethod: string;
  compatibilityLevel: CompatibilityLevel;
  migrationComplexity: 'simple' | 'moderate' | 'complex';
  dataTransformationRequired: boolean;
  authenticationChanges: boolean;
}

export interface ClientImpactAnalysis {
  clientType: 'mobile_ios' | 'mobile_android' | 'web' | 'api_consumer';
  affectedOperations: string[];
  impactLevel: 'low' | 'medium' | 'high';
  requiredChanges: string[];
  testingRequirements: string[];
  rolloutStrategy: 'immediate' | 'gradual' | 'feature_flag';
}

export interface ApiEvolutionPlan {
  id: string;
  name: string;
  description: string;
  phases: ApiEvolutionPhase[];
  totalDuration: number; // in days
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high';
    riskFactors: string[];
    mitigationStrategies: string[];
  };
}

export interface ApiEvolutionPhase {
  id: string;
  name: string;
  description: string;
  duration: number; // in days
  operations: string[];
  dependencies: string[];
  deliverables: string[];
  successCriteria: string[];
  rollbackPlan: string[];
}

export interface BackwardCompatibilityStrategy {
  maintainLegacyEndpoints: boolean;
  legacyEndpointTimeout: number; // in days
  versioningStrategy: 'url_versioning' | 'header_versioning' | 'parameter_versioning';
  deprecationNoticeStrategy: 'immediate' | 'gradual' | 'feature_flag';
  clientMigrationSupport: {
    documentationProvided: boolean;
    migrationToolsAvailable: boolean;
    supportChannelAvailable: boolean;
    migrationDeadline: Date;
  };
}

export interface ApiTestingStrategy {
  compatibilityTestSuite: {
    unitTests: string[];
    integrationTests: string[];
    endToEndTests: string[];
  };
  performanceTestingRequired: boolean;
  loadTestingScenarios: string[];
  securityTestingRequired: boolean;
  clientCompatibilityTesting: {
    mobileAppTesting: boolean;
    webAppTesting: boolean;
    apiConsumerTesting: boolean;
  };
}