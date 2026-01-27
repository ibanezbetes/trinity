import {
  MigrationPlan,
  MigrationPhase,
  MigrationTask,
  MigrationProgress,
  MigrationResult,
  ValidationResult,
  RollbackResult
} from '../entities/migration.entity';

export interface IMigrationRepository {
  // Migration Plan operations
  saveMigrationPlan(plan: MigrationPlan): Promise<void>;
  getMigrationPlan(id: string): Promise<MigrationPlan | null>;
  updateMigrationPlan(plan: MigrationPlan): Promise<void>;
  deleteMigrationPlan(id: string): Promise<void>;
  listMigrationPlans(): Promise<MigrationPlan[]>;

  // Migration Progress operations
  saveProgress(progress: MigrationProgress): Promise<void>;
  getProgress(planId: string): Promise<MigrationProgress | null>;
  updateProgress(progress: MigrationProgress): Promise<void>;

  // Migration Results operations
  saveResult(result: MigrationResult): Promise<void>;
  getResults(planId: string): Promise<MigrationResult[]>;
  getPhaseResults(planId: string, phaseId: string): Promise<MigrationResult[]>;

  // Validation Results operations
  saveValidationResult(result: ValidationResult): Promise<void>;
  getValidationResults(planId: string, phaseId?: string): Promise<ValidationResult[]>;

  // Rollback Results operations
  saveRollbackResult(result: RollbackResult): Promise<void>;
  getRollbackResults(planId: string): Promise<RollbackResult[]>;
}

export interface IMigrationOrchestrator {
  // Migration Plan management
  createMigrationPlan(planData: Partial<MigrationPlan>): Promise<MigrationPlan>;
  validateMigrationPlan(plan: MigrationPlan): Promise<ValidationResult[]>;
  
  // Migration execution
  executeMigrationPhase(planId: string, phaseId: string): Promise<MigrationResult>;
  executeMigrationTask(planId: string, phaseId: string, taskId: string): Promise<MigrationResult>;
  
  // Migration monitoring
  getMigrationProgress(planId: string): Promise<MigrationProgress>;
  pauseMigration(planId: string): Promise<void>;
  resumeMigration(planId: string): Promise<void>;
  cancelMigration(planId: string): Promise<void>;
  
  // Validation
  validateMigrationStep(planId: string, phaseId: string, taskId: string): Promise<ValidationResult[]>;
  validateSystemState(planId: string): Promise<ValidationResult[]>;
  
  // Rollback operations
  rollbackToPhase(planId: string, targetPhaseId: string): Promise<RollbackResult>;
  rollbackTask(planId: string, phaseId: string, taskId: string): Promise<RollbackResult>;
  
  // Utility operations
  estimateMigrationDuration(plan: MigrationPlan): Promise<number>;
  generateMigrationReport(planId: string): Promise<MigrationReport>;
}

export interface MigrationReport {
  planId: string;
  planName: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  totalPhases: number;
  completedPhases: number;
  failedPhases: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  overallProgress: number;
  phases: PhaseReport[];
  validationSummary: ValidationSummary;
  rollbackHistory: RollbackResult[];
  recommendations: string[];
}

export interface PhaseReport {
  phaseId: string;
  phaseName: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  tasks: TaskReport[];
  validationResults: ValidationResult[];
}

export interface TaskReport {
  taskId: string;
  taskName: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  error?: string;
  validationResults: ValidationResult[];
}

export interface ValidationSummary {
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;
  criticalFailures: number;
  warningCount: number;
  validationsByType: Record<string, number>;
}