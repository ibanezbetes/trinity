#!/usr/bin/env npx ts-node

/**
 * Trinity Resource Naming Validation Script
 * 
 * Validates that all resources follow Trinity naming conventions
 * and provides recommendations for fixes
 */

import * as fs from 'fs';
import * as path from 'path';
import { CloudFormationClient, ListStacksCommand, DescribeStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';
import { 
  generateResourceNames, 
  validateResourceName, 
  getExpectedResourceNames,
  NAMING_RULES,
  NamingConfig 
} from '../config/resource-naming';

interface NamingValidationResult {
  category: string;
  resource: string;
  current: string;
  expected?: string;
  status: 'compliant' | 'non-compliant' | 'warning';
  issues: string[];
}

interface NamingReport {
  timestamp: string;
  environment: string;
  region: string;
  summary: {
    total: number;
    compliant: number;
    nonCompliant: number;
    warnings: number;
  };
  results: NamingValidationResult[];
  recommendations: string[];
}

class TrinityNamingValidator {
  private config: NamingConfig;
  private cfClient: CloudFormationClient;
  private dynamoClient: DynamoDBClient;
  private lambdaClient: LambdaClient;
  private results: NamingValidationResult[] = [];

  constructor(environment: string, region: string = 'eu-west-1') {
    this.config = {
      project: 'trinity',
      environment,
      region,
      version: 'v2'
    };
    
    this.cfClient = new CloudFormationClient({ region });
    this.dynamoClient = new DynamoDBClient({ region });
    this.lambdaClient = new LambdaClient({ region });
  }

  private addResult(
    category: string, 
    resource: string, 
    current: string, 
    expected: string | undefined, 
    status: 'compliant' | 'non-compliant' | 'warning', 
    issues: string[]
  ) {
    this.results.push({
      category,
      resource,
      current,
      expected,
      status,
      issues
    });

    const icon = status === 'compliant' ? '✅' : status === 'non-compliant' ? '❌' : '⚠️';
    console.log(`${icon} [${category}] ${resource}: ${current}`);
    if (issues.length > 0) {
      issues.forEach(issue => console.log(`   - ${issue}`));
    }
    if (expected && expected !== current) {
      console.log(`   Expected: ${expected}`);
    }
  }

  /**
   * Validate DynamoDB table names
   */
  async validateDynamoDBTables(): Promise<void> {
    console.log('🗄️ Validating DynamoDB table names...\n');

    try {
      const tablesResponse = await this.dynamoClient.send(new ListTablesCommand({}));
      const existingTables = tablesResponse.TableNames || [];
      const expectedNames = getExpectedResourceNames();

      // Check existing Trinity tables
      const trinityTables = existingTables.filter(table => table.startsWith('trinity-'));

      for (const tableName of trinityTables) {
        const validation = validateResourceName(tableName, 'dynamodb-table', this.config);
        
        // Find expected name
        const expectedTable = Object.entries(expectedNames.tables).find(([_, name]) => name === tableName);
        const expectedName = expectedTable ? expectedTable[1] : undefined;

        if (validation.valid) {
          this.addResult('DynamoDB', tableName, tableName, expectedName, 'compliant', []);
        } else {
          this.addResult('DynamoDB', tableName, tableName, expectedName, 'non-compliant', validation.issues);
        }
      }

      // Check for missing expected tables
      for (const [tableKey, expectedName] of Object.entries(expectedNames.tables)) {
        if (!trinityTables.includes(expectedName)) {
          this.addResult('DynamoDB', tableKey, 'NOT_FOUND', expectedName, 'warning', ['Expected table not found']);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to validate DynamoDB tables: ${error}`);
    }
  }

  /**
   * Validate Lambda function names
   */
  async validateLambdaFunctions(): Promise<void> {
    console.log('\n⚡ Validating Lambda function names...\n');

    try {
      const functionsResponse = await this.lambdaClient.send(new ListFunctionsCommand({}));
      const existingFunctions = functionsResponse.Functions?.map(f => f.FunctionName).filter(Boolean) || [];
      const expectedNames = getExpectedResourceNames();

      // Check existing Trinity functions
      const trinityFunctions = existingFunctions.filter((func): func is string => 
        func !== undefined && func.startsWith('trinity-')
      );

      for (const functionName of trinityFunctions) {
        const validation = validateResourceName(functionName, 'lambda-function', this.config);
        
        // Find expected name
        const expectedFunction = Object.entries(expectedNames.lambdas).find(([_, name]) => name === functionName);
        const expectedName = expectedFunction ? expectedFunction[1] : undefined;

        if (validation.valid) {
          this.addResult('Lambda', functionName, functionName, expectedName, 'compliant', []);
        } else {
          this.addResult('Lambda', functionName, functionName, expectedName, 'non-compliant', validation.issues);
        }
      }

      // Check for missing expected functions
      for (const [functionKey, expectedName] of Object.entries(expectedNames.lambdas)) {
        if (!trinityFunctions.includes(expectedName)) {
          this.addResult('Lambda', functionKey, 'NOT_FOUND', expectedName, 'warning', ['Expected function not found']);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to validate Lambda functions: ${error}`);
    }
  }

  /**
   * Validate CloudFormation stack names
   */
  async validateCloudFormationStacks(): Promise<void> {
    console.log('\n📦 Validating CloudFormation stack names...\n');

    try {
      const stacksResponse = await this.cfClient.send(new ListStacksCommand({
        StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE']
      }));
      
      const existingStacks = stacksResponse.StackSummaries?.map(s => s.StackName).filter(Boolean) || [];
      const expectedNames = getExpectedResourceNames();

      // Check existing Trinity stacks
      const trinityStacks = existingStacks.filter((stack): stack is string => 
        stack !== undefined && stack.includes('Trinity')
      );

      for (const stackName of trinityStacks) {
        const validation = validateResourceName(stackName, 'cloudformation-stack', this.config);
        
        // Find expected name
        const expectedStack = Object.entries(expectedNames.stacks).find(([_, name]) => name === stackName);
        const expectedName = expectedStack ? expectedStack[1] : undefined;

        if (validation.valid) {
          this.addResult('CloudFormation', stackName, stackName, expectedName, 'compliant', []);
        } else {
          this.addResult('CloudFormation', stackName, stackName, expectedName, 'non-compliant', validation.issues);
        }
      }

      // Check for missing expected stacks
      for (const [stackKey, expectedName] of Object.entries(expectedNames.stacks)) {
        if (!trinityStacks.includes(expectedName)) {
          this.addResult('CloudFormation', stackKey, 'NOT_FOUND', expectedName, 'warning', ['Expected stack not found']);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to validate CloudFormation stacks: ${error}`);
    }
  }

  /**
   * Validate CDK construct names in source code
   */
  validateCDKConstructNames(): void {
    console.log('\n🏗️ Validating CDK construct names in source code...\n');

    const libDir = path.join(__dirname, '..', 'lib');
    if (!fs.existsSync(libDir)) {
      console.log('⚠️ CDK lib directory not found');
      return;
    }

    const stackFiles = fs.readdirSync(libDir).filter(file => file.endsWith('.ts'));

    for (const file of stackFiles) {
      const filePath = path.join(libDir, file);
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for hardcoded resource names
      const hardcodedNames = content.match(/tableName:\s*['"`]([^'"`]+)['"`]/g);
      if (hardcodedNames) {
        for (const match of hardcodedNames) {
          const tableName = match.match(/['"`]([^'"`]+)['"`]/)?.[1];
          if (tableName && tableName.startsWith('trinity-')) {
            const validation = validateResourceName(tableName, 'dynamodb-table', this.config);
            
            if (validation.valid) {
              this.addResult('CDK Source', file, tableName, undefined, 'compliant', []);
            } else {
              this.addResult('CDK Source', file, tableName, undefined, 'non-compliant', validation.issues);
            }
          }
        }
      }
    }
  }

  /**
   * Generate naming recommendations
   */
  generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const nonCompliantResults = this.results.filter(r => r.status === 'non-compliant');
    const warningResults = this.results.filter(r => r.status === 'warning');

    if (nonCompliantResults.length > 0) {
      recommendations.push('🔧 Fix non-compliant resource names:');
      nonCompliantResults.forEach(result => {
        if (result.expected) {
          recommendations.push(`   - Rename ${result.current} to ${result.expected}`);
        } else {
          recommendations.push(`   - Fix naming issues in ${result.current}: ${result.issues.join(', ')}`);
        }
      });
    }

    if (warningResults.length > 0) {
      recommendations.push('⚠️ Address missing resources:');
      warningResults.forEach(result => {
        if (result.expected) {
          recommendations.push(`   - Create missing resource: ${result.expected}`);
        }
      });
    }

    if (nonCompliantResults.length === 0 && warningResults.length === 0) {
      recommendations.push('✅ All resource names are compliant with Trinity naming conventions');
    }

    recommendations.push('');
    recommendations.push('📋 Naming Convention Rules:');
    Object.entries(NAMING_RULES).forEach(([category, rules]) => {
      recommendations.push(`   ${category.toUpperCase()}:`);
      rules.forEach(rule => {
        recommendations.push(`     - ${rule}`);
      });
    });

    return recommendations;
  }

  /**
   * Generate naming validation report
   */
  generateReport(): NamingReport {
    const summary = {
      total: this.results.length,
      compliant: this.results.filter(r => r.status === 'compliant').length,
      nonCompliant: this.results.filter(r => r.status === 'non-compliant').length,
      warnings: this.results.filter(r => r.status === 'warning').length,
    };

    const report: NamingReport = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      region: this.config.region,
      summary,
      results: this.results,
      recommendations: this.generateRecommendations(),
    };

    // Save report
    const reportPath = path.join('naming-reports', `naming-validation-${Date.now()}.json`);
    
    if (!fs.existsSync('naming-reports')) {
      fs.mkdirSync('naming-reports', { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n📊 Naming Validation Summary:');
    console.log(`   ✅ Compliant: ${summary.compliant}`);
    console.log(`   ❌ Non-compliant: ${summary.nonCompliant}`);
    console.log(`   ⚠️ Warnings: ${summary.warnings}`);
    console.log(`   📝 Total: ${summary.total}`);
    console.log(`   📋 Report: ${reportPath}`);

    // Print recommendations
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach(rec => console.log(rec));

    return report;
  }

  /**
   * Execute naming validation
   */
  async executeValidation(): Promise<NamingReport> {
    console.log('🔍 Starting Trinity resource naming validation...\n');
    console.log(`📋 Environment: ${this.config.environment}`);
    console.log(`🌍 Region: ${this.config.region}\n`);

    // Validate different resource types
    await this.validateDynamoDBTables();
    await this.validateLambdaFunctions();
    await this.validateCloudFormationStacks();
    this.validateCDKConstructNames();

    return this.generateReport();
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
  const region = args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Trinity Resource Naming Validation

Usage:
  npx ts-node validate-naming.ts [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --help, -h          Show this help message

Examples:
  # Validate naming in development
  npx ts-node validate-naming.ts --env=dev
  
  # Validate naming in production
  npx ts-node validate-naming.ts --env=production --region=eu-west-1
`);
    process.exit(0);
  }
  
  const validator = new TrinityNamingValidator(environment, region);
  validator.executeValidation().then(report => {
    const hasIssues = report.summary.nonCompliant > 0;
    process.exit(hasIssues ? 1 : 0);
  }).catch(error => {
    console.error('❌ Naming validation failed:', error);
    process.exit(1);
  });
}

export { TrinityNamingValidator, NamingValidationResult, NamingReport };