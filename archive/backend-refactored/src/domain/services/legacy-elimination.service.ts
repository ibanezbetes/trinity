/**
 * Legacy Elimination Service
 * 
 * Handles the complete elimination of legacy components, dependencies,
 * and infrastructure resources identified during the Trinity refactoring.
 * 
 * This service implements systematic cleanup procedures to ensure
 * no legacy remnants remain in the system.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface LegacyComponent {
  path: string;
  type: 'dependency' | 'file' | 'directory' | 'aws-resource' | 'configuration';
  reason: string;
  safeToRemove: boolean;
  category: 'backend' | 'mobile' | 'infrastructure' | 'global';
}

export interface EliminationResult {
  component: LegacyComponent;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  timestamp: Date;
}

export interface EliminationReport {
  timestamp: Date;
  totalComponents: number;
  eliminated: number;
  failed: number;
  skipped: number;
  results: EliminationResult[];
  errors: string[];
  warnings: string[];
}

@Injectable()
export class LegacyEliminationService {
  private readonly logger = new Logger(LegacyEliminationService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Execute complete legacy elimination based on analysis report
   */
  async executeCompleteLegacyElimination(
    analysisReportPath: string,
    dryRun: boolean = false
  ): Promise<EliminationReport> {
    this.logger.log('Starting complete legacy elimination process');

    const report: EliminationReport = {
      timestamp: new Date(),
      totalComponents: 0,
      eliminated: 0,
      failed: 0,
      skipped: 0,
      results: [],
      errors: [],
      warnings: []
    };

    try {
      // Load analysis report
      const analysisData = await this.loadAnalysisReport(analysisReportPath);
      const legacyComponents = await this.extractLegacyComponents(analysisData);

      report.totalComponents = legacyComponents.length;
      this.logger.log(`Found ${legacyComponents.length} legacy components to eliminate`);

      // Phase 1: Remove obsolete dependencies
      const dependencyComponents = legacyComponents.filter(c => c.type === 'dependency');
      await this.eliminateDependencies(dependencyComponents, report, dryRun);

      // Phase 2: Remove obsolete files and directories
      const fileComponents = legacyComponents.filter(c => c.type === 'file' || c.type === 'directory');
      await this.eliminateFiles(fileComponents, report, dryRun);

      // Phase 3: Remove AWS resources
      const awsComponents = legacyComponents.filter(c => c.type === 'aws-resource');
      await this.eliminateAWSResources(awsComponents, report, dryRun);

      // Phase 4: Clean configuration files
      const configComponents = legacyComponents.filter(c => c.type === 'configuration');
      await this.eliminateConfigurations(configComponents, report, dryRun);

      // Phase 5: Verify elimination completeness
      await this.verifyEliminationCompleteness(report);

      this.logger.log(`Legacy elimination completed: ${report.eliminated}/${report.totalComponents} eliminated`);

    } catch (error) {
      this.logger.error(`Legacy elimination failed: ${error.message}`);
      report.errors.push(`Critical error: ${error.message}`);
    }

    return report;
  }

  /**
   * Load and parse analysis report
   */
  private async loadAnalysisReport(reportPath: string): Promise<any> {
    try {
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      return JSON.parse(reportContent);
    } catch (error) {
      throw new Error(`Failed to load analysis report: ${error.message}`);
    }
  }

  /**
   * Extract legacy components from analysis data
   */
  private async extractLegacyComponents(analysisData: any): Promise<LegacyComponent[]> {
    const components: LegacyComponent[] = [];

    // Extract from each project in the analysis
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

    // Add known legacy components not detected by analysis
    components.push(...this.getKnownLegacyComponents());

    return components;
  }

  /**
   * Get known legacy components that should be removed
   */
  private getKnownLegacyComponents(): LegacyComponent[] {
    return [
      // Legacy backend dependencies
      {
        path: 'aws-sdk',
        type: 'dependency',
        reason: 'Replaced by @aws-sdk/client-* packages',
        safeToRemove: true,
        category: 'backend'
      },
      {
        path: 'socket.io',
        type: 'dependency',
        reason: 'Replaced by AppSync real-time subscriptions',
        safeToRemove: true,
        category: 'backend'
      },
      {
        path: 'redis',
        type: 'dependency',
        reason: 'No longer needed with simplified architecture',
        safeToRemove: true,
        category: 'backend'
      },
      
      // Legacy infrastructure files
      {
        path: 'infrastructure/lib/trinity-stack.ts',
        type: 'file',
        reason: 'Replaced by simplified infrastructure stack',
        safeToRemove: true,
        category: 'infrastructure'
      },
      {
        path: 'infrastructure/lib/trinity-cost-optimization-stack.ts',
        type: 'file',
        reason: 'Functionality integrated into main stack',
        safeToRemove: true,
        category: 'infrastructure'
      },

      // Legacy configuration files
      {
        path: 'backend/ecosystem.config.js',
        type: 'file',
        reason: 'PM2 configuration no longer needed',
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

      // Legacy mobile dependencies
      {
        path: '@react-native-async-storage/async-storage',
        type: 'dependency',
        reason: 'Replaced by secure storage solution',
        safeToRemove: true,
        category: 'mobile'
      }
    ];
  }

  /**
   * Categorize component based on project and path
   */
  private categorizeComponent(projectName: string, componentPath: string): 'backend' | 'mobile' | 'infrastructure' | 'global' {
    if (projectName.includes('backend') || componentPath.includes('backend')) return 'backend';
    if (projectName.includes('mobile') || componentPath.includes('mobile')) return 'mobile';
    if (projectName.includes('infrastructure') || componentPath.includes('infrastructure')) return 'infrastructure';
    return 'global';
  }

  /**
   * Eliminate obsolete dependencies
   */
  private async eliminateDependencies(
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    this.logger.log(`Eliminating ${components.length} obsolete dependencies`);

    const packageJsonFiles = [
      'backend/package.json',
      'backend-refactored/package.json',
      'mobile/package.json',
      'infrastructure/package.json'
    ];

    for (const packageJsonPath of packageJsonFiles) {
      try {
        if (await this.fileExists(packageJsonPath)) {
          await this.cleanPackageJson(packageJsonPath, components, report, dryRun);
        }
      } catch (error) {
        report.errors.push(`Failed to clean ${packageJsonPath}: ${error.message}`);
      }
    }
  }

  /**
   * Clean package.json file from obsolete dependencies
   */
  private async cleanPackageJson(
    packageJsonPath: string,
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    try {
      const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageContent);
      let modified = false;

      // Remove obsolete dependencies
      for (const component of components) {
        if (component.type === 'dependency' && component.safeToRemove) {
          const depName = component.path;
          
          if (packageJson.dependencies?.[depName]) {
            if (!dryRun) {
              delete packageJson.dependencies[depName];
            }
            modified = true;
            report.results.push({
              component,
              status: 'success',
              message: `Removed dependency ${depName} from ${packageJsonPath}`,
              timestamp: new Date()
            });
            report.eliminated++;
          }

          if (packageJson.devDependencies?.[depName]) {
            if (!dryRun) {
              delete packageJson.devDependencies[depName];
            }
            modified = true;
            report.results.push({
              component,
              status: 'success',
              message: `Removed dev dependency ${depName} from ${packageJsonPath}`,
              timestamp: new Date()
            });
            report.eliminated++;
          }
        }
      }

      // Write updated package.json
      if (modified && !dryRun) {
        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        this.logger.log(`Updated ${packageJsonPath} - removed obsolete dependencies`);
      }

    } catch (error) {
      report.errors.push(`Failed to process ${packageJsonPath}: ${error.message}`);
    }
  }

  /**
   * Eliminate obsolete files and directories
   */
  private async eliminateFiles(
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    this.logger.log(`Eliminating ${components.length} obsolete files and directories`);

    for (const component of components) {
      if (!component.safeToRemove) {
        report.results.push({
          component,
          status: 'skipped',
          message: 'Component marked as unsafe to remove',
          timestamp: new Date()
        });
        report.skipped++;
        continue;
      }

      try {
        const fullPath = path.resolve(component.path);
        
        if (await this.fileExists(fullPath)) {
          if (!dryRun) {
            const stats = await fs.stat(fullPath);
            if (stats.isDirectory()) {
              await fs.rmdir(fullPath, { recursive: true });
            } else {
              await fs.unlink(fullPath);
            }
          }

          report.results.push({
            component,
            status: 'success',
            message: `Eliminated ${component.type}: ${component.path}`,
            timestamp: new Date()
          });
          report.eliminated++;
          this.logger.log(`Eliminated: ${component.path}`);
        } else {
          report.results.push({
            component,
            status: 'skipped',
            message: 'File/directory does not exist',
            timestamp: new Date()
          });
          report.skipped++;
        }

      } catch (error) {
        report.results.push({
          component,
          status: 'failed',
          message: `Failed to eliminate: ${error.message}`,
          timestamp: new Date()
        });
        report.failed++;
        this.logger.error(`Failed to eliminate ${component.path}: ${error.message}`);
      }
    }
  }

  /**
   * Eliminate AWS resources
   */
  private async eliminateAWSResources(
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    this.logger.log(`Eliminating ${components.length} obsolete AWS resources`);

    // Group AWS resources by type for efficient elimination
    const resourcesByType = this.groupAWSResourcesByType(components);

    // Eliminate CloudFormation stacks first
    if (resourcesByType.cloudformation) {
      await this.eliminateCloudFormationStacks(resourcesByType.cloudformation, report, dryRun);
    }

    // Eliminate individual resources
    for (const [resourceType, resources] of Object.entries(resourcesByType)) {
      if (resourceType !== 'cloudformation') {
        await this.eliminateAWSResourceType(resourceType, resources, report, dryRun);
      }
    }
  }

  /**
   * Group AWS resources by type
   */
  private groupAWSResourcesByType(components: LegacyComponent[]): Record<string, LegacyComponent[]> {
    const groups: Record<string, LegacyComponent[]> = {};

    for (const component of components) {
      const resourceType = this.extractAWSResourceType(component.path);
      if (!groups[resourceType]) {
        groups[resourceType] = [];
      }
      groups[resourceType].push(component);
    }

    return groups;
  }

  /**
   * Extract AWS resource type from path
   */
  private extractAWSResourceType(path: string): string {
    if (path.includes('cloudformation') || path.includes('stack')) return 'cloudformation';
    if (path.includes('lambda')) return 'lambda';
    if (path.includes('dynamodb')) return 'dynamodb';
    if (path.includes('appsync')) return 'appsync';
    if (path.includes('cognito')) return 'cognito';
    if (path.includes('s3')) return 's3';
    return 'unknown';
  }

  /**
   * Eliminate CloudFormation stacks
   */
  private async eliminateCloudFormationStacks(
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    for (const component of components) {
      try {
        const stackName = this.extractStackName(component.path);
        
        if (!dryRun) {
          // Check if stack exists
          const { stdout } = await execAsync(`aws cloudformation describe-stacks --stack-name ${stackName}`);
          
          if (stdout) {
            // Delete stack
            await execAsync(`aws cloudformation delete-stack --stack-name ${stackName}`);
            
            // Wait for deletion to complete
            await execAsync(`aws cloudformation wait stack-delete-complete --stack-name ${stackName}`);
          }
        }

        report.results.push({
          component,
          status: 'success',
          message: `Eliminated CloudFormation stack: ${stackName}`,
          timestamp: new Date()
        });
        report.eliminated++;

      } catch (error) {
        report.results.push({
          component,
          status: 'failed',
          message: `Failed to eliminate stack: ${error.message}`,
          timestamp: new Date()
        });
        report.failed++;
      }
    }
  }

  /**
   * Eliminate specific AWS resource type
   */
  private async eliminateAWSResourceType(
    resourceType: string,
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    this.logger.log(`Eliminating ${components.length} ${resourceType} resources`);

    for (const component of components) {
      try {
        if (!dryRun) {
          await this.eliminateSpecificAWSResource(resourceType, component.path);
        }

        report.results.push({
          component,
          status: 'success',
          message: `Eliminated ${resourceType} resource: ${component.path}`,
          timestamp: new Date()
        });
        report.eliminated++;

      } catch (error) {
        report.results.push({
          component,
          status: 'failed',
          message: `Failed to eliminate ${resourceType}: ${error.message}`,
          timestamp: new Date()
        });
        report.failed++;
      }
    }
  }

  /**
   * Eliminate specific AWS resource
   */
  private async eliminateSpecificAWSResource(resourceType: string, resourcePath: string): Promise<void> {
    switch (resourceType) {
      case 'lambda':
        await execAsync(`aws lambda delete-function --function-name ${resourcePath}`);
        break;
      case 'dynamodb':
        await execAsync(`aws dynamodb delete-table --table-name ${resourcePath}`);
        break;
      case 'appsync':
        await execAsync(`aws appsync delete-graphql-api --api-id ${resourcePath}`);
        break;
      case 'cognito':
        await execAsync(`aws cognito-idp delete-user-pool --user-pool-id ${resourcePath}`);
        break;
      case 's3':
        // Empty bucket first, then delete
        await execAsync(`aws s3 rm s3://${resourcePath} --recursive`);
        await execAsync(`aws s3 rb s3://${resourcePath}`);
        break;
      default:
        this.logger.warn(`Unknown AWS resource type: ${resourceType}`);
    }
  }

  /**
   * Eliminate configuration entries
   */
  private async eliminateConfigurations(
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    this.logger.log(`Eliminating ${components.length} obsolete configurations`);

    const configFiles = [
      '.env',
      '.env.example',
      'backend/.env',
      'backend/.env.example',
      'mobile/.env',
      'infrastructure/.env.production.example'
    ];

    for (const configFile of configFiles) {
      if (await this.fileExists(configFile)) {
        await this.cleanConfigFile(configFile, components, report, dryRun);
      }
    }
  }

  /**
   * Clean configuration file
   */
  private async cleanConfigFile(
    configPath: string,
    components: LegacyComponent[],
    report: EliminationReport,
    dryRun: boolean
  ): Promise<void> {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      let lines = configContent.split('\n');
      let modified = false;

      for (const component of components) {
        if (component.type === 'configuration' && component.safeToRemove) {
          const configKey = component.path;
          
          lines = lines.filter(line => {
            if (line.startsWith(`${configKey}=`) || line.includes(`${configKey}`)) {
              modified = true;
              report.results.push({
                component,
                status: 'success',
                message: `Removed config ${configKey} from ${configPath}`,
                timestamp: new Date()
              });
              report.eliminated++;
              return false;
            }
            return true;
          });
        }
      }

      if (modified && !dryRun) {
        await fs.writeFile(configPath, lines.join('\n'));
        this.logger.log(`Updated ${configPath} - removed obsolete configurations`);
      }

    } catch (error) {
      report.errors.push(`Failed to clean config file ${configPath}: ${error.message}`);
    }
  }

  /**
   * Verify elimination completeness
   */
  private async verifyEliminationCompleteness(report: EliminationReport): Promise<void> {
    this.logger.log('Verifying elimination completeness');

    // Check for remaining legacy references
    const legacyPatterns = [
      'aws-sdk',
      'socket.io',
      'redis',
      'ecosystem.config',
      'docker-compose.production'
    ];

    for (const pattern of legacyPatterns) {
      try {
        const { stdout } = await execAsync(`grep -r "${pattern}" . --exclude-dir=node_modules --exclude-dir=.git || true`);
        
        if (stdout.trim()) {
          report.warnings.push(`Legacy references still found for pattern: ${pattern}`);
          this.logger.warn(`Legacy references found: ${pattern}`);
        }
      } catch (error) {
        // Ignore grep errors
      }
    }

    // Verify AWS resources are cleaned
    await this.verifyAWSResourcesCleanup(report);
  }

  /**
   * Verify AWS resources cleanup
   */
  private async verifyAWSResourcesCleanup(report: EliminationReport): Promise<void> {
    try {
      // Check for remaining CloudFormation stacks
      const { stdout } = await execAsync('aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE');
      const stacks = JSON.parse(stdout);
      
      const trinityStacks = stacks.StackSummaries?.filter((stack: any) => 
        stack.StackName.toLowerCase().includes('trinity')
      );

      if (trinityStacks && trinityStacks.length > 0) {
        report.warnings.push(`${trinityStacks.length} Trinity CloudFormation stacks still exist`);
      }

    } catch (error) {
      report.warnings.push(`Could not verify AWS resources cleanup: ${error.message}`);
    }
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

  private extractStackName(path: string): string {
    // Extract stack name from path or use default
    if (path.includes('trinity-stack')) return 'TrinityStack';
    if (path.includes('trinity-cost-optimization')) return 'TrinityCostOptimizationStack';
    return path.split('/').pop() || 'UnknownStack';
  }

  /**
   * Generate elimination summary report
   */
  async generateEliminationSummary(report: EliminationReport): Promise<string> {
    const summary = `
# Legacy Elimination Report

**Timestamp:** ${report.timestamp.toISOString()}

## Summary
- **Total Components:** ${report.totalComponents}
- **Successfully Eliminated:** ${report.eliminated}
- **Failed:** ${report.failed}
- **Skipped:** ${report.skipped}
- **Success Rate:** ${((report.eliminated / report.totalComponents) * 100).toFixed(1)}%

## Elimination Results by Category

### Dependencies Eliminated
${report.results.filter(r => r.component.type === 'dependency' && r.status === 'success').length} obsolete dependencies removed

### Files Eliminated
${report.results.filter(r => r.component.type === 'file' && r.status === 'success').length} obsolete files removed

### AWS Resources Eliminated
${report.results.filter(r => r.component.type === 'aws-resource' && r.status === 'success').length} AWS resources removed

### Configurations Cleaned
${report.results.filter(r => r.component.type === 'configuration' && r.status === 'success').length} configuration entries removed

## Errors (${report.errors.length})
${report.errors.map(error => `- ${error}`).join('\n')}

## Warnings (${report.warnings.length})
${report.warnings.map(warning => `- ${warning}`).join('\n')}

## Next Steps
${report.eliminated === report.totalComponents 
  ? '✅ All legacy components successfully eliminated. System is clean.'
  : '⚠️ Some components could not be eliminated. Review failed items and retry if necessary.'
}
`;

    return summary;
  }
}