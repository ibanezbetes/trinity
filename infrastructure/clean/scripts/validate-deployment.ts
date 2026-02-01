#!/usr/bin/env npx ts-node

/**
 * Trinity Deployment Validation Script
 * 
 * Comprehensive validation for Trinity deployments including:
 * - Pre-deployment environment checks
 * - Post-deployment resource validation
 * - Configuration consistency checks
 * - Security compliance validation
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CloudFormationClient, DescribeStacksCommand, ListStackResourcesCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient, ListTablesCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { AppSyncClient, ListGraphqlApisCommand, GetGraphqlApiCommand } from '@aws-sdk/client-appsync';
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { getDeploymentConfig, validateDeploymentConfig, DeploymentEnvironmentConfig } from '../config/deployment-configs';

interface ValidationResult {
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: any;
}

interface ValidationReport {
  timestamp: string;
  environment: string;
  region: string;
  overallStatus: 'pass' | 'fail' | 'warn';
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  results: ValidationResult[];
}

class TrinityDeploymentValidator {
  private config: DeploymentEnvironmentConfig;
  private cfClient: CloudFormationClient;
  private dynamoClient: DynamoDBClient;
  private appSyncClient: AppSyncClient;
  private lambdaClient: LambdaClient;
  private results: ValidationResult[] = [];

  constructor(environment: string, region: string = 'eu-west-1') {
    this.config = getDeploymentConfig(environment);
    this.config.region = region;
    
    this.cfClient = new CloudFormationClient({ region });
    this.dynamoClient = new DynamoDBClient({ region });
    this.appSyncClient = new AppSyncClient({ region });
    this.lambdaClient = new LambdaClient({ region });
  }

  private addResult(category: string, test: string, status: 'pass' | 'fail' | 'warn', message: string, details?: any) {
    this.results.push({ category, test, status, message, details });
    
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} [${category}] ${test}: ${message}`);
  }

  /**
   * Validate pre-deployment environment
   */
  async validateEnvironment(): Promise<void> {
    console.log('🔍 Validating deployment environment...\n');

    // Check AWS credentials
    try {
      await this.cfClient.send(new DescribeStacksCommand({}));
      this.addResult('Environment', 'AWS Credentials', 'pass', 'AWS credentials are valid');
    } catch (error) {
      this.addResult('Environment', 'AWS Credentials', 'fail', `AWS credentials invalid: ${error}`);
    }

    // Check CDK CLI
    try {
      const cdkVersion = execSync('cdk --version', { encoding: 'utf8' }).trim();
      this.addResult('Environment', 'CDK CLI', 'pass', `CDK CLI available: ${cdkVersion}`);
    } catch (error) {
      this.addResult('Environment', 'CDK CLI', 'fail', 'CDK CLI not available');
    }

    // Check Node.js version
    const nodeVersion = process.version;
    if (nodeVersion.startsWith('v18.')) {
      this.addResult('Environment', 'Node.js Version', 'pass', `Node.js version: ${nodeVersion}`);
    } else {
      this.addResult('Environment', 'Node.js Version', 'warn', `Node.js version ${nodeVersion} - recommended: v18.x`);
    }

    // Check CDK app configuration
    try {
      const cdkJson = JSON.parse(fs.readFileSync('cdk.json', 'utf8'));
      if (cdkJson.app) {
        this.addResult('Environment', 'CDK Configuration', 'pass', 'CDK app configuration valid');
      } else {
        this.addResult('Environment', 'CDK Configuration', 'fail', 'CDK app configuration missing');
      }
    } catch (error) {
      this.addResult('Environment', 'CDK Configuration', 'fail', `CDK configuration error: ${error}`);
    }

    // Check TypeScript compilation
    try {
      execSync('npm run build', { stdio: 'pipe' });
      this.addResult('Environment', 'TypeScript Build', 'pass', 'TypeScript compilation successful');
    } catch (error) {
      this.addResult('Environment', 'TypeScript Build', 'fail', 'TypeScript compilation failed');
    }

    // Validate deployment configuration
    const configIssues = validateDeploymentConfig(this.config);
    if (configIssues.length === 0) {
      this.addResult('Environment', 'Deployment Config', 'pass', 'Deployment configuration valid');
    } else {
      this.addResult('Environment', 'Deployment Config', 'fail', `Configuration issues: ${configIssues.join(', ')}`);
    }
  }

  /**
   * Validate DynamoDB tables
   */
  async validateDynamoDBTables(): Promise<void> {
    console.log('\n🗄️ Validating DynamoDB tables...\n');

    try {
      const tablesResponse = await this.dynamoClient.send(new ListTablesCommand({}));
      const existingTables = tablesResponse.TableNames || [];

      const expectedTables = [
        'trinity-users-dev',
        'trinity-rooms-dev-v2',
        'trinity-room-members-dev',
        'trinity-votes-dev',
        'trinity-movies-cache-dev',
        'trinity-room-matches-dev',
        'trinity-room-invites-dev-v2',
        'trinity-connections-dev',
        'trinity-room-movie-cache-dev',
        'trinity-room-cache-metadata-dev',
        'trinity-matchmaking-dev',
        'trinity-filter-cache'
      ];

      for (const expectedTable of expectedTables) {
        if (existingTables.includes(expectedTable)) {
          try {
            const tableDesc = await this.dynamoClient.send(
              new DescribeTableCommand({ TableName: expectedTable })
            );

            if (tableDesc.Table?.TableStatus === 'ACTIVE') {
              this.addResult('DynamoDB', expectedTable, 'pass', 'Table active and accessible');
            } else {
              this.addResult('DynamoDB', expectedTable, 'warn', `Table status: ${tableDesc.Table?.TableStatus}`);
            }

            // Check encryption if required
            if (this.config.security.enableEncryption) {
              if (tableDesc.Table?.SSEDescription?.Status === 'ENABLED') {
                this.addResult('DynamoDB', `${expectedTable} Encryption`, 'pass', 'Encryption enabled');
              } else {
                this.addResult('DynamoDB', `${expectedTable} Encryption`, 'fail', 'Encryption not enabled');
              }
            }

            // Check point-in-time recovery if required
            if (this.config.security.enablePointInTimeRecovery) {
              // Note: Would need additional API call to check PITR status
              this.addResult('DynamoDB', `${expectedTable} PITR`, 'warn', 'PITR status not checked (requires additional permissions)');
            }

          } catch (error) {
            this.addResult('DynamoDB', expectedTable, 'fail', `Failed to describe table: ${error}`);
          }
        } else {
          this.addResult('DynamoDB', expectedTable, 'fail', 'Table not found');
        }
      }

      // Check for unexpected tables
      const unexpectedTables = existingTables.filter(table => 
        table.startsWith('trinity-') && !expectedTables.includes(table)
      );

      if (unexpectedTables.length > 0) {
        this.addResult('DynamoDB', 'Unexpected Tables', 'warn', `Found unexpected tables: ${unexpectedTables.join(', ')}`);
      }

    } catch (error) {
      this.addResult('DynamoDB', 'Table Validation', 'fail', `DynamoDB validation failed: ${error}`);
    }
  }

  /**
   * Validate Lambda functions
   */
  async validateLambdaFunctions(): Promise<void> {
    console.log('\n⚡ Validating Lambda functions...\n');

    const expectedFunctions = [
      'trinity-auth-dev',
      'trinity-cache-dev',
      'trinity-vote-dev',
      'trinity-room-dev',
      'trinity-movie-dev',
      'trinity-realtime-dev',
      'trinity-matchmaker-dev'
    ];

    try {
      const functionsResponse = await this.lambdaClient.send(new ListFunctionsCommand({}));
      const existingFunctions = functionsResponse.Functions?.map(f => f.FunctionName) || [];

      for (const expectedFunction of expectedFunctions) {
        if (existingFunctions.includes(expectedFunction)) {
          try {
            const functionDesc = await this.lambdaClient.send(
              new GetFunctionCommand({ FunctionName: expectedFunction })
            );

            if (functionDesc.Configuration?.State === 'Active') {
              this.addResult('Lambda', expectedFunction, 'pass', 'Function active and ready');
            } else {
              this.addResult('Lambda', expectedFunction, 'warn', `Function state: ${functionDesc.Configuration?.State}`);
            }

            // Check runtime
            const runtime = functionDesc.Configuration?.Runtime;
            if (runtime?.startsWith('nodejs18')) {
              this.addResult('Lambda', `${expectedFunction} Runtime`, 'pass', `Runtime: ${runtime}`);
            } else {
              this.addResult('Lambda', `${expectedFunction} Runtime`, 'warn', `Runtime: ${runtime} - recommended: nodejs18.x`);
            }

          } catch (error) {
            this.addResult('Lambda', expectedFunction, 'fail', `Failed to describe function: ${error}`);
          }
        } else {
          this.addResult('Lambda', expectedFunction, 'fail', 'Function not found');
        }
      }

    } catch (error) {
      this.addResult('Lambda', 'Function Validation', 'fail', `Lambda validation failed: ${error}`);
    }
  }

  /**
   * Validate AppSync APIs
   */
  async validateAppSyncAPIs(): Promise<void> {
    console.log('\n🔗 Validating AppSync APIs...\n');

    try {
      const apisResponse = await this.appSyncClient.send(new ListGraphqlApisCommand({}));
      const existingAPIs = apisResponse.graphqlApis || [];

      const expectedAPIs = ['trinity-api-dev', 'trinity-realtime-api'];
      
      for (const expectedAPI of expectedAPIs) {
        const foundAPI = existingAPIs.find(api => api.name?.includes(expectedAPI));
        
        if (foundAPI) {
          try {
            const apiDesc = await this.appSyncClient.send(
              new GetGraphqlApiCommand({ apiId: foundAPI.apiId! })
            );

            if (apiDesc.graphqlApi?.apiId) {
              this.addResult('AppSync', expectedAPI, 'pass', `API active: ${apiDesc.graphqlApi.uris?.GRAPHQL}`);
            }

          } catch (error) {
            this.addResult('AppSync', expectedAPI, 'fail', `Failed to describe API: ${error}`);
          }
        } else {
          this.addResult('AppSync', expectedAPI, 'fail', 'API not found');
        }
      }

    } catch (error) {
      this.addResult('AppSync', 'API Validation', 'fail', `AppSync validation failed: ${error}`);
    }
  }

  /**
   * Validate CloudFormation stacks
   */
  async validateCloudFormationStacks(): Promise<void> {
    console.log('\n📦 Validating CloudFormation stacks...\n');

    for (const stackName of this.config.stacks) {
      try {
        const stackDesc = await this.cfClient.send(
          new DescribeStacksCommand({ StackName: stackName })
        );

        const stack = stackDesc.Stacks?.[0];
        if (stack) {
          if (stack.StackStatus?.includes('COMPLETE')) {
            this.addResult('CloudFormation', stackName, 'pass', `Stack status: ${stack.StackStatus}`);
          } else {
            this.addResult('CloudFormation', stackName, 'warn', `Stack status: ${stack.StackStatus}`);
          }

          // Check stack outputs
          if (stack.Outputs && stack.Outputs.length > 0) {
            this.addResult('CloudFormation', `${stackName} Outputs`, 'pass', `${stack.Outputs.length} outputs available`);
          } else {
            this.addResult('CloudFormation', `${stackName} Outputs`, 'warn', 'No stack outputs found');
          }

        } else {
          this.addResult('CloudFormation', stackName, 'fail', 'Stack not found');
        }

      } catch (error) {
        this.addResult('CloudFormation', stackName, 'fail', `Stack validation failed: ${error}`);
      }
    }
  }

  /**
   * Validate CDK outputs
   */
  validateCDKOutputs(): void {
    console.log('\n📋 Validating CDK outputs...\n');

    const outputsPath = 'cdk-outputs.json';
    if (fs.existsSync(outputsPath)) {
      try {
        const outputs = JSON.parse(fs.readFileSync(outputsPath, 'utf8'));
        const stackCount = Object.keys(outputs).length;
        
        if (stackCount > 0) {
          this.addResult('CDK', 'Outputs File', 'pass', `${stackCount} stacks with outputs`);

          // Check for required outputs
          const requiredOutputs = ['GraphQLAPIEndpoint', 'UserPoolId', 'UserPoolClientId'];
          let foundOutputs = 0;

          for (const stackOutputs of Object.values(outputs)) {
            const stackOutputKeys = Object.keys(stackOutputs as object);
            foundOutputs += requiredOutputs.filter(required => stackOutputKeys.includes(required)).length;
          }

          if (foundOutputs >= requiredOutputs.length) {
            this.addResult('CDK', 'Required Outputs', 'pass', 'All required outputs found');
          } else {
            this.addResult('CDK', 'Required Outputs', 'warn', `Found ${foundOutputs}/${requiredOutputs.length} required outputs`);
          }

        } else {
          this.addResult('CDK', 'Outputs File', 'warn', 'CDK outputs file is empty');
        }

      } catch (error) {
        this.addResult('CDK', 'Outputs File', 'fail', `Failed to parse CDK outputs: ${error}`);
      }
    } else {
      this.addResult('CDK', 'Outputs File', 'fail', 'CDK outputs file not found');
    }
  }

  /**
   * Generate validation report
   */
  generateReport(): ValidationReport {
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'pass').length,
      failed: this.results.filter(r => r.status === 'fail').length,
      warnings: this.results.filter(r => r.status === 'warn').length,
    };

    const overallStatus: 'pass' | 'fail' | 'warn' = 
      summary.failed > 0 ? 'fail' : 
      summary.warnings > 0 ? 'warn' : 'pass';

    const report: ValidationReport = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      region: this.config.region,
      overallStatus,
      summary,
      results: this.results,
    };

    // Save report
    const reportPath = path.join('validation-reports', `validation-${Date.now()}.json`);
    
    if (!fs.existsSync('validation-reports')) {
      fs.mkdirSync('validation-reports', { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n📊 Validation Summary:');
    console.log(`   ✅ Passed: ${summary.passed}`);
    console.log(`   ⚠️ Warnings: ${summary.warnings}`);
    console.log(`   ❌ Failed: ${summary.failed}`);
    console.log(`   📝 Total: ${summary.total}`);
    console.log(`   📋 Report: ${reportPath}`);
    console.log(`   🎯 Overall Status: ${overallStatus.toUpperCase()}`);

    return report;
  }

  /**
   * Execute full validation
   */
  async executeValidation(mode: 'pre' | 'post' = 'post'): Promise<ValidationReport> {
    console.log(`🔍 Starting Trinity ${mode}-deployment validation...\n`);
    console.log(`📋 Environment: ${this.config.environment}`);
    console.log(`🌍 Region: ${this.config.region}\n`);

    // Always validate environment
    await this.validateEnvironment();

    if (mode === 'post') {
      // Post-deployment validations
      await this.validateCloudFormationStacks();
      await this.validateDynamoDBTables();
      await this.validateLambdaFunctions();
      await this.validateAppSyncAPIs();
      this.validateCDKOutputs();
    }

    return this.generateReport();
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
  const region = args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1';
  const mode = args.includes('--pre') ? 'pre' : 'post';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Trinity Deployment Validation

Usage:
  npx ts-node validate-deployment.ts [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --pre               Run pre-deployment validation only
  --help, -h          Show this help message

Examples:
  # Post-deployment validation (default)
  npx ts-node validate-deployment.ts --env=dev
  
  # Pre-deployment validation
  npx ts-node validate-deployment.ts --pre --env=production
  
  # Staging environment validation
  npx ts-node validate-deployment.ts --env=staging --region=eu-west-1
`);
    process.exit(0);
  }
  
  const validator = new TrinityDeploymentValidator(environment, region);
  validator.executeValidation(mode).then(report => {
    process.exit(report.overallStatus === 'fail' ? 1 : 0);
  }).catch(error => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  });
}

export { TrinityDeploymentValidator, ValidationResult, ValidationReport };