/**
 * Trinity AWS Resource Cleanup Script
 * 
 * This script performs a comprehensive cleanup of all Trinity-related AWS resources
 * in the eu-west-1 region as part of the architectural stabilization process.
 * 
 * DESTRUCTIVE OPERATION: This script will delete ALL Trinity resources.
 * Only run this script if you have completed the backup process (Task 1).
 * 
 * Requirements: 4.2, 4.5
 * 
 * Usage: node scripts/utils/aws-resource-cleanup/aws-resource-cleanup.js
 */

const { 
  LambdaClient, 
  ListFunctionsCommand, 
  DeleteFunctionCommand,
  GetFunctionCommand 
} = require('@aws-sdk/client-lambda');
const { 
  DynamoDBClient, 
  ListTablesCommand, 
  DeleteTableCommand,
  DescribeTableCommand 
} = require('@aws-sdk/client-dynamodb');
const { 
  CloudFormationClient, 
  ListStacksCommand, 
  DeleteStackCommand,
  DescribeStacksCommand 
} = require('@aws-sdk/client-cloudformation');
const { 
  AppSyncClient, 
  ListGraphqlApisCommand, 
  DeleteGraphqlApiCommand,
  GetGraphqlApiCommand 
} = require('@aws-sdk/client-appsync');
const { 
  IAMClient, 
  ListRolesCommand, 
  DeleteRoleCommand,
  ListRolePoliciesCommand,
  DeleteRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  DetachRolePolicyCommand 
} = require('@aws-sdk/client-iam');
const { 
  S3Client, 
  ListBucketsCommand, 
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand 
} = require('@aws-sdk/client-s3');
const { 
  APIGatewayClient, 
  GetRestApisCommand, 
  DeleteRestApiCommand 
} = require('@aws-sdk/client-api-gateway');
const { 
  CognitoIdentityProviderClient, 
  ListUserPoolsCommand, 
  DeleteUserPoolCommand,
  ListUserPoolClientsCommand,
  DeleteUserPoolClientCommand 
} = require('@aws-sdk/client-cognito-identity-provider');

// Load environment variables
require('dotenv').config();

const REGION = 'eu-west-1';
const TRINITY_PREFIXES = ['trinity-', 'Trinity'];

class TrinityResourceCleanup {
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
    this.results = [];
  }

  isTrinityResource(resourceName) {
    return TRINITY_PREFIXES.some(prefix => 
      resourceName.toLowerCase().includes(prefix.toLowerCase())
    );
  }

  addResult(resourceType, resourceName, status, error) {
    this.results.push({
      resourceType,
      resourceName,
      status,
      error
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Scan and delete all Trinity Lambda functions
   */
  async cleanupLambdaFunctions() {
    console.log('🚀 Scanning Lambda functions...');
    
    try {
      const listCommand = new ListFunctionsCommand({});
      const response = await this.lambdaClient.send(listCommand);
      
      const trinityFunctions = response.Functions?.filter(func => 
        func.FunctionName && this.isTrinityResource(func.FunctionName)
      ) || [];

      console.log(`Found ${trinityFunctions.length} Trinity Lambda functions`);

      for (const func of trinityFunctions) {
        if (!func.FunctionName) continue;
        
        try {
          console.log(`  Deleting Lambda function: ${func.FunctionName}`);
          
          const deleteCommand = new DeleteFunctionCommand({
            FunctionName: func.FunctionName
          });
          
          await this.lambdaClient.send(deleteCommand);
          this.addResult('Lambda', func.FunctionName, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(1000);
          
        } catch (error) {
          console.error(`  Failed to delete Lambda function ${func.FunctionName}:`, error);
          this.addResult('Lambda', func.FunctionName, 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list Lambda functions:', error);
    }
  }

  /**
   * Scan and delete all Trinity DynamoDB tables
   */
  async cleanupDynamoDBTables() {
    console.log('🗄️ Scanning DynamoDB tables...');
    
    try {
      const listCommand = new ListTablesCommand({});
      const response = await this.dynamoClient.send(listCommand);
      
      const trinityTables = response.TableNames?.filter(tableName => 
        this.isTrinityResource(tableName)
      ) || [];

      console.log(`Found ${trinityTables.length} Trinity DynamoDB tables`);

      for (const tableName of trinityTables) {
        try {
          console.log(`  Deleting DynamoDB table: ${tableName}`);
          
          // Check if table exists and is not already being deleted
          const describeCommand = new DescribeTableCommand({ TableName: tableName });
          const tableInfo = await this.dynamoClient.send(describeCommand);
          
          if (tableInfo.Table?.TableStatus === 'DELETING') {
            console.log(`  Table ${tableName} is already being deleted`);
            this.addResult('DynamoDB', tableName, 'skipped', 'Already being deleted');
            continue;
          }
          
          const deleteCommand = new DeleteTableCommand({ TableName: tableName });
          await this.dynamoClient.send(deleteCommand);
          this.addResult('DynamoDB', tableName, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(2000);
          
        } catch (error) {
          console.error(`  Failed to delete DynamoDB table ${tableName}:`, error);
          this.addResult('DynamoDB', tableName, 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list DynamoDB tables:', error);
    }
  }

  /**
   * Scan and delete all Trinity CloudFormation stacks
   */
  async cleanupCloudFormationStacks() {
    console.log('☁️ Scanning CloudFormation stacks...');
    
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

      console.log(`Found ${trinityStacks.length} Trinity CloudFormation stacks`);

      for (const stack of trinityStacks) {
        if (!stack.StackName) continue;
        
        try {
          console.log(`  Deleting CloudFormation stack: ${stack.StackName}`);
          
          const deleteCommand = new DeleteStackCommand({
            StackName: stack.StackName
          });
          
          await this.cloudFormationClient.send(deleteCommand);
          this.addResult('CloudFormation', stack.StackName, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(3000);
          
        } catch (error) {
          console.error(`  Failed to delete CloudFormation stack ${stack.StackName}:`, error);
          this.addResult('CloudFormation', stack.StackName, 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list CloudFormation stacks:', error);
    }
  }

  /**
   * Scan and delete all Trinity AppSync APIs
   */
  async cleanupAppSyncAPIs() {
    console.log('🔗 Scanning AppSync GraphQL APIs...');
    
    try {
      const listCommand = new ListGraphqlApisCommand({});
      const response = await this.appSyncClient.send(listCommand);
      
      const trinityAPIs = response.graphqlApis?.filter(api => 
        api.name && this.isTrinityResource(api.name)
      ) || [];

      console.log(`Found ${trinityAPIs.length} Trinity AppSync APIs`);

      for (const api of trinityAPIs) {
        if (!api.apiId) continue;
        
        try {
          console.log(`  Deleting AppSync API: ${api.name} (${api.apiId})`);
          
          const deleteCommand = new DeleteGraphqlApiCommand({
            apiId: api.apiId
          });
          
          await this.appSyncClient.send(deleteCommand);
          this.addResult('AppSync', api.name || api.apiId, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(2000);
          
        } catch (error) {
          console.error(`  Failed to delete AppSync API ${api.name}:`, error);
          this.addResult('AppSync', api.name || api.apiId || 'unknown', 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list AppSync APIs:', error);
    }
  }

  /**
   * Scan and delete Trinity IAM roles
   */
  async cleanupIAMRoles() {
    console.log('🔐 Scanning IAM roles...');
    
    try {
      const listCommand = new ListRolesCommand({});
      const response = await this.iamClient.send(listCommand);
      
      const trinityRoles = response.Roles?.filter(role => 
        role.RoleName && this.isTrinityResource(role.RoleName)
      ) || [];

      console.log(`Found ${trinityRoles.length} Trinity IAM roles`);

      for (const role of trinityRoles) {
        if (!role.RoleName) continue;
        
        try {
          console.log(`  Cleaning up IAM role: ${role.RoleName}`);
          
          // Detach managed policies
          const attachedPoliciesCommand = new ListAttachedRolePoliciesCommand({
            RoleName: role.RoleName
          });
          const attachedPolicies = await this.iamClient.send(attachedPoliciesCommand);
          
          for (const policy of attachedPolicies.AttachedPolicies || []) {
            if (policy.PolicyArn) {
              await this.iamClient.send(new DetachRolePolicyCommand({
                RoleName: role.RoleName,
                PolicyArn: policy.PolicyArn
              }));
            }
          }
          
          // Delete inline policies
          const inlinePoliciesCommand = new ListRolePoliciesCommand({
            RoleName: role.RoleName
          });
          const inlinePolicies = await this.iamClient.send(inlinePoliciesCommand);
          
          for (const policyName of inlinePolicies.PolicyNames || []) {
            await this.iamClient.send(new DeleteRolePolicyCommand({
              RoleName: role.RoleName,
              PolicyName: policyName
            }));
          }
          
          // Delete the role
          const deleteCommand = new DeleteRoleCommand({
            RoleName: role.RoleName
          });
          
          await this.iamClient.send(deleteCommand);
          this.addResult('IAM Role', role.RoleName, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(1000);
          
        } catch (error) {
          console.error(`  Failed to delete IAM role ${role.RoleName}:`, error);
          this.addResult('IAM Role', role.RoleName, 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list IAM roles:', error);
    }
  }

  /**
   * Scan and delete Trinity S3 buckets
   */
  async cleanupS3Buckets() {
    console.log('🪣 Scanning S3 buckets...');
    
    try {
      const listCommand = new ListBucketsCommand({});
      const response = await this.s3Client.send(listCommand);
      
      const trinityBuckets = response.Buckets?.filter(bucket => 
        bucket.Name && this.isTrinityResource(bucket.Name)
      ) || [];

      console.log(`Found ${trinityBuckets.length} Trinity S3 buckets`);

      for (const bucket of trinityBuckets) {
        if (!bucket.Name) continue;
        
        try {
          console.log(`  Cleaning up S3 bucket: ${bucket.Name}`);
          
          // First, delete all objects in the bucket
          const listObjectsCommand = new ListObjectsV2Command({
            Bucket: bucket.Name
          });
          const objects = await this.s3Client.send(listObjectsCommand);
          
          if (objects.Contents && objects.Contents.length > 0) {
            const deleteObjectsCommand = new DeleteObjectsCommand({
              Bucket: bucket.Name,
              Delete: {
                Objects: objects.Contents.map(obj => ({ Key: obj.Key }))
              }
            });
            await this.s3Client.send(deleteObjectsCommand);
          }
          
          // Then delete the bucket
          const deleteBucketCommand = new DeleteBucketCommand({
            Bucket: bucket.Name
          });
          
          await this.s3Client.send(deleteBucketCommand);
          this.addResult('S3 Bucket', bucket.Name, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(2000);
          
        } catch (error) {
          console.error(`  Failed to delete S3 bucket ${bucket.Name}:`, error);
          this.addResult('S3 Bucket', bucket.Name, 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list S3 buckets:', error);
    }
  }

  /**
   * Scan and delete Trinity API Gateway APIs
   */
  async cleanupAPIGateway() {
    console.log('🌐 Scanning API Gateway APIs...');
    
    try {
      const listCommand = new GetRestApisCommand({});
      const response = await this.apiGatewayClient.send(listCommand);
      
      const trinityAPIs = response.items?.filter(api => 
        api.name && this.isTrinityResource(api.name)
      ) || [];

      console.log(`Found ${trinityAPIs.length} Trinity API Gateway APIs`);

      for (const api of trinityAPIs) {
        if (!api.id) continue;
        
        try {
          console.log(`  Deleting API Gateway API: ${api.name} (${api.id})`);
          
          const deleteCommand = new DeleteRestApiCommand({
            restApiId: api.id
          });
          
          await this.apiGatewayClient.send(deleteCommand);
          this.addResult('API Gateway', api.name || api.id, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(1000);
          
        } catch (error) {
          console.error(`  Failed to delete API Gateway API ${api.name}:`, error);
          this.addResult('API Gateway', api.name || api.id || 'unknown', 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list API Gateway APIs:', error);
    }
  }

  /**
   * Scan and delete Trinity Cognito User Pools
   */
  async cleanupCognitoUserPools() {
    console.log('👤 Scanning Cognito User Pools...');
    
    try {
      const listCommand = new ListUserPoolsCommand({ MaxResults: 60 });
      const response = await this.cognitoClient.send(listCommand);
      
      const trinityUserPools = response.UserPools?.filter(pool => 
        pool.Name && this.isTrinityResource(pool.Name)
      ) || [];

      console.log(`Found ${trinityUserPools.length} Trinity Cognito User Pools`);

      for (const pool of trinityUserPools) {
        if (!pool.Id) continue;
        
        try {
          console.log(`  Cleaning up Cognito User Pool: ${pool.Name} (${pool.Id})`);
          
          // First, delete all user pool clients
          const listClientsCommand = new ListUserPoolClientsCommand({
            UserPoolId: pool.Id
          });
          const clients = await this.cognitoClient.send(listClientsCommand);
          
          for (const client of clients.UserPoolClients || []) {
            if (client.ClientId) {
              await this.cognitoClient.send(new DeleteUserPoolClientCommand({
                UserPoolId: pool.Id,
                ClientId: client.ClientId
              }));
            }
          }
          
          // Then delete the user pool
          const deleteCommand = new DeleteUserPoolCommand({
            UserPoolId: pool.Id
          });
          
          await this.cognitoClient.send(deleteCommand);
          this.addResult('Cognito User Pool', pool.Name || pool.Id, 'deleted');
          
          // Add delay to avoid throttling
          await this.delay(2000);
          
        } catch (error) {
          console.error(`  Failed to delete Cognito User Pool ${pool.Name}:`, error);
          this.addResult('Cognito User Pool', pool.Name || pool.Id || 'unknown', 'failed', error.message);
        }
      }
    } catch (error) {
      console.error('Failed to list Cognito User Pools:', error);
    }
  }

  /**
   * Verify clean state after cleanup
   */
  async verifyCleanState() {
    console.log('🔍 Verifying clean state...');
    
    let isClean = true;
    
    try {
      // Check Lambda functions
      const lambdaResponse = await this.lambdaClient.send(new ListFunctionsCommand({}));
      const remainingLambdas = lambdaResponse.Functions?.filter(func => 
        func.FunctionName && this.isTrinityResource(func.FunctionName)
      ) || [];
      
      if (remainingLambdas.length > 0) {
        console.log(`❌ Found ${remainingLambdas.length} remaining Lambda functions:`);
        remainingLambdas.forEach(func => console.log(`  - ${func.FunctionName}`));
        isClean = false;
      } else {
        console.log('✅ No Trinity Lambda functions remaining');
      }
      
      // Check DynamoDB tables
      const dynamoResponse = await this.dynamoClient.send(new ListTablesCommand({}));
      const remainingTables = dynamoResponse.TableNames?.filter(tableName => 
        this.isTrinityResource(tableName)
      ) || [];
      
      if (remainingTables.length > 0) {
        console.log(`❌ Found ${remainingTables.length} remaining DynamoDB tables:`);
        remainingTables.forEach(table => console.log(`  - ${table}`));
        isClean = false;
      } else {
        console.log('✅ No Trinity DynamoDB tables remaining');
      }
      
      // Check AppSync APIs
      const appSyncResponse = await this.appSyncClient.send(new ListGraphqlApisCommand({}));
      const remainingAPIs = appSyncResponse.graphqlApis?.filter(api => 
        api.name && this.isTrinityResource(api.name)
      ) || [];
      
      if (remainingAPIs.length > 0) {
        console.log(`❌ Found ${remainingAPIs.length} remaining AppSync APIs:`);
        remainingAPIs.forEach(api => console.log(`  - ${api.name} (${api.apiId})`));
        isClean = false;
      } else {
        console.log('✅ No Trinity AppSync APIs remaining');
      }
      
    } catch (error) {
      console.error('Error during clean state verification:', error);
      isClean = false;
    }
    
    return isClean;
  }

  /**
   * Generate cleanup summary
   */
  generateSummary() {
    const summary = {
      totalResources: this.results.length,
      deletedResources: this.results.filter(r => r.status === 'deleted').length,
      failedResources: this.results.filter(r => r.status === 'failed').length,
      skippedResources: this.results.filter(r => r.status === 'skipped').length,
      results: this.results
    };
    
    return summary;
  }

  /**
   * Execute complete cleanup process
   */
  async executeCleanup() {
    console.log('🧹 Starting Trinity AWS Resource Cleanup...');
    console.log(`Region: ${REGION}`);
    console.log('⚠️  WARNING: This is a DESTRUCTIVE operation!');
    console.log('');
    
    // Execute cleanup in order of dependencies
    await this.cleanupLambdaFunctions();
    await this.cleanupAppSyncAPIs();
    await this.cleanupAPIGateway();
    await this.cleanupDynamoDBTables();
    await this.cleanupCognitoUserPools();
    await this.cleanupIAMRoles();
    await this.cleanupS3Buckets();
    await this.cleanupCloudFormationStacks();
    
    // Verify clean state
    const isClean = await this.verifyCleanState();
    
    const summary = this.generateSummary();
    
    console.log('\n📊 Cleanup Summary:');
    console.log(`Total resources processed: ${summary.totalResources}`);
    console.log(`Successfully deleted: ${summary.deletedResources}`);
    console.log(`Failed to delete: ${summary.failedResources}`);
    console.log(`Skipped: ${summary.skippedResources}`);
    console.log(`Clean state achieved: ${isClean ? '✅ Yes' : '❌ No'}`);
    
    if (summary.failedResources > 0) {
      console.log('\n❌ Failed deletions:');
      summary.results
        .filter(r => r.status === 'failed')
        .forEach(r => console.log(`  - ${r.resourceType}: ${r.resourceName} - ${r.error}`));
    }
    
    return summary;
  }
}

// Main execution
async function main() {
  try {
    const cleanup = new TrinityResourceCleanup();
    const summary = await cleanup.executeCleanup();
    
    // Exit with appropriate code
    process.exit(summary.failedResources > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('Fatal error during cleanup:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { TrinityResourceCleanup };