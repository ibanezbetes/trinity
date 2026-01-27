export interface MigrationPhase {
  id: string;
  name: string;
  description: string;
  tasks: MigrationTask[];
  prerequisites: string[];
  successCriteria: string[];
  rollbackProcedure: RollbackProcedure;
  estimatedDuration: number; // in minutes
  status: MigrationPhaseStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface MigrationTask {
  id: string;
  name: string;
  description: string;
  type: MigrationTaskType;
  parameters: Record<string, any>;
  dependencies: string[];
  validationSteps: ValidationStep[];
  rollbackSteps: RollbackStep[];
  status: MigrationTaskStatus;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}

export interface RollbackProcedure {
  id: string;
  name: string;
  steps: RollbackStep[];
  validationChecks: ValidationStep[];
  safetyChecks: string[];
}

export interface RollbackStep {
  id: string;
  name: string;
  description: string;
  action: string;
  parameters: Record<string, any>;
  order: number;
}

export interface ValidationStep {
  id: string;
  name: string;
  description: string;
  type: ValidationType;
  criteria: ValidationCriteria;
  timeout: number; // in seconds
}

export interface ValidationCriteria {
  expectedResult?: any;
  minimumThreshold?: number;
  maximumThreshold?: number;
  requiredFields?: string[];
  customValidator?: string; // function name or script
}

export interface MigrationPlan {
  id: string;
  name: string;
  description: string;
  version: string;
  phases: MigrationPhase[];
  dependencies: PhaseDependency[];
  rollbackStrategies: RollbackStrategy[];
  validationCriteria: ValidationCriteria[];
  estimatedDuration: number; // total in minutes
  status: MigrationPlanStatus;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface PhaseDependency {
  phaseId: string;
  dependsOn: string[];
  type: DependencyType;
}

export interface RollbackStrategy {
  id: string;
  name: string;
  description: string;
  applicablePhases: string[];
  procedure: RollbackProcedure;
  riskLevel: RiskLevel;
}

export interface MigrationProgress {
  planId: string;
  currentPhase?: string;
  currentTask?: string;
  completedPhases: string[];
  completedTasks: string[];
  failedTasks: string[];
  overallProgress: number; // percentage
  phaseProgress: number; // percentage of current phase
  estimatedTimeRemaining: number; // in minutes
  startedAt: Date;
  lastUpdatedAt: Date;
}

export interface MigrationResult {
  success: boolean;
  phaseId: string;
  taskId?: string;
  message: string;
  data?: any;
  validationResults: ValidationResult[];
  duration: number; // in milliseconds
  timestamp: Date;
}

export interface ValidationResult {
  stepId: string;
  success: boolean;
  message: string;
  actualValue?: any;
  expectedValue?: any;
  timestamp: Date;
}

export interface RollbackResult {
  success: boolean;
  phaseId: string;
  message: string;
  stepsExecuted: string[];
  validationResults: ValidationResult[];
  duration: number; // in milliseconds
  timestamp: Date;
}

// Enums
export enum MigrationPhaseStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  SKIPPED = 'skipped'
}

export enum MigrationTaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  SKIPPED = 'skipped'
}

export enum MigrationTaskType {
  DATA_MIGRATION = 'data_migration',
  SCHEMA_MIGRATION = 'schema_migration',
  CODE_DEPLOYMENT = 'code_deployment',
  INFRASTRUCTURE_UPDATE = 'infrastructure_update',
  VALIDATION = 'validation',
  CLEANUP = 'cleanup',
  BACKUP = 'backup',
  CONFIGURATION = 'configuration'
}

export enum ValidationType {
  DATA_INTEGRITY = 'data_integrity',
  FUNCTIONALITY = 'functionality',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  CONNECTIVITY = 'connectivity',
  CUSTOM = 'custom'
}

export enum MigrationPlanStatus {
  DRAFT = 'draft',
  READY = 'ready',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  CANCELLED = 'cancelled'
}

export enum DependencyType {
  HARD = 'hard', // Must complete before dependent phase can start
  SOFT = 'soft', // Preferred order but not required
  PARALLEL = 'parallel' // Can run in parallel
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}