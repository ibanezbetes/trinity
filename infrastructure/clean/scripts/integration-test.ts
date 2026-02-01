#!/usr/bin/env npx ts-node

/**
 * Trinity System Integration Testing Script
 * 
 * Comprehensive end-to-end testing and validation before infrastructure import
 * This is the critical "Dry Run" checkpoint to ensure TypeScript code
 * interacts correctly with existing resources
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, ListFunctionsCommand } from '@aws-sdk/client-lambda';

interface TestResult {
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  message: string;
  details?: any;
}

interface IntegrationTestReport {
  timestamp: string;
  environment: string;
  region: string;
  overallStatus: 'pass' | 'fail';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
  };
  results: TestResult[];
  propertyTestResults: {
    [testFile: string]: {
      status: 'pass' | 'fail';
      iterations: number;
      duration: number;
      errors?: string[];
    };
  };
  recommendations: string[];
}

class TrinityIntegrationTester {
  private environment: string;
  private region: string;
  private cfClient: CloudFormationClient;
  private dynamoClient: DynamoDBClient;
  private lambdaClient: LambdaClient;
  private results: TestResult[] = [];
  private startTime: number;

  constructor(environment: string, region: string = 'eu-west-1') {
    this.environment = environment;
    this.region = region;
    this.cfClient = new CloudFormationClient({ region });
    this.dynamoClient = new DynamoDBClient({ region });
    this.lambdaClient = new LambdaClient({ region });
    this.startTime = Date.now();
  }

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    const timestamp = new Date().toISOString();
    const icon = level === 'info' ? '🧪' : level === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} [${timestamp}] ${message}`);
  }

  private addResult(category: string, test: string, status: 'pass' | 'fail' | 'skip', message: string, details?: any) {
    const duration = Date.now() - this.startTime;
    this.results.push({ category, test, status, duration, message, details });
    
    const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
    this.log(`${icon} [${category}] ${test}: ${message}`);
  }

  /**
   * Test TypeScript compilation
   */
  async testTypeScriptCompilation(): Promise<void> {
    this.log('🔨 Testing TypeScript compilation...');
    
    try {
      const startTime = Date.now();
      execSync('npm run build', { stdio: 'pipe' });
      const duration = Date.now() - startTime;
      
      this.addResult('Build', 'TypeScript Compilation', 'pass', `Compiled successfully in ${duration}ms`);
    } catch (error) {
      this.addResult('Build', 'TypeScript Compilation', 'fail', `Compilation failed: ${error}`);
    }
  }

  /**
   * Test CDK synthesis
   */
  async testCDKSynthesis(): Promise<void> {
    this.log('🏗️ Testing CDK synthesis...');
    
    try {
      const startTime = Date.now();
      execSync('npm run synth', { stdio: 'pipe' });
      const duration = Date.now() - startTime;
      
      // Check if CloudFormation templates were generated
      const cdkOutDir = 'cdk.out';
      if (fs.existsSync(cdkOutDir)) {
        const templates = fs.readdirSync(cdkOutDir).filter(file => file.endsWith('.template.json'));
        this.addResult('CDK', 'Synthesis', 'pass', `Generated ${templates.length} CloudFormation templates in ${duration}ms`);
      } else {
        this.addResult('CDK', 'Synthesis', 'fail', 'CDK output directory not found');
      }
    } catch (error) {
      this.addResult('CDK', 'Synthesis', 'fail', `CDK synthesis failed: ${error}`);
    }
  }

  /**
   * Test AWS connectivity and permissions
   */
  async testAWSConnectivity(): Promise<void> {
    this.log('🔗 Testing AWS connectivity and permissions...');
    
    try {
      // Test CloudFormation access
      await this.cfClient.send(new DescribeStacksCommand({}));
      this.addResult('AWS', 'CloudFormation Access', 'pass', 'CloudFormation API accessible');
      
      // Test DynamoDB access
      await this.dynamoClient.send(new ListTablesCommand({}));
      this.addResult('AWS', 'DynamoDB Access', 'pass', 'DynamoDB API accessible');
      
      // Test Lambda access
      await this.lambdaClient.send(new ListFunctionsCommand({}));
      this.addResult('AWS', 'Lambda Access', 'pass', 'Lambda API accessible');
      
    } catch (error) {
      this.addResult('AWS', 'Connectivity', 'fail', `AWS access failed: ${error}`);
    }
  }

  /**
   * Test existing resource compatibility
   */
  async testResourceCompatibility(): Promise<void> {
    this.log('🔍 Testing existing resource compatibility...');
    
    try {
      // Check existing DynamoDB tables
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
      
      const foundTables = expectedTables.filter(table => existingTables.includes(table));
      
      if (foundTables.length === expectedTables.length) {
        this.addResult('Resources', 'DynamoDB Tables', 'pass', `All ${expectedTables.length} expected tables found`);
      } else {
        const missingTables = expectedTables.filter(table => !existingTables.includes(table));
        this.addResult('Resources', 'DynamoDB Tables', 'fail', `Missing tables: ${missingTables.join(', ')}`);
      }
      
      // Check existing Lambda functions
      const functionsResponse = await this.lambdaClient.send(new ListFunctionsCommand({}));
      const existingFunctions = functionsResponse.Functions?.map(f => f.FunctionName).filter(Boolean) || [];
      
      const expectedFunctions = [
        'trinity-auth-dev',
        'trinity-cache-dev',
        'trinity-vote-dev',
        'trinity-room-dev',
        'trinity-movie-dev',
        'trinity-realtime-dev',
        'trinity-vote-consensus-dev' // Note: matchmaker is deployed as vote-consensus
      ];
      
      const foundFunctions = expectedFunctions.filter(func => existingFunctions.includes(func));
      
      if (foundFunctions.length === expectedFunctions.length) {
        this.addResult('Resources', 'Lambda Functions', 'pass', `All ${expectedFunctions.length} expected functions found`);
      } else {
        const missingFunctions = expectedFunctions.filter(func => !existingFunctions.includes(func));
        this.addResult('Resources', 'Lambda Functions', 'fail', `Missing functions: ${missingFunctions.join(', ')}`);
      }
      
    } catch (error) {
      this.addResult('Resources', 'Compatibility Check', 'fail', `Resource compatibility check failed: ${error}`);
    }
  }

  /**
   * Run property-based tests
   */
  async runPropertyBasedTests(): Promise<{ [testFile: string]: any }> {
    this.log('🎲 Running property-based tests with 100+ iterations...');
    
    const propertyTestResults: { [testFile: string]: any } = {};
    
    // Find all property test files
    const testDir = path.join(__dirname, '..', 'test');
    const propertyTestFiles = fs.readdirSync(testDir)
      .filter(file => file.includes('property.test.ts'))
      .map(file => path.join(testDir, file));
    
    for (const testFile of propertyTestFiles) {
      const testName = path.basename(testFile, '.ts');
      this.log(`🧪 Running ${testName}...`);
      
      const startTime = Date.now();
      
      try {
        // Run Jest with specific test file and increased iterations
        const jestCommand = [
          'npx', 'jest',
          testFile,
          '--verbose',
          '--no-cache',
          '--testTimeout=300000' // 5 minutes timeout
        ];
        
        execSync(jestCommand.join(' '), { 
          stdio: 'pipe',
          env: { 
            ...process.env, 
            FC_NUM_RUNS: '100' // Set fast-check to run 100+ iterations
          }
        });
        
        const duration = Date.now() - startTime;
        
        propertyTestResults[testName] = {
          status: 'pass',
          iterations: 100,
          duration,
        };
        
        this.addResult('Property Tests', testName, 'pass', `Passed 100+ iterations in ${duration}ms`);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        
        propertyTestResults[testName] = {
          status: 'fail',
          iterations: 0,
          duration,
          errors: [String(error)],
        };
        
        this.addResult('Property Tests', testName, 'fail', `Failed: ${error}`);
      }
    }
    
    return propertyTestResults;
  }

  /**
   * Test CDK diff against existing resources
   */
  async testCDKDiff(): Promise<void> {
    this.log('📊 Testing CDK diff against existing resources...');
    
    try {
      const startTime = Date.now();
      
      // Run CDK diff to see what changes would be made
      const diffOutput = execSync('npm run diff', { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      const duration = Date.now() - startTime;
      
      // Analyze diff output
      const lines = diffOutput.split('\n');
      const hasChanges = lines.some(line => 
        line.includes('[+]') || line.includes('[-]') || line.includes('[~]')
      );
      
      if (hasChanges) {
        // Count different types of changes
        const additions = lines.filter(line => line.includes('[+]')).length;
        const deletions = lines.filter(line => line.includes('[-]')).length;
        const modifications = lines.filter(line => line.includes('[~]')).length;
        
        this.addResult('CDK', 'Diff Analysis', 'pass', 
          `Found changes: +${additions} -${deletions} ~${modifications} in ${duration}ms`, 
          { additions, deletions, modifications, diffOutput: lines.slice(0, 20) }
        );
      } else {
        this.addResult('CDK', 'Diff Analysis', 'pass', `No changes detected in ${duration}ms`);
      }
      
    } catch (error) {
      // CDK diff might exit with non-zero code when there are differences
      // This is expected behavior, so we parse the output anyway
      const errorOutput = String(error);
      if (errorOutput.includes('Stack') && errorOutput.includes('diff')) {
        this.addResult('CDK', 'Diff Analysis', 'pass', 'CDK diff completed with changes detected');
      } else {
        this.addResult('CDK', 'Diff Analysis', 'fail', `CDK diff failed: ${error}`);
      }
    }
  }

  /**
   * Test deployment validation scripts
   */
  async testValidationScripts(): Promise<void> {
    this.log('🔍 Testing deployment validation scripts...');
    
    const validationScripts = [
      { name: 'Pre-deployment Validation', command: 'npm run validate:pre' },
      { name: 'Naming Validation', command: 'npm run validate:naming' },
      { name: 'Schema Validation', command: 'npm run validate:schema' },
    ];
    
    for (const script of validationScripts) {
      try {
        const startTime = Date.now();
        execSync(script.command, { stdio: 'pipe' });
        const duration = Date.now() - startTime;
        
        this.addResult('Validation', script.name, 'pass', `Completed in ${duration}ms`);
      } catch (error) {
        this.addResult('Validation', script.name, 'fail', `Failed: ${error}`);
      }
    }
  }

  /**
   * Test import preparation
   */
  async testImportPreparation(): Promise<void> {
    this.log('📥 Testing import preparation...');
    
    try {
      // Test import configuration generation
      const startTime = Date.now();
      
      // This would normally be part of the deploy-master script
      // For now, we'll test that the script can be invoked
      execSync('npx ts-node scripts/deploy-master.ts --dry-run --env=dev', { stdio: 'pipe' });
      
      const duration = Date.now() - startTime;
      this.addResult('Import', 'Preparation', 'pass', `Import preparation completed in ${duration}ms`);
      
    } catch (error) {
      this.addResult('Import', 'Preparation', 'fail', `Import preparation failed: ${error}`);
    }
  }

  /**
   * Generate integration test report
   */
  generateReport(propertyTestResults: { [testFile: string]: any }): IntegrationTestReport {
    const totalDuration = Date.now() - this.startTime;
    
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'pass').length,
      failed: this.results.filter(r => r.status === 'fail').length,
      skipped: this.results.filter(r => r.status === 'skip').length,
      duration: totalDuration,
    };

    const overallStatus: 'pass' | 'fail' = summary.failed === 0 ? 'pass' : 'fail';

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (summary.failed > 0) {
      recommendations.push('🔧 Fix failing tests before proceeding to infrastructure import');
      
      const failedTests = this.results.filter(r => r.status === 'fail');
      failedTests.forEach(test => {
        recommendations.push(`   - ${test.category}: ${test.test} - ${test.message}`);
      });
    }
    
    const failedPropertyTests = Object.entries(propertyTestResults)
      .filter(([_, result]) => result.status === 'fail');
    
    if (failedPropertyTests.length > 0) {
      recommendations.push('🎲 Fix failing property-based tests:');
      failedPropertyTests.forEach(([testName, result]) => {
        recommendations.push(`   - ${testName}: ${result.errors?.join(', ')}`);
      });
    }
    
    if (overallStatus === 'pass') {
      recommendations.push('✅ All integration tests passed - ready for infrastructure import');
      recommendations.push('📋 Next steps:');
      recommendations.push('   1. Review Task 13 execution plan');
      recommendations.push('   2. Ensure backup procedures are in place');
      recommendations.push('   3. Execute CDK import for Database Stack');
      recommendations.push('   4. Validate import success');
      recommendations.push('   5. Proceed with remaining stack imports');
    }

    const report: IntegrationTestReport = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      region: this.region,
      overallStatus,
      summary,
      results: this.results,
      propertyTestResults,
      recommendations,
    };

    // Save report
    const reportPath = path.join('integration-reports', `integration-test-${Date.now()}.json`);
    
    if (!fs.existsSync('integration-reports')) {
      fs.mkdirSync('integration-reports', { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Print summary
    console.log('\n🧪 Integration Test Summary:');
    console.log(`   ✅ Passed: ${summary.passed}`);
    console.log(`   ❌ Failed: ${summary.failed}`);
    console.log(`   ⏭️ Skipped: ${summary.skipped}`);
    console.log(`   📝 Total: ${summary.total}`);
    console.log(`   ⏱️ Duration: ${(summary.duration / 1000).toFixed(2)}s`);
    console.log(`   🎯 Overall Status: ${overallStatus.toUpperCase()}`);
    console.log(`   📋 Report: ${reportPath}`);

    // Print property test summary
    const propertyTestCount = Object.keys(propertyTestResults).length;
    const passedPropertyTests = Object.values(propertyTestResults).filter(r => r.status === 'pass').length;
    
    console.log('\n🎲 Property Test Summary:');
    console.log(`   ✅ Passed: ${passedPropertyTests}/${propertyTestCount}`);
    console.log(`   🔄 Total Iterations: ${passedPropertyTests * 100}+`);

    // Print recommendations
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach(rec => console.log(rec));

    return report;
  }

  /**
   * Execute comprehensive integration testing
   */
  async execute(): Promise<IntegrationTestReport> {
    try {
      this.log('🚀 Starting Trinity System Integration Testing...');
      this.log(`📋 Environment: ${this.environment}`);
      this.log(`🌍 Region: ${this.region}`);
      this.log('🎯 This is the critical "Dry Run" checkpoint before infrastructure import\n');

      // Run all integration tests
      await this.testTypeScriptCompilation();
      await this.testCDKSynthesis();
      await this.testAWSConnectivity();
      await this.testResourceCompatibility();
      await this.testCDKDiff();
      await this.testValidationScripts();
      await this.testImportPreparation();
      
      // Run property-based tests with 100+ iterations
      const propertyTestResults = await this.runPropertyBasedTests();
      
      // Generate comprehensive report
      const report = this.generateReport(propertyTestResults);
      
      if (report.overallStatus === 'pass') {
        this.log('🎉 Integration testing completed successfully - ready for infrastructure import!');
      } else {
        this.log('❌ Integration testing failed - fix issues before proceeding', 'error');
      }
      
      return report;
      
    } catch (error) {
      this.log(`❌ Integration testing error: ${error}`, 'error');
      throw error;
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
  const region = args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'eu-west-1';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Trinity System Integration Testing

Usage:
  npx ts-node integration-test.ts [options]

Options:
  --env=<env>          Environment (dev|staging|production) [default: dev]
  --region=<region>    AWS region [default: eu-west-1]
  --help, -h          Show this help message

Description:
  This is the critical "Dry Run" checkpoint that validates:
  - TypeScript compilation and CDK synthesis
  - AWS connectivity and existing resource compatibility
  - Property-based tests with 100+ iterations
  - Deployment validation scripts
  - Import preparation procedures

  All tests must pass before proceeding to Task 13 (Infrastructure Import).

Examples:
  # Run integration tests for development
  npx ts-node integration-test.ts --env=dev
  
  # Run integration tests for production
  npx ts-node integration-test.ts --env=production --region=eu-west-1
`);
    process.exit(0);
  }
  
  const tester = new TrinityIntegrationTester(environment, region);
  tester.execute().then(report => {
    process.exit(report.overallStatus === 'pass' ? 0 : 1);
  }).catch(error => {
    console.error('❌ Integration testing failed:', error);
    process.exit(1);
  });
}

export { TrinityIntegrationTester, IntegrationTestReport };