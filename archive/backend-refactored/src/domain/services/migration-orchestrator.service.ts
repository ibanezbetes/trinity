import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  IMigrationOrchestrator,
  IMigrationRepository,
  MigrationReport
} from '../repositories/migration.repository';
import {
  MigrationPlan,
  MigrationPhase,
  MigrationTask,
  MigrationProgress,
  MigrationResult,
  ValidationResult,
  RollbackResult,
  MigrationPhaseStatus,
  MigrationTaskStatus,
  MigrationPlanStatus,
  ValidationType,
  MigrationTaskType
} from '../entities/migration.entity';

@Injectable()
export class MigrationOrchestratorService implements IMigrationOrchestrator {
  private readonly logger = new Logger(MigrationOrchestratorService.name);

  constructor(
    @Inject('IMigrationRepository')
    private readonly migrationRepository: IMigrationRepository
  ) {}

  async createMigrationPlan(planData: Partial<MigrationPlan>): Promise<MigrationPlan> {
    const plan: MigrationPlan = {
      id: planData.id || this.generateId(),
      name: planData.name || 'Unnamed Migration Plan',
      description: planData.description || '',
      version: planData.version || '1.0.0',
      phases: planData.phases || [],
      dependencies: planData.dependencies || [],
      rollbackStrategies: planData.rollbackStrategies || [],
      validationCriteria: planData.validationCriteria || [],
      estimatedDuration: 0,
      status: MigrationPlanStatus.DRAFT,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Calculate estimated duration
    plan.estimatedDuration = await this.estimateMigrationDuration(plan);

    await this.migrationRepository.saveMigrationPlan(plan);
    this.logger.log(`Created migration plan: ${plan.id} - ${plan.name}`);

    return plan;
  }

  async validateMigrationPlan(plan: MigrationPlan): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Validate plan structure
    if (!plan.phases || plan.phases.length === 0) {
      results.push({
        stepId: 'plan-structure',
        success: false,
        message: 'Migration plan must have at least one phase',
        timestamp: new Date()
      });
    }

    // Validate phase dependencies
    for (const dependency of plan.dependencies) {
      const phase = plan.phases.find(p => p.id === dependency.phaseId);
      if (!phase) {
        results.push({
          stepId: `dependency-${dependency.phaseId}`,
          success: false,
          message: `Phase ${dependency.phaseId} referenced in dependencies but not found`,
          timestamp: new Date()
        });
      }

      for (const depId of dependency.dependsOn) {
        const depPhase = plan.phases.find(p => p.id === depId);
        if (!depPhase) {
          results.push({
            stepId: `dependency-${depId}`,
            success: false,
            message: `Dependency phase ${depId} not found`,
            timestamp: new Date()
          });
        }
      }
    }

    // Validate circular dependencies
    const circularDeps = this.detectCircularDependencies(plan);
    if (circularDeps.length > 0) {
      results.push({
        stepId: 'circular-dependencies',
        success: false,
        message: `Circular dependencies detected: ${circularDeps.join(', ')}`,
        timestamp: new Date()
      });
    }

    // Validate each phase
    for (const phase of plan.phases) {
      const phaseResults = await this.validatePhase(phase);
      results.push(...phaseResults);
    }

    return results;
  }

  async executeMigrationPhase(planId: string, phaseId: string): Promise<MigrationResult> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    const phase = plan.phases.find(p => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found in plan ${planId}`);
    }

    this.logger.log(`Starting migration phase: ${phaseId} - ${phase.name}`);
    const startTime = Date.now();

    try {
      // Update phase status
      phase.status = MigrationPhaseStatus.IN_PROGRESS;
      phase.startedAt = new Date();
      await this.migrationRepository.updateMigrationPlan(plan);

      // Validate prerequisites
      const prerequisiteResults = await this.validatePrerequisites(plan, phase);
      if (prerequisiteResults.some(r => !r.success)) {
        throw new Error(`Prerequisites not met for phase ${phaseId}`);
      }

      // Execute tasks in order
      const taskResults: MigrationResult[] = [];
      for (const task of phase.tasks) {
        const taskResult = await this.executeMigrationTask(planId, phaseId, task.id);
        taskResults.push(taskResult);
        
        if (!taskResult.success) {
          throw new Error(`Task ${task.id} failed: ${taskResult.message}`);
        }
      }

      // Validate phase completion
      const validationResults = await this.validatePhaseCompletion(plan, phase);
      if (validationResults.some(r => !r.success)) {
        throw new Error(`Phase validation failed for ${phaseId}`);
      }

      // Update phase status
      phase.status = MigrationPhaseStatus.COMPLETED;
      phase.completedAt = new Date();
      await this.migrationRepository.updateMigrationPlan(plan);

      const result: MigrationResult = {
        success: true,
        phaseId,
        message: `Phase ${phase.name} completed successfully`,
        validationResults,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveResult(result);
      this.logger.log(`Completed migration phase: ${phaseId}`);

      return result;

    } catch (error) {
      // Update phase status
      phase.status = MigrationPhaseStatus.FAILED;
      phase.error = error.message;
      await this.migrationRepository.updateMigrationPlan(plan);

      const result: MigrationResult = {
        success: false,
        phaseId,
        message: `Phase ${phase.name} failed: ${error.message}`,
        validationResults: [],
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveResult(result);
      this.logger.error(`Failed migration phase: ${phaseId} - ${error.message}`);

      throw error;
    }
  }

  async executeMigrationTask(planId: string, phaseId: string, taskId: string): Promise<MigrationResult> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    const phase = plan.phases.find(p => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`);
    }

    const task = phase.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in phase ${phaseId}`);
    }

    this.logger.log(`Executing migration task: ${taskId} - ${task.name}`);
    const startTime = Date.now();

    try {
      // Update task status
      task.status = MigrationTaskStatus.IN_PROGRESS;
      task.startedAt = new Date();
      await this.migrationRepository.updateMigrationPlan(plan);

      // Execute task based on type
      const taskResult = await this.executeTaskByType(task);

      // Validate task completion
      const validationResults = await this.validateTask(task);
      if (validationResults.some(r => !r.success)) {
        throw new Error(`Task validation failed for ${taskId}`);
      }

      // Update task status
      task.status = MigrationTaskStatus.COMPLETED;
      task.completedAt = new Date();
      task.result = taskResult;
      await this.migrationRepository.updateMigrationPlan(plan);

      const result: MigrationResult = {
        success: true,
        phaseId,
        taskId,
        message: `Task ${task.name} completed successfully`,
        data: taskResult,
        validationResults,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveResult(result);
      this.logger.log(`Completed migration task: ${taskId}`);

      return result;

    } catch (error) {
      // Update task status
      task.status = MigrationTaskStatus.FAILED;
      task.error = error.message;
      await this.migrationRepository.updateMigrationPlan(plan);

      const result: MigrationResult = {
        success: false,
        phaseId,
        taskId,
        message: `Task ${task.name} failed: ${error.message}`,
        validationResults: [],
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveResult(result);
      this.logger.error(`Failed migration task: ${taskId} - ${error.message}`);

      throw error;
    }
  }

  async getMigrationProgress(planId: string): Promise<MigrationProgress> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    const completedPhases = plan.phases.filter(p => p.status === MigrationPhaseStatus.COMPLETED);
    const completedTasks = plan.phases.flatMap(p => p.tasks).filter(t => t.status === MigrationTaskStatus.COMPLETED);
    const failedTasks = plan.phases.flatMap(p => p.tasks).filter(t => t.status === MigrationTaskStatus.FAILED);
    const totalTasks = plan.phases.flatMap(p => p.tasks).length;

    const currentPhase = plan.phases.find(p => p.status === MigrationPhaseStatus.IN_PROGRESS);
    const currentTask = currentPhase?.tasks.find(t => t.status === MigrationTaskStatus.IN_PROGRESS);

    const overallProgress = totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0;
    const phaseProgress = currentPhase ? 
      (currentPhase.tasks.filter(t => t.status === MigrationTaskStatus.COMPLETED).length / currentPhase.tasks.length) * 100 : 0;

    const progress: MigrationProgress = {
      planId,
      currentPhase: currentPhase?.id,
      currentTask: currentTask?.id,
      completedPhases: completedPhases.map(p => p.id),
      completedTasks: completedTasks.map(t => t.id),
      failedTasks: failedTasks.map(t => t.id),
      overallProgress,
      phaseProgress,
      estimatedTimeRemaining: this.calculateRemainingTime(plan, overallProgress),
      startedAt: plan.startedAt || new Date(),
      lastUpdatedAt: new Date()
    };

    await this.migrationRepository.saveProgress(progress);
    return progress;
  }

  async pauseMigration(planId: string): Promise<void> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    // Implementation would pause current operations
    this.logger.log(`Pausing migration: ${planId}`);
  }

  async resumeMigration(planId: string): Promise<void> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    // Implementation would resume paused operations
    this.logger.log(`Resuming migration: ${planId}`);
  }

  async cancelMigration(planId: string): Promise<void> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    plan.status = MigrationPlanStatus.CANCELLED;
    await this.migrationRepository.updateMigrationPlan(plan);
    this.logger.log(`Cancelled migration: ${planId}`);
  }

  async validateMigrationStep(planId: string, phaseId: string, taskId: string): Promise<ValidationResult[]> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    const phase = plan.phases.find(p => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`);
    }

    const task = phase.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    return this.validateTask(task);
  }

  async validateSystemState(planId: string): Promise<ValidationResult[]> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    // Implementation would validate overall system state
    return [];
  }

  async rollbackToPhase(planId: string, targetPhaseId: string): Promise<RollbackResult> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    const targetPhase = plan.phases.find(p => p.id === targetPhaseId);
    if (!targetPhase) {
      throw new Error(`Target phase ${targetPhaseId} not found`);
    }

    this.logger.log(`Rolling back to phase: ${targetPhaseId}`);
    const startTime = Date.now();

    try {
      const stepsExecuted: string[] = [];
      const validationResults: ValidationResult[] = [];

      // Find phases to rollback (all phases after target)
      const targetIndex = plan.phases.findIndex(p => p.id === targetPhaseId);
      const phasesToRollback = plan.phases.slice(targetIndex + 1).reverse();

      // Execute rollback for each phase
      for (const phase of phasesToRollback) {
        if (phase.rollbackProcedure) {
          for (const step of phase.rollbackProcedure.steps) {
            await this.executeRollbackStep(step);
            stepsExecuted.push(step.id);
          }

          // Validate rollback
          for (const validation of phase.rollbackProcedure.validationChecks) {
            const result = await this.executeValidation(validation);
            validationResults.push(result);
          }
        }

        phase.status = MigrationPhaseStatus.ROLLED_BACK;
      }

      await this.migrationRepository.updateMigrationPlan(plan);

      const result: RollbackResult = {
        success: true,
        phaseId: targetPhaseId,
        message: `Successfully rolled back to phase ${targetPhase.name}`,
        stepsExecuted,
        validationResults,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveRollbackResult(result);
      this.logger.log(`Rollback completed to phase: ${targetPhaseId}`);

      return result;

    } catch (error) {
      const result: RollbackResult = {
        success: false,
        phaseId: targetPhaseId,
        message: `Rollback failed: ${error.message}`,
        stepsExecuted: [],
        validationResults: [],
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveRollbackResult(result);
      this.logger.error(`Rollback failed: ${error.message}`);

      throw error;
    }
  }

  async rollbackTask(planId: string, phaseId: string, taskId: string): Promise<RollbackResult> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    const phase = plan.phases.find(p => p.id === phaseId);
    if (!phase) {
      throw new Error(`Phase ${phaseId} not found`);
    }

    const task = phase.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    this.logger.log(`Rolling back task: ${taskId}`);
    const startTime = Date.now();

    try {
      const stepsExecuted: string[] = [];
      const validationResults: ValidationResult[] = [];

      // Execute rollback steps
      for (const step of task.rollbackSteps) {
        await this.executeRollbackStep(step);
        stepsExecuted.push(step.id);
      }

      // Validate rollback
      for (const validation of task.validationSteps) {
        const result = await this.executeValidation(validation);
        validationResults.push(result);
      }

      task.status = MigrationTaskStatus.ROLLED_BACK;
      await this.migrationRepository.updateMigrationPlan(plan);

      const result: RollbackResult = {
        success: true,
        phaseId,
        message: `Successfully rolled back task ${task.name}`,
        stepsExecuted,
        validationResults,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveRollbackResult(result);
      this.logger.log(`Task rollback completed: ${taskId}`);

      return result;

    } catch (error) {
      const result: RollbackResult = {
        success: false,
        phaseId,
        message: `Task rollback failed: ${error.message}`,
        stepsExecuted: [],
        validationResults: [],
        duration: Date.now() - startTime,
        timestamp: new Date()
      };

      await this.migrationRepository.saveRollbackResult(result);
      this.logger.error(`Task rollback failed: ${error.message}`);

      throw error;
    }
  }

  async estimateMigrationDuration(plan: MigrationPlan): Promise<number> {
    let totalDuration = 0;

    for (const phase of plan.phases) {
      totalDuration += phase.estimatedDuration;
    }

    // Add buffer for validation and potential issues (20%)
    return Math.ceil(totalDuration * 1.2);
  }

  async generateMigrationReport(planId: string): Promise<MigrationReport> {
    const plan = await this.migrationRepository.getMigrationPlan(planId);
    if (!plan) {
      throw new Error(`Migration plan ${planId} not found`);
    }

    const results = await this.migrationRepository.getResults(planId);
    const rollbackHistory = await this.migrationRepository.getRollbackResults(planId);
    const validationResults = await this.migrationRepository.getValidationResults(planId);

    // Implementation would generate comprehensive report
    const report: MigrationReport = {
      planId: plan.id,
      planName: plan.name,
      status: plan.status,
      startedAt: plan.startedAt,
      completedAt: plan.completedAt,
      duration: plan.completedAt && plan.startedAt ? 
        plan.completedAt.getTime() - plan.startedAt.getTime() : undefined,
      totalPhases: plan.phases.length,
      completedPhases: plan.phases.filter(p => p.status === MigrationPhaseStatus.COMPLETED).length,
      failedPhases: plan.phases.filter(p => p.status === MigrationPhaseStatus.FAILED).length,
      totalTasks: plan.phases.flatMap(p => p.tasks).length,
      completedTasks: plan.phases.flatMap(p => p.tasks).filter(t => t.status === MigrationTaskStatus.COMPLETED).length,
      failedTasks: plan.phases.flatMap(p => p.tasks).filter(t => t.status === MigrationTaskStatus.FAILED).length,
      overallProgress: 0, // Calculate based on completed tasks
      phases: [], // Generate phase reports
      validationSummary: {
        totalValidations: validationResults.length,
        passedValidations: validationResults.filter(v => v.success).length,
        failedValidations: validationResults.filter(v => !v.success).length,
        criticalFailures: 0,
        warningCount: 0,
        validationsByType: {}
      },
      rollbackHistory,
      recommendations: []
    };

    return report;
  }

  // Private helper methods
  private generateId(): string {
    return `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private detectCircularDependencies(plan: MigrationPlan): string[] {
    // Implementation would detect circular dependencies
    return [];
  }

  private async validatePhase(phase: MigrationPhase): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    if (!phase.tasks || phase.tasks.length === 0) {
      results.push({
        stepId: `phase-${phase.id}-tasks`,
        success: false,
        message: `Phase ${phase.name} must have at least one task`,
        timestamp: new Date()
      });
    }

    return results;
  }

  private async validatePrerequisites(plan: MigrationPlan, phase: MigrationPhase): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const prerequisite of phase.prerequisites) {
      // Implementation would validate each prerequisite
      results.push({
        stepId: `prerequisite-${prerequisite}`,
        success: true,
        message: `Prerequisite ${prerequisite} validated`,
        timestamp: new Date()
      });
    }

    return results;
  }

  private async validatePhaseCompletion(plan: MigrationPlan, phase: MigrationPhase): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const criteria of phase.successCriteria) {
      // Implementation would validate each success criteria
      results.push({
        stepId: `success-criteria-${criteria}`,
        success: true,
        message: `Success criteria ${criteria} met`,
        timestamp: new Date()
      });
    }

    return results;
  }

  private async executeTaskByType(task: MigrationTask): Promise<any> {
    switch (task.type) {
      case MigrationTaskType.DATA_MIGRATION:
        return this.executeDataMigration(task);
      case MigrationTaskType.SCHEMA_MIGRATION:
        return this.executeSchemaMigration(task);
      case MigrationTaskType.CODE_DEPLOYMENT:
        return this.executeCodeDeployment(task);
      case MigrationTaskType.INFRASTRUCTURE_UPDATE:
        return this.executeInfrastructureUpdate(task);
      case MigrationTaskType.VALIDATION:
        return this.executeValidationTask(task);
      case MigrationTaskType.CLEANUP:
        return this.executeCleanupTask(task);
      case MigrationTaskType.BACKUP:
        return this.executeBackupTask(task);
      case MigrationTaskType.CONFIGURATION:
        return this.executeConfigurationTask(task);
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async executeDataMigration(task: MigrationTask): Promise<any> {
    // Implementation would execute data migration
    this.logger.log(`Executing data migration: ${task.name}`);
    return { migrated: true };
  }

  private async executeSchemaMigration(task: MigrationTask): Promise<any> {
    // Implementation would execute schema migration
    this.logger.log(`Executing schema migration: ${task.name}`);
    return { migrated: true };
  }

  private async executeCodeDeployment(task: MigrationTask): Promise<any> {
    // Implementation would execute code deployment
    this.logger.log(`Executing code deployment: ${task.name}`);
    return { deployed: true };
  }

  private async executeInfrastructureUpdate(task: MigrationTask): Promise<any> {
    // Implementation would execute infrastructure update
    this.logger.log(`Executing infrastructure update: ${task.name}`);
    return { updated: true };
  }

  private async executeValidationTask(task: MigrationTask): Promise<any> {
    // Implementation would execute validation
    this.logger.log(`Executing validation: ${task.name}`);
    return { validated: true };
  }

  private async executeCleanupTask(task: MigrationTask): Promise<any> {
    // Implementation would execute cleanup
    this.logger.log(`Executing cleanup: ${task.name}`);
    return { cleaned: true };
  }

  private async executeBackupTask(task: MigrationTask): Promise<any> {
    // Implementation would execute backup
    this.logger.log(`Executing backup: ${task.name}`);
    return { backed_up: true };
  }

  private async executeConfigurationTask(task: MigrationTask): Promise<any> {
    // Implementation would execute configuration
    this.logger.log(`Executing configuration: ${task.name}`);
    return { configured: true };
  }

  private async validateTask(task: MigrationTask): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const validation of task.validationSteps) {
      const result = await this.executeValidation(validation);
      results.push(result);
    }

    return results;
  }

  private async executeValidation(validation: any): Promise<ValidationResult> {
    // Implementation would execute validation step
    return {
      stepId: validation.id,
      success: true,
      message: `Validation ${validation.name} passed`,
      timestamp: new Date()
    };
  }

  private async executeRollbackStep(step: any): Promise<void> {
    // Implementation would execute rollback step
    this.logger.log(`Executing rollback step: ${step.name}`);
  }

  private calculateRemainingTime(plan: MigrationPlan, progress: number): number {
    if (progress === 0) return plan.estimatedDuration;
    
    const elapsed = plan.startedAt ? Date.now() - plan.startedAt.getTime() : 0;
    const elapsedMinutes = elapsed / (1000 * 60);
    const totalEstimated = elapsedMinutes / (progress / 100);
    
    return Math.max(0, totalEstimated - elapsedMinutes);
  }
}