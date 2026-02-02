#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';

interface DataValidationResult {
  table: string;
  status: 'PASS' | 'FAIL';
  itemCount: number;
  sampleData: any;
  errors?: string[];
}

class DataIntegrityValidator {
  private readonly region = 'eu-west-1';
  private results: DataValidationResult[] = [];

  async validateAll(): Promise<DataValidationResult[]> {
    console.log('🔍 Validating Data Integrity...');
    console.log('📋 Ensuring all data is readable via new CDK-managed infrastructure');
    
    const tables = [
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

    for (const table of tables) {
      await this.validateTable(table);
    }
    
    this.generateReport();
    return this.results;
  }

  private async validateTable(tableName: string): Promise<void> {
    console.log(`\n📊 Validating table: ${tableName}`);
    
    try {
      // Get item count
      const countOutput = execSync(
        `aws dynamodb scan --table-name ${tableName} --select COUNT --region ${this.region} --query "Count" --output text`,
        { encoding: 'utf8' }
      );
      
      const itemCount = parseInt(countOutput.trim());
      
      // Get sample data (first 3 items)
      const sampleOutput = execSync(
        `aws dynamodb scan --table-name ${tableName} --limit 3 --region ${this.region} --output json`,
        { encoding: 'utf8' }
      );
      
      const sampleData = JSON.parse(sampleOutput);
      
      this.results.push({
        table: tableName,
        status: 'PASS',
        itemCount,
        sampleData: sampleData.Items || []
      });
      
      console.log(`   ✅ ${itemCount} items accessible`);
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      this.results.push({
        table: tableName,
        status: 'FAIL',
        itemCount: 0,
        sampleData: null,
        errors: [err.message]
      });
      
      console.log(`   ❌ Failed to access table: ${err.message}`);
    }
  }

  private generateReport(): void {
    const reportPath = 'data-integrity-report.json';
    
    const summary = {
      timestamp: new Date().toISOString(),
      totalTables: this.results.length,
      accessibleTables: this.results.filter(r => r.status === 'PASS').length,
      failedTables: this.results.filter(r => r.status === 'FAIL').length,
      totalItems: this.results.reduce((sum, r) => sum + r.itemCount, 0),
      overallStatus: this.results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL'
    };
    
    const report = {
      summary,
      details: this.results
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n📊 Data Integrity Summary:');
    console.log(`   Total Tables: ${summary.totalTables}`);
    console.log(`   Accessible: ${summary.accessibleTables}`);
    console.log(`   Failed: ${summary.failedTables}`);
    console.log(`   Total Items: ${summary.totalItems}`);
    console.log(`   Overall Status: ${summary.overallStatus}`);
    console.log(`   Report saved to: ${reportPath}`);
    
    if (summary.overallStatus === 'PASS') {
      console.log('\n🎉 All data is accessible via CDK-managed infrastructure!');
      console.log('✅ Data integrity validation - PASSED');
    } else {
      console.log('\n⚠️ Some tables failed data integrity validation');
      console.log('❌ Data integrity validation - FAILED');
      
      const failedTables = this.results.filter(r => r.status === 'FAIL');
      failedTables.forEach(table => {
        console.log(`   ❌ ${table.table}: ${table.errors?.join(', ')}`);
      });
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const validator = new DataIntegrityValidator();
  validator.validateAll().then(results => {
    const overallStatus = results.every(r => r.status === 'PASS');
    process.exit(overallStatus ? 0 : 1);
  }).catch(error => {
    console.error('💥 Validation failed:', error);
    process.exit(1);
  });
}

export { DataIntegrityValidator };