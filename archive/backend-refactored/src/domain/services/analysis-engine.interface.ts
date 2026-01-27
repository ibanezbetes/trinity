/**
 * Analysis Engine Interface
 * Core interface for analyzing existing codebase and infrastructure
 */

export interface ModuleInfo {
  name: string;
  path: string;
  type: 'nestjs' | 'react-native' | 'config' | 'infrastructure';
  dependencies: string[];
  exports: string[];
  size: number;
  lastModified: Date;
}

export interface DependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; type: string }>;
  cycles: string[][];
  unusedDependencies: string[];
}

export interface ConfigurationFiles {
  path: string;
  type: 'package.json' | 'tsconfig' | 'env' | 'docker' | 'cdk' | 'jest' | 'eslint' | 'prettier' | 'babel' | 'metro' | 'eas' | 'expo' | 'other';
  content: any;
  isObsolete: boolean;
}

export interface CoverageReport {
  totalLines: number;
  coveredLines: number;
  percentage: number;
  uncoveredFiles: string[];
}

export interface RepositoryAnalysis {
  modules: ModuleInfo[];
  dependencies: DependencyGraph;
  configurations: ConfigurationFiles[];
  testCoverage: CoverageReport;
  codeMetrics: {
    totalLines: number;
    totalFiles: number;
    averageComplexity: number;
    duplicatedCode: any[];
    technicalDebt: any[];
    maintainabilityIndex: number;
  };
  securityIssues: any[];
  performanceIssues: any[];
  qualityIssues: any[];
}

export interface InfrastructureResource {
  id: string;
  type: 'lambda' | 'dynamodb' | 'appsync' | 'cognito' | 's3' | 'cloudfront' | 'apigateway' | 'ecs' | 'elb' | 'sqs' | 'sns' | 'unknown' | 'other';
  name: string;
  region: string;
  isActive: boolean;
  lastUsed?: Date;
  estimatedCost: number;
  dependencies: string[];
  service?: string;
  source?: 'cdk' | 'cloudformation' | 'manual';
  filePath?: string;
  stackName?: string;
}

export interface InfrastructureAnalysis {
  cdkStacks: any[];
  awsResources: any[];
  costEstimate: any;
  securityAnalysis: any[];
  performanceAnalysis: any;
  complianceAnalysis: any;
}

export interface Feature {
  name: string;
  description: string;
  modules: string[];
  complexity: 'low' | 'medium' | 'high';
  userImpact: 'low' | 'medium' | 'high';
  isCore: boolean;
  isDeprecated: boolean;
  dependencies: string[];
}

export interface FeatureMap {
  features: Feature[];
  coreFeatures: Feature[];
  deprecatedFeatures: Feature[];
  missingFeatures: string[];
}

export interface ObsoleteComponent {
  path: string;
  type: 'file' | 'directory' | 'dependency' | 'infrastructure';
  reason: string;
  safeToRemove: boolean;
  dependencies: string[];
  lastUsed?: Date;
}

export interface ObsoleteComponents {
  components: ObsoleteComponent[];
  totalSize: number;
  potentialSavings: {
    storage: number;
    cost: number;
    complexity: number;
  };
}

export interface Codebase {
  rootPath: string;
  analysis: RepositoryAnalysis;
  infrastructure: InfrastructureAnalysis;
}

export interface SystemAnalysis {
  repository: RepositoryAnalysis;
  infrastructure: InfrastructureAnalysis;
  features: any;
  dependencies: any;
  obsoleteComponents: any[];
  recommendations: any[];
  migrationPlan: any[];
}

/**
 * Core Analysis Engine Interface
 * Defines the contract for analyzing existing Trinity codebase
 */
export interface IAnalysisEngine {
  /**
   * Scans repository structure and analyzes all source code
   */
  scanRepository(path: string): Promise<RepositoryAnalysis>;

  /**
   * Analyzes AWS infrastructure from CDK code
   */
  analyzeInfrastructure(cdkPath: string): Promise<InfrastructureAnalysis>;

  /**
   * Analyzes configuration files in the repository
   */
  analyzeConfigurations(rootPath: string): Promise<ConfigurationFiles[]>;

  /**
   * Analyzes existing specs in .kiro/specs directory
   */
  analyzeExistingSpecs(rootPath: string): Promise<any[]>;

  /**
   * Catalogs CDK resources from infrastructure code
   */
  catalogCDKResources(cdkPath: string): Promise<InfrastructureResource[]>;

  /**
   * Extracts feature mapping from codebase analysis
   */
  extractFeatures(codebase: Codebase): Promise<FeatureMap>;

  /**
   * Identifies obsolete components that can be safely removed
   */
  identifyObsoleteComponents(analysis: SystemAnalysis): Promise<ObsoleteComponents>;

  /**
   * Performs complete system analysis
   */
  analyzeSystem(rootPath: string): Promise<SystemAnalysis>;
}