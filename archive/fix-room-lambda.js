#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Room Lambda Function...');

try {
  // Change to infrastructure directory
  process.chdir('./infrastructure');
  
  console.log('📦 Building Lambda function...');
  
  // Build the TypeScript code
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('🚀 Deploying Lambda function...');
  
  // Deploy using CDK
  execSync('npx cdk deploy --require-approval never', { stdio: 'inherit' });
  
  console.log('✅ Room Lambda function fixed and deployed!');
  
} catch (error) {
  console.error('❌ Error fixing Room Lambda:', error.message);
  process.exit(1);
}