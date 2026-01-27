#!/usr/bin/env node

/**
 * Deploy getAvailableGenres function fix to Lambda
 * This script deploys the updated movie handler with the missing getAvailableGenres function
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Deploying getAvailableGenres function fix...');

try {
  // Change to infrastructure directory
  process.chdir('infrastructure');
  
  console.log('📦 Building Lambda function...');
  
  // Build the TypeScript files
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('🔄 Deploying to AWS...');
  
  // Deploy the stack
  execSync('npx cdk deploy --require-approval never', { stdio: 'inherit' });
  
  console.log('✅ getAvailableGenres function deployed successfully!');
  console.log('');
  console.log('📱 The mobile app should now be able to load genres for both MOVIE and TV media types.');
  console.log('');
  console.log('🧪 Test the fix by:');
  console.log('1. Opening the mobile app');
  console.log('2. Going to create room modal');
  console.log('3. Switching between "Películas" and "Series"');
  console.log('4. Verifying that genres load without errors');

} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}
