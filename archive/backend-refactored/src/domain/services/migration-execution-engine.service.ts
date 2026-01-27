import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import {
  MigrationTask,
  MigrationTaskType,
  MigrationTaskStatus,
  ValidationResult,
  RollbackResult,
  MigrationResult
} from '../entities/migration.entity';

export interface ExecutionContext {
  planId: string;
  phaseId: string;
  taskId: string;
  parameters: Record<string, any>;
  environment: 'development' | 'staging' | 'production';
  dryRun: boolean;
  timeout: number;
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionResult {
  success: boolean;
  taskId: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  output: any;
  logs: string[];
  metrics: ExecutionMetrics;
  error?: Error;
}

export interface ExecutionMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkUsage: number;
  recordsProcessed: number;
  bytesTransferred: number;
  operationsPerSecond: number;
}

export interface TaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean;
  execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult>;
  validate(task: MigrationTask, context: ExecutionContext): Promise<ValidationResult[]>;
  rollback(task: MigrationTask, context: ExecutionContext): Promise<RollbackResult>;
}

@Injectable()
export class MigrationExecutionEngine extends EventEmitter {
  private readonly logger = new Logger(MigrationExecutionEngine.name);
  private readonly executors = new Map<MigrationTaskType, TaskExecutor>();
  private readonly runningTasks = new Map<string, ExecutionContext>();
  private readonly taskQueue: Array<{ task: MigrationTask; context: ExecutionContext }> = [];
  private isProcessingQueue = false;

  constructor() {
    super();
    this.initializeExecutors();
  }

  private initializeExecutors(): void {
    // Register task executors
    this.registerExecutor(MigrationTaskType.DATA_MIGRATION, new DataMigrationExecutor());
    this.registerExecutor(MigrationTaskType.SCHEMA_MIGRATION, new SchemaMigrationExecutor());
    this.registerExecutor(MigrationTaskType.CODE_DEPLOYMENT, new CodeDeploymentExecutor());
    this.registerExecutor(MigrationTaskType.INFRASTRUCTURE_UPDATE, new InfrastructureUpdateExecutor());
    this.registerExecutor(MigrationTaskType.VALIDATION, new ValidationExecutor());
    this.registerExecutor(MigrationTaskType.CLEANUP, new CleanupExecutor());
    this.registerExecutor(MigrationTaskType.BACKUP, new BackupExecutor());
    this.registerExecutor(MigrationTaskType.CONFIGURATION, new ConfigurationExecutor());
  }

  registerExecutor(taskType: MigrationTaskType, executor: TaskExecutor): void {
    this.executors.set(taskType, executor);
    this.logger.log(`Registered executor for task type: ${taskType}`);
  }

  async executeTask(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const executor = this.executors.get(task.type);
    if (!executor) {
      throw new Error(`No executor found for task type: ${task.type}`);
    }

    this.logger.log(`Starting execution of task: ${task.id} (${task.type})`);
    this.runningTasks.set(task.id, context);
    
    try {
      // Emit task started event
      this.emit('taskStarted', { taskId: task.id, context });

      // Pre-execution validation
      const preValidationResults = await executor.validate(task, context);
      if (preValidationResults.some(r => !r.success)) {
        throw new Error(`Pre-execution validation failed: ${preValidationResults.filter(r => !r.success).map(r => r.message).join(', ')}`);
      }

      // Execute the task
      const result = await this.executeWithTimeout(executor, task, context);

      // Post-execution validation
      const postValidationResults = await executor.validate(task, context);
      if (postValidationResults.some(r => !r.success)) {
        this.logger.warn(`Post-execution validation warnings for task ${task.id}`);
      }

      // Emit task completed event
      this.emit('taskCompleted', { taskId: task.id, result });

      this.logger.log(`Completed execution of task: ${task.id} in ${result.duration}ms`);
      return result;

    } catch (error) {
      this.logger.error(`Failed to execute task ${task.id}: ${error.message}`);
      
      // Emit task failed event
      this.emit('taskFailed', { taskId: task.id, error });

      // Attempt rollback if configured
      if (context.retryCount < context.maxRetries) {
        this.logger.log(`Retrying task ${task.id} (attempt ${context.retryCount + 1}/${context.maxRetries})`);
        context.retryCount++;
        return this.executeTask(task, context);
      }

      throw error;
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  private async executeWithTimeout(
    executor: TaskExecutor,
    task: MigrationTask,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Task ${task.id} timed out after ${context.timeout}ms`));
      }, context.timeout);

      executor.execute(task, context)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  async validateTask(task: MigrationTask, context: ExecutionContext): Promise<ValidationResult[]> {
    const executor = this.executors.get(task.type);
    if (!executor) {
      return [{
        stepId: `validation-${task.id}`,
        success: false,
        message: `No executor found for task type: ${task.type}`,
        timestamp: new Date()
      }];
    }

    return executor.validate(task, context);
  }

  async rollbackTask(task: MigrationTask, context: ExecutionContext): Promise<RollbackResult> {
    const executor = this.executors.get(task.type);
    if (!executor) {
      throw new Error(`No executor found for task type: ${task.type}`);
    }

    this.logger.log(`Rolling back task: ${task.id}`);
    
    try {
      const result = await executor.rollback(task, context);
      this.emit('taskRolledBack', { taskId: task.id, result });
      return result;
    } catch (error) {
      this.logger.error(`Failed to rollback task ${task.id}: ${error.message}`);
      throw error;
    }
  }

  queueTask(task: MigrationTask, context: ExecutionContext): void {
    this.taskQueue.push({ task, context });
    this.logger.log(`Queued task: ${task.id}`);
    
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.taskQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.logger.log(`Processing task queue (${this.taskQueue.length} tasks)`);

    while (this.taskQueue.length > 0) {
      const { task, context } = this.taskQueue.shift()!;
      
      try {
        await this.executeTask(task, context);
      } catch (error) {
        this.logger.error(`Queue task execution failed: ${error.message}`);
        // Continue processing other tasks
      }
    }

    this.isProcessingQueue = false;
    this.logger.log('Task queue processing completed');
  }

  pauseExecution(): void {
    this.isProcessingQueue = false;
    this.logger.log('Execution paused');
    this.emit('executionPaused');
  }

  resumeExecution(): void {
    if (this.taskQueue.length > 0) {
      this.processQueue();
    }
    this.logger.log('Execution resumed');
    this.emit('executionResumed');
  }

  getRunningTasks(): ExecutionContext[] {
    return Array.from(this.runningTasks.values());
  }

  getQueuedTasks(): number {
    return this.taskQueue.length;
  }

  isTaskRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  cancelTask(taskId: string): boolean {
    if (this.runningTasks.has(taskId)) {
      // In a real implementation, this would signal the executor to stop
      this.runningTasks.delete(taskId);
      this.emit('taskCancelled', { taskId });
      return true;
    }
    return false;
  }

  getExecutionMetrics(): {
    runningTasks: number;
    queuedTasks: number;
    totalExecutors: number;
    systemMetrics: ExecutionMetrics;
  } {
    return {
      runningTasks: this.runningTasks.size,
      queuedTasks: this.taskQueue.length,
      totalExecutors: this.executors.size,
      systemMetrics: this.getSystemMetrics()
    };
  }

  private getSystemMetrics(): ExecutionMetrics {
    // In a real implementation, this would collect actual system metrics
    return {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkUsage: 0,
      recordsProcessed: 0,
      bytesTransferred: 0,
      operationsPerSecond: 0
    };
  }
}

// Base executor class
abstract class BaseTaskExecutor implements TaskExecutor {
  protected readonly logger = new Logger(this.constructor.name);

  abstract canExecute(taskType: MigrationTaskType): boolean;
  abstract execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult>;

  async validate(task: MigrationTask, context: ExecutionContext): Promise<ValidationResult[]> {
    // Default validation - can be overridden
    return [{
      stepId: `validation-${task.id}`,
      success: true,
      message: 'Basic validation passed',
      timestamp: new Date()
    }];
  }

  async rollback(task: MigrationTask, context: ExecutionContext): Promise<RollbackResult> {
    // Default rollback - can be overridden
    return {
      success: true,
      phaseId: context.phaseId,
      message: `Task ${task.id} rollback completed`,
      stepsExecuted: [],
      validationResults: [],
      duration: 0,
      timestamp: new Date()
    };
  }

  protected createExecutionResult(
    task: MigrationTask,
    startTime: Date,
    success: boolean,
    output?: any,
    error?: Error
  ): ExecutionResult {
    const endTime = new Date();
    return {
      success,
      taskId: task.id,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      output: output || {},
      logs: [],
      metrics: {
        cpuUsage: 0,
        memoryUsage: 0,
        diskUsage: 0,
        networkUsage: 0,
        recordsProcessed: 0,
        bytesTransferred: 0,
        operationsPerSecond: 0
      },
      error
    };
  }
}

// Concrete executor implementations
class DataMigrationExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.DATA_MIGRATION;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing data migration: ${task.name}`);

    try {
      // Simulate data migration logic
      if (context.dryRun) {
        this.logger.log('Dry run mode - simulating data migration');
        await this.simulateDelay(1000);
      } else {
        // Actual data migration would happen here
        await this.simulateDelay(2000);
      }

      return this.createExecutionResult(task, startTime, true, {
        recordsMigrated: 1000,
        tablesProcessed: 5,
        dataIntegrityChecks: 'passed'
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class SchemaMigrationExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.SCHEMA_MIGRATION;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing schema migration: ${task.name}`);

    try {
      if (context.dryRun) {
        this.logger.log('Dry run mode - validating schema changes');
      } else {
        // Actual schema migration would happen here
      }

      await this.simulateDelay(1500);

      return this.createExecutionResult(task, startTime, true, {
        tablesCreated: 3,
        indexesCreated: 8,
        constraintsAdded: 5
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class CodeDeploymentExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.CODE_DEPLOYMENT;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing code deployment: ${task.name}`);

    try {
      if (context.dryRun) {
        this.logger.log('Dry run mode - validating deployment package');
      } else {
        // Actual code deployment would happen here
      }

      await this.simulateDelay(3000);

      return this.createExecutionResult(task, startTime, true, {
        servicesDeployed: 4,
        configurationUpdated: true,
        healthChecksPassed: true
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class InfrastructureUpdateExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.INFRASTRUCTURE_UPDATE;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing infrastructure update: ${task.name}`);

    try {
      await this.simulateDelay(2500);

      return this.createExecutionResult(task, startTime, true, {
        resourcesUpdated: 6,
        networksConfigured: 2,
        securityGroupsUpdated: 3
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ValidationExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.VALIDATION;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing validation: ${task.name}`);

    try {
      await this.simulateDelay(1000);

      return this.createExecutionResult(task, startTime, true, {
        checksPerformed: 15,
        checksPassed: 15,
        checksFailed: 0,
        warnings: 2
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class CleanupExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.CLEANUP;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing cleanup: ${task.name}`);

    try {
      await this.simulateDelay(800);

      return this.createExecutionResult(task, startTime, true, {
        filesDeleted: 25,
        tempDataCleared: true,
        cachesCleaned: 8
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class BackupExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.BACKUP;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing backup: ${task.name}`);

    try {
      await this.simulateDelay(4000);

      return this.createExecutionResult(task, startTime, true, {
        backupSize: '2.5GB',
        backupLocation: '/backups/migration-backup-' + Date.now(),
        compressionRatio: 0.65,
        integrityVerified: true
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ConfigurationExecutor extends BaseTaskExecutor {
  canExecute(taskType: MigrationTaskType): boolean {
    return taskType === MigrationTaskType.CONFIGURATION;
  }

  async execute(task: MigrationTask, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = new Date();
    this.logger.log(`Executing configuration: ${task.name}`);

    try {
      await this.simulateDelay(1200);

      return this.createExecutionResult(task, startTime, true, {
        configFilesUpdated: 12,
        environmentVariablesSet: 8,
        servicesRestarted: 3
      });
    } catch (error) {
      return this.createExecutionResult(task, startTime, false, null, error);
    }
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}