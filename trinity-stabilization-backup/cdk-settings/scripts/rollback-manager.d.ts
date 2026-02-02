#!/usr/bin/env npx ts-node
/**
 * Trinity Rollback Manager
 *
 * Provides comprehensive rollback capabilities for Trinity deployments
 * including stack rollback, resource restoration, and data recovery
 */
interface RollbackConfig {
    environment: 'dev' | 'staging' | 'production';
    region: string;
    backupTimestamp?: string;
    targetStack?: string;
    dryRun: boolean;
}
interface BackupMetadata {
    timestamp: string;
    environment: string;
    region: string;
    stacks: string[];
    outputs: Record<string, any>;
    deploymentLog: string[];
}
declare class TrinityRollbackManager {
    private config;
    private cfClient;
    private rollbackLog;
    constructor(config: RollbackConfig);
    private log;
    /**
     * List available backups
     */
    listBackups(): BackupMetadata[];
    /**
     * Validate rollback target
     */
    validateRollbackTarget(backup: BackupMetadata): Promise<boolean>;
    /**
     * Execute stack rollback
     */
    executeStackRollback(stackName: string): Promise<boolean>;
    /**
     * Restore configuration from backup
     */
    restoreConfiguration(backup: BackupMetadata): Promise<boolean>;
    /**
     * Execute full rollback
     */
    executeRollback(): Promise<boolean>;
}
export { TrinityRollbackManager, RollbackConfig };
