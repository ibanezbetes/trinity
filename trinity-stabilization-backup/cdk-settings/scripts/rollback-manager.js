#!/usr/bin/env npx ts-node
"use strict";
/**
 * Trinity Rollback Manager
 *
 * Provides comprehensive rollback capabilities for Trinity deployments
 * including stack rollback, resource restoration, and data recovery
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrinityRollbackManager = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const client_cloudformation_1 = require("@aws-sdk/client-cloudformation");
class TrinityRollbackManager {
    constructor(config) {
        this.rollbackLog = [];
        this.config = config;
        this.cfClient = new client_cloudformation_1.CloudFormationClient({ region: config.region });
        this.log('🔄 Trinity Rollback Manager initialized');
        this.log(`📋 Environment: ${config.environment}`);
        this.log(`🌍 Region: ${config.region}`);
    }
    log(message, level = 'info') {
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
    listBackups() {
        this.log('📋 Listing available backups...');
        const backupDir = 'deployment-backups';
        if (!fs.existsSync(backupDir)) {
            this.log('⚠️ No backup directory found', 'warn');
            return [];
        }
        const backups = [];
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
                }
                catch (error) {
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
    async validateRollbackTarget(backup) {
        this.log(`🔍 Validating rollback target: ${backup.timestamp}`);
        try {
            // Check if stacks exist
            for (const stackName of backup.stacks) {
                try {
                    await this.cfClient.send(new client_cloudformation_1.DescribeStacksCommand({ StackName: stackName }));
                    this.log(`✅ Stack ${stackName} exists and can be rolled back`);
                }
                catch (error) {
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
        }
        catch (error) {
            this.log(`❌ Rollback validation failed: ${error}`, 'error');
            return false;
        }
    }
    /**
     * Execute stack rollback
     */
    async executeStackRollback(stackName) {
        this.log(`🔄 Rolling back stack: ${stackName}`);
        try {
            if (this.config.dryRun) {
                this.log(`🔍 DRY RUN: Would rollback stack ${stackName}`);
                return true;
            }
            // Get stack events before rollback
            const eventsResponse = await this.cfClient.send(new client_cloudformation_1.DescribeStackEventsCommand({ StackName: stackName }));
            const recentEvents = eventsResponse.StackEvents?.slice(0, 10) || [];
            this.log(`📋 Recent events for ${stackName}:`);
            recentEvents.forEach(event => {
                this.log(`   ${event.Timestamp}: ${event.LogicalResourceId} - ${event.ResourceStatus}`);
            });
            // Execute CDK rollback
            const rollbackCommand = ['cdk', 'deploy', stackName, '--rollback'];
            this.log(`📝 Executing: ${rollbackCommand.join(' ')}`);
            const rollbackProcess = (0, child_process_1.spawn)(rollbackCommand[0], rollbackCommand.slice(1), {
                stdio: 'inherit',
                env: { ...process.env, CDK_DEFAULT_REGION: this.config.region }
            });
            return new Promise((resolve, reject) => {
                rollbackProcess.on('close', (code) => {
                    if (code === 0) {
                        this.log(`✅ Stack ${stackName} rolled back successfully`);
                        resolve(true);
                    }
                    else {
                        this.log(`❌ Stack ${stackName} rollback failed with code ${code}`, 'error');
                        resolve(false);
                    }
                });
                rollbackProcess.on('error', (error) => {
                    this.log(`❌ Rollback error: ${error}`, 'error');
                    reject(error);
                });
            });
        }
        catch (error) {
            this.log(`❌ Stack rollback failed: ${error}`, 'error');
            return false;
        }
    }
    /**
     * Restore configuration from backup
     */
    async restoreConfiguration(backup) {
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
        }
        catch (error) {
            this.log(`❌ Configuration restoration failed: ${error}`, 'error');
            return false;
        }
    }
    /**
     * Execute full rollback
     */
    async executeRollback() {
        try {
            this.log('🔄 Starting Trinity rollback process...');
            // List available backups
            const backups = this.listBackups();
            if (backups.length === 0) {
                this.log('❌ No backups available for rollback', 'error');
                return false;
            }
            // Select backup (use specified timestamp or latest)
            let targetBackup;
            if (this.config.backupTimestamp) {
                const found = backups.find(b => b.timestamp === this.config.backupTimestamp);
                if (!found) {
                    this.log(`❌ Backup ${this.config.backupTimestamp} not found`, 'error');
                    return false;
                }
                targetBackup = found;
            }
            else {
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
            }
            else {
                this.log('❌ Rollback failed', 'error');
            }
            return success;
        }
        catch (error) {
            this.log(`❌ Rollback process error: ${error}`, 'error');
            return false;
        }
    }
}
exports.TrinityRollbackManager = TrinityRollbackManager;
// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const config = {
        environment: args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev',
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
    }
    else {
        manager.executeRollback().then(success => {
            process.exit(success ? 0 : 1);
        }).catch(error => {
            console.error('❌ Rollback failed:', error);
            process.exit(1);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9sbGJhY2stbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJvbGxiYWNrLW1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQTs7Ozs7R0FLRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQWdEO0FBQ2hELHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFDN0IsMEVBQXlIO0FBbUJ6SCxNQUFNLHNCQUFzQjtJQUsxQixZQUFZLE1BQXNCO1FBRjFCLGdCQUFXLEdBQWEsRUFBRSxDQUFDO1FBR2pDLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSw0Q0FBb0IsQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUVwRSxJQUFJLENBQUMsR0FBRyxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDcEQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTyxHQUFHLENBQUMsT0FBZSxFQUFFLFFBQW1DLE1BQU07UUFDcEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUMzQyxNQUFNLFFBQVEsR0FBRyxJQUFJLFNBQVMsS0FBSyxPQUFPLEVBQUUsQ0FBQztRQUU3QyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVoQyxRQUFRLEtBQUssRUFBRSxDQUFDO1lBQ2QsS0FBSyxNQUFNO2dCQUNULE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxPQUFPLEVBQUUsQ0FBQyxDQUFDO2dCQUM5QixNQUFNO1lBQ1IsS0FBSyxPQUFPO2dCQUNW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QUcsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdFLFdBQVcsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDeEUsTUFBTSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDO0tBQ25DLENBQUM7SUFFRixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ25ELE9BQU8sQ0FBQyxHQUFHLENBQUM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQWlDZixDQUFDLENBQUM7UUFDQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRW5ELElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQzFCLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUN0QyxPQUFPLENBQUMsR0FBRyxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDdkMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sTUFBTSxDQUFDLFNBQVMsTUFBTSxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sU0FBUyxDQUFDLENBQUM7UUFDekUsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO1NBQU0sQ0FBQztRQUNOLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDdkMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDaEMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ2YsT0FBTyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMzQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBucHggdHMtbm9kZVxyXG5cclxuLyoqXHJcbiAqIFRyaW5pdHkgUm9sbGJhY2sgTWFuYWdlclxyXG4gKiBcclxuICogUHJvdmlkZXMgY29tcHJlaGVuc2l2ZSByb2xsYmFjayBjYXBhYmlsaXRpZXMgZm9yIFRyaW5pdHkgZGVwbG95bWVudHNcclxuICogaW5jbHVkaW5nIHN0YWNrIHJvbGxiYWNrLCByZXNvdXJjZSByZXN0b3JhdGlvbiwgYW5kIGRhdGEgcmVjb3ZlcnlcclxuICovXHJcblxyXG5pbXBvcnQgeyBleGVjU3luYywgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5pbXBvcnQgeyBDbG91ZEZvcm1hdGlvbkNsaWVudCwgRGVzY3JpYmVTdGFja3NDb21tYW5kLCBEZXNjcmliZVN0YWNrRXZlbnRzQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1jbG91ZGZvcm1hdGlvbic7XHJcblxyXG5pbnRlcmZhY2UgUm9sbGJhY2tDb25maWcge1xyXG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdzdGFnaW5nJyB8ICdwcm9kdWN0aW9uJztcclxuICByZWdpb246IHN0cmluZztcclxuICBiYWNrdXBUaW1lc3RhbXA/OiBzdHJpbmc7XHJcbiAgdGFyZ2V0U3RhY2s/OiBzdHJpbmc7XHJcbiAgZHJ5UnVuOiBib29sZWFuO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQmFja3VwTWV0YWRhdGEge1xyXG4gIHRpbWVzdGFtcDogc3RyaW5nO1xyXG4gIGVudmlyb25tZW50OiBzdHJpbmc7XHJcbiAgcmVnaW9uOiBzdHJpbmc7XHJcbiAgc3RhY2tzOiBzdHJpbmdbXTtcclxuICBvdXRwdXRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xyXG4gIGRlcGxveW1lbnRMb2c6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5jbGFzcyBUcmluaXR5Um9sbGJhY2tNYW5hZ2VyIHtcclxuICBwcml2YXRlIGNvbmZpZzogUm9sbGJhY2tDb25maWc7XHJcbiAgcHJpdmF0ZSBjZkNsaWVudDogQ2xvdWRGb3JtYXRpb25DbGllbnQ7XHJcbiAgcHJpdmF0ZSByb2xsYmFja0xvZzogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgY29uc3RydWN0b3IoY29uZmlnOiBSb2xsYmFja0NvbmZpZykge1xyXG4gICAgdGhpcy5jb25maWcgPSBjb25maWc7XHJcbiAgICB0aGlzLmNmQ2xpZW50ID0gbmV3IENsb3VkRm9ybWF0aW9uQ2xpZW50KHsgcmVnaW9uOiBjb25maWcucmVnaW9uIH0pO1xyXG4gICAgXHJcbiAgICB0aGlzLmxvZygn8J+UhCBUcmluaXR5IFJvbGxiYWNrIE1hbmFnZXIgaW5pdGlhbGl6ZWQnKTtcclxuICAgIHRoaXMubG9nKGDwn5OLIEVudmlyb25tZW50OiAke2NvbmZpZy5lbnZpcm9ubWVudH1gKTtcclxuICAgIHRoaXMubG9nKGDwn4yNIFJlZ2lvbjogJHtjb25maWcucmVnaW9ufWApO1xyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBsb2cobWVzc2FnZTogc3RyaW5nLCBsZXZlbDogJ2luZm8nIHwgJ3dhcm4nIHwgJ2Vycm9yJyA9ICdpbmZvJykge1xyXG4gICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xyXG4gICAgY29uc3QgbG9nRW50cnkgPSBgWyR7dGltZXN0YW1wfV0gJHttZXNzYWdlfWA7XHJcbiAgICBcclxuICAgIHRoaXMucm9sbGJhY2tMb2cucHVzaChsb2dFbnRyeSk7XHJcbiAgICBcclxuICAgIHN3aXRjaCAobGV2ZWwpIHtcclxuICAgICAgY2FzZSAnd2Fybic6XHJcbiAgICAgICAgY29uc29sZS53YXJuKGDimqDvuI8gJHttZXNzYWdlfWApO1xyXG4gICAgICAgIGJyZWFrO1xyXG4gICAgICBjYXNlICdlcnJvcic6XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihg4p2MICR7bWVzc2FnZX1gKTtcclxuICAgICAgICBicmVhaztcclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICBjb25zb2xlLmxvZyhtZXNzYWdlKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIExpc3QgYXZhaWxhYmxlIGJhY2t1cHNcclxuICAgKi9cclxuICBsaXN0QmFja3VwcygpOiBCYWNrdXBNZXRhZGF0YVtdIHtcclxuICAgIHRoaXMubG9nKCfwn5OLIExpc3RpbmcgYXZhaWxhYmxlIGJhY2t1cHMuLi4nKTtcclxuICAgIFxyXG4gICAgY29uc3QgYmFja3VwRGlyID0gJ2RlcGxveW1lbnQtYmFja3Vwcyc7XHJcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoYmFja3VwRGlyKSkge1xyXG4gICAgICB0aGlzLmxvZygn4pqg77iPIE5vIGJhY2t1cCBkaXJlY3RvcnkgZm91bmQnLCAnd2FybicpO1xyXG4gICAgICByZXR1cm4gW107XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYmFja3VwczogQmFja3VwTWV0YWRhdGFbXSA9IFtdO1xyXG4gICAgY29uc3QgYmFja3VwRGF0ZXMgPSBmcy5yZWFkZGlyU3luYyhiYWNrdXBEaXIpO1xyXG5cclxuICAgIGZvciAoY29uc3QgZGF0ZSBvZiBiYWNrdXBEYXRlcykge1xyXG4gICAgICBjb25zdCBkYXRlUGF0aCA9IHBhdGguam9pbihiYWNrdXBEaXIsIGRhdGUpO1xyXG4gICAgICBpZiAoZnMuc3RhdFN5bmMoZGF0ZVBhdGgpLmlzRGlyZWN0b3J5KCkpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgY29uc3QgZGVwbG95bWVudExvZ1BhdGggPSBwYXRoLmpvaW4oZGF0ZVBhdGgsICdkZXBsb3ltZW50LWxvZy50eHQnKTtcclxuICAgICAgICAgIGNvbnN0IG91dHB1dHNQYXRoID0gcGF0aC5qb2luKGRhdGVQYXRoLCAnY2RrLW91dHB1dHMtYmFja3VwLmpzb24nKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZGVwbG95bWVudExvZ1BhdGgpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGRlcGxveW1lbnRMb2cgPSBmcy5yZWFkRmlsZVN5bmMoZGVwbG95bWVudExvZ1BhdGgsICd1dGY4Jykuc3BsaXQoJ1xcbicpO1xyXG4gICAgICAgICAgICBsZXQgb3V0cHV0cyA9IHt9O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGZzLmV4aXN0c1N5bmMob3V0cHV0c1BhdGgpKSB7XHJcbiAgICAgICAgICAgICAgb3V0cHV0cyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKG91dHB1dHNQYXRoLCAndXRmOCcpKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgYmFja3Vwcy5wdXNoKHtcclxuICAgICAgICAgICAgICB0aW1lc3RhbXA6IGRhdGUsXHJcbiAgICAgICAgICAgICAgZW52aXJvbm1lbnQ6IHRoaXMuY29uZmlnLmVudmlyb25tZW50LFxyXG4gICAgICAgICAgICAgIHJlZ2lvbjogdGhpcy5jb25maWcucmVnaW9uLFxyXG4gICAgICAgICAgICAgIHN0YWNrczogT2JqZWN0LmtleXMob3V0cHV0cyksXHJcbiAgICAgICAgICAgICAgb3V0cHV0cyxcclxuICAgICAgICAgICAgICBkZXBsb3ltZW50TG9nXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICB0aGlzLmxvZyhg4pqg77iPIEZhaWxlZCB0byByZWFkIGJhY2t1cCAke2RhdGV9OiAke2Vycm9yfWAsICd3YXJuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5sb2coYOKchSBGb3VuZCAke2JhY2t1cHMubGVuZ3RofSBiYWNrdXBzYCk7XHJcbiAgICByZXR1cm4gYmFja3Vwcy5zb3J0KChhLCBiKSA9PiBiLnRpbWVzdGFtcC5sb2NhbGVDb21wYXJlKGEudGltZXN0YW1wKSk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBWYWxpZGF0ZSByb2xsYmFjayB0YXJnZXRcclxuICAgKi9cclxuICBhc3luYyB2YWxpZGF0ZVJvbGxiYWNrVGFyZ2V0KGJhY2t1cDogQmFja3VwTWV0YWRhdGEpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRoaXMubG9nKGDwn5SNIFZhbGlkYXRpbmcgcm9sbGJhY2sgdGFyZ2V0OiAke2JhY2t1cC50aW1lc3RhbXB9YCk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIC8vIENoZWNrIGlmIHN0YWNrcyBleGlzdFxyXG4gICAgICBmb3IgKGNvbnN0IHN0YWNrTmFtZSBvZiBiYWNrdXAuc3RhY2tzKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgIGF3YWl0IHRoaXMuY2ZDbGllbnQuc2VuZChuZXcgRGVzY3JpYmVTdGFja3NDb21tYW5kKHsgU3RhY2tOYW1lOiBzdGFja05hbWUgfSkpO1xyXG4gICAgICAgICAgdGhpcy5sb2coYOKchSBTdGFjayAke3N0YWNrTmFtZX0gZXhpc3RzIGFuZCBjYW4gYmUgcm9sbGVkIGJhY2tgKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgdGhpcy5sb2coYOKaoO+4jyBTdGFjayAke3N0YWNrTmFtZX0gbm90IGZvdW5kIC0gbWF5IGhhdmUgYmVlbiBkZWxldGVkYCwgJ3dhcm4nKTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFZhbGlkYXRlIGJhY2t1cCBpbnRlZ3JpdHlcclxuICAgICAgaWYgKCFiYWNrdXAub3V0cHV0cyB8fCBPYmplY3Qua2V5cyhiYWNrdXAub3V0cHV0cykubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhpcy5sb2coJ+KaoO+4jyBCYWNrdXAgaGFzIG5vIG91dHB1dHMgLSBtYXkgYmUgaW5jb21wbGV0ZScsICd3YXJuJyk7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLmxvZygn4pyFIFJvbGxiYWNrIHRhcmdldCB2YWxpZGF0aW9uIGNvbXBsZXRlZCcpO1xyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZyhg4p2MIFJvbGxiYWNrIHZhbGlkYXRpb24gZmFpbGVkOiAke2Vycm9yfWAsICdlcnJvcicpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeGVjdXRlIHN0YWNrIHJvbGxiYWNrXHJcbiAgICovXHJcbiAgYXN5bmMgZXhlY3V0ZVN0YWNrUm9sbGJhY2soc3RhY2tOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIHRoaXMubG9nKGDwn5SEIFJvbGxpbmcgYmFjayBzdGFjazogJHtzdGFja05hbWV9YCk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5kcnlSdW4pIHtcclxuICAgICAgICB0aGlzLmxvZyhg8J+UjSBEUlkgUlVOOiBXb3VsZCByb2xsYmFjayBzdGFjayAke3N0YWNrTmFtZX1gKTtcclxuICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gR2V0IHN0YWNrIGV2ZW50cyBiZWZvcmUgcm9sbGJhY2tcclxuICAgICAgY29uc3QgZXZlbnRzUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmNmQ2xpZW50LnNlbmQoXHJcbiAgICAgICAgbmV3IERlc2NyaWJlU3RhY2tFdmVudHNDb21tYW5kKHsgU3RhY2tOYW1lOiBzdGFja05hbWUgfSlcclxuICAgICAgKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJlY2VudEV2ZW50cyA9IGV2ZW50c1Jlc3BvbnNlLlN0YWNrRXZlbnRzPy5zbGljZSgwLCAxMCkgfHwgW107XHJcbiAgICAgIHRoaXMubG9nKGDwn5OLIFJlY2VudCBldmVudHMgZm9yICR7c3RhY2tOYW1lfTpgKTtcclxuICAgICAgcmVjZW50RXZlbnRzLmZvckVhY2goZXZlbnQgPT4ge1xyXG4gICAgICAgIHRoaXMubG9nKGAgICAke2V2ZW50LlRpbWVzdGFtcH06ICR7ZXZlbnQuTG9naWNhbFJlc291cmNlSWR9IC0gJHtldmVudC5SZXNvdXJjZVN0YXR1c31gKTtcclxuICAgICAgfSk7XHJcblxyXG4gICAgICAvLyBFeGVjdXRlIENESyByb2xsYmFja1xyXG4gICAgICBjb25zdCByb2xsYmFja0NvbW1hbmQgPSBbJ2NkaycsICdkZXBsb3knLCBzdGFja05hbWUsICctLXJvbGxiYWNrJ107XHJcbiAgICAgIFxyXG4gICAgICB0aGlzLmxvZyhg8J+TnSBFeGVjdXRpbmc6ICR7cm9sbGJhY2tDb21tYW5kLmpvaW4oJyAnKX1gKTtcclxuICAgICAgXHJcbiAgICAgIGNvbnN0IHJvbGxiYWNrUHJvY2VzcyA9IHNwYXduKHJvbGxiYWNrQ29tbWFuZFswXSwgcm9sbGJhY2tDb21tYW5kLnNsaWNlKDEpLCB7XHJcbiAgICAgICAgc3RkaW86ICdpbmhlcml0JyxcclxuICAgICAgICBlbnY6IHsgLi4ucHJvY2Vzcy5lbnYsIENES19ERUZBVUxUX1JFR0lPTjogdGhpcy5jb25maWcucmVnaW9uIH1cclxuICAgICAgfSk7XHJcblxyXG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgICAgIHJvbGxiYWNrUHJvY2Vzcy5vbignY2xvc2UnLCAoY29kZSkgPT4ge1xyXG4gICAgICAgICAgaWYgKGNvZGUgPT09IDApIHtcclxuICAgICAgICAgICAgdGhpcy5sb2coYOKchSBTdGFjayAke3N0YWNrTmFtZX0gcm9sbGVkIGJhY2sgc3VjY2Vzc2Z1bGx5YCk7XHJcbiAgICAgICAgICAgIHJlc29sdmUodHJ1ZSk7XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmxvZyhg4p2MIFN0YWNrICR7c3RhY2tOYW1lfSByb2xsYmFjayBmYWlsZWQgd2l0aCBjb2RlICR7Y29kZX1gLCAnZXJyb3InKTtcclxuICAgICAgICAgICAgcmVzb2x2ZShmYWxzZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJvbGxiYWNrUHJvY2Vzcy5vbignZXJyb3InLCAoZXJyb3IpID0+IHtcclxuICAgICAgICAgIHRoaXMubG9nKGDinYwgUm9sbGJhY2sgZXJyb3I6ICR7ZXJyb3J9YCwgJ2Vycm9yJyk7XHJcbiAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9KTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZyhg4p2MIFN0YWNrIHJvbGxiYWNrIGZhaWxlZDogJHtlcnJvcn1gLCAnZXJyb3InKTtcclxuICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUmVzdG9yZSBjb25maWd1cmF0aW9uIGZyb20gYmFja3VwXHJcbiAgICovXHJcbiAgYXN5bmMgcmVzdG9yZUNvbmZpZ3VyYXRpb24oYmFja3VwOiBCYWNrdXBNZXRhZGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgdGhpcy5sb2coYPCflKcgUmVzdG9yaW5nIGNvbmZpZ3VyYXRpb24gZnJvbSBiYWNrdXA6ICR7YmFja3VwLnRpbWVzdGFtcH1gKTtcclxuICAgIFxyXG4gICAgdHJ5IHtcclxuICAgICAgaWYgKHRoaXMuY29uZmlnLmRyeVJ1bikge1xyXG4gICAgICAgIHRoaXMubG9nKCfwn5SNIERSWSBSVU46IFdvdWxkIHJlc3RvcmUgY29uZmlndXJhdGlvbicpO1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBSZXN0b3JlIENESyBvdXRwdXRzXHJcbiAgICAgIGNvbnN0IG91dHB1dHNQYXRoID0gJ2Nkay1vdXRwdXRzLmpzb24nO1xyXG4gICAgICBjb25zdCBiYWNrdXBPdXRwdXRzUGF0aCA9IHBhdGguam9pbignZGVwbG95bWVudC1iYWNrdXBzJywgYmFja3VwLnRpbWVzdGFtcCwgJ2Nkay1vdXRwdXRzLWJhY2t1cC5qc29uJyk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhiYWNrdXBPdXRwdXRzUGF0aCkpIHtcclxuICAgICAgICBmcy5jb3B5RmlsZVN5bmMoYmFja3VwT3V0cHV0c1BhdGgsIG91dHB1dHNQYXRoKTtcclxuICAgICAgICB0aGlzLmxvZygn4pyFIENESyBvdXRwdXRzIHJlc3RvcmVkJyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIENyZWF0ZSByZXN0b3JhdGlvbiByZXBvcnRcclxuICAgICAgY29uc3QgcmVzdG9yYXRpb25SZXBvcnQgPSB7XHJcbiAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgYmFja3VwU291cmNlOiBiYWNrdXAudGltZXN0YW1wLFxyXG4gICAgICAgIGVudmlyb25tZW50OiB0aGlzLmNvbmZpZy5lbnZpcm9ubWVudCxcclxuICAgICAgICByZWdpb246IHRoaXMuY29uZmlnLnJlZ2lvbixcclxuICAgICAgICByZXN0b3JlZFN0YWNrczogYmFja3VwLnN0YWNrcyxcclxuICAgICAgICByb2xsYmFja0xvZzogdGhpcy5yb2xsYmFja0xvZ1xyXG4gICAgICB9O1xyXG5cclxuICAgICAgY29uc3QgcmVwb3J0UGF0aCA9IHBhdGguam9pbigncm9sbGJhY2stcmVwb3J0cycsIGByZXN0b3JhdGlvbi0ke0RhdGUubm93KCl9Lmpzb25gKTtcclxuICAgICAgXHJcbiAgICAgIGlmICghZnMuZXhpc3RzU3luYygncm9sbGJhY2stcmVwb3J0cycpKSB7XHJcbiAgICAgICAgZnMubWtkaXJTeW5jKCdyb2xsYmFjay1yZXBvcnRzJywgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcbiAgICAgIH1cclxuICAgICAgXHJcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocmVwb3J0UGF0aCwgSlNPTi5zdHJpbmdpZnkocmVzdG9yYXRpb25SZXBvcnQsIG51bGwsIDIpKTtcclxuICAgICAgdGhpcy5sb2coYPCfk4sgUmVzdG9yYXRpb24gcmVwb3J0IHNhdmVkOiAke3JlcG9ydFBhdGh9YCk7XHJcblxyXG4gICAgICByZXR1cm4gdHJ1ZTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICB0aGlzLmxvZyhg4p2MIENvbmZpZ3VyYXRpb24gcmVzdG9yYXRpb24gZmFpbGVkOiAke2Vycm9yfWAsICdlcnJvcicpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBFeGVjdXRlIGZ1bGwgcm9sbGJhY2tcclxuICAgKi9cclxuICBhc3luYyBleGVjdXRlUm9sbGJhY2soKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICB0cnkge1xyXG4gICAgICB0aGlzLmxvZygn8J+UhCBTdGFydGluZyBUcmluaXR5IHJvbGxiYWNrIHByb2Nlc3MuLi4nKTtcclxuXHJcbiAgICAgIC8vIExpc3QgYXZhaWxhYmxlIGJhY2t1cHNcclxuICAgICAgY29uc3QgYmFja3VwcyA9IHRoaXMubGlzdEJhY2t1cHMoKTtcclxuICAgICAgaWYgKGJhY2t1cHMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgdGhpcy5sb2coJ+KdjCBObyBiYWNrdXBzIGF2YWlsYWJsZSBmb3Igcm9sbGJhY2snLCAnZXJyb3InKTtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFNlbGVjdCBiYWNrdXAgKHVzZSBzcGVjaWZpZWQgdGltZXN0YW1wIG9yIGxhdGVzdClcclxuICAgICAgbGV0IHRhcmdldEJhY2t1cDogQmFja3VwTWV0YWRhdGE7XHJcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5iYWNrdXBUaW1lc3RhbXApIHtcclxuICAgICAgICBjb25zdCBmb3VuZCA9IGJhY2t1cHMuZmluZChiID0+IGIudGltZXN0YW1wID09PSB0aGlzLmNvbmZpZy5iYWNrdXBUaW1lc3RhbXApO1xyXG4gICAgICAgIGlmICghZm91bmQpIHtcclxuICAgICAgICAgIHRoaXMubG9nKGDinYwgQmFja3VwICR7dGhpcy5jb25maWcuYmFja3VwVGltZXN0YW1wfSBub3QgZm91bmRgLCAnZXJyb3InKTtcclxuICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGFyZ2V0QmFja3VwID0gZm91bmQ7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGFyZ2V0QmFja3VwID0gYmFja3Vwc1swXTsgLy8gTGF0ZXN0IGJhY2t1cFxyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLmxvZyhg8J+OryBUYXJnZXQgYmFja3VwOiAke3RhcmdldEJhY2t1cC50aW1lc3RhbXB9YCk7XHJcblxyXG4gICAgICAvLyBWYWxpZGF0ZSByb2xsYmFjayB0YXJnZXRcclxuICAgICAgY29uc3QgaXNWYWxpZCA9IGF3YWl0IHRoaXMudmFsaWRhdGVSb2xsYmFja1RhcmdldCh0YXJnZXRCYWNrdXApO1xyXG4gICAgICBpZiAoIWlzVmFsaWQpIHtcclxuICAgICAgICB0aGlzLmxvZygn4p2MIFJvbGxiYWNrIHRhcmdldCB2YWxpZGF0aW9uIGZhaWxlZCcsICdlcnJvcicpO1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgLy8gRXhlY3V0ZSByb2xsYmFjayBmb3IgZWFjaCBzdGFjayBvciBzcGVjaWZpYyBzdGFja1xyXG4gICAgICBjb25zdCBzdGFja3NUb1JvbGxiYWNrID0gdGhpcy5jb25maWcudGFyZ2V0U3RhY2sgXHJcbiAgICAgICAgPyBbdGhpcy5jb25maWcudGFyZ2V0U3RhY2tdXHJcbiAgICAgICAgOiB0YXJnZXRCYWNrdXAuc3RhY2tzO1xyXG5cclxuICAgICAgbGV0IHN1Y2Nlc3MgPSB0cnVlO1xyXG4gICAgICBmb3IgKGNvbnN0IHN0YWNrTmFtZSBvZiBzdGFja3NUb1JvbGxiYWNrKSB7XHJcbiAgICAgICAgY29uc3Qgcm9sbGJhY2tTdWNjZXNzID0gYXdhaXQgdGhpcy5leGVjdXRlU3RhY2tSb2xsYmFjayhzdGFja05hbWUpO1xyXG4gICAgICAgIGlmICghcm9sbGJhY2tTdWNjZXNzKSB7XHJcbiAgICAgICAgICBzdWNjZXNzID0gZmFsc2U7XHJcbiAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFJlc3RvcmUgY29uZmlndXJhdGlvblxyXG4gICAgICBpZiAoc3VjY2Vzcykge1xyXG4gICAgICAgIGNvbnN0IGNvbmZpZ1N1Y2Nlc3MgPSBhd2FpdCB0aGlzLnJlc3RvcmVDb25maWd1cmF0aW9uKHRhcmdldEJhY2t1cCk7XHJcbiAgICAgICAgaWYgKCFjb25maWdTdWNjZXNzKSB7XHJcbiAgICAgICAgICB0aGlzLmxvZygn4pqg77iPIENvbmZpZ3VyYXRpb24gcmVzdG9yYXRpb24gaGFkIGlzc3VlcycsICd3YXJuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAoc3VjY2Vzcykge1xyXG4gICAgICAgIHRoaXMubG9nKCfwn46JIFJvbGxiYWNrIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkhJyk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5sb2coJ+KdjCBSb2xsYmFjayBmYWlsZWQnLCAnZXJyb3InKTtcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHN1Y2Nlc3M7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgdGhpcy5sb2coYOKdjCBSb2xsYmFjayBwcm9jZXNzIGVycm9yOiAke2Vycm9yfWAsICdlcnJvcicpO1xyXG4gICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBDTEkgaW50ZXJmYWNlXHJcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xyXG4gIGNvbnN0IGFyZ3MgPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7XHJcbiAgXHJcbiAgY29uc3QgY29uZmlnOiBSb2xsYmFja0NvbmZpZyA9IHtcclxuICAgIGVudmlyb25tZW50OiAoYXJncy5maW5kKGFyZyA9PiBhcmcuc3RhcnRzV2l0aCgnLS1lbnY9JykpPy5zcGxpdCgnPScpWzFdIGFzIGFueSkgfHwgJ2RldicsXHJcbiAgICByZWdpb246IGFyZ3MuZmluZChhcmcgPT4gYXJnLnN0YXJ0c1dpdGgoJy0tcmVnaW9uPScpKT8uc3BsaXQoJz0nKVsxXSB8fCAnZXUtd2VzdC0xJyxcclxuICAgIGJhY2t1cFRpbWVzdGFtcDogYXJncy5maW5kKGFyZyA9PiBhcmcuc3RhcnRzV2l0aCgnLS1iYWNrdXA9JykpPy5zcGxpdCgnPScpWzFdLFxyXG4gICAgdGFyZ2V0U3RhY2s6IGFyZ3MuZmluZChhcmcgPT4gYXJnLnN0YXJ0c1dpdGgoJy0tc3RhY2s9JykpPy5zcGxpdCgnPScpWzFdLFxyXG4gICAgZHJ5UnVuOiBhcmdzLmluY2x1ZGVzKCctLWRyeS1ydW4nKSxcclxuICB9O1xyXG4gIFxyXG4gIGlmIChhcmdzLmluY2x1ZGVzKCctLWhlbHAnKSB8fCBhcmdzLmluY2x1ZGVzKCctaCcpKSB7XHJcbiAgICBjb25zb2xlLmxvZyhgXHJcblRyaW5pdHkgUm9sbGJhY2sgTWFuYWdlclxyXG5cclxuVXNhZ2U6XHJcbiAgbnB4IHRzLW5vZGUgcm9sbGJhY2stbWFuYWdlci50cyBbb3B0aW9uc11cclxuXHJcbk9wdGlvbnM6XHJcbiAgLS1lbnY9PGVudj4gICAgICAgICAgRW52aXJvbm1lbnQgKGRldnxzdGFnaW5nfHByb2R1Y3Rpb24pIFtkZWZhdWx0OiBkZXZdXHJcbiAgLS1yZWdpb249PHJlZ2lvbj4gICAgQVdTIHJlZ2lvbiBbZGVmYXVsdDogZXUtd2VzdC0xXVxyXG4gIC0tYmFja3VwPTx0aW1lc3RhbXA+IFNwZWNpZmljIGJhY2t1cCB0byByb2xsYmFjayB0byAoWVlZWS1NTS1ERCBmb3JtYXQpXHJcbiAgLS1zdGFjaz08bmFtZT4gICAgICAgU3BlY2lmaWMgc3RhY2sgdG8gcm9sbGJhY2sgKGRlZmF1bHQ6IGFsbCBzdGFja3MpXHJcbiAgLS1kcnktcnVuICAgICAgICAgICBTaG93IHdoYXQgd291bGQgYmUgcm9sbGVkIGJhY2sgd2l0aG91dCBleGVjdXRpbmdcclxuICAtLWhlbHAsIC1oICAgICAgICAgIFNob3cgdGhpcyBoZWxwIG1lc3NhZ2VcclxuXHJcbkNvbW1hbmRzOlxyXG4gIGxpc3QgICAgICAgICAgICAgICAgTGlzdCBhdmFpbGFibGUgYmFja3Vwc1xyXG4gIHJvbGxiYWNrICAgICAgICAgICAgRXhlY3V0ZSByb2xsYmFjayAoZGVmYXVsdClcclxuXHJcbkV4YW1wbGVzOlxyXG4gICMgTGlzdCBhdmFpbGFibGUgYmFja3Vwc1xyXG4gIG5weCB0cy1ub2RlIHJvbGxiYWNrLW1hbmFnZXIudHMgbGlzdFxyXG4gIFxyXG4gICMgUm9sbGJhY2sgdG8gbGF0ZXN0IGJhY2t1cFxyXG4gIG5weCB0cy1ub2RlIHJvbGxiYWNrLW1hbmFnZXIudHMgcm9sbGJhY2tcclxuICBcclxuICAjIFJvbGxiYWNrIHRvIHNwZWNpZmljIGJhY2t1cFxyXG4gIG5weCB0cy1ub2RlIHJvbGxiYWNrLW1hbmFnZXIudHMgcm9sbGJhY2sgLS1iYWNrdXA9MjAyNi0wMi0wMVxyXG4gIFxyXG4gICMgUm9sbGJhY2sgc3BlY2lmaWMgc3RhY2sgb25seVxyXG4gIG5weCB0cy1ub2RlIHJvbGxiYWNrLW1hbmFnZXIudHMgcm9sbGJhY2sgLS1zdGFjaz1UcmluaXR5RGF0YWJhc2VTdGFja1xyXG4gIFxyXG4gICMgRHJ5IHJ1biByb2xsYmFja1xyXG4gIG5weCB0cy1ub2RlIHJvbGxiYWNrLW1hbmFnZXIudHMgcm9sbGJhY2sgLS1kcnktcnVuXHJcbmApO1xyXG4gICAgcHJvY2Vzcy5leGl0KDApO1xyXG4gIH1cclxuICBcclxuICBjb25zdCBtYW5hZ2VyID0gbmV3IFRyaW5pdHlSb2xsYmFja01hbmFnZXIoY29uZmlnKTtcclxuICBcclxuICBpZiAoYXJncy5pbmNsdWRlcygnbGlzdCcpKSB7XHJcbiAgICBjb25zdCBiYWNrdXBzID0gbWFuYWdlci5saXN0QmFja3VwcygpO1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfk4sgQXZhaWxhYmxlIEJhY2t1cHM6Jyk7XHJcbiAgICBiYWNrdXBzLmZvckVhY2goYmFja3VwID0+IHtcclxuICAgICAgY29uc29sZS5sb2coYCAgICR7YmFja3VwLnRpbWVzdGFtcH0gLSAke2JhY2t1cC5zdGFja3MubGVuZ3RofSBzdGFja3NgKTtcclxuICAgIH0pO1xyXG4gIH0gZWxzZSB7XHJcbiAgICBtYW5hZ2VyLmV4ZWN1dGVSb2xsYmFjaygpLnRoZW4oc3VjY2VzcyA9PiB7XHJcbiAgICAgIHByb2Nlc3MuZXhpdChzdWNjZXNzID8gMCA6IDEpO1xyXG4gICAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgICBjb25zb2xlLmVycm9yKCfinYwgUm9sbGJhY2sgZmFpbGVkOicsIGVycm9yKTtcclxuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgeyBUcmluaXR5Um9sbGJhY2tNYW5hZ2VyLCBSb2xsYmFja0NvbmZpZyB9OyJdfQ==