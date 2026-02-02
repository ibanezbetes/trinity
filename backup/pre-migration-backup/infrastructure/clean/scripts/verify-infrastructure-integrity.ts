#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';

interface VerificationResult {
  component: string;
  status: 'PASS' | 'FAIL';
  details: string;
  errors?: string[];
}

class InfrastructureIntegrityVerifier {
  private readonly region = 'eu-west-1';
  private results: VerificationResult[] = [];

  async verifyAll(): Promise<VerificationResult[]> {
    console.log('🔍 Verifying Infrastructure Integrity...');
    console.log('📋 Property 10: Infrastructure Integrity - Requirements 7.1');
    
    await this.verifyCloudFormationStacks();
    await this.verifyDynamoDBTables();
    await this.verifyLambdaFunctions();
    await this.verifyAppSyncAPIs();
    await this.verifyCognitoResources();
    
    this.generateReport();
    return this.results;
  }

  private async verifyCloudFormationStacks(): Promise<void> {
    console.log('\n📚 Verifying CloudFormation Stacks...');
    
    const expectedStacks = [
      'TrinityDatabaseStack',
      'TrinityApiStack', 
      'TrinityMainStack',
      'TrinityMatchmakingStack'
    ];

    try {
      const output = execSync(
        `aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --region ${this.region} --query "StackSummaries[].StackName" --output text`,
        { encoding: 'utf8' }
      );
      
      const existingStacks = output.trim().split('\t');
      const missingStacks = expectedStacks.filter(stack => !existingStacks.includes(stack));
      
      if (missingStacks.length === 0) {
        this.results.push({
          component: 'CloudFormation Stacks',
          status: 'PASS',
          details: `All ${expectedStacks.length} expected stacks are deployed and in stable state`
        });
        console.log('✅ All CloudFormation stacks verified');
      } else {
        this.results.push({
          component: 'CloudFormation Stacks',
          status: 'FAIL',
          details: `Missing stacks: ${missingStacks.join(', ')}`,
          errors: [`Expected stacks not found: ${missingStacks.join(', ')}`]
        });
        console.log('❌ Missing CloudFormation stacks:', missingStacks);
      }
    } catch (error) {
      this.results.push({
        component: 'CloudFormation Stacks',
        status: 'FAIL',
        details: 'Failed to verify stacks',
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  private async verifyDynamoDBTables(): Promise<void> {
    console.log('\n🗄️ Verifying DynamoDB Tables...');
    
    const expectedTables = [
      'trinity-users-dev',
      'trinity-rooms-dev-v2', 
      'trinity-room-members-dev',
      'trinity-room-invites-dev-v2',
      'trinity-votes-dev',
      'trinity-movies-cache-dev',
      'trinity-room-matches-dev',
      'trinity-connections-dev',
      'trinity-room-movie-cache-dev',
      'trinity-room-cache-metadata-dev',
      'trinity-matchmaking-dev',
      'trinity-filter-cache'
    ];

    try {
      const output = execSync(
        `aws dynamodb list-tables --region ${this.region} --query "TableNames" --output text`,
        { encoding: 'utf8' }
      );
      
      const existingTables = output.trim().split('\t');
      const missingTables = expectedTables.filter(table => !existingTables.includes(table));
      
      if (missingTables.length === 0) {
        // Verify each table is ACTIVE
        let allActive = true;
        const inactiveTables: string[] = [];
        
        for (const table of expectedTables) {
          try {
            const tableStatus = execSync(
              `aws dynamodb describe-table --table-name ${table} --region ${this.region} --query "Table.TableStatus" --output text`,
              { encoding: 'utf8' }
            ).trim();
            
            if (tableStatus !== 'ACTIVE') {
              allActive = false;
              inactiveTables.push(`${table} (${tableStatus})`);
            }
          } catch (error) {
            allActive = false;
            inactiveTables.push(`${table} (ERROR)`);
          }
        }
        
        if (allActive) {
          this.results.push({
            component: 'DynamoDB Tables',
            status: 'PASS',
            details: `All ${expectedTables.length} tables are ACTIVE and accessible`
          });
          console.log('✅ All DynamoDB tables verified');
        } else {
          this.results.push({
            component: 'DynamoDB Tables',
            status: 'FAIL',
            details: `Some tables are not ACTIVE: ${inactiveTables.join(', ')}`,
            errors: [`Inactive tables: ${inactiveTables.join(', ')}`]
          });
        }
      } else {
        this.results.push({
          component: 'DynamoDB Tables',
          status: 'FAIL',
          details: `Missing tables: ${missingTables.join(', ')}`,
          errors: [`Expected tables not found: ${missingTables.join(', ')}`]
        });
        console.log('❌ Missing DynamoDB tables:', missingTables);
      }
    } catch (error) {
      this.results.push({
        component: 'DynamoDB Tables',
        status: 'FAIL',
        details: 'Failed to verify tables',
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  private async verifyLambdaFunctions(): Promise<void> {
    console.log('\n⚡ Verifying Lambda Functions...');
    
    const expectedFunctions = [
      'trinity-auth-dev',
      'trinity-cache-dev', 
      'trinity-vote-dev',
      'trinity-room-dev',
      'trinity-movie-dev',
      'trinity-realtime-dev',
      'trinity-vote-consensus-dev'
    ];

    try {
      const output = execSync(
        `aws lambda list-functions --region ${this.region} --query "Functions[?contains(FunctionName, 'trinity')].FunctionName" --output text`,
        { encoding: 'utf8' }
      );
      
      const existingFunctions = output.trim().split('\t');
      const missingFunctions = expectedFunctions.filter(func => !existingFunctions.includes(func));
      
      if (missingFunctions.length === 0) {
        this.results.push({
          component: 'Lambda Functions',
          status: 'PASS',
          details: `All ${expectedFunctions.length} Lambda functions are deployed`
        });
        console.log('✅ All Lambda functions verified');
      } else {
        this.results.push({
          component: 'Lambda Functions',
          status: 'FAIL',
          details: `Missing functions: ${missingFunctions.join(', ')}`,
          errors: [`Expected functions not found: ${missingFunctions.join(', ')}`]
        });
        console.log('❌ Missing Lambda functions:', missingFunctions);
      }
    } catch (error) {
      this.results.push({
        component: 'Lambda Functions',
        status: 'FAIL',
        details: 'Failed to verify functions',
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  private async verifyAppSyncAPIs(): Promise<void> {
    console.log('\n🔗 Verifying AppSync APIs...');
    
    const expectedAPIs = ['trinity-api-dev', 'trinity-realtime-api'];

    try {
      const output = execSync(
        `aws appsync list-graphql-apis --region ${this.region} --query "graphqlApis[?contains(name, 'trinity')].name" --output text`,
        { encoding: 'utf8' }
      );
      
      const existingAPIs = output.trim().split('\t');
      const missingAPIs = expectedAPIs.filter(api => !existingAPIs.includes(api));
      
      if (missingAPIs.length === 0) {
        this.results.push({
          component: 'AppSync APIs',
          status: 'PASS',
          details: `All ${expectedAPIs.length} GraphQL APIs are deployed`
        });
        console.log('✅ All AppSync APIs verified');
      } else {
        this.results.push({
          component: 'AppSync APIs',
          status: 'FAIL',
          details: `Missing APIs: ${missingAPIs.join(', ')}`,
          errors: [`Expected APIs not found: ${missingAPIs.join(', ')}`]
        });
        console.log('❌ Missing AppSync APIs:', missingAPIs);
      }
    } catch (error) {
      this.results.push({
        component: 'AppSync APIs',
        status: 'FAIL',
        details: 'Failed to verify APIs',
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  private async verifyCognitoResources(): Promise<void> {
    console.log('\n🔐 Verifying Cognito Resources...');
    
    try {
      const output = execSync(
        `aws cognito-idp list-user-pools --max-results 20 --region ${this.region} --query "UserPools[?contains(Name, 'trinity')].Name" --output text`,
        { encoding: 'utf8' }
      );
      
      const userPools = output.trim().split('\t').filter(pool => pool.length > 0);
      
      if (userPools.length > 0) {
        this.results.push({
          component: 'Cognito User Pools',
          status: 'PASS',
          details: `Found ${userPools.length} Trinity user pools: ${userPools.join(', ')}`
        });
        console.log('✅ Cognito resources verified');
      } else {
        this.results.push({
          component: 'Cognito User Pools',
          status: 'FAIL',
          details: 'No Trinity user pools found',
          errors: ['Expected at least one Trinity user pool']
        });
        console.log('❌ No Cognito user pools found');
      }
    } catch (error) {
      this.results.push({
        component: 'Cognito User Pools',
        status: 'FAIL',
        details: 'Failed to verify Cognito resources',
        errors: [error instanceof Error ? error.message : String(error)]
      });
    }
  }

  private generateReport(): void {
    const reportPath = 'infrastructure-integrity-report.json';
    
    const summary = {
      timestamp: new Date().toISOString(),
      totalComponents: this.results.length,
      passedComponents: this.results.filter(r => r.status === 'PASS').length,
      failedComponents: this.results.filter(r => r.status === 'FAIL').length,
      overallStatus: this.results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL'
    };
    
    const report = {
      summary,
      details: this.results
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📊 Infrastructure Integrity Summary:');
    console.log(`   Total Components: ${summary.totalComponents}`);
    console.log(`   Passed: ${summary.passedComponents}`);
    console.log(`   Failed: ${summary.failedComponents}`);
    console.log(`   Overall Status: ${summary.overallStatus}`);
    console.log(`   Report saved to: ${reportPath}`);
    
    if (summary.overallStatus === 'PASS') {
      console.log('\n🎉 All infrastructure components verified successfully!');
      console.log('✅ Property 10: Infrastructure Integrity - PASSED');
    } else {
      console.log('\n⚠️ Some infrastructure components failed verification');
      console.log('❌ Property 10: Infrastructure Integrity - FAILED');
      
      const failedComponents = this.results.filter(r => r.status === 'FAIL');
      failedComponents.forEach(component => {
        console.log(`   ❌ ${component.component}: ${component.details}`);
        if (component.errors) {
          component.errors.forEach(error => console.log(`      - ${error}`));
        }
      });
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const verifier = new InfrastructureIntegrityVerifier();
  verifier.verifyAll().then(results => {
    const overallStatus = results.every(r => r.status === 'PASS');
    process.exit(overallStatus ? 0 : 1);
  }).catch(error => {
    console.error('💥 Verification failed:', error);
    process.exit(1);
  });
}

export { InfrastructureIntegrityVerifier };