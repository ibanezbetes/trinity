#!/usr/bin/env npx ts-node

/**
 * Trinity Rollback Manager
 * 
 * Provides comprehensive rollback capabilities for Trinity deployments
 * including stack rollback, resource restoration, and data recovery
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CloudFormationClient, DescribeStacksCommand, DescribeStackEventsCommand } from '@aws-sdk/client-cloudformation';

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

class TrinityRollbackManager {
  private config: RollbackConfig;
  private cfClient: CloudFormationClient;
  private rollbackLog: string[] = [];

  constructor(config: RollbackConfig) {
    this.config = config;
    this.cfClient = new CloudFormationClient({ region: config.region });
    
    this.log('🔄 Trinity Rollback Manager initialized');
    this.log(`📋 Environment: ${config.environment}`);
    this.log(`🌍 Region: ${config.region}`);
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    this.rollbackLog.push(logEntry);
    
    switch (level) {
      case 'warn':
        console.warn(`⚠️ ${message}`);
        break;
      case 'error':
        console.error(`❌ ${message}`);
        break;
      default:
        console.log(message);
    }
  }

  /**
   * List available backups
   */
  listBackups(): BackupMetadata[] {
    this.log('📋 Listing available backups...');
    
    const backupDir = 'deployment-backups';
    if (!fs.existsSync(backupDir)) {
      this.log('⚠️ No backup directory found', 'warn');
      return [];
    }

    const backups: BackupMetadata[] = [];
    const backupDates = fs.readdirSync(backupDir);

    for (const date of backupDates) {
      const datePath = path.join(backupDir, date);
      if (fs.statSync(datePath).isDirectory()) {
        try {
          const deploymentLogPath = path.join(datePath, 'deployment-log.txt');
          const outputsPath = path.join(datePath, 'cdk-outputs-backup.json');
          
          if (fs.existsSync(deploymentLogPath)) {
            const deploymentLog = fs.readFileSync(deploymentLogPath, 'utf8').split('\n');
            let outputs = {};
            
            if (fs.existsSync(outputsPath)) {
              outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
            }

            backups.push({
              timestamp: date,
              environment: this.config.environment,
              region: this.config.region,
              stacks: Object.keys(outputs),
              outputs,
              deploymentLog
            });
          }
        } catch (error) {
          this.log(`⚠️ Failed to read backup ${date}: ${error}`, 'warn');
        }
      }
    }

    this.log(`✅ Found ${backups.length} backups`);
    return backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  /**
   * Validate rollback target
   */
  async validateRollbackTarget(backup: BackupMetadata): Promise<boolean> {
    this.log(`🔍 Validating rollback target: ${backup.timestamp}`);
    
    try {
      // Check if stacks exist
      for (const stackName of backup.stacks) {
        try {
          await this.cfClient.send(new DescribeStacksCommand({ StackName: stackName }));
          this.log(`✅ Stack ${stackName} exists and can be rolled back`);
        } catch (error) {
          this.log(`⚠️ Stack ${stackName} not found - may have been deleted`, 'warn');
        }
      }

      // Validate backup integrity
      if (!backup.outputs || Object.keys(backup.outputs).length === 0) {
        this.log('⚠️ Backup has no outputs - may be incomplete', 'warn');
        return false;
      }

      this.log('✅ Rollback target validation completed');
      return true;

    } catch (error) {
      this.log(`❌ Rollback validation failed: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Execute stack rollback
   */
  async executeStackRollback(stackName: string): Promise<boolean> {
    this.log(`🔄 Rolling back stack: ${stackName}`);
    
    try {
      if (this.config.dryRun) {
        this.log(`🔍 DRY RUN: Would rollback stack ${stackName}`);
        return true;
      }

      // Get stack events before rollback
      const eventsResponse = await this.cfClient.send(
        new DescribeStackEventsCommand({ StackName: stackName })
      );
      
      const recentEvents = eventsResponse.StackEvents?.slice(0, 10) || [];
      this.log(`📋 Recent events for ${stackName}:`);
      recentEvents.forEach(event => {
        this.log(`   ${event.Timestamp}: ${event.LogicalResourceId} - ${event.ResourceStatus}`);
      });

      // Execute CDK rollback
      const rollbackCommand = ['cdk', 'deploy', stackName, '--rollback'];
      
      this.log(`📝 Executing: ${rollbackCommand.join(' ')}`);
      
      const rollbackProcess = spawn(rollbackCommand[0], rollbackCommand.slice(1), {
        stdio: 'inherit',
        env: { ...process.env, CDK_DEFAULT_REGION: this.config.region }
      });

      return new Promise((resolve, reject) => {
        rollbackProcess.on('close', (code) => {
          if (code === 0) {
            this.log(`✅ Stack ${stackName} rolled back successfully`);
            resolve(true);
          } else {
            this.log(`❌ Stack ${stackName} rollback failed with code ${code}`, 'error');
            resolve(false);
          }
        });

        rollbackProcess.on('error', (error) => {
          this.log(`❌ Rollback error: ${error}`, 'error');
          reject(error);
        });
      });

    } catch (error) {
      this.log(`❌ Stack rollback failed: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Restore configuration from backup
   */
  async restoreConfiguration(backup: BackupMetadata): Promise<boolean> {
    this.log(`🔧 Restoring configuration from backup: ${backup.timestamp}`);
    
    try {
      if (this.config.dryRun) {
        this.log('🔍 DRY RUN: Would restore configuration');
        return true;
      }

      // Restore CDK outputs
      const outputsPath = 'cdk-outputs.json';
      const backupOutputsPath = path.join('deployment-backups', backup.timestamp, 'cdk-outputs-backup.json');
      
      if (fs.existsSync(backupOutputsPath)) {
        fs.copyFileSync(backupOutputsPath, outputsPath);
        this.log('✅ CDK outputs restored');
      }

      // Create restoration report
      const restorationReport = {
        timestamp: new Date().toISOString(),
        backupSource: backup.timestamp,
        environment: this.config.environment,
        region: this.config.region,
        restoredStacks: backup.stacks,
        rollbackLog: this.rollbackLog
      };

      const reportPath = path.join('rollback-reports', `restoration-${Date.now()}.json`);
      
      if (!fs.existsSync('rollback-reports')) {
        fs.mkdirSync('rollback-reports', { recursive: true });
      }
      
      fs.writeFileSync(reportPath, JSON.stringify(restorationReport, null, 2));
      this.log(`📋 Restoration report saved: ${reportPath}`);

      return true;

    } catch (error) {
      this.log(`❌ Configuration restoration failed: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Execute full rollback
   */
  async executeRollback(): Promise<boolean> {
    try {
      this.log('🔄 Starting Trinity rollback process...');

      // List available backups
      const backups = this.listBackups();
      if (backups.length === 0) {
        this.log('❌ No backups available for rollback', 'error');
        return false;
      }

      // Select backup (use specified timestamp or latest)
      let targetBackup: BackupMetadata;
      if (this.config.backupTimestamp) {
        const found = backups.find(b => b.timestamp === this.config.backupTimestamp);
        if (!found) {
          this.log(`❌ Backup ${this.config.backupTimestamp} not found`, 'error');
          return false;
        }
        targetBackup = found;
      } else {
        targetBackup = backups[0]; // Latest backup
      }

      this.log(`🎯 Target backup: ${targetBackup.timestamp}`);

      // Validate rollback target
      const isValid = await this.validateRollbackTarget(targetBackup);
      if (!isValid) {
        this.log('❌ Rollback target validation failed', 'error');
        return false;
      }

      // Execute rollback for each stack or specific stack
      const stacksToRollback = this.config.targetStack 
        ? [this.config.targetStack]
        : targetBackup.stacks;

      let success = true;
      for (const stackName of stacksToRollback) {
        const rollbackSuccess = await this.executeStackRollback(stackName);
        if (!rollbackSuccess) {
          success = false;
          break;
        }
      }

      // Restore configuration
      if (success) {
        const configSuccess = await this.restoreConfiguration(targetBackup);
        if (!configSuccess) {
          this.log('⚠️ Configuration restoration had issues', 'warn');
        }
      }

      if (success) {
        this.log('🎉 Rollback completed successfully!');
      } else {
        this.log('❌ Rollback failed', 'error');
      }

      return success;

    } catch (error) {
      this.log(`❌ Rollback process error: ${error}`, 'error');
      return false;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const config: RollbackConfig = {
    environment: (args.find(arg => arg.startsWith('--env='))?.split('=')[1] as any) || 'dev',
    region: args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1',
    backupTimestamp: args.find(arg => arg.startsWith('--backup='))?.split('=')[1],
    targetStack: args.find(arg => arg.startsWith('--stack='))?.split('=')[1],
    dryRun: args.includes('--dry-run'),
  };
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Trinity Rollback Manager

Usage:
  npx ts-node rollback-manager.ts [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --backup=<timestamp> Specific backup to rollback to (YYYY-MM-DD format)
  --stack=<name>       Specific stack to rollback (default: all stacks)
  --dry-run           Show what would be rolled back without executing
  --help, -h          Show this help message

Commands:
  list                List available backups
  rollback            Execute rollback (default)

Examples:
  # List available backups
  npx ts-node rollback-manager.ts list
  
  # Rollback to latest backup
  npx ts-node rollback-manager.ts rollback
  
  # Rollback to specific backup
  npx ts-node rollback-manager.ts rollback --backup=2026-02-01
  
  # Rollback specific stack only
  npx ts-node rollback-manager.ts rollback --stack=TrinityDatabaseStack
  
  # Dry run rollback
  npx ts-node rollback-manager.ts rollback --dry-run
`);
    process.exit(0);
  }
  
  const manager = new TrinityRollbackManager(config);
  
  if (args.includes('list')) {
    const backups = manager.listBackups();
    console.log('\n📋 Available Backups:');
    backups.forEach(backup => {
      console.log(`   ${backup.timestamp} - ${backup.stacks.length} stacks`);
    });
  } else {
    manager.executeRollback().then(success => {
      process.exit(success ? 0 : 1);
    }).catch(error => {
      console.error('❌ Rollback failed:', error);
      process.exit(1);
    });
  }
}

export { TrinityRollbackManager, RollbackConfig };