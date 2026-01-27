import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpException,
  Logger
} from '@nestjs/common';
import { MigrationOrchestratorService } from '../../domain/services/migration-orchestrator.service';
import {
  MigrationPlan,
  MigrationProgress,
  MigrationResult,
  ValidationResult,
  RollbackResult
} from '../../domain/entities/migration.entity';
import { MigrationReport } from '../../domain/repositories/migration.repository';

@Controller('api/migration')
export class MigrationController {
  private readonly logger = new Logger(MigrationController.name);

  constructor(
    private readonly migrationOrchestrator: MigrationOrchestratorService
  ) {}

  @Post('plans')
  async createMigrationPlan(@Body() planData: Partial<MigrationPlan>): Promise<MigrationPlan> {
    try {
      this.logger.log(`Creating migration plan: ${planData.name}`);
      return await this.migrationOrchestrator.createMigrationPlan(planData);
    } catch (error) {
      this.logger.error(`Failed to create migration plan: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('plans/:planId/validate')
  async validateMigrationPlan(@Param('planId') planId: string): Promise<ValidationResult[]> {
    try {
      // First get the plan, then validate it
      const plan = await this.getMigrationPlanById(planId);
      return await this.migrationOrchestrator.validateMigrationPlan(plan);
    } catch (error) {
      this.logger.error(`Failed to validate migration plan ${planId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('plans/:planId/phases/:phaseId/execute')
  async executeMigrationPhase(
    @Param('planId') planId: string,
    @Param('phaseId') phaseId: string
  ): Promise<MigrationResult> {
    try {
      this.logger.log(`Executing migration phase: ${phaseId} in plan: ${planId}`);
      return await this.migrationOrchestrator.executeMigrationPhase(planId, phaseId);
    } catch (error) {
      this.logger.error(`Failed to execute migration phase ${phaseId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('plans/:planId/phases/:phaseId/tasks/:taskId/execute')
  async executeMigrationTask(
    @Param('planId') planId: string,
    @Param('phaseId') phaseId: string,
    @Param('taskId') taskId: string
  ): Promise<MigrationResult> {
    try {
      this.logger.log(`Executing migration task: ${taskId} in phase: ${phaseId}`);
      return await this.migrationOrchestrator.executeMigrationTask(planId, phaseId, taskId);
    } catch (error) {
      this.logger.error(`Failed to execute migration task ${taskId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('plans/:planId/progress')
  async getMigrationProgress(@Param('planId') planId: string): Promise<MigrationProgress> {
    try {
      return await this.migrationOrchestrator.getMigrationProgress(planId);
    } catch (error) {
      this.logger.error(`Failed to get migration progress for ${planId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Post('plans/:planId/pause')
  async pauseMigration(@Param('planId') planId: string): Promise<{ message: string }> {
    try {
      await this.migrationOrchestrator.pauseMigration(planId);
      return { message: `Migration ${planId} paused successfully` };
    } catch (error) {
      this.logger.error(`Failed to pause migration ${planId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('plans/:planId/resume')
  async resumeMigration(@Param('planId') planId: string): Promise<{ message: string }> {
    try {
      await this.migrationOrchestrator.resumeMigration(planId);
      return { message: `Migration ${planId} resumed successfully` };
    } catch (error) {
      this.logger.error(`Failed to resume migration ${planId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('plans/:planId/cancel')
  async cancelMigration(@Param('planId') planId: string): Promise<{ message: string }> {
    try {
      await this.migrationOrchestrator.cancelMigration(planId);
      return { message: `Migration ${planId} cancelled successfully` };
    } catch (error) {
      this.logger.error(`Failed to cancel migration ${planId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('plans/:planId/phases/:phaseId/tasks/:taskId/validate')
  async validateMigrationStep(
    @Param('planId') planId: string,
    @Param('phaseId') phaseId: string,
    @Param('taskId') taskId: string
  ): Promise<ValidationResult[]> {
    try {
      return await this.migrationOrchestrator.validateMigrationStep(planId, phaseId, taskId);
    } catch (error) {
      this.logger.error(`Failed to validate migration step: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('plans/:planId/validate-system')
  async validateSystemState(@Param('planId') planId: string): Promise<ValidationResult[]> {
    try {
      return await this.migrationOrchestrator.validateSystemState(planId);
    } catch (error) {
      this.logger.error(`Failed to validate system state: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('plans/:planId/rollback/:targetPhaseId')
  async rollbackToPhase(
    @Param('planId') planId: string,
    @Param('targetPhaseId') targetPhaseId: string
  ): Promise<RollbackResult> {
    try {
      this.logger.log(`Rolling back plan ${planId} to phase: ${targetPhaseId}`);
      return await this.migrationOrchestrator.rollbackToPhase(planId, targetPhaseId);
    } catch (error) {
      this.logger.error(`Failed to rollback to phase ${targetPhaseId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('plans/:planId/phases/:phaseId/tasks/:taskId/rollback')
  async rollbackTask(
    @Param('planId') planId: string,
    @Param('phaseId') phaseId: string,
    @Param('taskId') taskId: string
  ): Promise<RollbackResult> {
    try {
      this.logger.log(`Rolling back task ${taskId} in phase ${phaseId}`);
      return await this.migrationOrchestrator.rollbackTask(planId, phaseId, taskId);
    } catch (error) {
      this.logger.error(`Failed to rollback task ${taskId}: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('plans/:planId/estimate')
  async estimateMigrationDuration(@Param('planId') planId: string): Promise<{ duration: number }> {
    try {
      const plan = await this.getMigrationPlanById(planId);
      const duration = await this.migrationOrchestrator.estimateMigrationDuration(plan);
      return { duration };
    } catch (error) {
      this.logger.error(`Failed to estimate migration duration: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Get('plans/:planId/report')
  async generateMigrationReport(@Param('planId') planId: string): Promise<MigrationReport> {
    try {
      return await this.migrationOrchestrator.generateMigrationReport(planId);
    } catch (error) {
      this.logger.error(`Failed to generate migration report: ${error.message}`);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  // Helper method to get migration plan by ID
  private async getMigrationPlanById(planId: string): Promise<MigrationPlan> {
    // This would typically use the repository directly
    // For now, we'll create a simple plan structure
    const samplePlan: MigrationPlan = {
      id: planId,
      name: 'Trinity Complete Refactoring',
      description: 'Complete refactoring of Trinity system from legacy to clean architecture',
      version: '1.0.0',
      phases: [],
      dependencies: [],
      rollbackStrategies: [],
      validationCriteria: [],
      estimatedDuration: 0,
      status: 'draft' as any,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    return samplePlan;
  }
}