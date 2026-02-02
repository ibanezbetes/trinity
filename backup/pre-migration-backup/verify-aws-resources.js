#!/usr/bin/env node

/**
 * AWS Resource Verification Script
 * Verifies current AWS resources before migration
 * Run: node backup/pre-migration-backup/verify-aws-resources.js
 */

const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { AppSyncClient, ListGraphqlApisCommand } = require('@aws-sdk/client-appsync');
const { CognitoIdentityProviderClient, ListUserPoolsCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { CloudFormationClient, ListStacksCommand } = require('@aws-sdk/client-cloudformation');

const region = 'eu-west-1';

// Expected resources from inventory
const EXPECTED_LAMBDAS = [
  'trinity-auth-dev',
  'trinity-cache-dev', 
  'trinity-matchmaker-dev',
  'trinity-movie-dev',
  'trinity-realtime-dev',
  'trinity-room-dev',
  'trinity-vote-dev'
];

const EXPECTED_TABLES = [
  'trinity-users-dev',
  'trinity-rooms-dev',
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

async function verifyLambdaFunctions() {
  console.log('\n🔍 Verifying Lambda Functions...');
  
  try {
    const client = new LambdaClient({ region });
    const command = new ListFunctionsCommand({});
    const response = await client.send(command);
    
    const trinityFunctions = response.Functions.filter(fn => 
      fn.FunctionName.startsWith('trinity-')
    );
    
    console.log(`✅ Found ${trinityFunctions.length} Trinity Lambda functions:`);
    trinityFunctions.forEach(fn => {
      const isExpected = EXPECTED_LAMBDAS.includes(fn.FunctionName);
      const status = isExpected ? '✅' : '⚠️';
      console.log(`  ${status} ${fn.FunctionName} (Runtime: ${fn.Runtime})`);
    });
    
    // Check for missing functions
    const foundNames = trinityFunctions.map(fn => fn.FunctionName);
    const missing = EXPECTED_LAMBDAS.filter(name => !foundNames.includes(name));
    if (missing.length > 0) {
      console.log(`❌ Missing Lambda functions: ${missing.join(', ')}`);
    }
    
    return trinityFunctions;
  } catch (error) {
    console.error('❌ Error verifying Lambda functions:', error.message);
    return [];
  }
}

async function verifyDynamoDBTables() {
  console.log('\n🔍 Verifying DynamoDB Tables...');
  
  try {
    const client = new DynamoDBClient({ region });
    const command = new ListTablesCommand({});
    const response = await client.send(command);
    
    const trinityTables = response.TableNames.filter(name => 
      name.startsWith('trinity-')
    );
    
    console.log(`✅ Found ${trinityTables.length} Trinity DynamoDB tables:`);
    trinityTables.forEach(name => {
      const isExpected = EXPECTED_TABLES.includes(name);
      const status = isExpected ? '✅' : '⚠️';
      console.log(`  ${status} ${name}`);
    });
    
    // Check for missing tables
    const missing = EXPECTED_TABLES.filter(name => !trinityTables.includes(name));
    if (missing.length > 0) {
      console.log(`❌ Missing DynamoDB tables: ${missing.join(', ')}`);
    }
    
    return trinityTables;
  } catch (error) {
    console.error('❌ Error verifying DynamoDB tables:', error.message);
    return [];
  }
}

async function verifyGraphQLAPIs() {
  console.log('\n🔍 Verifying GraphQL APIs...');
  
  try {
    const client = new AppSyncClient({ region });
    const command = new ListGraphqlApisCommand({});
    const response = await client.send(command);
    
    const trinityAPIs = response.graphqlApis.filter(api => 
      api.name.toLowerCase().includes('trinity')
    );
    
    console.log(`✅ Found ${trinityAPIs.length} Trinity GraphQL APIs:`);
    trinityAPIs.forEach(api => {
      console.log(`  ✅ ${api.name} (${api.apiId})`);
      console.log(`     URL: ${api.uris.GRAPHQL}`);
      if (api.uris.REALTIME) {
        console.log(`     Realtime: ${api.uris.REALTIME}`);
      }
    });
    
    return trinityAPIs;
  } catch (error) {
    console.error('❌ Error verifying GraphQL APIs:', error.message);
    return [];
  }
}

async function verifyCognitoUserPools() {
  console.log('\n🔍 Verifying Cognito User Pools...');
  
  try {
    const client = new CognitoIdentityProviderClient({ region });
    const command = new ListUserPoolsCommand({ MaxResults: 60 });
    const response = await client.send(command);
    
    const trinityPools = response.UserPools.filter(pool => 
      pool.Name.toLowerCase().includes('trinity')
    );
    
    console.log(`✅ Found ${trinityPools.length} Trinity User Pools:`);
    trinityPools.forEach(pool => {
      console.log(`  ✅ ${pool.Name} (${pool.Id})`);
    });
    
    return trinityPools;
  } catch (error) {
    console.error('❌ Error verifying Cognito User Pools:', error.message);
    return [];
  }
}

async function verifyCloudFormationStacks() {
  console.log('\n🔍 Verifying CloudFormation Stacks...');
  
  try {
    const client = new CloudFormationClient({ region });
    const command = new ListStacksCommand({
      StackStatusFilter: [
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE', 
        'UPDATE_ROLLBACK_COMPLETE'
      ]
    });
    const response = await client.send(command);
    
    const trinityStacks = response.StackSummaries.filter(stack => 
      stack.StackName.toLowerCase().includes('trinity')
    );
    
    console.log(`✅ Found ${trinityStacks.length} Trinity CloudFormation stacks:`);
    trinityStacks.forEach(stack => {
      console.log(`  ✅ ${stack.StackName} (${stack.StackStatus})`);
    });
    
    return trinityStacks;
  } catch (error) {
    console.error('❌ Error verifying CloudFormation stacks:', error.message);
    return [];
  }
}

async function generateBackupReport(lambdas, tables, apis, userPools, stacks) {
  const report = {
    timestamp: new Date().toISOString(),
    region: region,
    resources: {
      lambdaFunctions: {
        found: lambdas.length,
        expected: EXPECTED_LAMBDAS.length,
        functions: lambdas.map(fn => ({
          name: fn.FunctionName,
          runtime: fn.Runtime,
          lastModified: fn.LastModified
        }))
      },
      dynamodbTables: {
        found: tables.length,
        expected: EXPECTED_TABLES.length,
        tables: tables
      },
      graphqlAPIs: {
        found: apis.length,
        expected: 2,
        apis: apis.map(api => ({
          name: api.name,
          apiId: api.apiId,
          graphqlUrl: api.uris.GRAPHQL,
          realtimeUrl: api.uris.REALTIME
        }))
      },
      cognitoUserPools: {
        found: userPools.length,
        expected: 1,
        pools: userPools.map(pool => ({
          name: pool.Name,
          id: pool.Id
        }))
      },
      cloudFormationStacks: {
        found: stacks.length,
        stacks: stacks.map(stack => ({
          name: stack.StackName,
          status: stack.StackStatus,
          creationTime: stack.CreationTime
        }))
      }
    }
  };
  
  // Write report to file
  const fs = require('fs');
  const reportPath = 'backup/pre-migration-backup/aws-resource-verification-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n📄 Backup verification report saved to: ${reportPath}`);
  
  return report;
}

async function main() {
  console.log('🚀 Trinity AWS Resource Verification');
  console.log('=====================================');
  console.log(`Region: ${region}`);
  console.log(`Date: ${new Date().toISOString()}`);
  
  try {
    const lambdas = await verifyLambdaFunctions();
    const tables = await verifyDynamoDBTables();
    const apis = await verifyGraphQLAPIs();
    const userPools = await verifyCognitoUserPools();
    const stacks = await verifyCloudFormationStacks();
    
    const report = await generateBackupReport(lambdas, tables, apis, userPools, stacks);
    
    console.log('\n📊 Summary:');
    console.log(`  Lambda Functions: ${lambdas.length}/${EXPECTED_LAMBDAS.length}`);
    console.log(`  DynamoDB Tables: ${tables.length}/${EXPECTED_TABLES.length}`);
    console.log(`  GraphQL APIs: ${apis.length}/2`);
    console.log(`  Cognito User Pools: ${userPools.length}/1`);
    console.log(`  CloudFormation Stacks: ${stacks.length}`);
    
    const allResourcesFound = 
      lambdas.length >= EXPECTED_LAMBDAS.length &&
      tables.length >= EXPECTED_TABLES.length &&
      apis.length >= 2 &&
      userPools.length >= 1;
    
    if (allResourcesFound) {
      console.log('\n✅ All expected resources found - Ready for migration!');
    } else {
      console.log('\n⚠️ Some expected resources missing - Review before migration');
    }
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };