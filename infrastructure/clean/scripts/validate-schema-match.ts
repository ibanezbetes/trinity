#!/usr/bin/env node
/**
 * Schema Validation Script
 * Compares CDK-generated CloudFormation template against live DynamoDB tables
 * Ensures perfect match before CDK import operation
 */

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TableSchema {
  tableName: string;
  keySchema: any[];
  attributeDefinitions: any[];
  globalSecondaryIndexes?: any[];
  localSecondaryIndexes?: any[];
  billingMode: string;
  streamSpecification?: any;
  timeToLiveDescription?: any;
}

class SchemaValidator {
  private dynamoClient = new DynamoDBClient({ region: 'eu-west-1' });
  
  private expectedTables = [
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
    'trinity-filter-cache',
  ];

  async validateAll(): Promise<boolean> {
    console.log('🔍 Trinity Schema Validation');
    console.log('Comparing CDK definitions with live AWS tables');
    console.log('─'.repeat(60));

    // Generate CloudFormation template
    console.log('📋 Generating CloudFormation template...');
    const templatePath = path.join(process.cwd(), 'cdk-template.json');
    
    try {
      // Use stderr redirection to avoid warnings in JSON output
      const synthOutput = execSync('npm run build && cdk synth TrinityDatabaseStack --json 2>/dev/null || cdk synth TrinityDatabaseStack --json', { 
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'pipe' 
      });
      
      // Extract JSON from output (skip warnings and notices)
      const lines = synthOutput.split('\n');
      const jsonStartIndex = lines.findIndex(line => line.trim().startsWith('{'));
      
      // Find last closing brace (use reverse iteration instead of findLastIndex)
      let jsonEndIndex = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().endsWith('}')) {
          jsonEndIndex = i;
          break;
        }
      }
      
      if (jsonStartIndex === -1 || jsonEndIndex === -1) {
        console.error('❌ Could not find JSON in CDK output');
        return false;
      }
      
      const jsonContent = lines.slice(jsonStartIndex, jsonEndIndex + 1).join('\n');
      fs.writeFileSync(templatePath, jsonContent);
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('❌ Failed to generate CDK template:', err.message);
      return false;
    }

    // Load CDK template
    if (!fs.existsSync(templatePath)) {
      console.error('❌ CDK template not found');
      return false;
    }

    let template;
    try {
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      template = JSON.parse(templateContent);
    } catch (error) {
      console.error('❌ Failed to parse CDK template as JSON:', error);
      return false;
    }
    const cdkTables = this.extractTablesFromTemplate(template);

    console.log(`📊 Found ${Object.keys(cdkTables).length} tables in CDK template`);

    // Validate each table
    let allValid = true;
    for (const tableName of this.expectedTables) {
      console.log(`\n🔍 Validating ${tableName}...`);
      
      const isValid = await this.validateTable(tableName, cdkTables[tableName]);
      if (!isValid) {
        allValid = false;
      }
    }

    // Cleanup
    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }

    console.log('\n' + '─'.repeat(60));
    console.log(allValid ? '✅ All schemas match!' : '❌ Schema mismatches found!');
    
    return allValid;
  }

  private extractTablesFromTemplate(template: any): { [key: string]: any } {
    const tables: { [key: string]: any } = {};
    
    if (template.Resources) {
      for (const [resourceId, resource] of Object.entries(template.Resources as any)) {
        const res = resource as any;
        if (res.Type === 'AWS::DynamoDB::Table') {
          const tableName = res.Properties.TableName;
          if (tableName) {
            tables[tableName] = res.Properties;
          }
        }
      }
    }
    
    return tables;
  }

  private async validateTable(tableName: string, cdkDefinition: any): Promise<boolean> {
    try {
      // Get live table description
      const command = new DescribeTableCommand({ TableName: tableName });
      const response = await this.dynamoClient.send(command);
      const liveTable = response.Table;

      if (!liveTable) {
        console.error(`❌ Table ${tableName} not found in AWS`);
        return false;
      }

      if (!cdkDefinition) {
        console.error(`❌ Table ${tableName} not found in CDK template`);
        return false;
      }

      // Validate key schema
      const keySchemaMatch = this.compareKeySchema(
        liveTable.KeySchema || [],
        cdkDefinition.KeySchema || []
      );

      // Validate attribute definitions
      const attributesMatch = this.compareAttributeDefinitions(
        liveTable.AttributeDefinitions || [],
        cdkDefinition.AttributeDefinitions || []
      );

      // Validate GSIs
      const gsiMatch = this.compareGlobalSecondaryIndexes(
        liveTable.GlobalSecondaryIndexes || [],
        cdkDefinition.GlobalSecondaryIndexes || []
      );

      // Validate billing mode
      const billingMatch = liveTable.BillingModeSummary?.BillingMode === cdkDefinition.BillingMode;

      const isValid = keySchemaMatch && attributesMatch && gsiMatch && billingMatch;

      if (isValid) {
        console.log(`✅ ${tableName} - Schema matches`);
      } else {
        console.log(`❌ ${tableName} - Schema mismatch:`);
        if (!keySchemaMatch) console.log('  - Key schema mismatch');
        if (!attributesMatch) console.log('  - Attribute definitions mismatch');
        if (!gsiMatch) console.log('  - Global Secondary Indexes mismatch');
        if (!billingMatch) console.log('  - Billing mode mismatch');
      }

      return isValid;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ Error validating ${tableName}:`, err.message);
      return false;
    }
  }

  private compareKeySchema(live: any[], cdk: any[]): boolean {
    if (live.length !== cdk.length) return false;
    
    const liveKeys = live.map(k => ({ name: k.AttributeName, type: k.KeyType }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const cdkKeys = cdk.map(k => ({ name: k.AttributeName, type: k.KeyType }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return JSON.stringify(liveKeys) === JSON.stringify(cdkKeys);
  }

  private compareAttributeDefinitions(live: any[], cdk: any[]): boolean {
    if (live.length !== cdk.length) return false;
    
    const liveAttrs = live.map(a => ({ name: a.AttributeName, type: a.AttributeType }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const cdkAttrs = cdk.map(a => ({ name: a.AttributeName, type: a.AttributeType }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    return JSON.stringify(liveAttrs) === JSON.stringify(cdkAttrs);
  }

  private compareGlobalSecondaryIndexes(live: any[], cdk: any[]): boolean {
    if (live.length !== cdk.length) return false;
    
    // Compare index names and key schemas
    for (const liveIndex of live) {
      const cdkIndex = cdk.find(i => i.IndexName === liveIndex.IndexName);
      if (!cdkIndex) return false;
      
      const keySchemaMatch = this.compareKeySchema(
        liveIndex.KeySchema || [],
        cdkIndex.KeySchema || []
      );
      
      if (!keySchemaMatch) return false;
    }
    
    return true;
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new SchemaValidator();
  validator.validateAll().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Schema validation failed:', error);
    process.exit(1);
  });
}

export { SchemaValidator };