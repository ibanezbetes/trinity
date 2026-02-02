#!/usr/bin/env node
/**
 * Environment Configuration Validator
 * Validates that all required environment variables are present before deployment
 */

import { environmentLoader } from './load-env-config';

async function validateEnvironmentConfiguration(): Promise<void> {
  console.log('🔍 Validating environment configuration...');
  
  try {
    // Validate required variables
    environmentLoader.validateRequiredVariables();
    
    // Get all variables
    const allVars = environmentLoader.getAllVariables();
    const lambdaVars = environmentLoader.getLambdaEnvironmentVariables();
    
    console.log(`📊 Environment Statistics:`);
    console.log(`   - Total variables in .env: ${Object.keys(allVars).length}`);
    console.log(`   - Lambda variables: ${Object.keys(lambdaVars).length}`);
    
    // Check critical variables
    const criticalVars = [
      'AWS_REGION',
      'AWS_ACCOUNT_ID', 
      'TMDB_API_KEY',
      'GRAPHQL_API_URL'
    ];
    
    console.log('\n🔑 Critical Variables:');
    for (const varName of criticalVars) {
      const value = environmentLoader.getVariable(varName);
      if (value) {
        // Mask sensitive values
        const maskedValue = varName.includes('KEY') || varName.includes('SECRET') 
          ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
          : value;
        console.log(`   ✅ ${varName}: ${maskedValue}`);
      } else {
        console.log(`   ❌ ${varName}: NOT SET`);
      }
    }
    
    // Check CDK environment
    const cdkEnv = environmentLoader.getCDKEnvironment();
    console.log('\n🏗️ CDK Environment:');
    console.log(`   - Account: ${cdkEnv.account}`);
    console.log(`   - Region: ${cdkEnv.region}`);
    
    // Check Lambda environment variables (exclude AWS_REGION as it's reserved)
    console.log('\n🚀 Lambda Environment Variables:');
    const lambdaVarNames = Object.keys(lambdaVars).sort();
    for (const varName of lambdaVarNames) {
      const value = lambdaVars[varName];
      const maskedValue = varName.includes('KEY') || varName.includes('SECRET') || varName.includes('ACCESS')
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : value;
      console.log(`   - ${varName}: ${maskedValue}`);
    }
    
    console.log('\n✅ Environment configuration validation passed!');
    
  } catch (error) {
    console.error('\n❌ Environment configuration validation failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run validation if called directly
if (require.main === module) {
  validateEnvironmentConfiguration();
}

export { validateEnvironmentConfiguration };