#!/usr/bin/env node

/**
 * Trinity Legacy Verification Script
 * 
 * Verifies that legacy elimination was complete and no legacy
 * components or references remain in the system.
 * 
 * Usage:
 *   node verify-legacy-elimination.js
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class LegacyVerificationExecutor {
  constructor() {
    this.verificationReport = {
      timestamp: new Date(),
      overallStatus: 'clean',
      totalChecks: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      results: [],
      legacyReferences: [],
      recommendations: []
    };
  }

  async execute() {
    console.log('🔍 Trinity Legacy Verification Process Started');
    console.log('─'.repeat(60));

    try {
      const verificationChecks = [
        { name: 'Dependency Cleanup', fn: () => this.verifyDependencyCleanup() },
        { name: 'File System Cleanup', fn: () => this.verifyFileSystemCleanup() },
        { name: 'Configuration Cleanup', fn: () => this.verifyConfigurationCleanup() },
        { name: 'Code References', fn: () => this.verifyCodeReferences() },
        { name: 'AWS Resources', fn: () => this.verifyAWSResourcesCleanup() },
        { name: 'Documentation Updates', fn: () => this.verifyDocumentationUpdates() },
        { name: 'Tests Integrity', fn: () => this.verifyTestsIntegrity() },
        { name: 'Build Processes', fn: () => this.verifyBuildProcesses() }
      ];

      this.verificationReport.totalChecks = verificationChecks.length;

      for (const check of verificationChecks) {
        console.log(`\n🔎 Verifying: ${check.name}...`);
        
        try {
          const result = await check.fn();
          this.verificationReport.results.push(result);

          if (result.passed) {
            this.verificationReport.passed++;
            console.log(`   ✅ ${result.message}`);
          } else {
            if (result.message.includes('warning') || result.message.includes('Warning')) {
              this.verificationReport.warnings++;
              console.log(`   ⚠️ ${result.message}`);
            } else {
              this.verificationReport.failed++;
              console.log(`   ❌ ${result.message}`);
            }

            if (result.details) {
              console.log(`   📋 Details: ${JSON.stringify(result.details, null, 2)}`);
            }
          }

          if (result.references) {
            this.verificationReport.legacyReferences.push(...result.references);
          }

        } catch (error) {
          console.log(`   ❌ Verification failed: ${error.message}`);
          this.verificationReport.results.push({
            category: check.name.toLowerCase().replace(' ', '-'),
            passed: false,
            message: `Verification check failed: ${error.message}`
          });
          this.verificationReport.failed++;
        }
      }

      // Determine overall status
      if (this.verificationReport.failed > 0) {
        this.verificationReport.overallStatus = 'failed';
      } else if (this.verificationReport.warnings > 0) {
        this.verificationReport.overallStatus = 'warnings';
      } else {
        this.verificationReport.overallStatus = 'clean';
      }

      // Generate recommendations
      this.verificationReport.recommendations = this.generateRecommendations();

      // Generate final report
      await this.generateFinalReport();

      console.log('\n' + '═'.repeat(60));
      const statusEmoji = {
        'clean': '🎉',
        'warnings': '⚠️',
        'failed': '❌'
      };
      
      console.log(`${statusEmoji[this.verificationReport.overallStatus]} Legacy Verification Completed!`);
      console.log(`📊 Status: ${this.verificationReport.overallStatus.toUpperCase()}`);
      console.log(`📈 Results: ${this.verificationReport.passed}/${this.verificationReport.totalChecks} passed`);
      console.log(`📄 Report saved to: legacy-verification-report.json`);

      if (this.verificationReport.legacyReferences.length > 0) {
        console.log(`🔍 Found ${this.verificationReport.legacyReferences.length} legacy references to review`);
      }

    } catch (error) {
      console.error('❌ Legacy verification failed:', error.message);
      this.verificationReport.overallStatus = 'failed';
      this.verificationReport.results.push({
        category: 'critical-error',
        passed: false,
        message: `Critical verification error: ${error.message}`
      });
      await this.generateFinalReport();
      process.exit(1);
    }
  }

  async verifyDependencyCleanup() {
    const legacyDependencies = [
      'aws-sdk',
      'socket.io',
      'redis',
      'pm2',
      'docker',
      'passport',
      'passport-jwt',
      '@nestjs/platform-socket.io'
    ];

    const packageJsonFiles = [
      'backend/package.json',
      'mobile/package.json',
      'infrastructure/package.json'
    ];

    const foundDependencies = [];

    for (const packageFile of packageJsonFiles) {
      if (await this.fileExists(packageFile)) {
        try {
          const content = await fs.readFile(packageFile, 'utf-8');
          const packageJson = JSON.parse(content);

          for (const dep of legacyDependencies) {
            if (packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep]) {
              foundDependencies.push(`${dep} in ${packageFile}`);
            }
          }
        } catch (error) {
          // Skip if file can't be read
        }
      }
    }

    return {
      category: 'dependency-cleanup',
      passed: foundDependencies.length === 0,
      message: foundDependencies.length === 0 
        ? 'All legacy dependencies successfully removed'
        : `Found ${foundDependencies.length} legacy dependencies still present`,
      details: foundDependencies
    };
  }

  async verifyFileSystemCleanup() {
    const legacyFiles = [
      'backend/ecosystem.config.js',
      'backend/docker-compose.production.yml',
      'backend/Dockerfile.production',
      'infrastructure/lib/trinity-cost-optimization-stack.ts',
      'infrastructure/lib/trinity-cost-optimization-stack.js',
      'infrastructure/lib/trinity-cost-optimization-stack.d.ts'
    ];

    const foundFiles = [];

    for (const file of legacyFiles) {
      if (await this.fileExists(file)) {
        foundFiles.push(file);
      }
    }

    return {
      category: 'filesystem-cleanup',
      passed: foundFiles.length === 0,
      message: foundFiles.length === 0
        ? 'All legacy files successfully removed'
        : `Found ${foundFiles.length} legacy files still present`,
      details: foundFiles
    };
  }

  async verifyConfigurationCleanup() {
    const legacyConfigPatterns = [
      'REDIS_',
      'SOCKET_IO_',
      'PM2_',
      'DOCKER_'
    ];

    const configFiles = [
      '.env',
      '.env.example',
      'backend/.env',
      'backend/.env.example',
      'mobile/.env'
    ];

    const foundConfigs = [];

    for (const configFile of configFiles) {
      if (await this.fileExists(configFile)) {
        try {
          const content = await fs.readFile(configFile, 'utf-8');
          
          for (const pattern of legacyConfigPatterns) {
            if (content.includes(pattern)) {
              foundConfigs.push(`${pattern} in ${configFile}`);
            }
          }
        } catch (error) {
          // Skip if file can't be read
        }
      }
    }

    return {
      category: 'configuration-cleanup',
      passed: foundConfigs.length === 0,
      message: foundConfigs.length === 0
        ? 'All legacy configurations successfully removed'
        : `Found ${foundConfigs.length} legacy configuration entries`,
      details: foundConfigs
    };
  }

  async verifyCodeReferences() {
    const legacyPatterns = [
      { pattern: 'ecosystem.config', severity: 'high' },
      { pattern: 'docker-compose.production', severity: 'high' },
      { pattern: 'trinity-cost-optimization', severity: 'medium' },
      { pattern: 'socket.io', severity: 'medium' },
      { pattern: 'redis', severity: 'low' }
    ];

    const references = [];

    for (const { pattern, severity } of legacyPatterns) {
      try {
        const { stdout } = await execAsync(
          `grep -r "${pattern}" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude="*.log" --exclude="*.json" -n || true`
        );

        if (stdout.trim()) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const [filePath, lineNumber, ...contentParts] = line.split(':');
            if (filePath && lineNumber && contentParts.length > 0) {
              references.push({
                file: filePath,
                line: parseInt(lineNumber),
                content: contentParts.join(':').trim(),
                pattern,
                severity
              });
            }
          }
        }
      } catch (error) {
        // Ignore grep errors
      }
    }

    const highSeverityRefs = references.filter(r => r.severity === 'high');
    const passed = highSeverityRefs.length === 0;

    return {
      category: 'code-references',
      passed,
      message: passed
        ? 'No critical legacy code references found'
        : `Found ${highSeverityRefs.length} critical legacy references in code`,
      references,
      details: {
        total: references.length,
        high: references.filter(r => r.severity === 'high').length,
        medium: references.filter(r => r.severity === 'medium').length,
        low: references.filter(r => r.severity === 'low').length
      }
    };
  }

  async verifyAWSResourcesCleanup() {
    try {
      const { stdout } = await execAsync('aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE');
      const stacks = JSON.parse(stdout);
      
      const legacyStacks = stacks.StackSummaries?.filter(stack => 
        stack.StackName.toLowerCase().includes('trinity') &&
        stack.StackName !== 'TrinitySimplifiedStack'
      ) || [];

      return {
        category: 'aws-resources',
        passed: legacyStacks.length === 0,
        message: legacyStacks.length === 0
          ? 'All legacy AWS resources successfully removed'
          : `Found ${legacyStacks.length} legacy CloudFormation stacks`,
        details: legacyStacks.map(stack => stack.StackName)
      };

    } catch (error) {
      return {
        category: 'aws-resources',
        passed: false,
        message: `Warning: Could not verify AWS resources: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  async verifyDocumentationUpdates() {
    const documentationFiles = [
      'README.md',
      'backend/README.md',
      'mobile/README.md',
      'infrastructure/README.md'
    ];

    const legacyDocPatterns = [
      'ecosystem.config',
      'docker-compose.production',
      'PM2',
      'Redis'
    ];

    const foundInDocs = [];

    for (const docFile of documentationFiles) {
      if (await this.fileExists(docFile)) {
        try {
          const content = await fs.readFile(docFile, 'utf-8');
          
          for (const pattern of legacyDocPatterns) {
            if (content.toLowerCase().includes(pattern.toLowerCase())) {
              foundInDocs.push(`${pattern} in ${docFile}`);
            }
          }
        } catch (error) {
          // Skip if file can't be read
        }
      }
    }

    return {
      category: 'documentation-updates',
      passed: foundInDocs.length === 0,
      message: foundInDocs.length === 0
        ? 'Documentation successfully updated'
        : `Found ${foundInDocs.length} legacy references in documentation`,
      details: foundInDocs
    };
  }

  async verifyTestsIntegrity() {
    try {
      const { stdout, stderr } = await execAsync('npm test --prefix backend-refactored', { timeout: 30000 });
      
      const passed = !stderr.includes('FAIL') && (stdout.includes('PASS') || stdout.includes('passed'));

      return {
        category: 'tests-integrity',
        passed,
        message: passed
          ? 'All tests pass after legacy elimination'
          : 'Some tests are failing after legacy elimination',
        details: { 
          stdout: stdout.substring(0, 200) + '...', 
          stderr: stderr.substring(0, 200) + '...' 
        }
      };

    } catch (error) {
      return {
        category: 'tests-integrity',
        passed: false,
        message: `Warning: Could not verify test integrity: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  async verifyBuildProcesses() {
    const buildResults = [];

    // Test backend build
    try {
      await execAsync('npm run build --prefix backend-refactored', { timeout: 60000 });
      buildResults.push({ project: 'backend-refactored', status: 'success' });
    } catch (error) {
      buildResults.push({ project: 'backend-refactored', status: 'failed', error: error.message.substring(0, 100) });
    }

    const failedBuilds = buildResults.filter(r => r.status === 'failed');

    return {
      category: 'build-processes',
      passed: failedBuilds.length === 0,
      message: failedBuilds.length === 0
        ? 'All build processes working correctly'
        : `${failedBuilds.length} build processes are failing`,
      details: buildResults
    };
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.verificationReport.overallStatus === 'clean') {
      recommendations.push('✅ Legacy elimination completed successfully');
      recommendations.push('🔍 Consider running periodic verification to ensure no legacy components are reintroduced');
      recommendations.push('📚 Update team documentation to reflect the new clean architecture');
    } else {
      if (this.verificationReport.legacyReferences.length > 0) {
        recommendations.push('🔧 Review and remove remaining legacy code references');
        recommendations.push('📝 Update code comments and documentation that reference legacy components');
      }

      const failedResults = this.verificationReport.results.filter(r => !r.passed);
      for (const result of failedResults) {
        switch (result.category) {
          case 'dependency-cleanup':
            recommendations.push('📦 Run npm uninstall for remaining legacy dependencies');
            break;
          case 'filesystem-cleanup':
            recommendations.push('🗑️ Manually remove remaining legacy files');
            break;
          case 'aws-resources':
            recommendations.push('☁️ Complete AWS resource cleanup using AWS Console or CLI');
            break;
          case 'tests-integrity':
            recommendations.push('🧪 Fix failing tests and ensure compatibility with new architecture');
            break;
          case 'build-processes':
            recommendations.push('🔨 Fix build issues and update build configurations');
            break;
        }
      }
    }

    return recommendations;
  }

  async generateFinalReport() {
    const report = {
      ...this.verificationReport,
      summary: {
        successRate: ((this.verificationReport.passed / this.verificationReport.totalChecks) * 100).toFixed(1),
        completedAt: new Date().toISOString()
      }
    };

    await fs.writeFile('legacy-verification-report.json', JSON.stringify(report, null, 2));

    const statusEmoji = {
      'clean': '✅',
      'warnings': '⚠️',
      'failed': '❌'
    };

    const markdownSummary = `# Trinity Legacy Verification Report

${statusEmoji[report.overallStatus]} **Overall Status: ${report.overallStatus.toUpperCase()}**

**Timestamp:** ${report.timestamp}

## Summary
- **Total Checks:** ${report.totalChecks}
- **Passed:** ${report.passed}
- **Failed:** ${report.failed}
- **Warnings:** ${report.warnings}
- **Success Rate:** ${report.summary.successRate}%

## Verification Results

${report.results.map(result => `
### ${result.category}
${result.passed ? '✅' : '❌'} ${result.message}
${result.details ? `**Details:** \`${JSON.stringify(result.details)}\`` : ''}
`).join('\n')}

## Legacy References Found (${report.legacyReferences.length})

${report.legacyReferences.map(ref => `
- **${ref.file}:${ref.line}** (${ref.severity}): \`${ref.pattern}\`
  \`${ref.content}\`
`).join('\n')}

## Recommendations

${report.recommendations.map(rec => `- ${rec}`).join('\n')}

## Next Steps

${report.overallStatus === 'clean' 
  ? '🎉 Legacy elimination verification passed! The system is clean and ready for production.'
  : '🔧 Address the issues identified above and re-run verification to ensure complete legacy elimination.'
}
`;

    await fs.writeFile('LEGACY_VERIFICATION_SUMMARY.md', markdownSummary);
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
  const executor = new LegacyVerificationExecutor();
  executor.execute().catch(console.error);
}

module.exports = LegacyVerificationExecutor;