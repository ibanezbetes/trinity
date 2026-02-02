/**
 * Trinity AWS Resource Cleanup - Scan Only Test
 * 
 * This script performs a dry-run scan of all Trinity-related AWS resources
 * without actually deleting anything. Use this to verify what would be deleted.
 * 
 * Usage: node scripts/utils/aws-resource-cleanup/test-cleanup-scan.js
 */

const { 
  LambdaClient, 
  ListFunctionsCommand
} = require('@aws-sdk/client-lambda');
const { 
  DynamoDBClient, 
  ListTablesCommand
} = require('@aws-sdk/client-dynamodb');
const { 
  CloudFormationClient, 
  ListStacksCommand
} = require('@aws-sdk/client-cloudformation');
const { 
  AppSyncClient, 
  ListGraphqlApisCommand
} = require('@aws-sdk/client-appsync');
const { 
  IAMClient, 
  ListRolesCommand
} = require('@aws-sdk/client-iam');
const { 
  S3Client, 
  ListBucketsCommand
} = require('@aws-sdk/client-s3');
const { 
  APIGatewayClient, 
  GetRestApisCommand
} = require('@aws-sdk/client-api-gateway');
const { 
  CognitoIdentityProviderClient, 
  ListUserPoolsCommand
} = require('@aws-sdk/client-cognito-identity-provider');

// Load environment variables
require('dotenv').config();

const REGION = 'eu-west-1';
const TRINITY_PREFIXES = ['trinity-', 'Trinity'];

class TrinityResourceScanner {
  constructor() {
    const clientConfig = { region: REGION };
    
    this.lambdaClient = new LambdaClient(clientConfig);
    this.dynamoClient = new DynamoDBClient(clientConfig);
    this.cloudFormationClient = new CloudFormationClient(clientConfig);
    this.appSyncClient = new AppSyncClient(clientConfig);
    this.iamClient = new IAMClient(clientConfig);
    this.s3Client = new S3Client(clientConfig);
    this.apiGatewayClient = new APIGatewayClient(clientConfig);
    this.cognitoClient = new CognitoIdentityProviderClient(clientConfig);
    this.foundResources = [];
  }

  isTrinityResource(resourceName) {
    return TRINITY_PREFIXES.some(prefix => 
      resourceName.toLowerCase().includes(prefix.toLowerCase())
    );
  }

  addFoundResource(resourceType, resourceName, details = {}) {
    this.foundResources.push({
      resourceType,
      resourceName,
      details
    });
  }

  async scanLambdaFunctions() {
    console.log('🚀 Scanning Lambda functions...');
    
    try {
      const listCommand = new ListFunctionsCommand({});
      const response = await this.lambdaClient.send(listCommand);
      
      const trinityFunctions = response.Functions?.filter(func => 
        func.FunctionName && this.isTrinityResource(func.FunctionName)
      ) || [];

      console.log(`Found ${trinityFunctions.length} Trinity Lambda functions:`);
      
      for (const func of trinityFunctions) {
        console.log(`  - ${func.FunctionName} (Runtime: ${func.Runtime}, Size: ${func.CodeSize} bytes)`);
        this.addFoundResource('Lambda', func.FunctionName, {
          runtime: func.Runtime,
          codeSize: func.CodeSize,
          lastModified: func.LastModified
        });
      }
    } catch (error) {
      console.error('Failed to list Lambda functions:', error.message);
    }
  }

  async scanDynamoDBTables() {
    console.log('\n🗄️ Scanning DynamoDB tables...');
    
    try {
      const listCommand = new ListTablesCommand({});
      const response = await this.dynamoClient.send(listCommand);
      
      const trinityTables = response.TableNames?.filter(tableName => 
        this.isTrinityResource(tableName)
      ) || [];

      console.log(`Found ${trinityTables.length} Trinity DynamoDB tables:`);
      
      for (const tableName of trinityTables) {
        console.log(`  - ${tableName}`);
        this.addFoundResource('DynamoDB', tableName);
      }
    } catch (error) {
      console.error('Failed to list DynamoDB tables:', error.message);
    }
  }

  async scanCloudFormationStacks() {
    console.log('\n☁️ Scanning CloudFormation stacks...');
    
    try {
      const listCommand = new ListStacksCommand({
        StackStatusFilter: [
          'CREATE_COMPLETE',
          'UPDATE_COMPLETE',
          'ROLLBACK_COMPLETE',
          'UPDATE_ROLLBACK_COMPLETE'
        ]
      });
      const response = await this.cloudFormationClient.send(listCommand);
      
      const trinityStacks = response.StackSummaries?.filter(stack => 
        stack.StackName && this.isTrinityResource(stack.StackName)
      ) || [];

      console.log(`Found ${trinityStacks.length} Trinity CloudFormation stacks:`);
      
      for (const stack of trinityStacks) {
        console.log(`  - ${stack.StackName} (Status: ${stack.StackStatus})`);
        this.addFoundResource('CloudFormation', stack.StackName, {
          status: stack.StackStatus,
          creationTime: stack.CreationTime
        });
      }
    } catch (error) {
      console.error('Failed to list CloudFormation stacks:', error.message);
    }
  }

  async scanAppSyncAPIs() {
    console.log('\n🔗 Scanning AppSync GraphQL APIs...');
    
    try {
      const listCommand = new ListGraphqlApisCommand({});
      const response = await this.appSyncClient.send(listCommand);
      
      const trinityAPIs = response.graphqlApis?.filter(api => 
        api.name && this.isTrinityResource(api.name)
      ) || [];

      console.log(`Found ${trinityAPIs.length} Trinity AppSync APIs:`);
      
      for (const api of trinityAPIs) {
        console.log(`  - ${api.name} (ID: ${api.apiId}, Auth: ${api.authenticationType})`);
        this.addFoundResource('AppSync', api.name, {
          apiId: api.apiId,
          authenticationType: api.authenticationType,
          uris: api.uris
        });
      }
    } catch (error) {
      console.error('Failed to list AppSync APIs:', error.message);
    }
  }

  async scanIAMRoles() {
    console.log('\n🔐 Scanning IAM roles...');
    
    try {
      const listCommand = new ListRolesCommand({});
      const response = await this.iamClient.send(listCommand);
      
      const trinityRoles = response.Roles?.filter(role => 
        role.RoleName && this.isTrinityResource(role.RoleName)
      ) || [];

      console.log(`Found ${trinityRoles.length} Trinity IAM roles:`);
      
      for (const role of trinityRoles) {
        console.log(`  - ${role.RoleName} (Created: ${role.CreateDate})`);
        this.addFoundResource('IAM Role', role.RoleName, {
          arn: role.Arn,
          createDate: role.CreateDate
        });
      }
    } catch (error) {
      console.error('Failed to list IAM roles:', error.message);
    }
  }

  async scanS3Buckets() {
    console.log('\n🪣 Scanning S3 buckets...');
    
    try {
      const listCommand = new ListBucketsCommand({});
      const response = await this.s3Client.send(listCommand);
      
      const trinityBuckets = response.Buckets?.filter(bucket => 
        bucket.Name && this.isTrinityResource(bucket.Name)
      ) || [];

      console.log(`Found ${trinityBuckets.length} Trinity S3 buckets:`);
      
      for (const bucket of trinityBuckets) {
        console.log(`  - ${bucket.Name} (Created: ${bucket.CreationDate})`);
        this.addFoundResource('S3 Bucket', bucket.Name, {
          creationDate: bucket.CreationDate
        });
      }
    } catch (error) {
      console.error('Failed to list S3 buckets:', error.message);
    }
  }

  async scanAPIGateway() {
    console.log('\n🌐 Scanning API Gateway APIs...');
    
    try {
      const listCommand = new GetRestApisCommand({});
      const response = await this.apiGatewayClient.send(listCommand);
      
      const trinityAPIs = response.items?.filter(api => 
        api.name && this.isTrinityResource(api.name)
      ) || [];

      console.log(`Found ${trinityAPIs.length} Trinity API Gateway APIs:`);
      
      for (const api of trinityAPIs) {
        console.log(`  - ${api.name} (ID: ${api.id}, Created: ${api.createdDate})`);
        this.addFoundResource('API Gateway', api.name, {
          id: api.id,
          createdDate: api.createdDate
        });
      }
    } catch (error) {
      console.error('Failed to list API Gateway APIs:', error.message);
    }
  }

  async scanCognitoUserPools() {
    console.log('\n👤 Scanning Cognito User Pools...');
    
    try {
      const listCommand = new ListUserPoolsCommand({ MaxResults: 60 });
      const response = await this.cognitoClient.send(listCommand);
      
      const trinityUserPools = response.UserPools?.filter(pool => 
        pool.Name && this.isTrinityResource(pool.Name)
      ) || [];

      console.log(`Found ${trinityUserPools.length} Trinity Cognito User Pools:`);
      
      for (const pool of trinityUserPools) {
        console.log(`  - ${pool.Name} (ID: ${pool.Id}, Created: ${pool.CreationDate})`);
        this.addFoundResource('Cognito User Pool', pool.Name, {
          id: pool.Id,
          creationDate: pool.CreationDate
        });
      }
    } catch (error) {
      console.error('Failed to list Cognito User Pools:', error.message);
    }
  }

  generateSummary() {
    const summary = {
      totalResources: this.foundResources.length,
      resourcesByType: {}
    };
    
    // Group resources by type
    for (const resource of this.foundResources) {
      if (!summary.resourcesByType[resource.resourceType]) {
        summary.resourcesByType[resource.resourceType] = 0;
      }
      summary.resourcesByType[resource.resourceType]++;
    }
    
    return summary;
  }

  async executeScan() {
    console.log('🔍 Starting Trinity AWS Resource Scan (DRY RUN)...');
    console.log(`Region: ${REGION}`);
    console.log('ℹ️  This is a READ-ONLY scan - no resources will be deleted');
    console.log('');
    
    // Execute scans
    await this.scanLambdaFunctions();
    await this.scanDynamoDBTables();
    await this.scanCloudFormationStacks();
    await this.scanAppSyncAPIs();
    await this.scanIAMRoles();
    await this.scanS3Buckets();
    await this.scanAPIGateway();
    await this.scanCognitoUserPools();
    
    const summary = this.generateSummary();
    
    console.log('\n📊 Scan Summary:');
    console.log(`Total Trinity resources found: ${summary.totalResources}`);
    console.log('\nResources by type:');
    
    for (const [type, count] of Object.entries(summary.resourcesByType)) {
      console.log(`  ${type}: ${count}`);
    }
    
    if (summary.totalResources === 0) {
      console.log('\n✅ No Trinity resources found - AWS state is already clean!');
    } else {
      console.log('\n⚠️  These resources would be DELETED by the cleanup script!');
      console.log('Make sure you have completed the backup process before running the actual cleanup.');
    }
    
    return summary;
  }
}

// Main execution
async function main() {
  try {
    const scanner = new TrinityResourceScanner();
    await scanner.executeScan();
    
  } catch (error) {
    console.error('Fatal error during scan:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { TrinityResourceScanner };