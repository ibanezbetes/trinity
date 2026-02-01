#!/usr/bin/env ts-node
"use strict";
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
exports.LegacyDeploymentCleanup = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class LegacyDeploymentCleanup {
    constructor() {
        this.results = [];
        this.workspaceRoot = path.resolve('../..');
    }
    async performCleanup() {
        console.log('🧹 Cleaning up legacy deployment scripts...');
        console.log('📋 Archiving non-CDK deployment methods');
        await this.identifyLegacyScripts();
        await this.createArchiveDirectory();
        await this.archiveLegacyScripts();
        await this.updateDocumentation();
        this.generateReport();
        return this.results;
    }
    async identifyLegacyScripts() {
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
            }
            else {
                this.results.push({
                    action: 'IDENTIFY',
                    target: pattern,
                    status: 'SKIPPED',
                    details: `Script not found: ${scriptPath}`
                });
            }
        }
    }
    async createArchiveDirectory() {
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
            }
            else {
                this.results.push({
                    action: 'CREATE_ARCHIVE',
                    target: archivePath,
                    status: 'SKIPPED',
                    details: 'Archive directory already exists'
                });
                console.log('   📁 Archive directory already exists');
            }
        }
        catch (error) {
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
    copyDirectoryRecursive(source, target) {
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
            }
            else {
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }
    async archiveLegacyScripts() {
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
                }
                else {
                    this.results.push({
                        action: 'ARCHIVE',
                        target: script,
                        status: 'SKIPPED',
                        details: 'Script not found'
                    });
                }
            }
            catch (error) {
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
    async updateDocumentation() {
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
        }
        catch (error) {
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
    generateReport() {
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
        }
        else {
            console.log('\n⚠️ Legacy cleanup completed with some issues');
            const failedActions = this.results.filter(r => r.status === 'ERROR');
            failedActions.forEach(action => {
                console.log(`   ❌ ${action.action} ${action.target}: ${action.details}`);
            });
        }
    }
}
exports.LegacyDeploymentCleanup = LegacyDeploymentCleanup;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2xlYW51cC1sZWdhY3ktZGVwbG95bWVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNsZWFudXAtbGVnYWN5LWRlcGxveW1lbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdBLHVDQUF5QjtBQUN6QiwyQ0FBNkI7QUFTN0IsTUFBTSx1QkFBdUI7SUFBN0I7UUFDVSxZQUFPLEdBQW9CLEVBQUUsQ0FBQztRQUNyQixrQkFBYSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7SUEyU3pELENBQUM7SUF6U0MsS0FBSyxDQUFDLGNBQWM7UUFDbEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2Q0FBNkMsQ0FBQyxDQUFDO1FBQzNELE9BQU8sQ0FBQyxHQUFHLENBQUMseUNBQXlDLENBQUMsQ0FBQztRQUV2RCxNQUFNLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQ25DLE1BQU0sSUFBSSxDQUFDLHNCQUFzQixFQUFFLENBQUM7UUFDcEMsTUFBTSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUNsQyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBRWpDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUN0QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDdEIsQ0FBQztJQUVPLEtBQUssQ0FBQyxxQkFBcUI7UUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO1FBRTdELE1BQU0sY0FBYyxHQUFHO1lBQ3JCLG9CQUFvQjtZQUNwQixxQkFBcUI7WUFDckIsb0JBQW9CO1lBQ3BCLDBCQUEwQjtTQUMzQixDQUFDO1FBRUYsS0FBSyxNQUFNLE9BQU8sSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNyQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxhQUFhLEVBQUUsU0FBUyxFQUFF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QUssQ0FBQyxDQUFDO1FBQzNDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgdHMtbm9kZVxyXG5cclxuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcclxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xyXG5cclxuaW50ZXJmYWNlIENsZWFudXBSZXN1bHQge1xyXG4gIGFjdGlvbjogc3RyaW5nO1xyXG4gIHRhcmdldDogc3RyaW5nO1xyXG4gIHN0YXR1czogJ1NVQ0NFU1MnIHwgJ1NLSVBQRUQnIHwgJ0VSUk9SJztcclxuICBkZXRhaWxzOiBzdHJpbmc7XHJcbn1cclxuXHJcbmNsYXNzIExlZ2FjeURlcGxveW1lbnRDbGVhbnVwIHtcclxuICBwcml2YXRlIHJlc3VsdHM6IENsZWFudXBSZXN1bHRbXSA9IFtdO1xyXG4gIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlUm9vdCA9IHBhdGgucmVzb2x2ZSgnLi4vLi4nKTtcclxuXHJcbiAgYXN5bmMgcGVyZm9ybUNsZWFudXAoKTogUHJvbWlzZTxDbGVhbnVwUmVzdWx0W10+IHtcclxuICAgIGNvbnNvbGUubG9nKCfwn6e5IENsZWFuaW5nIHVwIGxlZ2FjeSBkZXBsb3ltZW50IHNjcmlwdHMuLi4nKTtcclxuICAgIGNvbnNvbGUubG9nKCfwn5OLIEFyY2hpdmluZyBub24tQ0RLIGRlcGxveW1lbnQgbWV0aG9kcycpO1xyXG4gICAgXHJcbiAgICBhd2FpdCB0aGlzLmlkZW50aWZ5TGVnYWN5U2NyaXB0cygpO1xyXG4gICAgYXdhaXQgdGhpcy5jcmVhdGVBcmNoaXZlRGlyZWN0b3J5KCk7XHJcbiAgICBhd2FpdCB0aGlzLmFyY2hpdmVMZWdhY3lTY3JpcHRzKCk7XHJcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZURvY3VtZW50YXRpb24oKTtcclxuICAgIFxyXG4gICAgdGhpcy5nZW5lcmF0ZVJlcG9ydCgpO1xyXG4gICAgcmV0dXJuIHRoaXMucmVzdWx0cztcclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgaWRlbnRpZnlMZWdhY3lTY3JpcHRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCflI0gSWRlbnRpZnlpbmcgbGVnYWN5IGRlcGxveW1lbnQgc2NyaXB0cy4uLicpO1xyXG4gICAgXHJcbiAgICBjb25zdCBsZWdhY3lQYXR0ZXJucyA9IFtcclxuICAgICAgJ2RlcGxveS1hbGwtbGFtYmRhcycsXHJcbiAgICAgICdkZXBsb3ktY2FjaGUtc3lzdGVtJywgXHJcbiAgICAgICdkZXBsb3ktbWF0Y2htYWtpbmcnLFxyXG4gICAgICAndXBkYXRlLWxhbWJkYS1hbmQtZGVwbG95J1xyXG4gICAgXTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IHBhdHRlcm4gb2YgbGVnYWN5UGF0dGVybnMpIHtcclxuICAgICAgY29uc3Qgc2NyaXB0UGF0aCA9IHBhdGguam9pbih0aGlzLndvcmtzcGFjZVJvb3QsICdzY3JpcHRzJywgcGF0dGVybik7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhzY3JpcHRQYXRoKSkge1xyXG4gICAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICAgIGFjdGlvbjogJ0lERU5USUZZJyxcclxuICAgICAgICAgIHRhcmdldDogcGF0dGVybixcclxuICAgICAgICAgIHN0YXR1czogJ1NVQ0NFU1MnLFxyXG4gICAgICAgICAgZGV0YWlsczogYEZvdW5kIGxlZ2FjeSBkZXBsb3ltZW50IHNjcmlwdDogJHtzY3JpcHRQYXRofWBcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAg8J+TgSBGb3VuZDogJHtwYXR0ZXJufWApO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICAgIGFjdGlvbjogJ0lERU5USUZZJyxcclxuICAgICAgICAgIHRhcmdldDogcGF0dGVybixcclxuICAgICAgICAgIHN0YXR1czogJ1NLSVBQRUQnLFxyXG4gICAgICAgICAgZGV0YWlsczogYFNjcmlwdCBub3QgZm91bmQ6ICR7c2NyaXB0UGF0aH1gXHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgYXN5bmMgY3JlYXRlQXJjaGl2ZURpcmVjdG9yeSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OmIENyZWF0aW5nIGFyY2hpdmUgZGlyZWN0b3J5Li4uJyk7XHJcbiAgICBcclxuICAgIGNvbnN0IGFyY2hpdmVQYXRoID0gcGF0aC5qb2luKHRoaXMud29ya3NwYWNlUm9vdCwgJ3NjcmlwdHMnLCAnbGVnYWN5LWFyY2hpdmVkJyk7XHJcbiAgICBcclxuICAgIHRyeSB7XHJcbiAgICAgIGlmICghZnMuZXhpc3RzU3luYyhhcmNoaXZlUGF0aCkpIHtcclxuICAgICAgICBmcy5ta2RpclN5bmMoYXJjaGl2ZVBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIENyZWF0ZSBSRUFETUUgZXhwbGFpbmluZyB0aGUgYXJjaGl2ZVxyXG4gICAgICAgIGNvbnN0IHJlYWRtZUNvbnRlbnQgPSBgIyBMZWdhY3kgRGVwbG95bWVudCBTY3JpcHRzIEFyY2hpdmVcclxuXHJcblRoaXMgZGlyZWN0b3J5IGNvbnRhaW5zIGRlcGxveW1lbnQgc2NyaXB0cyB0aGF0IHdlcmUgdXNlZCBiZWZvcmUgdGhlIENESyBtaWdyYXRpb24uXHJcblxyXG4jIyBNaWdyYXRpb24gQ29tcGxldGVkOiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1cclxuXHJcblRoZXNlIHNjcmlwdHMgYXJlIGFyY2hpdmVkIGZvciBoaXN0b3JpY2FsIHJlZmVyZW5jZSBidXQgc2hvdWxkIE5PVCBiZSB1c2VkIGZvciBkZXBsb3ltZW50LlxyXG5cclxuIyMgQ3VycmVudCBEZXBsb3ltZW50IE1ldGhvZFxyXG5cclxuVXNlIENESyBmb3IgYWxsIGRlcGxveW1lbnRzOlxyXG5cclxuXFxgXFxgXFxgYmFzaFxyXG5jZCBpbmZyYXN0cnVjdHVyZS9jbGVhblxyXG5ucG0gcnVuIGRlcGxveTphbGwgICAgIyBEZXBsb3kgYWxsIHN0YWNrc1xyXG5ucG0gcnVuIGhvdHN3YXAgICAgICAgIyBGYXN0IGRldmVsb3BtZW50IGRlcGxveW1lbnRcclxuXFxgXFxgXFxgXHJcblxyXG4jIyBBcmNoaXZlZCBTY3JpcHRzXHJcblxyXG5UaGUgZm9sbG93aW5nIGxlZ2FjeSBkZXBsb3ltZW50IG1ldGhvZHMgaGF2ZSBiZWVuIHJlcGxhY2VkIGJ5IENESzpcclxuXHJcbi0gKipkZXBsb3ktYWxsLWxhbWJkYXMqKjogUmVwbGFjZWQgYnkgXFxgY2RrIGRlcGxveSBUcmluaXR5TGFtYmRhU3RhY2tcXGBcclxuLSAqKmRlcGxveS1jYWNoZS1zeXN0ZW0qKjogUmVwbGFjZWQgYnkgXFxgY2RrIGRlcGxveSBUcmluaXR5RGF0YWJhc2VTdGFja1xcYFxyXG4tICoqZGVwbG95LW1hdGNobWFraW5nKio6IFJlcGxhY2VkIGJ5IFxcYGNkayBkZXBsb3kgVHJpbml0eU1hdGNobWFraW5nU3RhY2tcXGBcclxuLSAqKnVwZGF0ZS1sYW1iZGEtYW5kLWRlcGxveSoqOiBSZXBsYWNlZCBieSBcXGBjZGsgaG90c3dhcFxcYFxyXG5cclxuIyMgSW5mcmFzdHJ1Y3R1cmUgTWFuYWdlbWVudFxyXG5cclxuQWxsIGluZnJhc3RydWN0dXJlIGlzIG5vdyBtYW5hZ2VkIHRocm91Z2ggQ0RLIHN0YWNrczpcclxuXHJcbjEuICoqVHJpbml0eURhdGFiYXNlU3RhY2sqKiAtIER5bmFtb0RCIHRhYmxlc1xyXG4yLiAqKlRyaW5pdHlMYW1iZGFTdGFjayoqIC0gTGFtYmRhIGZ1bmN0aW9ucyAgXHJcbjMuICoqVHJpbml0eUFwaVN0YWNrKiogLSBBcHBTeW5jIEdyYXBoUUwgQVBJc1xyXG40LiAqKlRyaW5pdHlDb2duaXRvU3RhY2sqKiAtIFVzZXIgYXV0aGVudGljYXRpb25cclxuNS4gKipUcmluaXR5TW9uaXRvcmluZ1N0YWNrKiogLSBDbG91ZFdhdGNoIG1vbml0b3JpbmdcclxuXHJcbiMjIERPIE5PVCBVU0UgVEhFU0UgQVJDSElWRUQgU0NSSVBUU1xyXG5cclxuVXNpbmcgdGhlc2Ugc2NyaXB0cyBjb3VsZCBjYXVzZSBjb25mbGljdHMgd2l0aCBDREstbWFuYWdlZCByZXNvdXJjZXMuXHJcbmA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oYXJjaGl2ZVBhdGgsICdSRUFETUUubWQnKSwgcmVhZG1lQ29udGVudCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGhpcy5yZXN1bHRzLnB1c2goe1xyXG4gICAgICAgICAgYWN0aW9uOiAnQ1JFQVRFX0FSQ0hJVkUnLFxyXG4gICAgICAgICAgdGFyZ2V0OiBhcmNoaXZlUGF0aCxcclxuICAgICAgICAgIHN0YXR1czogJ1NVQ0NFU1MnLFxyXG4gICAgICAgICAgZGV0YWlsczogJ0FyY2hpdmUgZGlyZWN0b3J5IGNyZWF0ZWQgd2l0aCBkb2N1bWVudGF0aW9uJ1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCcgICDinIUgQXJjaGl2ZSBkaXJlY3RvcnkgY3JlYXRlZCcpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICAgIGFjdGlvbjogJ0NSRUFURV9BUkNISVZFJyxcclxuICAgICAgICAgIHRhcmdldDogYXJjaGl2ZVBhdGgsXHJcbiAgICAgICAgICBzdGF0dXM6ICdTS0lQUEVEJyxcclxuICAgICAgICAgIGRldGFpbHM6ICdBcmNoaXZlIGRpcmVjdG9yeSBhbHJlYWR5IGV4aXN0cydcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZygnICAg8J+TgSBBcmNoaXZlIGRpcmVjdG9yeSBhbHJlYWR5IGV4aXN0cycpO1xyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICBjb25zdCBlcnIgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IgOiBuZXcgRXJyb3IoU3RyaW5nKGVycm9yKSk7XHJcbiAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICBhY3Rpb246ICdDUkVBVEVfQVJDSElWRScsXHJcbiAgICAgICAgdGFyZ2V0OiBhcmNoaXZlUGF0aCxcclxuICAgICAgICBzdGF0dXM6ICdFUlJPUicsXHJcbiAgICAgICAgZGV0YWlsczogZXJyLm1lc3NhZ2VcclxuICAgICAgfSk7XHJcbiAgICAgIGNvbnNvbGUubG9nKGAgICDinYwgRmFpbGVkIHRvIGNyZWF0ZSBhcmNoaXZlOiAke2Vyci5tZXNzYWdlfWApO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBjb3B5RGlyZWN0b3J5UmVjdXJzaXZlKHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKHRhcmdldCkpIHtcclxuICAgICAgZnMubWtkaXJTeW5jKHRhcmdldCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgaXRlbXMgPSBmcy5yZWFkZGlyU3luYyhzb3VyY2UpO1xyXG4gICAgXHJcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcclxuICAgICAgY29uc3Qgc291cmNlUGF0aCA9IHBhdGguam9pbihzb3VyY2UsIGl0ZW0pO1xyXG4gICAgICBjb25zdCB0YXJnZXRQYXRoID0gcGF0aC5qb2luKHRhcmdldCwgaXRlbSk7XHJcbiAgICAgIFxyXG4gICAgICBjb25zdCBzdGF0ID0gZnMuc3RhdFN5bmMoc291cmNlUGF0aCk7XHJcbiAgICAgIFxyXG4gICAgICBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpKSB7XHJcbiAgICAgICAgdGhpcy5jb3B5RGlyZWN0b3J5UmVjdXJzaXZlKHNvdXJjZVBhdGgsIHRhcmdldFBhdGgpO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGZzLmNvcHlGaWxlU3luYyhzb3VyY2VQYXRoLCB0YXJnZXRQYXRoKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyBhcmNoaXZlTGVnYWN5U2NyaXB0cygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnNvbGUubG9nKCdcXG7wn5OmIEFyY2hpdmluZyBsZWdhY3kgc2NyaXB0cy4uLicpO1xyXG4gICAgXHJcbiAgICBjb25zdCBsZWdhY3lTY3JpcHRzID0gW1xyXG4gICAgICAnZGVwbG95LWFsbC1sYW1iZGFzJyxcclxuICAgICAgJ2RlcGxveS1jYWNoZS1zeXN0ZW0nLFxyXG4gICAgICAnZGVwbG95LW1hdGNobWFraW5nJywgXHJcbiAgICAgICd1cGRhdGUtbGFtYmRhLWFuZC1kZXBsb3knXHJcbiAgICBdO1xyXG5cclxuICAgIGZvciAoY29uc3Qgc2NyaXB0IG9mIGxlZ2FjeVNjcmlwdHMpIHtcclxuICAgICAgY29uc3Qgc291cmNlUGF0aCA9IHBhdGguam9pbih0aGlzLndvcmtzcGFjZVJvb3QsICdzY3JpcHRzJywgc2NyaXB0KTtcclxuICAgICAgY29uc3QgdGFyZ2V0UGF0aCA9IHBhdGguam9pbih0aGlzLndvcmtzcGFjZVJvb3QsICdzY3JpcHRzJywgJ2xlZ2FjeS1hcmNoaXZlZCcsIHNjcmlwdCk7XHJcbiAgICAgIFxyXG4gICAgICB0cnkge1xyXG4gICAgICAgIGlmIChmcy5leGlzdHNTeW5jKHNvdXJjZVBhdGgpKSB7XHJcbiAgICAgICAgICAvLyBDb3B5IHRvIGFyY2hpdmUgdXNpbmcgTm9kZS5qcyBmcyBtZXRob2RzXHJcbiAgICAgICAgICB0aGlzLmNvcHlEaXJlY3RvcnlSZWN1cnNpdmUoc291cmNlUGF0aCwgdGFyZ2V0UGF0aCk7XHJcbiAgICAgICAgICBcclxuICAgICAgICAgIHRoaXMucmVzdWx0cy5wdXNoKHtcclxuICAgICAgICAgICAgYWN0aW9uOiAnQVJDSElWRScsXHJcbiAgICAgICAgICAgIHRhcmdldDogc2NyaXB0LFxyXG4gICAgICAgICAgICBzdGF0dXM6ICdTVUNDRVNTJyxcclxuICAgICAgICAgICAgZGV0YWlsczogYEFyY2hpdmVkIHRvIGxlZ2FjeS1hcmNoaXZlZC8ke3NjcmlwdH1gXHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKGAgICDinIUgQXJjaGl2ZWQ6ICR7c2NyaXB0fWApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICAgIGFjdGlvbjogJ0FSQ0hJVkUnLFxyXG4gICAgICAgICAgICB0YXJnZXQ6IHNjcmlwdCxcclxuICAgICAgICAgICAgc3RhdHVzOiAnU0tJUFBFRCcsXHJcbiAgICAgICAgICAgIGRldGFpbHM6ICdTY3JpcHQgbm90IGZvdW5kJ1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnN0IGVyciA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyb3IpKTtcclxuICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICBhY3Rpb246ICdBUkNISVZFJyxcclxuICAgICAgICAgIHRhcmdldDogc2NyaXB0LFxyXG4gICAgICAgICAgc3RhdHVzOiAnRVJST1InLFxyXG4gICAgICAgICAgZGV0YWlsczogZXJyLm1lc3NhZ2VcclxuICAgICAgICB9KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgICAg4p2MIEZhaWxlZCB0byBhcmNoaXZlICR7c2NyaXB0fTogJHtlcnIubWVzc2FnZX1gKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgcHJpdmF0ZSBhc3luYyB1cGRhdGVEb2N1bWVudGF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc29sZS5sb2coJ1xcbvCfk50gVXBkYXRpbmcgZG9jdW1lbnRhdGlvbi4uLicpO1xyXG4gICAgXHJcbiAgICBjb25zdCByZWFkbWVQYXRoID0gcGF0aC5qb2luKHRoaXMud29ya3NwYWNlUm9vdCwgJ1JFQURNRS5tZCcpO1xyXG4gICAgXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhyZWFkbWVQYXRoKSkge1xyXG4gICAgICAgIGxldCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKHJlYWRtZVBhdGgsICd1dGY4Jyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQWRkIG1pZ3JhdGlvbiBjb21wbGV0aW9uIG5vdGljZVxyXG4gICAgICAgIGNvbnN0IG1pZ3JhdGlvbk5vdGljZSA9IGBcclxuIyMg8J+OiSBDREsgTWlncmF0aW9uIENvbXBsZXRlZFxyXG5cclxuKipNaWdyYXRpb24gRGF0ZSoqOiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1cclxuXHJcblRyaW5pdHkgaW5mcmFzdHJ1Y3R1cmUgaXMgbm93IGZ1bGx5IG1hbmFnZWQgYnkgQVdTIENESy4gQWxsIGxlZ2FjeSBkZXBsb3ltZW50IHNjcmlwdHMgaGF2ZSBiZWVuIGFyY2hpdmVkLlxyXG5cclxuIyMjIE5ldyBEZXBsb3ltZW50IENvbW1hbmRzXHJcblxyXG5cXGBcXGBcXGBiYXNoXHJcbmNkIGluZnJhc3RydWN0dXJlL2NsZWFuXHJcbm5wbSBydW4gZGVwbG95OmFsbCAgICAjIERlcGxveSBhbGwgc3RhY2tzXHJcbm5wbSBydW4gaG90c3dhcCAgICAgICAjIEZhc3QgZGV2ZWxvcG1lbnQgZGVwbG95bWVudFxyXG5cXGBcXGBcXGBcclxuXHJcbiMjIyBMZWdhY3kgU2NyaXB0cyBBcmNoaXZlZFxyXG5cclxuTGVnYWN5IGRlcGxveW1lbnQgc2NyaXB0cyBoYXZlIGJlZW4gbW92ZWQgdG8gXFxgc2NyaXB0cy9sZWdhY3ktYXJjaGl2ZWQvXFxgIGZvciBoaXN0b3JpY2FsIHJlZmVyZW5jZS5cclxuKipETyBOT1QgVVNFKiogdGhlc2UgYXJjaGl2ZWQgc2NyaXB0cyBhcyB0aGV5IG1heSBjb25mbGljdCB3aXRoIENESy1tYW5hZ2VkIHJlc291cmNlcy5cclxuXHJcbmA7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gSW5zZXJ0IGFmdGVyIHRoZSBmaXJzdCBoZWFkaW5nXHJcbiAgICAgICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcclxuICAgICAgICBjb25zdCBmaXJzdEhlYWRpbmdJbmRleCA9IGxpbmVzLmZpbmRJbmRleChsaW5lID0+IGxpbmUuc3RhcnRzV2l0aCgnIycpKTtcclxuICAgICAgICBcclxuICAgICAgICBpZiAoZmlyc3RIZWFkaW5nSW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgICBsaW5lcy5zcGxpY2UoZmlyc3RIZWFkaW5nSW5kZXggKyAxLCAwLCBtaWdyYXRpb25Ob3RpY2UpO1xyXG4gICAgICAgICAgY29udGVudCA9IGxpbmVzLmpvaW4oJ1xcbicpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHJlYWRtZVBhdGgsIGNvbnRlbnQpO1xyXG4gICAgICAgICAgXHJcbiAgICAgICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgICAgIGFjdGlvbjogJ1VQREFURV9ET0NTJyxcclxuICAgICAgICAgICAgdGFyZ2V0OiAnUkVBRE1FLm1kJyxcclxuICAgICAgICAgICAgc3RhdHVzOiAnU1VDQ0VTUycsXHJcbiAgICAgICAgICAgIGRldGFpbHM6ICdBZGRlZCBDREsgbWlncmF0aW9uIGNvbXBsZXRpb24gbm90aWNlJ1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgICBjb25zb2xlLmxvZygnICAg4pyFIFVwZGF0ZWQgUkVBRE1FLm1kIHdpdGggbWlncmF0aW9uIG5vdGljZScpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgY29uc3QgZXJyID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKFN0cmluZyhlcnJvcikpO1xyXG4gICAgICB0aGlzLnJlc3VsdHMucHVzaCh7XHJcbiAgICAgICAgYWN0aW9uOiAnVVBEQVRFX0RPQ1MnLFxyXG4gICAgICAgIHRhcmdldDogJ1JFQURNRS5tZCcsXHJcbiAgICAgICAgc3RhdHVzOiAnRVJST1InLFxyXG4gICAgICAgIGRldGFpbHM6IGVyci5tZXNzYWdlXHJcbiAgICAgIH0pO1xyXG4gICAgICBjb25zb2xlLmxvZyhgICAg4p2MIEZhaWxlZCB0byB1cGRhdGUgZG9jdW1lbnRhdGlvbjogJHtlcnIubWVzc2FnZX1gKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHByaXZhdGUgZ2VuZXJhdGVSZXBvcnQoKTogdm9pZCB7XHJcbiAgICBjb25zdCByZXBvcnRQYXRoID0gJ2xlZ2FjeS1jbGVhbnVwLXJlcG9ydC5qc29uJztcclxuICAgIFxyXG4gICAgY29uc3Qgc3VtbWFyeSA9IHtcclxuICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgIHRvdGFsQWN0aW9uczogdGhpcy5yZXN1bHRzLmxlbmd0aCxcclxuICAgICAgc3VjY2Vzc2Z1bEFjdGlvbnM6IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ1NVQ0NFU1MnKS5sZW5ndGgsXHJcbiAgICAgIHNraXBwZWRBY3Rpb25zOiB0aGlzLnJlc3VsdHMuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICdTS0lQUEVEJykubGVuZ3RoLFxyXG4gICAgICBmYWlsZWRBY3Rpb25zOiB0aGlzLnJlc3VsdHMuZmlsdGVyKHIgPT4gci5zdGF0dXMgPT09ICdFUlJPUicpLmxlbmd0aCxcclxuICAgICAgb3ZlcmFsbFN0YXR1czogdGhpcy5yZXN1bHRzLnNvbWUociA9PiByLnN0YXR1cyA9PT0gJ0VSUk9SJykgPyAnUEFSVElBTCcgOiAnU1VDQ0VTUydcclxuICAgIH07XHJcbiAgICBcclxuICAgIGNvbnN0IHJlcG9ydCA9IHtcclxuICAgICAgc3VtbWFyeSxcclxuICAgICAgZGV0YWlsczogdGhpcy5yZXN1bHRzXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICBmcy53cml0ZUZpbGVTeW5jKHJlcG9ydFBhdGgsIEpTT04uc3RyaW5naWZ5KHJlcG9ydCwgbnVsbCwgMikpO1xyXG4gICAgXHJcbiAgICBjb25zb2xlLmxvZygnXFxu8J+TiiBMZWdhY3kgQ2xlYW51cCBTdW1tYXJ5OicpO1xyXG4gICAgY29uc29sZS5sb2coYCAgIFRvdGFsIEFjdGlvbnM6ICR7c3VtbWFyeS50b3RhbEFjdGlvbnN9YCk7XHJcbiAgICBjb25zb2xlLmxvZyhgICAgU3VjY2Vzc2Z1bDogJHtzdW1tYXJ5LnN1Y2Nlc3NmdWxBY3Rpb25zfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIFNraXBwZWQ6ICR7c3VtbWFyeS5za2lwcGVkQWN0aW9uc31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBGYWlsZWQ6ICR7c3VtbWFyeS5mYWlsZWRBY3Rpb25zfWApO1xyXG4gICAgY29uc29sZS5sb2coYCAgIE92ZXJhbGwgU3RhdHVzOiAke3N1bW1hcnkub3ZlcmFsbFN0YXR1c31gKTtcclxuICAgIGNvbnNvbGUubG9nKGAgICBSZXBvcnQgc2F2ZWQgdG86ICR7cmVwb3J0UGF0aH1gKTtcclxuICAgIFxyXG4gICAgaWYgKHN1bW1hcnkub3ZlcmFsbFN0YXR1cyA9PT0gJ1NVQ0NFU1MnKSB7XHJcbiAgICAgIGNvbnNvbGUubG9nKCdcXG7wn46JIExlZ2FjeSBkZXBsb3ltZW50IGNsZWFudXAgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSEnKTtcclxuICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgbGVnYWN5IHNjcmlwdHMgYXJjaGl2ZWQgYW5kIGRvY3VtZW50YXRpb24gdXBkYXRlZCcpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgY29uc29sZS5sb2coJ1xcbuKaoO+4jyBMZWdhY3kgY2xlYW51cCBjb21wbGV0ZWQgd2l0aCBzb21lIGlzc3VlcycpO1xyXG4gICAgICBcclxuICAgICAgY29uc3QgZmFpbGVkQWN0aW9ucyA9IHRoaXMucmVzdWx0cy5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ0VSUk9SJyk7XHJcbiAgICAgIGZhaWxlZEFjdGlvbnMuZm9yRWFjaChhY3Rpb24gPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGAgICDinYwgJHthY3Rpb24uYWN0aW9ufSAke2FjdGlvbi50YXJnZXR9OiAke2FjdGlvbi5kZXRhaWxzfWApO1xyXG4gICAgICB9KTtcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEV4ZWN1dGUgaWYgcnVuIGRpcmVjdGx5XHJcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xyXG4gIGNvbnN0IGNsZWFudXAgPSBuZXcgTGVnYWN5RGVwbG95bWVudENsZWFudXAoKTtcclxuICBjbGVhbnVwLnBlcmZvcm1DbGVhbnVwKCkudGhlbihyZXN1bHRzID0+IHtcclxuICAgIGNvbnN0IGhhc0Vycm9ycyA9IHJlc3VsdHMuc29tZShyID0+IHIuc3RhdHVzID09PSAnRVJST1InKTtcclxuICAgIHByb2Nlc3MuZXhpdChoYXNFcnJvcnMgPyAxIDogMCk7XHJcbiAgfSkuY2F0Y2goZXJyb3IgPT4ge1xyXG4gICAgY29uc29sZS5lcnJvcign8J+SpSBDbGVhbnVwIGZhaWxlZDonLCBlcnJvcik7XHJcbiAgICBwcm9jZXNzLmV4aXQoMSk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCB7IExlZ2FjeURlcGxveW1lbnRDbGVhbnVwIH07Il19