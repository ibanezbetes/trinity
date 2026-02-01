#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface CleanupResult {
  action: string;
  target: string;
  status: 'SUCCESS' | 'SKIPPED' | 'ERROR';
  details: string;
}

class LegacyDeploymentCleanup {
  private results: CleanupResult[] = [];
  private readonly workspaceRoot = path.resolve('../..');

  async performCleanup(): Promise<CleanupResult[]> {
    console.log('🧹 Cleaning up legacy deployment scripts...');
    console.log('📋 Archiving non-CDK deployment methods');
    
    await this.identifyLegacyScripts();
    await this.createArchiveDirectory();
    await this.archiveLegacyScripts();
    await this.updateDocumentation();
    
    this.generateReport();
    return this.results;
  }

  private async identifyLegacyScripts(): Promise<void> {
    console.log('\n🔍 Identifying legacy deployment scripts...');
    
    const legacyPatterns = [
      'deploy-all-lambdas',
      'deploy-cache-system', 
      'deploy-matchmaking',
      'update-lambda-and-deploy'
    ];

    for (const pattern of legacyPatterns) {
      const scriptPath = path.join(this.workspaceRoot, 'scripts', pattern);
      
      if (fs.existsSync(scriptPath)) {
        this.results.push({
          action: 'IDENTIFY',
          target: pattern,
          status: 'SUCCESS',
          details: `Found legacy deployment script: ${scriptPath}`
        });
        console.log(`   📁 Found: ${pattern}`);
      } else {
        this.results.push({
          action: 'IDENTIFY',
          target: pattern,
          status: 'SKIPPED',
          details: `Script not found: ${scriptPath}`
        });
      }
    }
  }

  private async createArchiveDirectory(): Promise<void> {
    console.log('\n📦 Creating archive directory...');
    
    const archivePath = path.join(this.workspaceRoot, 'scripts', 'legacy-archived');
    
    try {
      if (!fs.existsSync(archivePath)) {
        fs.mkdirSync(archivePath, { recursive: true });
        
        // Create README explaining the archive
        const readmeContent = `# Legacy Deployment Scripts Archive

This directory contains deployment scripts that were used before the CDK migration.

## Migration Completed: ${new Date().toISOString()}

These scripts are archived for historical reference but should NOT be used for deployment.

## Current Deployment Method

Use CDK for all deployments:

\`\`\`bash
cd infrastructure/clean
npm run deploy:all    # Deploy all stacks
npm run hotswap       # Fast development deployment
\`\`\`

## Archived Scripts

The following legacy deployment methods have been replaced by CDK:

- **deploy-all-lambdas**: Replaced by \`cdk deploy TrinityLambdaStack\`
- **deploy-cache-system**: Replaced by \`cdk deploy TrinityDatabaseStack\`
- **deploy-matchmaking**: Replaced by \`cdk deploy TrinityMatchmakingStack\`
- **update-lambda-and-deploy**: Replaced by \`cdk hotswap\`

## Infrastructure Management

All infrastructure is now managed through CDK stacks:

1. **TrinityDatabaseStack** - DynamoDB tables
2. **TrinityLambdaStack** - Lambda functions  
3. **TrinityApiStack** - AppSync GraphQL APIs
4. **TrinityCognitoStack** - User authentication
5. **TrinityMonitoringStack** - CloudWatch monitoring

## DO NOT USE THESE ARCHIVED SCRIPTS

Using these scripts could cause conflicts with CDK-managed resources.
`;
        
        fs.writeFileSync(path.join(archivePath, 'README.md'), readmeContent);
        
        this.results.push({
          action: 'CREATE_ARCHIVE',
          target: archivePath,
          status: 'SUCCESS',
          details: 'Archive directory created with documentation'
        });
        console.log('   ✅ Archive directory created');
      } else {
        this.results.push({
          action: 'CREATE_ARCHIVE',
          target: archivePath,
          status: 'SKIPPED',
          details: 'Archive directory already exists'
        });
        console.log('   📁 Archive directory already exists');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.results.push({
        action: 'CREATE_ARCHIVE',
        target: archivePath,
        status: 'ERROR',
        details: err.message
      });
      console.log(`   ❌ Failed to create archive: ${err.message}`);
    }
  }

  private copyDirectoryRecursive(source: string, target: string): void {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    const items = fs.readdirSync(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        this.copyDirectoryRecursive(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  private async archiveLegacyScripts(): Promise<void> {
    console.log('\n📦 Archiving legacy scripts...');
    
    const legacyScripts = [
      'deploy-all-lambdas',
      'deploy-cache-system',
      'deploy-matchmaking', 
      'update-lambda-and-deploy'
    ];

    for (const script of legacyScripts) {
      const sourcePath = path.join(this.workspaceRoot, 'scripts', script);
      const targetPath = path.join(this.workspaceRoot, 'scripts', 'legacy-archived', script);
      
      try {
        if (fs.existsSync(sourcePath)) {
          // Copy to archive using Node.js fs methods
          this.copyDirectoryRecursive(sourcePath, targetPath);
          
          this.results.push({
            action: 'ARCHIVE',
            target: script,
            status: 'SUCCESS',
            details: `Archived to legacy-archived/${script}`
          });
          console.log(`   ✅ Archived: ${script}`);
        } else {
          this.results.push({
            action: 'ARCHIVE',
            target: script,
            status: 'SKIPPED',
            details: 'Script not found'
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.results.push({
          action: 'ARCHIVE',
          target: script,
          status: 'ERROR',
          details: err.message
        });
        console.log(`   ❌ Failed to archive ${script}: ${err.message}`);
      }
    }
  }

  private async updateDocumentation(): Promise<void> {
    console.log('\n📝 Updating documentation...');
    
    const readmePath = path.join(this.workspaceRoot, 'README.md');
    
    try {
      if (fs.existsSync(readmePath)) {
        let content = fs.readFileSync(readmePath, 'utf8');
        
        // Add migration completion notice
        const migrationNotice = `
## 🎉 CDK Migration Completed

**Migration Date**: ${new Date().toISOString()}

Trinity infrastructure is now fully managed by AWS CDK. All legacy deployment scripts have been archived.

### New Deployment Commands

\`\`\`bash
cd infrastructure/clean
npm run deploy:all    # Deploy all stacks
npm run hotswap       # Fast development deployment
\`\`\`

### Legacy Scripts Archived

Legacy deployment scripts have been moved to \`scripts/legacy-archived/\` for historical reference.
**DO NOT USE** these archived scripts as they may conflict with CDK-managed resources.

`;
        
        // Insert after the first heading
        const lines = content.split('\n');
        const firstHeadingIndex = lines.findIndex(line => line.startsWith('#'));
        
        if (firstHeadingIndex !== -1) {
          lines.splice(firstHeadingIndex + 1, 0, migrationNotice);
          content = lines.join('\n');
          
          fs.writeFileSync(readmePath, content);
          
          this.results.push({
            action: 'UPDATE_DOCS',
            target: 'README.md',
            status: 'SUCCESS',
            details: 'Added CDK migration completion notice'
          });
          console.log('   ✅ Updated README.md with migration notice');
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.results.push({
        action: 'UPDATE_DOCS',
        target: 'README.md',
        status: 'ERROR',
        details: err.message
      });
      console.log(`   ❌ Failed to update documentation: ${err.message}`);
    }
  }

  private generateReport(): void {
    const reportPath = 'legacy-cleanup-report.json';
    
    const summary = {
      timestamp: new Date().toISOString(),
      totalActions: this.results.length,
      successfulActions: this.results.filter(r => r.status === 'SUCCESS').length,
      skippedActions: this.results.filter(r => r.status === 'SKIPPED').length,
      failedActions: this.results.filter(r => r.status === 'ERROR').length,
      overallStatus: this.results.some(r => r.status === 'ERROR') ? 'PARTIAL' : 'SUCCESS'
    };
    
    const report = {
      summary,
      details: this.results
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📊 Legacy Cleanup Summary:');
    console.log(`   Total Actions: ${summary.totalActions}`);
    console.log(`   Successful: ${summary.successfulActions}`);
    console.log(`   Skipped: ${summary.skippedActions}`);
    console.log(`   Failed: ${summary.failedActions}`);
    console.log(`   Overall Status: ${summary.overallStatus}`);
    console.log(`   Report saved to: ${reportPath}`);
    
    if (summary.overallStatus === 'SUCCESS') {
      console.log('\n🎉 Legacy deployment cleanup completed successfully!');
      console.log('✅ All legacy scripts archived and documentation updated');
    } else {
      console.log('\n⚠️ Legacy cleanup completed with some issues');
      
      const failedActions = this.results.filter(r => r.status === 'ERROR');
      failedActions.forEach(action => {
        console.log(`   ❌ ${action.action} ${action.target}: ${action.details}`);
      });
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const cleanup = new LegacyDeploymentCleanup();
  cleanup.performCleanup().then(results => {
    const hasErrors = results.some(r => r.status === 'ERROR');
    process.exit(hasErrors ? 1 : 0);
  }).catch(error => {
    console.error('💥 Cleanup failed:', error);
    process.exit(1);
  });
}

export { LegacyDeploymentCleanup };