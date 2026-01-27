/**
 * Analysis Domain Entities
 * Core entities for the Analysis Engine domain
 */

export interface ModuleInfo {
  name: string;
  path: string;
  type: 'controller' | 'service' | 'module' | 'guard' | 'interceptor' | 'decorator' | 'dto' | 'entity';
  dependencies: string[];
  exports: string[];
  imports: string[];
  decorators: string[];
  methods?: MethodInfo[];
  properties?: PropertyInfo[];
  isDeprecated: boolean;
  complexity: number;
  testCoverage?: number;
  lastModified: Date;
}

export interface MethodInfo {
  name: string;
  parameters: ParameterInfo[];
  returnType: string;
  decorators: string[];
  isAsync: boolean;
  complexity: number;
  lineCount: number;
}

export interface ParameterInfo {
  name: string;
  type: string;
  isOptional: boolean;
  decorators: string[];
}

export interface PropertyInfo {
  name: string;
  type: string;
  decorators: string[];
  isReadonly: boolean;
  isOptional: boolean;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  circularDependencies: string[][];
  orphanedModules: string[];
}

export interface DependencyNode {
  id: string;
  name: string;
  type: 'internal' | 'external' | 'builtin';
  version?: string;
  path: string;
  usageCount: number;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'require' | 'dynamic';
  isOptional: boolean;
}

export interface ConfigurationFiles {
  packageJson: PackageJsonInfo[];
  tsConfig: TsConfigInfo[];
  nestCliJson: NestCliInfo[];
  envFiles: EnvFileInfo[];
  dockerFiles: DockerFileInfo[];
  other: OtherConfigInfo[];
}

export interface PackageJsonInfo {
  path: string;
  name: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  engines?: Record<string, string>;
  workspaces?: string[];
}

export interface TsConfigInfo {
  path: string;
  compilerOptions: Record<string, any>;
  include: string[];
  exclude: string[];
  extends?: string;
  references?: Array<{ path: string }>;
}

export interface NestCliInfo {
  path: string;
  collection: string;
  sourceRoot: string;
  compilerOptions: Record<string, any>;
  generateOptions: Record<string, any>;
}

export interface EnvFileInfo {
  path: string;
  variables: Record<string, string>;
  isExample: boolean;
}

export interface DockerFileInfo {
  path: string;
  baseImage: string;
  commands: string[];
  exposedPorts: number[];
  volumes: string[];
}

export interface OtherConfigInfo {
  path: string;
  type: string;
  content: Record<string, any>;
}

export interface CoverageReport {
  overall: CoverageMetrics;
  byFile: Record<string, CoverageMetrics>;
  byDirectory: Record<string, CoverageMetrics>;
  uncoveredLines: UncoveredLine[];
}

export interface CoverageMetrics {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
  linesCovered: number;
  statementsCovered: number;
  functionsCovered: number;
  branchesCovered: number;
  percentage: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
  };
}

export interface UncoveredLine {
  file: string;
  line: number;
  type: 'statement' | 'function' | 'branch';
}

export interface RepositoryAnalysis {
  modules: ModuleInfo[];
  dependencies: DependencyGraph;
  configurations: ConfigurationFiles;
  testCoverage: CoverageReport;
  codeMetrics: CodeMetrics;
  securityIssues: SecurityIssue[];
  performanceIssues: PerformanceIssue[];
  qualityIssues: QualityIssue[];
}

export interface CodeMetrics {
  totalLines: number;
  totalFiles: number;
  averageComplexity: number;
  duplicatedCode: DuplicatedCodeBlock[];
  technicalDebt: TechnicalDebtItem[];
  maintainabilityIndex: number;
}

export interface DuplicatedCodeBlock {
  files: string[];
  startLine: number;
  endLine: number;
  similarity: number;
  content: string;
}

export interface TechnicalDebtItem {
  file: string;
  line: number;
  type: 'code_smell' | 'bug' | 'vulnerability' | 'duplication';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  estimatedEffort: number; // in hours
}

export interface SecurityIssue {
  file: string;
  line: number;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommendation: string;
  cwe?: string;
}

export interface PerformanceIssue {
  file: string;
  line: number;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  recommendation: string;
}

export interface QualityIssue {
  file: string;
  line: number;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  rule: string;
  recommendation: string;
}

// React Native/Expo specific entities
export interface ComponentInfo {
  name: string;
  path: string;
  type: 'functional' | 'class' | 'hook' | 'hoc' | 'context';
  props: PropInfo[];
  hooks: HookInfo[];
  dependencies: string[];
  exports: string[];
  isScreen: boolean;
  isReusable: boolean;
  complexity: number;
  testCoverage?: number;
  lastModified: Date;
}

export interface PropInfo {
  name: string;
  type: string;
  isRequired: boolean;
  defaultValue?: any;
  description?: string;
}

export interface HookInfo {
  name: string;
  type: 'useState' | 'useEffect' | 'useContext' | 'useReducer' | 'useMemo' | 'useCallback' | 'custom';
  dependencies: string[];
  isCustom: boolean;
}

export interface ReactNativeAnalysis {
  components: ComponentInfo[];
  screens: ComponentInfo[];
  hooks: ComponentInfo[];
  navigation: NavigationInfo;
  dependencies: DependencyGraph;
  configurations: ReactNativeConfigFiles;
  buildInfo: BuildInfo;
  performanceMetrics: ReactNativePerformanceMetrics;
}

export interface NavigationInfo {
  navigators: NavigatorInfo[];
  screens: ScreenInfo[];
  routes: RouteInfo[];
  deepLinks: DeepLinkInfo[];
}

export interface NavigatorInfo {
  name: string;
  type: 'stack' | 'tab' | 'drawer' | 'modal';
  screens: string[];
  options: Record<string, any>;
}

export interface ScreenInfo {
  name: string;
  component: string;
  path: string;
  params?: Record<string, any>;
  options?: Record<string, any>;
}

export interface RouteInfo {
  name: string;
  path: string;
  component: string;
  params: string[];
  isProtected: boolean;
}

export interface DeepLinkInfo {
  scheme: string;
  path: string;
  screen: string;
  params: Record<string, any>;
}

export interface ReactNativeConfigFiles {
  appJson: AppJsonInfo;
  packageJson: PackageJsonInfo;
  metroConfig: MetroConfigInfo;
  babelConfig: BabelConfigInfo;
  easJson?: EasJsonInfo;
  expoConfig?: ExpoConfigInfo;
}

export interface AppJsonInfo {
  expo: {
    name: string;
    slug: string;
    version: string;
    platforms: string[];
    orientation: string;
    icon: string;
    splash: Record<string, any>;
    updates: Record<string, any>;
    assetBundlePatterns: string[];
    ios?: Record<string, any>;
    android?: Record<string, any>;
    web?: Record<string, any>;
  };
}

export interface MetroConfigInfo {
  resolver: Record<string, any>;
  transformer: Record<string, any>;
  serializer: Record<string, any>;
  server: Record<string, any>;
}

export interface BabelConfigInfo {
  presets: string[];
  plugins: Array<string | [string, Record<string, any>]>;
  env: Record<string, any>;
}

export interface EasJsonInfo {
  cli: Record<string, any>;
  build: Record<string, any>;
  submit: Record<string, any>;
}

export interface ExpoConfigInfo {
  name: string;
  slug: string;
  version: string;
  sdkVersion: string;
  platforms: string[];
  extra: Record<string, any>;
}

export interface BuildInfo {
  platform: 'ios' | 'android' | 'web';
  buildType: 'development' | 'preview' | 'production';
  buildNumber: string;
  buildDate: Date;
  sdkVersion: string;
  dependencies: Record<string, string>;
  bundleSize: number;
  assets: AssetInfo[];
}

export interface AssetInfo {
  name: string;
  path: string;
  size: number;
  type: 'image' | 'font' | 'audio' | 'video' | 'other';
  optimized: boolean;
}

export interface ReactNativePerformanceMetrics {
  bundleSize: number;
  startupTime: number;
  memoryUsage: number;
  renderTime: number;
  navigationTime: number;
  apiResponseTime: number;
  crashRate: number;
  anrRate: number; // Android Not Responding rate
}
// Infrastructure Analysis Entities
export interface InfrastructureAnalysis {
  cdkStacks: CDKStackInfo[];
  awsResources: AWSResourceInfo[];
  costEstimate: CostEstimate;
  securityAnalysis: InfrastructureSecurityAnalysis;
  performanceAnalysis: InfrastructurePerformanceAnalysis;
  complianceAnalysis: ComplianceAnalysis;
}

export interface CDKStackInfo {
  name: string;
  path: string;
  resources: CDKResourceInfo[];
  dependencies: string[];
  outputs: CDKOutputInfo[];
  parameters: CDKParameterInfo[];
  conditions: CDKConditionInfo[];
  metadata: Record<string, any>;
}

export interface CDKResourceInfo {
  logicalId: string;
  type: string;
  properties: Record<string, any>;
  dependencies: string[];
  condition?: string;
  metadata?: Record<string, any>;
}

export interface CDKOutputInfo {
  logicalId: string;
  value: any;
  description?: string;
  exportName?: string;
  condition?: string;
}

export interface CDKParameterInfo {
  logicalId: string;
  type: string;
  defaultValue?: any;
  description?: string;
  constraints?: Record<string, any>;
}

export interface CDKConditionInfo {
  logicalId: string;
  condition: any;
}

export interface AWSResourceInfo {
  id: string;
  type: string;
  name: string;
  region: string;
  properties: Record<string, any>;
  tags: Record<string, string>;
  cost: ResourceCost;
  usage: ResourceUsage;
  dependencies: string[];
  isActive: boolean;
  lastModified: Date;
}

export interface ResourceCost {
  monthly: number;
  yearly: number;
  currency: string;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  service: string;
  component: string;
  cost: number;
  unit: string;
}

export interface ResourceUsage {
  cpu?: number;
  memory?: number;
  storage?: number;
  network?: number;
  requests?: number;
  period: string;
}

export interface CostEstimate {
  total: ResourceCost;
  byService: Record<string, ResourceCost>;
  byRegion: Record<string, ResourceCost>;
  optimizationRecommendations: CostOptimizationRecommendation[];
}

export interface CostOptimizationRecommendation {
  resource: string;
  type: 'rightsizing' | 'reserved_instances' | 'spot_instances' | 'storage_optimization' | 'unused_resources';
  description: string;
  potentialSavings: number;
  effort: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
}

export interface InfrastructureSecurityAnalysis {
  vulnerabilities: InfrastructureVulnerability[];
  misconfigurations: SecurityMisconfiguration[];
  complianceIssues: ComplianceIssue[];
  recommendations: SecurityRecommendation[];
}

export interface InfrastructureVulnerability {
  resource: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  remediation: string;
  cve?: string;
}

export interface SecurityMisconfiguration {
  resource: string;
  rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  remediation: string;
}

export interface ComplianceIssue {
  resource: string;
  framework: string;
  rule: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  remediation: string;
}

export interface SecurityRecommendation {
  type: string;
  description: string;
  resources: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  effort: 'low' | 'medium' | 'high';
}

export interface InfrastructurePerformanceAnalysis {
  bottlenecks: PerformanceBottleneck[];
  scalabilityIssues: ScalabilityIssue[];
  recommendations: PerformanceRecommendation[];
}

export interface PerformanceBottleneck {
  resource: string;
  type: string;
  description: string;
  impact: string;
  recommendation: string;
}

export interface ScalabilityIssue {
  resource: string;
  type: string;
  description: string;
  impact: string;
  recommendation: string;
}

export interface PerformanceRecommendation {
  type: string;
  description: string;
  resources: string[];
  expectedImprovement: string;
  effort: 'low' | 'medium' | 'high';
}

export interface ComplianceAnalysis {
  frameworks: ComplianceFramework[];
  overallScore: number;
  issues: ComplianceIssue[];
  recommendations: ComplianceRecommendation[];
}

export interface ComplianceFramework {
  name: string;
  version: string;
  score: number;
  passedControls: number;
  totalControls: number;
  criticalIssues: number;
}

export interface ComplianceRecommendation {
  framework: string;
  control: string;
  description: string;
  resources: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

// Feature Analysis Entities
export interface FeatureMap {
  coreFeatures: Feature[];
  deprecatedFeatures: Feature[];
  missingFeatures: Feature[];
  featureComplexity: Map<string, ComplexityMetrics>;
  featureDependencies: FeatureDependencyGraph;
  featureUsage: FeatureUsageAnalysis;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  type: 'core' | 'optional' | 'deprecated' | 'experimental';
  status: 'active' | 'inactive' | 'deprecated' | 'planned';
  components: string[];
  dependencies: string[];
  testCoverage: number;
  documentation: DocumentationInfo;
  lastModified: Date;
  owner?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  linesOfCode: number;
  numberOfMethods: number;
  numberOfClasses: number;
  maintainabilityIndex: number;
}

export interface FeatureDependencyGraph {
  nodes: FeatureNode[];
  edges: FeatureDependencyEdge[];
  circularDependencies: string[][];
}

export interface FeatureNode {
  id: string;
  name: string;
  type: string;
  complexity: number;
}

export interface FeatureDependencyEdge {
  from: string;
  to: string;
  type: 'required' | 'optional' | 'circular';
  strength: number;
}

export interface FeatureUsageAnalysis {
  mostUsed: FeatureUsage[];
  leastUsed: FeatureUsage[];
  unused: string[];
  criticalPath: string[];
}

export interface FeatureUsage {
  featureId: string;
  usageCount: number;
  lastUsed: Date;
  usagePattern: 'frequent' | 'occasional' | 'rare' | 'never';
}

export interface DocumentationInfo {
  exists: boolean;
  path?: string;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'missing';
  completeness: number;
  lastUpdated?: Date;
}

// Room Management Features
export interface RoomFeatures {
  roomCreation: FeatureImplementation;
  roomManagement: FeatureImplementation;
  participantManagement: FeatureImplementation;
  roomSettings: FeatureImplementation;
  roomPersistence: FeatureImplementation;
}

export interface VotingFeatures {
  votingSession: FeatureImplementation;
  realTimeVoting: FeatureImplementation;
  voteValidation: FeatureImplementation;
  resultsCalculation: FeatureImplementation;
  votingHistory: FeatureImplementation;
}

export interface AuthFeatures {
  googleAuth: FeatureImplementation;
  cognitoAuth: FeatureImplementation;
  jwtTokens: FeatureImplementation;
  sessionManagement: FeatureImplementation;
  userProfiles: FeatureImplementation;
}

export interface MediaFeatures {
  mediaUpload: FeatureImplementation;
  mediaStorage: FeatureImplementation;
  mediaStreaming: FeatureImplementation;
  mediaProcessing: FeatureImplementation;
  mediaMetadata: FeatureImplementation;
}

export interface FeatureImplementation {
  isImplemented: boolean;
  completeness: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  components: string[];
  tests: TestInfo[];
  documentation: DocumentationInfo;
  issues: ImplementationIssue[];
}

export interface TestInfo {
  path: string;
  type: 'unit' | 'integration' | 'e2e' | 'property';
  coverage: number;
  passing: boolean;
  lastRun: Date;
}

export interface ImplementationIssue {
  type: 'bug' | 'performance' | 'security' | 'maintainability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  file: string;
  line?: number;
}

// Obsolete Components
export interface ObsoleteComponents {
  unusedDependencies: string[];
  deadCode: DeadCodeInfo[];
  unusedAWSResources: string[];
  deprecatedCode: DeprecatedCodeInfo[];
  duplicatedCode: DuplicatedCodeBlock[];
  obsoleteConfigurations: ObsoleteConfigInfo[];
  removalPlan: RemovalPlan;
}

export interface DeadCodeInfo {
  file: string;
  type: 'function' | 'class' | 'variable' | 'import' | 'export';
  name: string;
  line: number;
  reason: string;
  safeToRemove: boolean;
  dependencies: string[];
}

export interface DeprecatedCodeInfo {
  file: string;
  type: 'api' | 'library' | 'pattern' | 'configuration';
  name: string;
  line: number;
  deprecatedSince: string;
  replacement?: string;
  removalDate?: Date;
  migrationGuide?: string;
}

export interface ObsoleteConfigInfo {
  file: string;
  type: 'environment' | 'build' | 'deployment' | 'dependency';
  key: string;
  reason: string;
  safeToRemove: boolean;
}

export interface RemovalPlan {
  phases: RemovalPhase[];
  totalEstimatedEffort: number;
  risks: RemovalRisk[];
  dependencies: RemovalDependency[];
}

export interface RemovalPhase {
  id: string;
  name: string;
  description: string;
  items: RemovalItem[];
  estimatedEffort: number;
  prerequisites: string[];
  risks: string[];
}

export interface RemovalItem {
  type: 'dependency' | 'code' | 'resource' | 'configuration';
  name: string;
  path: string;
  reason: string;
  effort: number;
  risk: 'low' | 'medium' | 'high';
}

export interface RemovalRisk {
  type: 'breaking_change' | 'data_loss' | 'service_disruption' | 'rollback_difficulty';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation: string;
  affectedComponents: string[];
}

export interface RemovalDependency {
  from: string;
  to: string;
  type: 'blocks' | 'requires' | 'conflicts';
  description: string;
}

// System Analysis
export interface SystemAnalysis {
  repository: RepositoryAnalysis;
  infrastructure: InfrastructureAnalysis;
  features: FeatureAnalysis;
  dependencies: DependencyAnalysis;
  obsoleteComponents: ObsoleteComponent[];
  recommendations: SystemRecommendation[];
  migrationPlan: MigrationPlan;
}

export interface FeatureAnalysis {
  coreFeatures: Feature[];
  deprecatedFeatures: Feature[];
  missingFeatures: Feature[];
  featureComplexity: Map<string, ComplexityMetrics>;
}

export interface DependencyAnalysis {
  internal: InternalDependency[];
  external: ExternalDependency[];
  circular: CircularDependency[];
  unused: UnusedDependency[];
  outdated: OutdatedDependency[];
}

export interface InternalDependency {
  from: string;
  to: string;
  type: string;
  strength: number;
}

export interface ExternalDependency {
  name: string;
  version: string;
  type: 'production' | 'development' | 'peer' | 'optional';
  usageCount: number;
  lastUpdated: Date;
  vulnerabilities: DependencyVulnerability[];
}

export interface CircularDependency {
  cycle: string[];
  severity: 'low' | 'medium' | 'high';
  impact: string;
}

export interface UnusedDependency {
  name: string;
  version: string;
  type: string;
  reason: string;
}

export interface OutdatedDependency {
  name: string;
  currentVersion: string;
  latestVersion: string;
  type: string;
  securityIssues: number;
  breakingChanges: boolean;
}

export interface DependencyVulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  patchedVersion?: string;
  cve?: string;
}

export interface ObsoleteComponent {
  name: string;
  type: string;
  path: string;
  reason: string;
  safeToRemove: boolean;
  dependencies: string[];
}

export interface SystemRecommendation {
  type: 'architecture' | 'performance' | 'security' | 'maintainability' | 'cost';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  components: string[];
  implementation: string;
}

export interface MigrationPlan {
  phases: MigrationPhase[];
  dependencies: PhaseDependency[];
  rollbackStrategies: RollbackStrategy[];
  validationCriteria: ValidationCriteria[];
  estimatedDuration: Duration;
}

export interface MigrationPhase {
  id: string;
  name: string;
  description: string;
  tasks: MigrationTask[];
  prerequisites: string[];
  successCriteria: string[];
  rollbackProcedure: RollbackProcedure;
}

export interface MigrationTask {
  id: string;
  name: string;
  description: string;
  type: 'code' | 'infrastructure' | 'data' | 'configuration' | 'testing';
  estimatedEffort: number;
  assignee?: string;
  dependencies: string[];
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
}

export interface PhaseDependency {
  from: string;
  to: string;
  type: 'blocks' | 'enables' | 'requires';
  description: string;
}

export interface RollbackStrategy {
  phaseId: string;
  description: string;
  steps: RollbackStep[];
  timeRequired: number;
  dataBackupRequired: boolean;
  risks: string[];
}

export interface RollbackStep {
  id: string;
  description: string;
  command?: string;
  manual: boolean;
  timeRequired: number;
}

export interface RollbackProcedure {
  description: string;
  steps: RollbackStep[];
  timeRequired: number;
  risks: string[];
}

export interface ValidationCriteria {
  phaseId: string;
  criteria: ValidationCriterion[];
}

export interface ValidationCriterion {
  name: string;
  description: string;
  type: 'automated' | 'manual';
  command?: string;
  expectedResult: string;
  critical: boolean;
}

export interface Duration {
  days: number;
  hours: number;
  confidence: 'low' | 'medium' | 'high';
}

// Codebase representation
export interface Codebase {
  path: string;
  modules: ModuleInfo[];
  components: ComponentInfo[];
  configurations: ConfigurationFiles;
  dependencies: DependencyGraph;
  metadata: CodebaseMetadata;
}

export interface CodebaseMetadata {
  name: string;
  version: string;
  type: 'nestjs' | 'react-native' | 'mixed';
  language: string;
  framework: string;
  lastAnalyzed: Date;
  analysisVersion: string;
}