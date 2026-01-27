import { Module } from '@nestjs/common';
import { MigrationOrchestratorService } from './services/migration-orchestrator.service';
import { MigrationExecutionEngine } from './services/migration-execution-engine.service';
import { RollbackRecoveryService } from './services/rollback-recovery.service';
import { MigrationRepositoryImpl } from '../infrastructure/database/migration.repository.impl';

@Module({
  providers: [
    MigrationOrchestratorService,
    MigrationExecutionEngine,
    RollbackRecoveryService,
    {
      provide: 'IMigrationRepository',
      useClass: MigrationRepositoryImpl,
    },
  ],
  exports: [MigrationOrchestratorService, MigrationExecutionEngine, RollbackRecoveryService],
})
export class MigrationModule {}