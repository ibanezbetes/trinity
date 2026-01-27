#!/usr/bin/env node

/**
 * Trinity Legacy Elimination Script
 * 
 * Executes complete elimination of legacy components identified
 * during the Trinity refactoring analysis.
 * 
 * Usage:
 *   node execute-legacy-elimination.js [--dry-run] [--report-path=path]
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class LegacyEliminationExecutor {
  constructor() {
    this.dryRun = process.argv.includes('--dry-run');
    this.reportPath = this.extractReportPath() || 'trinity-system-analysis-report.json';
    this.eliminationReport = {
      timestamp: new Date(),
      totalComponents: 0,
      eliminated: 0,
      failed: 0,
      skipped: 0,
      results: [],
      errors: [],
      warnings: []
    };
  }

  extractReportPath() {
    const reportArg = process.argv.find(arg => arg.startsWith('--report-path='));
    return reportArg ? reportArg.split('=')[1] : null;
  }

  async execute() {
    console.log('🧹 Trinity Legacy Elimination Process Started');
    console.log(`📊 Analysis Report: ${this.reportPath}`);
    console.log(`🔍 Mode: ${this.dryRun ? 'DRY RUN' : 'EXECUTION'}`);
    console.log('─'.repeat(60));

    try {
      // Phase 1: Load analysis and identify legacy components
      console.log('📋 Phase 1: Loading analysis report and identifying legacy components...');
      const legacyComponents = await this.loadLegacyComponents();
      this.eliminationReport.totalComponents = legacyComponents.length;
      console.log(`   Found ${legacyComponents.length} legacy components to eliminate`);

      // Phase 2: Eliminate dependencies
      console.log('\n📦 Phase 2: Eliminating obsolete dependencies...');
      const dependencyComponents = legacyComponents.filter(c => c.type === 'dependency');
      await this.eliminateDependencies(dependencyComponents);

      // Phase 3: Eliminate files and directories
      console.log('\n📁 Phase 3: Eliminating obsolete files and directories...');
      const fileComponents = legacyComponents.filter(c => c.type === 'file' || c.type === 'directory');
      await this.eliminateFiles(fileComponents);

      // Phase 4: Clean configuration files
      console.log('\n⚙️ Phase 4: Cleaning configuration files...');
      await this.cleanConfigurations();

      // Phase 5: AWS resources cleanup (if not dry run)
      if (!this.dryRun) {
        console.log('\n☁️ Phase 5: Cleaning up AWS resources...');
        await this.cleanupAWSResources();
      } else {
        console.log('\n☁️ Phase 5: AWS cleanup skipped (dry run mode)');
      }

      // Phase 6: Verification
      console.log('\n✅ Phase 6: Verifying elimination completeness...');
      await this.verifyElimination();

      // Generate final report
      await this.generateFinalReport();

      console.log('\n' + '═'.repeat(60));
      console.log('🎉 Legacy Elimination Process Completed!');
      console.log(`📊 Results: ${this.eliminationReport.eliminated}/${this.eliminationReport.totalComponents} eliminated`);
      console.log(`📄 Report saved to: legacy-elimination-report.json`);

    } catch (error) {
      console.error('❌ Legacy elimination failed:', error.message);
      this.eliminationReport.errors.push(`Critical error: ${error.message}`);
      await this.generateFinalReport();
      process.exit(1);
    }
  }

  async loadLegacyComponents() {
    try {
      const reportContent = await fs.readFile(this.reportPath, 'utf-8');
      const analysisData = JSON.parse(reportContent);
      
      const components = [];

      // Extract from analysis report
      if (analysisData.analysis?.projects) {
        for (const project of analysisData.analysis.projects) {
          if (project.analysis?.obsoleteComponents) {
            for (const component of project.analysis.obsoleteComponents) {
              components.push({
                ...component,
                category: this.categorizeComponent(project.name, component.path)
              });
            }
          }
        }
      }

      // Add known legacy components
      components.push(...this.getKnownLegacyComponents());

      return components;
    } catch (error) {
      throw new Error(`Failed to load legacy components: ${error.message}`);
    }
  }

  getKnownLegacyComponents() {
    return [
      // Legacy backend files
      {
        path: 'backend/ecosystem.config.js',
        type: 'file',
        reason: 'PM2 configuration no longer needed with serverless architecture',
        safeToRemove: true,
        category: 'backend'
      },
      {
        path: 'backend/docker-compose.production.yml',
        type: 'file',
        reason: 'Docker deployment replaced by serverless',
        safeToRemove: true,
        category: 'backend'
      },
      {
        path: 'backend/Dockerfile.production',
        type: 'file',
        reason: 'Docker deployment replaced by serverless',
        safeToRemove: true,
        category: 'backend'
      },

      // Legacy infrastructure files
      {
        path: 'infrastructure/lib/trinity-cost-optimization-stack.ts',
        type: 'file',
        reason: 'Functionality integrated into simplified stack',
        safeToRemove: true,
        category: 'infrastructure'
      },
      {
        path: 'infrastructure/lib/trinity-cost-optimization-stack.js',
        type: 'file',
        reason: 'Compiled version of obsolete stack',
        safeToRemove: true,
        category: 'infrastructure'
      },
      {
        path: 'infrastructure/lib/trinity-cost-optimization-stack.d.ts',
        type: 'file',
        reason: 'Type definitions for obsolete stack',
        safeToRemove: true,
        category: 'infrastructure'
      },

      // Legacy scripts and utilities
      {
        path: 'analyze-aws-infrastructure.js',
        type: 'file',
        reason: 'Analysis completed, script no longer needed',
        safeToRemove: true,
        category: 'global'
      },
      {
        path: 'check-appsync-joinroom-schema.js',
        type: 'file',
        reason: 'Legacy debugging script',
        safeToRemove: true,
        category: 'global'
      },
      {
        path: 'check-appsync-resolvers.js',
        type: 'file',
        reason: 'Legacy debugging script',
        safeToRemove: true,
        category: 'global'
      },
      {
        path: 'check-appsync-schema.js',
        type: 'file',
        reason: 'Legacy debugging script',
        safeToRemove: true,
        category: 'global'
      },

      // Legacy deployment scripts
      {
        path: 'deploy-lambda-fix.bat',
        type: 'file',
        reason: 'Legacy deployment script',
        safeToRemove: true,
        category: 'global'
      },
      {
        path: 'deploy-movies-lambda-simple.bat',
        type: 'file',
        reason: 'Legacy deployment script',
        safeToRemove: true,
        category: 'global'
      },
      {
        path: 'fix-lambda-boolean.bat',
        type: 'file',
        reason: 'Legacy fix script',
        safeToRemove: true,
        category: 'global'
      },

      // Legacy test and debug files
      {
        path: 'test-appsync-joinroom.js',
        type: 'file',
        reason: 'Legacy test script',
        safeToRemove: true,
        category: 'global'
      },
      {
        path: 'test-create-room-direct.js',
        type: 'file',
        reason: 'Legacy test script',
        safeToRemove: true,
        category: 'global'
      },
      {
        path: 'test-lambda-simple.js',
        type: 'file',
        reason: 'Legacy test script',
        safeToRemove: true,
        category: 'global'
      }
    ];
  }

  categorizeComponent(projectName, componentPath) {
    if (projectName.includes('backend') || componentPath.includes('backend')) return 'backend';
    if (projectName.includes('mobile') || componentPath.includes('mobile')) return 'mobile';
    if (projectName.includes('infrastructure') || componentPath.includes('infrastructure')) return 'infrastructure';
    return 'global';
  }

  async eliminateDependencies(components) {
    console.log(`   Processing ${components.length} dependency components...`);

    const packageJsonFiles = [
      'backend/package.json',
      'mobile/package.json',
      'infrastructure/package.json'
    ];

    for (const packageJsonPath of packageJsonFiles) {
      if (await this.fileExists(packageJsonPath)) {
        await this.cleanPackageJson(packageJsonPath, components);
      }
    }
  }

  async cleanPackageJson(packageJsonPath, components) {
    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      let modified = false;

      for (const component of components) {
        if (component.type === 'dependency' && component.safeToRemove) {
          const depName = component.path;
          
          if (packageJson.dependencies?.[depName]) {
            if (!this.dryRun) {
              delete packageJson.dependencies[depName];
            }
            modified = true;
            this.logElimination('success', component, `Removed dependency ${depName} from ${packageJsonPath}`);
          }

          if (packageJson.devDependencies?.[depName]) {
            if (!this.dryRun) {
              delete packageJson.devDependencies[depName];
            }
            modified = true;
            this.logElimination('success', component, `Removed dev dependency ${depName} from ${packageJsonPath}`);
          }
        }
      }

      if (modified && !this.dryRun) {
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log(`   ✅ Updated ${packageJsonPath}`);
      } else if (modified) {
        console.log(`   🔍 Would update ${packageJsonPath} (dry run)`);
      }

    } catch (error) {
      this.eliminationReport.errors.push(`Failed to process ${packageJsonPath}: ${error.message}`);
      console.log(`   ❌ Failed to process ${packageJsonPath}: ${error.message}`);
    }
  }

  async eliminateFiles(components) {
    console.log(`   Processing ${components.length} file/directory components...`);

    for (const component of components) {
      if (!component.safeToRemove) {
        this.logElimination('skipped', component, 'Component marked as unsafe to remove');
        continue;
      }

      try {
        const fullPath = path.resolve(component.path);
        
        if (await this.fileExists(fullPath)) {
          if (!this.dryRun) {
            const stats = await fs.stat(fullPath);
            if (stats.isDirectory()) {
              await fs.rmdir(fullPath, { recursive: true });
            } else {
              await fs.unlink(fullPath);
            }
          }

          this.logElimination('success', component, `Eliminated ${component.type}: ${component.path}`);
          console.log(`   ✅ ${this.dryRun ? 'Would eliminate' : 'Eliminated'}: ${component.path}`);
        } else {
          this.logElimination('skipped', component, 'File/directory does not exist');
        }

      } catch (error) {
        this.logElimination('failed', component, `Failed to eliminate: ${error.message}`);
        console.log(`   ❌ Failed to eliminate ${component.path}: ${error.message}`);
      }
    }
  }

  async cleanConfigurations() {
    console.log('   Cleaning obsolete configuration entries...');

    const configFiles = [
      '.env',
      '.env.example',
      'backend/.env',
      'backend/.env.example',
      'mobile/.env'
    ];

    const obsoleteConfigKeys = [
      'REDIS_URL',
      'REDIS_HOST',
      'REDIS_PORT',
      'SOCKET_IO_PORT',
      'PM2_',
      'DOCKER_'
    ];

    for (const configFile of configFiles) {
      if (await this.fileExists(configFile)) {
        await this.cleanConfigFile(configFile, obsoleteConfigKeys);
      }
    }
  }

  async cleanConfigFile(configPath, obsoleteKeys) {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      let lines = configContent.split('\n');
      let modified = false;

      lines = lines.filter(line => {
        for (const key of obsoleteKeys) {
          if (line.startsWith(`${key}=`) || line.includes(key)) {
            modified = true;
            console.log(`   ✅ ${this.dryRun ? 'Would remove' : 'Removed'} config: ${key} from ${configPath}`);
            this.eliminationReport.eliminated++;
            return false;
          }
        }
        return true;
      });

      if (modified && !this.dryRun) {
        await fs.writeFile(configPath, lines.join('\n'));
      }

    } catch (error) {
      this.eliminationReport.errors.push(`Failed to clean config file ${configPath}: ${error.message}`);
      console.log(`   ❌ Failed to clean ${configPath}: ${error.message}`);
    }
  }

  async cleanupAWSResources() {
    console.log('   Identifying and cleaning AWS resources...');

    try {
      // List CloudFormation stacks
      const { stdout } = await execAsync('aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE');
      const stacks = JSON.parse(stdout);
      
      const trinityStacks = stacks.StackSummaries?.filter(stack => 
        stack.StackName.toLowerCase().includes('trinity') &&
        stack.StackName !== 'TrinitySimplifiedStack' // Keep the new simplified stack
      ) || [];

      console.log(`   Found ${trinityStacks.length} legacy Trinity stacks to remove`);

      for (const stack of trinityStacks) {
        try {
          console.log(`   🗑️ Deleting stack: ${stack.StackName}`);
          await execAsync(`aws cloudformation delete-stack --stack-name ${stack.StackName}`);
          
          // Don't wait for completion in this script to avoid long delays
          console.log(`   ⏳ Stack deletion initiated: ${stack.StackName}`);
          this.eliminationReport.eliminated++;
          
        } catch (error) {
          console.log(`   ❌ Failed to delete stack ${stack.StackName}: ${error.message}`);
          this.eliminationReport.failed++;
        }
      }

    } catch (error) {
      console.log(`   ⚠️ Could not access AWS resources: ${error.message}`);
      this.eliminationReport.warnings.push(`AWS cleanup skipped: ${error.message}`);
    }
  }

  async verifyElimination() {
    console.log('   Verifying elimination completeness...');

    // Check for remaining legacy references
    const legacyPatterns = [
      'ecosystem.config',
      'docker-compose.production',
      'trinity-cost-optimization',
      'PM2_',
      'REDIS_'
    ];

    for (const pattern of legacyPatterns) {
      try {
        const { stdout } = await execAsync(`grep -r "${pattern}" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude="*.log" || true`);
        
        if (stdout.trim()) {
          this.eliminationReport.warnings.push(`Legacy references still found for pattern: ${pattern}`);
          console.log(`   ⚠️ Legacy references found: ${pattern}`);
        } else {
          console.log(`   ✅ No legacy references found for: ${pattern}`);
        }
      } catch (error) {
        // Ignore grep errors
      }
    }
  }

  async generateFinalReport() {
    const report = {
      ...this.eliminationReport,
      summary: {
        successRate: ((this.eliminationReport.eliminated / this.eliminationReport.totalComponents) * 100).toFixed(1),
        dryRun: this.dryRun,
        completedAt: new Date().toISOString()
      }
    };

    await fs.writeFile('legacy-elimination-report.json', JSON.stringify(report, null, 2));

    // Generate markdown summary
    const markdownSummary = `# Trinity Legacy Elimination Report

**Timestamp:** ${report.timestamp}
**Mode:** ${this.dryRun ? 'DRY RUN' : 'EXECUTION'}

## Summary
- **Total Components:** ${report.totalComponents}
- **Successfully Eliminated:** ${report.eliminated}
- **Failed:** ${report.failed}
- **Skipped:** ${report.skipped}
- **Success Rate:** ${report.summary.successRate}%

## Status
${report.eliminated === report.totalComponents 
  ? '✅ **All legacy components successfully eliminated. System is clean.**'
  : '⚠️ **Some components could not be eliminated. Review failed items and retry if necessary.**'
}

## Errors (${report.errors.length})
${report.errors.map(error => `- ${error}`).join('\n')}

## Warnings (${report.warnings.length})
${report.warnings.map(warning => `- ${warning}`).join('\n')}

## Next Steps
${this.dryRun 
  ? '- Run without --dry-run flag to execute actual elimination\n- Review the elimination plan above'
  : '- Verify system functionality after elimination\n- Run tests to ensure no regressions\n- Update documentation to reflect changes'
}
`;

    await fs.writeFile('LEGACY_ELIMINATION_SUMMARY.md', markdownSummary);
  }

  logElimination(status, component, message) {
    this.eliminationReport.results.push({
      component,
      status,
      message,
      timestamp: new Date()
    });

    switch (status) {
      case 'success':
        this.eliminationReport.eliminated++;
        break;
      case 'failed':
        this.eliminationReport.failed++;
        break;
      case 'skipped':
        this.eliminationReport.skipped++;
        break;
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const executor = new LegacyEliminationExecutor();
  executor.execute().catch(console.error);
}

module.exports = LegacyEliminationExecutor;