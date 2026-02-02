/**
 * Property Test: Complete Infrastructure Provisioning
 * Validates Requirements 1.1, 1.2, 1.3, 1.4
 * 
 * This property test ensures that all DynamoDB tables are correctly defined
 * in CDK and match the existing AWS infrastructure exactly.
 */

import * as fc from 'fast-check';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Property Test: Database Schema Consistency', () => {
  const dynamoClient = new DynamoDBClient({ region: 'eu-west-1' });
  
  const EXPECTED_TABLES = [
    'trinity-users-dev',
    'trinity-rooms-dev-v2',
    'trinity-room-members-dev',
    'trinity-room-invites-dev-v2',
    'trinity-votes-dev',
    'trinity-movies-cache-dev',
    'trinity-room-matches-dev',
    'trinity-connections-dev',
    'trinity-chat-sessions-dev',
    'trinity-room-movie-cache-dev',
    'trinity-room-cache-metadata-dev',
    'trinity-matchmaking-dev',
    'trinity-filter-cache',
  ] as const;

  beforeAll(() => {
    // Generate CDK template for testing
    try {
      execSync('npm run build', { cwd: process.cwd(), stdio: 'pipe' });
    } catch (error) {
      console.warn('Build failed, continuing with existing build');
    }
  });

  /**
   * Property 1: Complete Infrastructure Provisioning
   * For any valid environment configuration, all 12 DynamoDB tables must be defined in CDK
   */
  test('Property 1: All required tables are defined in CDK template', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('dev', 'staging', 'production'),
        async (environment) => {
          // Generate CDK template
          const templatePath = path.join(process.cwd(), `cdk-template-${environment}.json`);
          
          try {
            execSync(`TRINITY_ENV=${environment} cdk synth TrinityDatabaseStack > ${templatePath}`, {
              cwd: process.cwd(),
              stdio: 'pipe'
            });
            
            const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
            const cdkTables = extractTablesFromTemplate(template);
            
            // Property: All expected tables must be present in CDK template
            const cdkTableNames = Object.keys(cdkTables);
            const allTablesPresent = EXPECTED_TABLES.every(tableName => 
              cdkTableNames.includes(tableName)
            );
            
            // Cleanup
            if (fs.existsSync(templatePath)) {
              fs.unlinkSync(templatePath);
            }
            
            return allTablesPresent && cdkTableNames.length === EXPECTED_TABLES.length;
            
          } catch (error) {
            console.error(`Failed to generate template for ${environment}:`, error.message);
            return false;
          }
        }
      ),
      { numRuns: 10 } // Test all environments multiple times
    );
  });

  /**
   * Property 2: Schema Consistency
   * For any table that exists in both CDK and AWS, the schemas must match exactly
   */
  test('Property 2: CDK table schemas match AWS table schemas exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...EXPECTED_TABLES),
        async (tableName) => {
          try {
            // Get live table schema
            const liveTable = await getLiveTableSchema(tableName);
            if (!liveTable) {
              // If table doesn't exist in AWS, skip this test case
              return true;
            }
            
            // Get CDK table schema
            const cdkTable = await getCDKTableSchema(tableName);
            if (!cdkTable) {
              return false; // CDK should define all tables
            }
            
            // Property: Key schemas must match
            const keySchemaMatch = compareKeySchemas(
              liveTable.KeySchema || [],
              cdkTable.KeySchema || []
            );
            
            // Property: Attribute definitions must match
            const attributesMatch = compareAttributeDefinitions(
              liveTable.AttributeDefinitions || [],
              cdkTable.AttributeDefinitions || []
            );
            
            // Property: GSIs must match
            const gsiMatch = compareGlobalSecondaryIndexes(
              liveTable.GlobalSecondaryIndexes || [],
              cdkTable.GlobalSecondaryIndexes || []
            );
            
            // Property: Billing mode must match
            const billingMatch = liveTable.BillingModeSummary?.BillingMode === cdkTable.BillingMode;
            
            return keySchemaMatch && attributesMatch && gsiMatch && billingMatch;
            
          } catch (error) {
            console.error(`Error validating ${tableName}:`, error.message);
            return false;
          }
        }
      ),
      { numRuns: 100 } // Test each table multiple times
    );
  });

  /**
   * Property 3: Removal Policy Protection
   * All tables must have RemovalPolicy.RETAIN to protect existing data
   */
  test('Property 3: All tables have RemovalPolicy.RETAIN for data protection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...EXPECTED_TABLES),
        async (tableName) => {
          try {
            const templatePath = path.join(process.cwd(), 'cdk-template-retention.json');
            
            execSync(`cdk synth TrinityDatabaseStack > ${templatePath}`, {
              cwd: process.cwd(),
              stdio: 'pipe'
            });
            
            const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
            
            // Find the table resource in the template
            const tableResource = findTableResourceByName(template, tableName);
            
            // Cleanup
            if (fs.existsSync(templatePath)) {
              fs.unlinkSync(templatePath);
            }
            
            // Property: Table must have DeletionPolicy: Retain
            return tableResource?.DeletionPolicy === 'Retain';
            
          } catch (error) {
            console.error(`Error checking retention policy for ${tableName}:`, error.message);
            return false;
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4: Index Consistency
   * For any table with GSIs, the index definitions must match exactly
   */
  test('Property 4: Global Secondary Index definitions are consistent', async () => {
    const tablesWithGSIs = [
      'trinity-rooms-dev-v2',
      'trinity-room-members-dev',
      'trinity-room-movie-cache-dev',
      'trinity-room-cache-metadata-dev',
      'trinity-matchmaking-dev',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...tablesWithGSIs),
        async (tableName) => {
          try {
            const liveTable = await getLiveTableSchema(tableName);
            const cdkTable = await getCDKTableSchema(tableName);
            
            if (!liveTable || !cdkTable) {
              return false;
            }
            
            const liveGSIs = liveTable.GlobalSecondaryIndexes || [];
            const cdkGSIs = cdkTable.GlobalSecondaryIndexes || [];
            
            // Property: Same number of GSIs
            if (liveGSIs.length !== cdkGSIs.length) {
              return false;
            }
            
            // Property: Each GSI must match exactly
            for (const liveGSI of liveGSIs) {
              const cdkGSI = cdkGSIs.find(gsi => gsi.IndexName === liveGSI.IndexName);
              if (!cdkGSI) {
                return false;
              }
              
              // Check key schema match
              const keySchemaMatch = compareKeySchemas(
                liveGSI.KeySchema || [],
                cdkGSI.KeySchema || []
              );
              
              if (!keySchemaMatch) {
                return false;
              }
            }
            
            return true;
            
          } catch (error) {
            console.error(`Error validating GSIs for ${tableName}:`, error.message);
            return false;
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// Helper functions
function extractTablesFromTemplate(template: any): { [key: string]: any } {
  const tables: { [key: string]: any } = {};
  
  if (template.Resources) {
    for (const [resourceId, resource] of Object.entries(template.Resources as any)) {
      if (resource.Type === 'AWS::DynamoDB::Table') {
        const tableName = resource.Properties.TableName;
        if (tableName) {
          tables[tableName] = resource.Properties;
        }
      }
    }
  }
  
  return tables;
}

async function getLiveTableSchema(tableName: string): Promise<any> {
  try {
    const command = new DescribeTableCommand({ TableName: tableName });
    const response = await dynamoClient.send(command);
    return response.Table;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      return null; // Table doesn't exist
    }
    throw error;
  }
}

async function getCDKTableSchema(tableName: string): Promise<any> {
  try {
    const templatePath = path.join(process.cwd(), 'cdk-template-schema.json');
    
    execSync(`cdk synth TrinityDatabaseStack > ${templatePath}`, {
      cwd: process.cwd(),
      stdio: 'pipe'
    });
    
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const cdkTables = extractTablesFromTemplate(template);
    
    // Cleanup
    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }
    
    return cdkTables[tableName] || null;
  } catch (error) {
    return null;
  }
}

function compareKeySchemas(live: any[], cdk: any[]): boolean {
  if (live.length !== cdk.length) return false;
  
  const liveKeys = live.map(k => ({ name: k.AttributeName, type: k.KeyType }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cdkKeys = cdk.map(k => ({ name: k.AttributeName, type: k.KeyType }))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  return JSON.stringify(liveKeys) === JSON.stringify(cdkKeys);
}

function compareAttributeDefinitions(live: any[], cdk: any[]): boolean {
  if (live.length !== cdk.length) return false;
  
  const liveAttrs = live.map(a => ({ name: a.AttributeName, type: a.AttributeType }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const cdkAttrs = cdk.map(a => ({ name: a.AttributeName, type: a.AttributeType }))
    .sort((a, b) => a.name.localeCompare(b.name));
  
  return JSON.stringify(liveAttrs) === JSON.stringify(cdkAttrs);
}

function compareGlobalSecondaryIndexes(live: any[], cdk: any[]): boolean {
  if (live.length !== cdk.length) return false;
  
  // Sort by index name for consistent comparison
  const liveSorted = live.sort((a, b) => a.IndexName.localeCompare(b.IndexName));
  const cdkSorted = cdk.sort((a, b) => a.IndexName.localeCompare(b.IndexName));
  
  for (let i = 0; i < liveSorted.length; i++) {
    const liveIndex = liveSorted[i];
    const cdkIndex = cdkSorted[i];
    
    if (liveIndex.IndexName !== cdkIndex.IndexName) {
      return false;
    }
    
    const keySchemaMatch = compareKeySchemas(
      liveIndex.KeySchema || [],
      cdkIndex.KeySchema || []
    );
    
    if (!keySchemaMatch) {
      return false;
    }
  }
  
  return true;
}

function findTableResourceByName(template: any, tableName: string): any {
  if (!template.Resources) return null;
  
  for (const [resourceId, resource] of Object.entries(template.Resources as any)) {
    if (resource.Type === 'AWS::DynamoDB::Table' && 
        resource.Properties?.TableName === tableName) {
      return resource;
    }
  }
  
  return null;
}