/**
 * Legacy Verification Service
 * 
 * Verifies that legacy elimination was complete and no legacy
 * components or references remain in the system.
 * 
 * This service performs comprehensive validation to ensure
 * the Trinity refactoring achieved complete legacy cleanup.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface LegacyReference {
  file: string;
  line: number;
  content: string;
  pattern: string;
  severity: 'high' | 'medium' | 'low';
}

export interface VerificationResult {
  category: string;
  passed: boolean;
  message: string;
  details?: any;
  references?: LegacyReference[];
}

export interface LegacyVerificationReport {
  timestamp: Date;
  overallStatus: 'clean' | 'warnings' | 'failed';
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: VerificationResult[];
  legacyReferences: LegacyReference[];
  recommendations: string[];
}

@Injectable()
export class LegacyVerificationService {
  private readonly logger = new Logger(LegacyVerificationService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Perform comprehensive legacy verification
   */
  async performComprehensiveLegacyVerification(): Promise<LegacyVerificationReport> {
    this.logger.log('Starting comprehensive legacy verification');

    const report: LegacyVerificationReport = {
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

    try {
      // Verification categories
      const verificationChecks = [
        () => this.verifyDependencyCleanup(),
        () => this.verifyFileSystemCleanup(),
        () => this.verifyConfigurationCleanup(),
        () => this.verifyCodeReferences(),
        () => this.verifyAWSResourcesCleanup(),
        () => this.verifyDocumentationUpdates(),
        () => this.verifyTestsIntegrity(),
        () => this.verifyBuildProcesses()
      ];

      report.totalChecks = verificationChecks.length;

      // Execute all verification checks
      for (const check of verificationChecks) {
        try {
          const result = await check();
          report.results.push(result);

          if (result.passed) {
            report.passed++;
          } else {
            if (result.message.includes('warning')) {
              report.warnings++;
            } else {
              report.failed++;
            }
          }

          // Collect legacy references
          if (result.references) {
            report.legacyReferences.push(...result.references);
          }

        } catch (error) {
          report.results.push({
            category: 'verification-error',
            passed: false,
            message: `Verification check failed: ${error.message}`
          });
          report.failed++;
        }
      }

      // Determine overall status
      if (report.failed > 0) {
        report.overallStatus = 'failed';
      } else if (report.warnings > 0) {
        report.overallStatus = 'warnings';
      } else {
        report.overallStatus = 'clean';
      }

      // Generate recommendations
      report.recommendations = this.generateRecommendations(report);

      this.logger.log(`Legacy verification completed: ${report.overallStatus} (${report.passed}/${report.totalChecks} passed)`);

    } catch (error) {
      this.logger.error(`Legacy verification failed: ${error.message}`);
      report.overallStatus = 'failed';
      report.results.push({
        category: 'critical-error',
        passed: false,
        message: `Critical verification error: ${error.message}`
      });
    }

    return report;
  }

  /**
   * Verify dependency cleanup
   */
  private async verifyDependencyCleanup(): Promise<VerificationResult> {
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

    const foundDependencies: string[] = [];

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

  /**
   * Verify file system cleanup
   */
  private async verifyFileSystemCleanup(): Promise<VerificationResult> {
    const legacyFiles = [
      'backend/ecosystem.config.js',
      'backend/docker-compose.production.yml',
      'backend/Dockerfile.production',
      'infrastructure/lib/trinity-cost-optimization-stack.ts',
      'infrastructure/lib/trinity-cost-optimization-stack.js',
      'infrastructure/lib/trinity-cost-optimization-stack.d.ts'
    ];

    const foundFiles: string[] = [];

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

  /**
   * Verify configuration cleanup
   */
  private async verifyConfigurationCleanup(): Promise<VerificationResult> {
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

    const foundConfigs: string[] = [];

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

  /**
   * Verify code references
   */
  private async verifyCodeReferences(): Promise<VerificationResult> {
    const legacyPatterns = [
      { pattern: 'ecosystem.config', severity: 'high' as const },
      { pattern: 'docker-compose.production', severity: 'high' as const },
      { pattern: 'trinity-cost-optimization', severity: 'medium' as const },
      { pattern: 'socket.io', severity: 'medium' as const },
      { pattern: 'redis', severity: 'low' as const }
    ];

    const references: LegacyReference[] = [];

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

  /**
   * Verify AWS resources cleanup
   */
  private async verifyAWSResourcesCleanup(): Promise<VerificationResult> {
    try {
      // Check CloudFormation stacks
      const { stdout } = await execAsync('aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE');
      const stacks = JSON.parse(stdout);
      
      const legacyStacks = stacks.StackSummaries?.filter((stack: any) => 
        stack.StackName.toLowerCase().includes('trinity') &&
        stack.StackName !== 'TrinitySimplifiedStack' // Keep the new simplified stack
      ) || [];

      return {
        category: 'aws-resources',
        passed: legacyStacks.length === 0,
        message: legacyStacks.length === 0
          ? 'All legacy AWS resources successfully removed'
          : `Found ${legacyStacks.length} legacy CloudFormation stacks`,
        details: legacyStacks.map((stack: any) => stack.StackName)
      };

    } catch (error) {
      return {
        category: 'aws-resources',
        passed: false,
        message: `Could not verify AWS resources: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Verify documentation updates
   */
  private async verifyDocumentationUpdates(): Promise<VerificationResult> {
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

    const foundInDocs: string[] = [];

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

  /**
   * Verify tests integrity
   */
  private async verifyTestsIntegrity(): Promise<VerificationResult> {
    try {
      // Check if tests still pass after legacy elimination
      const { stdout, stderr } = await execAsync('npm test --prefix backend-refactored', { timeout: 30000 });
      
      const passed = !stderr.includes('FAIL') && (stdout.includes('PASS') || stdout.includes('passed'));

      return {
        category: 'tests-integrity',
        passed,
        message: passed
          ? 'All tests pass after legacy elimination'
          : 'Some tests are failing after legacy elimination',
        details: { stdout: stdout.substring(0, 500), stderr: stderr.substring(0, 500) }
      };

    } catch (error) {
      return {
        category: 'tests-integrity',
        passed: false,
        message: `Could not verify test integrity: ${error.message}`,
        details: { error: error.message }
      };
    }
  }

  /**
   * Verify build processes
   */
  private async verifyBuildProcesses(): Promise<VerificationResult> {
    const buildResults: any[] = [];

    // Test backend build
    try {
      await execAsync('npm run build --prefix backend-refactored', { timeout: 60000 });
      buildResults.push({ project: 'backend-refactored', status: 'success' });
    } catch (error) {
      buildResults.push({ project: 'backend-refactored', status: 'failed', error: error.message });
    }

    // Test mobile build (if applicable)
    if (await this.fileExists('mobile/package.json')) {
      try {
        await execAsync('npm run build --prefix mobile', { timeout: 60000 });
        buildResults.push({ project: 'mobile', status: 'success' });
      } catch (error) {
        buildResults.push({ project: 'mobile', status: 'failed', error: error.message });
      }
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

  /**
   * Generate recommendations based on verification results
   */
  private generateRecommendations(report: LegacyVerificationReport): string[] {
    const recommendations: string[] = [];

    if (report.overallStatus === 'clean') {
      recommendations.push('✅ Legacy elimination completed successfully');
      recommendations.push('🔍 Consider running periodic verification to ensure no legacy components are reintroduced');
      recommendations.push('📚 Update team documentation to reflect the new clean architecture');
    } else {
      if (report.legacyReferences.length > 0) {
        recommendations.push('🔧 Review and remove remaining legacy code references');
        recommendations.push('📝 Update code comments and documentation that reference legacy components');
      }

      const failedResults = report.results.filter(r => !r.passed);
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

  /**
   * Utility methods
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate verification summary report
   */
  async generateVerificationSummary(report: LegacyVerificationReport): Promise<string> {
    const statusEmoji = {
      'clean': '✅',
      'warnings': '⚠️',
      'failed': '❌'
    };

    const summary = `
# Legacy Verification Report

${statusEmoji[report.overallStatus]} **Overall Status: ${report.overallStatus.toUpperCase()}**

**Timestamp:** ${report.timestamp.toISOString()}

## Summary
- **Total Checks:** ${report.totalChecks}
- **Passed:** ${report.passed}
- **Failed:** ${report.failed}
- **Warnings:** ${report.warnings}
- **Success Rate:** ${((report.passed / report.totalChecks) * 100).toFixed(1)}%

## Verification Results

${report.results.map(result => `
### ${result.category}
${result.passed ? '✅' : '❌'} ${result.message}
${result.details ? `**Details:** ${JSON.stringify(result.details, null, 2)}` : ''}
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

    return summary;
  }
}