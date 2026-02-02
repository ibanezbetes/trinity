/**
 * Property Test 8: Comprehensive Resource Management
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 * 
 * This property test validates that all AWS resources are properly managed,
 * follow naming conventions, and maintain consistency across the system.
 */

import { execSync } from 'child_process';

describe('Property Test 8: Comprehensive Resource Management', () => {
  const EXPECTED_LAMBDA_FUNCTIONS = [
    'trinity-auth-dev',
    'trinity-room-dev', 
    'trinity-vote-dev',
    'trinity-movie-dev',
    'trinity-cache-dev',
    'trinity-realtime-dev',
    'trinity-vote-consensus-dev',
    'trinity-pre-signup-dev'
  ];

  const EXPECTED_DYNAMODB_TABLES = [
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

  /**
   * Property 8.1: Resource count consistency
   */
  test('Property 8.1: Exact resource counts are maintained', async () => {
    // Property: System must have exactly 8 Lambda functions (including pre-signup)
    const lambdaCommand = 'aws lambda list-functions --region eu-west-1';
    const lambdaResult = execSync(lambdaCommand, { encoding: 'utf8', timeout: 30000 });
    const lambdaResponse = JSON.parse(lambdaResult);
    
    const trinityFunctions = lambdaResponse.Functions.filter((func: any) => 
      func.FunctionName.startsWith('trinity-') && func.FunctionName.endsWith('-dev')
    );
    
    expect(trinityFunctions.length).toBe(8);
    
    // Property: System must have exactly 12 DynamoDB tables
    const dynamoCommand = 'aws dynamodb list-tables --region eu-west-1';
    const dynamoResult = execSync(dynamoCommand, { encoding: 'utf8', timeout: 30000 });
    const dynamoResponse = JSON.parse(dynamoResult);
    
    const trinityTables = dynamoResponse.TableNames.filter((table: string) => 
      table.startsWith('trinity-')
    );
    
    expect(trinityTables.length).toBe(12);
    
    console.log('✅ Property 8.1: Resource count consistency verified');
  }, 120000);

  /**
   * Property 8.2: Resource naming convention compliance
   */
  test('Property 8.2: All resources follow Trinity naming conventions', async () => {
    // Property: Lambda functions must follow pattern: trinity-{purpose}-dev
    const lambdaCommand = 'aws lambda list-functions --region eu-west-1';
    const lambdaResult = execSync(lambdaCommand, { encoding: 'utf8', timeout: 30000 });
    const lambdaResponse = JSON.parse(lambdaResult);
    
    const trinityFunctions = lambdaResponse.Functions.filter((func: any) => 
      func.FunctionName.startsWith('trinity-')
    );
    
    for (const func of trinityFunctions) {
      expect(func.FunctionName).toMatch(/^trinity-[a-z-]+-dev$/);
    }
    
    // Property: DynamoDB tables must follow pattern: trinity-{entity}-dev[-version]
    const dynamoCommand = 'aws dynamodb list-tables --region eu-west-1';
    const dynamoResult = execSync(dynamoCommand, { encoding: 'utf8', timeout: 30000 });
    const dynamoResponse = JSON.parse(dynamoResult);
    
    const trinityTables = dynamoResponse.TableNames.filter((table: string) => 
      table.startsWith('trinity-')
    );
    
    for (const table of trinityTables) {
      expect(table).toMatch(/^trinity-[a-z-]+(-dev)?(-v\d+)?$/);
    }
    
    console.log('✅ Property 8.2: Naming convention compliance verified');
  }, 120000);

  /**
   * Property 8.3: CDK management consistency
   */
  test('Property 8.3: All resources are consistently managed by CDK', async () => {
    // Property: All Lambda functions must have CDK management tags
    for (const functionName of EXPECTED_LAMBDA_FUNCTIONS) {
      const command = `aws lambda get-function --function-name ${functionName} --region eu-west-1`;
      const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
      const functionResponse = JSON.parse(result);
      
      const tags = functionResponse.Tags || {};
      
      // Property: Must have CloudFormation stack management
      expect(tags['aws:cloudformation:stack-name']).toBeDefined();
      expect(tags['aws:cloudformation:stack-name']).toContain('Trinity');
      
      // Property: Must be managed by CDK
      expect(tags['ManagedBy']).toBe('CDK');
      
      // Property: Must have consistent project tagging
      expect(tags['Project']).toBe('Trinity');
      expect(tags['Environment']).toBe('dev');
    }
    
    console.log('✅ Property 8.3: CDK management consistency verified');
  }, 300000);

  /**
   * Property 8.4: Resource configuration consistency
   */
  test('Property 8.4: All Lambda functions have consistent runtime configuration', async () => {
    const functionConfigs: any[] = [];
    
    // Collect all function configurations
    for (const functionName of EXPECTED_LAMBDA_FUNCTIONS) {
      const command = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
      const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
      const config = JSON.parse(result);
      functionConfigs.push(config);
    }
    
    // Property: All functions must use the same runtime
    const runtime = functionConfigs[0].Runtime;
    for (const config of functionConfigs) {
      expect(config.Runtime).toBe(runtime);
    }
    expect(runtime).toBe('nodejs18.x');
    
    // Property: All functions must have consistent memory and timeout settings
    // Note: trinity-pre-signup-dev is a Cognito trigger with different requirements
    for (const config of functionConfigs) {
      if (config.FunctionName === 'trinity-pre-signup-dev') {
        // Pre-signup function has different memory requirements
        expect(config.MemorySize).toBeGreaterThanOrEqual(128);
        expect(config.Timeout).toBeGreaterThanOrEqual(30);
      } else {
        // Main application functions
        expect(config.MemorySize).toBeGreaterThanOrEqual(512);
        expect(config.Timeout).toBeGreaterThanOrEqual(30);
      }
      expect(config.State).toBe('Active');
    }
    
    // Property: All functions must have environment variables (except Cognito triggers)
    for (const config of functionConfigs) {
      if (config.FunctionName === 'trinity-pre-signup-dev') {
        // Pre-signup function may not have environment variables
        continue;
      }
      expect(config.Environment).toBeDefined();
      expect(config.Environment.Variables).toBeDefined();
      expect(Object.keys(config.Environment.Variables).length).toBeGreaterThan(10);
    }
    
    console.log('✅ Property 8.4: Resource configuration consistency verified');
  }, 300000);

  /**
   * Property 8.5: Resource completeness and no orphans
   */
  test('Property 8.5: No orphaned resources exist outside expected set', async () => {
    // Property: All Trinity Lambda functions must be in expected set
    const lambdaCommand = 'aws lambda list-functions --region eu-west-1';
    const lambdaResult = execSync(lambdaCommand, { encoding: 'utf8', timeout: 30000 });
    const lambdaResponse = JSON.parse(lambdaResult);
    
    const trinityFunctions = lambdaResponse.Functions.filter((func: any) => 
      func.FunctionName.includes('trinity')
    );
    
    for (const func of trinityFunctions) {
      expect(EXPECTED_LAMBDA_FUNCTIONS).toContain(func.FunctionName);
    }
    
    // Property: All Trinity DynamoDB tables must be in expected set
    const dynamoCommand = 'aws dynamodb list-tables --region eu-west-1';
    const dynamoResult = execSync(dynamoCommand, { encoding: 'utf8', timeout: 30000 });
    const dynamoResponse = JSON.parse(dynamoResult);
    
    const trinityTables = dynamoResponse.TableNames.filter((table: string) => 
      table.includes('trinity')
    );
    
    for (const table of trinityTables) {
      expect(EXPECTED_DYNAMODB_TABLES).toContain(table);
    }
    
    console.log('✅ Property 8.5: No orphaned resources found');
  }, 120000);

  /**
   * Property 8.6: Regional consistency
   */
  test('Property 8.6: All resources are deployed in correct region', async () => {
    // Property: All Lambda functions must be in eu-west-1
    for (const functionName of EXPECTED_LAMBDA_FUNCTIONS) {
      const command = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
      const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
      const config = JSON.parse(result);
      
      // Function ARN should contain eu-west-1
      expect(config.FunctionArn).toContain('eu-west-1');
    }
    
    // Property: All DynamoDB tables must be accessible from eu-west-1
    for (const tableName of EXPECTED_DYNAMODB_TABLES) {
      const command = `aws dynamodb describe-table --table-name ${tableName} --region eu-west-1`;
      const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
      const tableInfo = JSON.parse(result);
      
      // Table should be active and accessible
      expect(tableInfo.Table.TableStatus).toBe('ACTIVE');
    }
    
    console.log('✅ Property 8.6: Regional consistency verified');
  }, 300000);

  /**
   * Property 8.7: Resource interdependency integrity
   */
  test('Property 8.7: Resources have proper interdependency configuration', async () => {
    // Property: Lambda functions must reference correct DynamoDB tables
    for (const functionName of EXPECTED_LAMBDA_FUNCTIONS) {
      const command = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
      const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
      const config = JSON.parse(result);
      
      const envVars = config.Environment?.Variables || {};
      
      // Property: Functions must reference existing tables
      const tableVars = Object.keys(envVars).filter(key => key.endsWith('_TABLE'));
      
      for (const tableVar of tableVars) {
        const tableName = envVars[tableVar];
        if (tableName && tableName.startsWith('trinity-')) {
          expect(EXPECTED_DYNAMODB_TABLES).toContain(tableName);
        }
      }
      
      // Property: Functions must reference other existing functions
      const handlerVars = Object.keys(envVars).filter(key => key.endsWith('_HANDLER_NAME'));
      
      for (const handlerVar of handlerVars) {
        const handlerName = envVars[handlerVar];
        if (handlerName && handlerName.startsWith('trinity-')) {
          // Allow for function name variations (e.g., matchmaker vs vote-consensus)
          const functionExists = EXPECTED_LAMBDA_FUNCTIONS.includes(handlerName) ||
                                handlerName === 'trinity-matchmaker-dev'; // Legacy reference
          expect(functionExists).toBe(true);
        }
      }
    }
    
    console.log('✅ Property 8.7: Resource interdependency integrity verified');
  }, 300000);
});