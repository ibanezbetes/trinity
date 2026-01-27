import { Test, TestingModule } from '@nestjs/testing';
import { MigrationOrchestratorService } from './migration-orchestrator.service';
import { MigrationRepositoryImpl } from '../../infrastructure/database/migration.repository.impl';
import {
  MigrationPlan,
  MigrationPhase,
  MigrationTask,
  MigrationTaskType,
  ValidationType,
  DependencyType,
  RiskLevel,
  MigrationPhaseStatus,
  MigrationTaskStatus,
  MigrationPlanStatus
} from '../entities/migration.entity';

describe('MigrationOrchestratorService', () => {
  let service: MigrationOrchestratorService;
  let repository: MigrationRepositoryImpl;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationOrchestratorService,
        {
          provide: 'IMigrationRepository',
          useClass: MigrationRepositoryImpl,
        },
      ],
    }).compile();

    service = module.get<MigrationOrchestratorService>(MigrationOrchestratorService);
    repository = module.get<MigrationRepositoryImpl>('IMigrationRepository');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMigrationPlan', () => {
    it('should create a migration plan with default values', async () => {
      const planData = {
        name: 'Test Migration Plan',
        description: 'A test migration plan'
      };

      const plan = await service.createMigrationPlan(planData);

      expect(plan).toBeDefined();
      expect(plan.id).toBeDefined();
      expect(plan.name).toBe(planData.name);
      expect(plan.description).toBe(planData.description);
      expect(plan.version).toBe('1.0.0');
      expect(plan.status).toBe(MigrationPlanStatus.DRAFT);
      expect(plan.phases).toEqual([]);
      expect(plan.dependencies).toEqual([]);
      expect(plan.rollbackStrategies).toEqual([]);
      expect(plan.validationCriteria).toEqual([]);
      expect(plan.createdAt).toBeInstanceOf(Date);
      expect(plan.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a migration plan with provided phases', async () => {
      const testTask: MigrationTask = {
        id: 'task-1',
        name: 'Test Task',
        description: 'A test task',
        type: MigrationTaskType.DATA_MIGRATION,
        parameters: { source: 'old_db', target: 'new_db' },
        dependencies: [],
        validationSteps: [{
          id: 'validation-1',
          name: 'Data Integrity Check',
          description: 'Verify data integrity',
          type: ValidationType.DATA_INTEGRITY,
          criteria: {
            expectedResult: 'success',
            minimumThreshold: 0.99
          },
          timeout: 300
        }],
        rollbackSteps: [{
          id: 'rollback-1',
          name: 'Restore Backup',
          description: 'Restore from backup',
          action: 'restore_backup',
          parameters: { backup_id: 'backup-123' },
          order: 1
        }],
        status: MigrationTaskStatus.PENDING
      };

      const testPhase: MigrationPhase = {
        id: 'phase-1',
        name: 'Data Migration Phase',
        description: 'Migrate data from old to new system',
        tasks: [testTask],
        prerequisites: ['backup_completed'],
        successCriteria: ['all_data_migrated', 'integrity_verified'],
        rollbackProcedure: {
          id: 'rollback-phase-1',
          name: 'Phase 1 Rollback',
          steps: [{
            id: 'rollback-step-1',
            name: 'Restore Database',
            description: 'Restore database from backup',
            action: 'restore_database',
            parameters: { backup_location: '/backups/db.sql' },
            order: 1
          }],
          validationChecks: [{
            id: 'rollback-validation-1',
            name: 'Verify Rollback',
            description: 'Verify rollback completed successfully',
            type: ValidationType.FUNCTIONALITY,
            criteria: { expectedResult: 'restored' },
            timeout: 180
          }],
          safetyChecks: ['verify_backup_exists', 'check_disk_space']
        },
        estimatedDuration: 120,
        status: MigrationPhaseStatus.PENDING
      };

      const planData = {
        name: 'Complex Migration Plan',
        description: 'A complex migration with phases',
        phases: [testPhase]
      };

      const plan = await service.createMigrationPlan(planData);

      expect(plan.phases).toHaveLength(1);
      expect(plan.phases[0].name).toBe(testPhase.name);
      expect(plan.phases[0].tasks).toHaveLength(1);
      expect(plan.phases[0].tasks[0].name).toBe(testTask.name);
      expect(plan.phases[0].tasks[0].type).toBe(MigrationTaskType.DATA_MIGRATION);
      expect(plan.phases[0].rollbackProcedure).toBeDefined();
      expect(plan.phases[0].rollbackProcedure.steps).toHaveLength(1);
    });
  });

  describe('validateMigrationPlan', () => {
    it('should validate a plan with no phases as invalid', async () => {
      const plan: MigrationPlan = {
        id: 'test-plan',
        name: 'Empty Plan',
        description: 'A plan with no phases',
        version: '1.0.0',
        phases: [],
        dependencies: [],
        rollbackStrategies: [],
        validationCriteria: [],
        estimatedDuration: 0,
        status: MigrationPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const results = await service.validateMigrationPlan(plan);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].stepId).toBe('plan-structure');
      expect(results[0].message).toContain('at least one phase');
    });

    it('should validate a plan with phases but no tasks as invalid', async () => {
      const plan: MigrationPlan = {
        id: 'test-plan',
        name: 'Plan with Empty Phase',
        description: 'A plan with phases but no tasks',
        version: '1.0.0',
        phases: [{
          id: 'empty-phase',
          name: 'Empty Phase',
          description: 'A phase with no tasks',
          tasks: [],
          prerequisites: [],
          successCriteria: ['phase_completed'],
          rollbackProcedure: {
            id: 'rollback-empty',
            name: 'Empty Rollback',
            steps: [],
            validationChecks: [],
            safetyChecks: []
          },
          estimatedDuration: 60,
          status: MigrationPhaseStatus.PENDING
        }],
        dependencies: [],
        rollbackStrategies: [],
        validationCriteria: [],
        estimatedDuration: 60,
        status: MigrationPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const results = await service.validateMigrationPlan(plan);

      const phaseTaskError = results.find(r => r.stepId === 'phase-empty-phase-tasks');
      expect(phaseTaskError).toBeDefined();
      expect(phaseTaskError?.success).toBe(false);
      expect(phaseTaskError?.message).toContain('at least one task');
    });

    it('should validate dependencies correctly', async () => {
      const plan: MigrationPlan = {
        id: 'test-plan',
        name: 'Plan with Dependencies',
        description: 'A plan with phase dependencies',
        version: '1.0.0',
        phases: [{
          id: 'phase-1',
          name: 'Phase 1',
          description: 'First phase',
          tasks: [{
            id: 'task-1',
            name: 'Task 1',
            description: 'First task',
            type: MigrationTaskType.BACKUP,
            parameters: {},
            dependencies: [],
            validationSteps: [],
            rollbackSteps: [],
            status: MigrationTaskStatus.PENDING
          }],
          prerequisites: [],
          successCriteria: ['task_completed'],
          rollbackProcedure: {
            id: 'rollback-1',
            name: 'Rollback 1',
            steps: [],
            validationChecks: [],
            safetyChecks: []
          },
          estimatedDuration: 30,
          status: MigrationPhaseStatus.PENDING
        }],
        dependencies: [{
          phaseId: 'phase-1',
          dependsOn: ['non-existent-phase'],
          type: DependencyType.HARD
        }],
        rollbackStrategies: [],
        validationCriteria: [],
        estimatedDuration: 30,
        status: MigrationPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const results = await service.validateMigrationPlan(plan);

      const dependencyError = results.find(r => r.stepId === 'dependency-non-existent-phase');
      expect(dependencyError).toBeDefined();
      expect(dependencyError?.success).toBe(false);
      expect(dependencyError?.message).toContain('not found');
    });
  });

  describe('getMigrationProgress', () => {
    it('should calculate progress correctly for a plan with completed tasks', async () => {
      // Create a plan with some completed tasks
      const plan = await service.createMigrationPlan({
        name: 'Progress Test Plan',
        phases: [{
          id: 'phase-1',
          name: 'Test Phase',
          description: 'A test phase',
          tasks: [
            {
              id: 'task-1',
              name: 'Completed Task',
              description: 'A completed task',
              type: MigrationTaskType.BACKUP,
              parameters: {},
              dependencies: [],
              validationSteps: [],
              rollbackSteps: [],
              status: MigrationTaskStatus.COMPLETED
            },
            {
              id: 'task-2',
              name: 'Pending Task',
              description: 'A pending task',
              type: MigrationTaskType.DATA_MIGRATION,
              parameters: {},
              dependencies: [],
              validationSteps: [],
              rollbackSteps: [],
              status: MigrationTaskStatus.PENDING
            }
          ],
          prerequisites: [],
          successCriteria: ['all_tasks_completed'],
          rollbackProcedure: {
            id: 'rollback-1',
            name: 'Test Rollback',
            steps: [],
            validationChecks: [],
            safetyChecks: []
          },
          estimatedDuration: 60,
          status: MigrationPhaseStatus.PENDING
        }]
      });

      const progress = await service.getMigrationProgress(plan.id);

      expect(progress).toBeDefined();
      expect(progress.planId).toBe(plan.id);
      expect(progress.overallProgress).toBe(50); // 1 out of 2 tasks completed
      expect(progress.completedTasks).toHaveLength(1);
      expect(progress.completedTasks[0]).toBe('task-1');
      expect(progress.failedTasks).toHaveLength(0);
      expect(progress.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty plans correctly', async () => {
      const plan = await service.createMigrationPlan({
        name: 'Empty Plan',
        phases: []
      });

      const progress = await service.getMigrationProgress(plan.id);

      expect(progress.overallProgress).toBe(0);
      expect(progress.completedPhases).toHaveLength(0);
      expect(progress.completedTasks).toHaveLength(0);
      expect(progress.failedTasks).toHaveLength(0);
    });
  });

  describe('estimateMigrationDuration', () => {
    it('should calculate duration with buffer correctly', async () => {
      const plan: MigrationPlan = {
        id: 'test-plan',
        name: 'Duration Test Plan',
        description: 'Test duration calculation',
        version: '1.0.0',
        phases: [
          {
            id: 'phase-1',
            name: 'Phase 1',
            description: 'First phase',
            tasks: [],
            prerequisites: [],
            successCriteria: [],
            rollbackProcedure: {
              id: 'rollback-1',
              name: 'Rollback 1',
              steps: [],
              validationChecks: [],
              safetyChecks: []
            },
            estimatedDuration: 60, // 1 hour
            status: MigrationPhaseStatus.PENDING
          },
          {
            id: 'phase-2',
            name: 'Phase 2',
            description: 'Second phase',
            tasks: [],
            prerequisites: [],
            successCriteria: [],
            rollbackProcedure: {
              id: 'rollback-2',
              name: 'Rollback 2',
              steps: [],
              validationChecks: [],
              safetyChecks: []
            },
            estimatedDuration: 120, // 2 hours
            status: MigrationPhaseStatus.PENDING
          }
        ],
        dependencies: [],
        rollbackStrategies: [],
        validationCriteria: [],
        estimatedDuration: 0,
        status: MigrationPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const duration = await service.estimateMigrationDuration(plan);

      // Total: 60 + 120 = 180 minutes
      // With 20% buffer: 180 * 1.2 = 216 minutes
      expect(duration).toBe(216);
    });

    it('should handle plans with no phases', async () => {
      const plan: MigrationPlan = {
        id: 'empty-plan',
        name: 'Empty Plan',
        description: 'Plan with no phases',
        version: '1.0.0',
        phases: [],
        dependencies: [],
        rollbackStrategies: [],
        validationCriteria: [],
        estimatedDuration: 0,
        status: MigrationPlanStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const duration = await service.estimateMigrationDuration(plan);

      expect(duration).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw error when getting progress for non-existent plan', async () => {
      await expect(service.getMigrationProgress('non-existent-plan'))
        .rejects.toThrow('Migration plan non-existent-plan not found');
    });

    it('should throw error when executing phase for non-existent plan', async () => {
      await expect(service.executeMigrationPhase('non-existent-plan', 'phase-1'))
        .rejects.toThrow('Migration plan non-existent-plan not found');
    });

    it('should throw error when executing non-existent phase', async () => {
      const plan = await service.createMigrationPlan({
        name: 'Test Plan',
        phases: []
      });

      await expect(service.executeMigrationPhase(plan.id, 'non-existent-phase'))
        .rejects.toThrow('Phase non-existent-phase not found');
    });
  });
});