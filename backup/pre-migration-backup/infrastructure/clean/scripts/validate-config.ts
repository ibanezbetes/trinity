#!/usr/bin/env node
/**
 * Configuration Validation Script
 * Validates Trinity configuration from both Parameter Store and environment variables
 */

import { ConfigLoader, ConfigUtils } from '../src/shared/config-loader';
import { logger } from '../src/shared/logger';

async function validateConfiguration(): Promise<void> {
  console.log('🔍 Trinity Configuration Validation');
  console.log('─'.repeat(50));

  try {
    const loader = new ConfigLoader();
    const summary = await loader.getConfigurationSummary();

    // Display summary
    console.log(`Environment: ${summary.environment}`);
    console.log(`Region: ${summary.region}`);
    console.log(`Parameter Count: ${summary.parameterCount}`);
    console.log(`Parameter Store Connectivity: ${summary.connectivity ? '✅' : '❌'}`);
    console.log('');

    // Display validation results
    if (summary.validation.isValid) {
      console.log('✅ Configuration validation PASSED');
    } else {
      console.log('❌ Configuration validation FAILED');
      
      if (summary.validation.missingParameters.length > 0) {
        console.log('\n📋 Missing Parameters:');
        summary.validation.missingParameters.forEach(param => {
          console.log(`  ❌ ${param}`);
        });
      }

      if (summary.validation.invalidParameters.length > 0) {
        console.log('\n⚠️ Invalid Parameters:');
        summary.validation.invalidParameters.forEach(param => {
          console.log(`  ⚠️ ${param}`);
        });
      }

      if (summary.validation.errors.length > 0) {
        console.log('\n🚨 Validation Errors:');
        summary.validation.errors.forEach(error => {
          console.log(`  🚨 ${error}`);
        });
      }
    }

    // List all parameters
    console.log('\n📋 Parameter Store Contents:');
    const parameters = await loader.listTrinityParameters();
    
    if (parameters.length === 0) {
      console.log('  ⚠️ No parameters found. Run "npm run hydrate-ssm" to create them.');
    } else {
      parameters.forEach(param => {
        const typeIcon = param.type === 'SecureString' ? '🔒' : '📝';
        const lastModified = param.lastModified ? param.lastModified.toISOString().split('T')[0] : 'Unknown';
        console.log(`  ${typeIcon} ${param.name} (v${param.version || 1}, ${lastModified})`);
      });
    }

    // Test configuration loading
    console.log('\n🧪 Testing Configuration Loading:');
    try {
      const config = await ConfigUtils.loadConfig();
      console.log('✅ Configuration loaded successfully');
      console.log(`  - External API endpoints: ${Object.keys(config.external).length}`);
      console.log(`  - DynamoDB tables: ${Object.keys(config.tables).length}`);
      console.log(`  - Feature flags: ${config.featureFlags ? Object.keys(config.featureFlags).length : 0}`);
    } catch (error) {
      console.log('❌ Configuration loading failed');
      console.log(`  Error: ${(error as Error).message}`);
    }

    console.log('\n─'.repeat(50));
    
    if (summary.validation.isValid && summary.connectivity) {
      console.log('🎉 All configuration checks passed!');
      process.exit(0);
    } else {
      console.log('⚠️ Configuration issues detected. Please review and fix.');
      process.exit(1);
    }

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Configuration validation failed:', err.message);
    process.exit(1);
  }
}

// Run validation
if (require.main === module) {
  validateConfiguration();
}

export { validateConfiguration };