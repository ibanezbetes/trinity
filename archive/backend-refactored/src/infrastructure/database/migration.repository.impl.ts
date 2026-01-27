import { Injectable, Logger } from '@nestjs/common';
import { IMigrationRepository } from '../../domain/repositories/migration.repository';
import {
  MigrationPlan,
  MigrationProgress,
  MigrationResult,
  ValidationResult,
  RollbackResult
} from '../../domain/entities/migration.entity';

@Injectable()
export class MigrationRepositoryImpl implements IMigrationRepository {
  private readonly logger = new Logger(MigrationRepositoryImpl.name);
  
  // In-memory storage for now - would be replaced with actual database
  private migrationPlans = new Map<string, MigrationPlan>();
  private migrationProgress = new Map<string, MigrationProgress>();
  private migrationResults = new Map<string, MigrationResult[]>();
  private validationResults = new Map<string, ValidationResult[]>();
  private rollbackResults = new Map<string, RollbackResult[]>();

  async saveMigrationPlan(plan: MigrationPlan): Promise<void> {
    this.migrationPlans.set(plan.id, { ...plan });
    this.logger.debug(`Saved migration plan: ${plan.id}`);
  }

  async getMigrationPlan(id: string): Promise<MigrationPlan | null> {
    const plan = this.migrationPlans.get(id);
    return plan ? { ...plan } : null;
  }

  async updateMigrationPlan(plan: MigrationPlan): Promise<void> {
    if (!this.migrationPlans.has(plan.id)) {
      throw new Error(`Migration plan ${plan.id} not found`);
    }
    
    plan.updatedAt = new Date();
    this.migrationPlans.set(plan.id, { ...plan });
    this.logger.debug(`Updated migration plan: ${plan.id}`);
  }

  async deleteMigrationPlan(id: string): Promise<void> {
    if (!this.migrationPlans.has(id)) {
      throw new Error(`Migration plan ${id} not found`);
    }
    
    this.migrationPlans.delete(id);
    this.migrationProgress.delete(id);
    this.migrationResults.delete(id);
    this.validationResults.delete(id);
    this.rollbackResults.delete(id);
    
    this.logger.debug(`Deleted migration plan: ${id}`);
  }

  async listMigrationPlans(): Promise<MigrationPlan[]> {
    return Array.from(this.migrationPlans.values()).map(plan => ({ ...plan }));
  }

  async saveProgress(progress: MigrationProgress): Promise<void> {
    this.migrationProgress.set(progress.planId, { ...progress });
    this.logger.debug(`Saved migration progress for plan: ${progress.planId}`);
  }

  async getProgress(planId: string): Promise<MigrationProgress | null> {
    const progress = this.migrationProgress.get(planId);
    return progress ? { ...progress } : null;
  }

  async updateProgress(progress: MigrationProgress): Promise<void> {
    if (!this.migrationProgress.has(progress.planId)) {
      throw new Error(`Migration progress for plan ${progress.planId} not found`);
    }
    
    progress.lastUpdatedAt = new Date();
    this.migrationProgress.set(progress.planId, { ...progress });
    this.logger.debug(`Updated migration progress for plan: ${progress.planId}`);
  }

  async saveResult(result: MigrationResult): Promise<void> {
    const planResults = this.migrationResults.get(result.phaseId) || [];
    planResults.push({ ...result });
    this.migrationResults.set(result.phaseId, planResults);
    this.logger.debug(`Saved migration result for phase: ${result.phaseId}`);
  }

  async getResults(planId: string): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    
    // Get all results for all phases of this plan
    const plan = await this.getMigrationPlan(planId);
    if (plan) {
      for (const phase of plan.phases) {
        const phaseResults = this.migrationResults.get(phase.id) || [];
        results.push(...phaseResults);
      }
    }
    
    return results.map(result => ({ ...result }));
  }

  async getPhaseResults(planId: string, phaseId: string): Promise<MigrationResult[]> {
    const results = this.migrationResults.get(phaseId) || [];
    return results.map(result => ({ ...result }));
  }

  async saveValidationResult(result: ValidationResult): Promise<void> {
    const key = `${result.stepId}`;
    const results = this.validationResults.get(key) || [];
    results.push({ ...result });
    this.validationResults.set(key, results);
    this.logger.debug(`Saved validation result: ${result.stepId}`);
  }

  async getValidationResults(planId: string, phaseId?: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    // For now, return all validation results
    // In a real implementation, this would filter by plan/phase
    for (const resultList of this.validationResults.values()) {
      results.push(...resultList);
    }
    
    return results.map(result => ({ ...result }));
  }

  async saveRollbackResult(result: RollbackResult): Promise<void> {
    const results = this.rollbackResults.get(result.phaseId) || [];
    results.push({ ...result });
    this.rollbackResults.set(result.phaseId, results);
    this.logger.debug(`Saved rollback result for phase: ${result.phaseId}`);
  }

  async getRollbackResults(planId: string): Promise<RollbackResult[]> {
    const results: RollbackResult[] = [];
    
    // Get all rollback results for all phases of this plan
    const plan = await this.getMigrationPlan(planId);
    if (plan) {
      for (const phase of plan.phases) {
        const phaseResults = this.rollbackResults.get(phase.id) || [];
        results.push(...phaseResults);
      }
    }
    
    return results.map(result => ({ ...result }));
  }
}