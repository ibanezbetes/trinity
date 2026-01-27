#!/usr/bin/env node

/**
 * Deploy getAvailableGenres function fix directly to Lambda
 * This script updates the Lambda function code directly without CDK
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Configure AWS
AWS.config.update({ region: 'us-east-1' });
const lambda = new AWS.Lambda();

console.log('🚀 Deploying getAvailableGenres function fix directly to Lambda...');

async function deployLambda() {
  try {
    // Create a zip file with the updated handler
    console.log('📦 Creating deployment package...');
    
    const zipBuffer = await createZipFile();
    
    console.log('🔄 Updating Lambda function...');
    
    // Update the Lambda function code
    const params = {
      FunctionName: 'TrinityMvpStack-MovieHandler', // Adjust function name if needed
      ZipFile: zipBuffer
    };
    
    const result = await lambda.updateFunctionCode(params).promise();
    
    console.log('✅ Lambda function updated successfully!');
    console.log(`📋 Function ARN: ${result.FunctionArn}`);
    console.log(`🔄 Last Modified: ${result.LastModified}`);
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
    
    if (error.code === 'ResourceNotFoundException') {
      console.log('');
      console.log('💡 Possible function names to try:');
      console.log('- TrinityMvpStack-MovieHandler');
      console.log('- trinity-movie-handler');
      console.log('- MovieHandler');
      console.log('');
      console.log('🔍 List all Lambda functions to find the correct name:');
      console.log('aws lambda list-functions --query "Functions[?contains(FunctionName, \'movie\') || contains(FunctionName, \'Movie\')].FunctionName"');
    }
    
    process.exit(1);
  }
}

async function createZipFile() {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks = [];
    
    archive.on('data', chunk => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    
    // Add the main handler file
    archive.file('infrastructure/src/handlers/movie.js', { name: 'movie.js' });
    
    // Add the content filter service
    archive.file('infrastructure/src/services/content-filter-service.js', { name: 'content-filter-service.js' });
    
    // Add package.json for dependencies
    const packageJson = {
      "name": "movie-handler",
      "version": "1.0.0",
      "main": "movie.js",
      "dependencies": {
        "@aws-sdk/client-dynamodb": "^3.0.0",
        "@aws-sdk/lib-dynamodb": "^3.0.0"
      }
    };
    
    archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });
    
    archive.finalize();
  });
}

// Check if archiver is available, if not, use a simpler approach
try {
  require('archiver');
  deployLambda();
} catch (e) {
  console.log('📦 archiver not found, using AWS CLI approach...');
  
  // Alternative: Use AWS CLI
  const { execSync } = require('child_process');
  
  try {
    console.log('🔍 Listing Lambda functions to find movie handler...');
    const result = execSync('aws lambda list-functions --query "Functions[?contains(FunctionName, \'movie\') || contains(FunctionName, \'Movie\')].FunctionName" --output table', { encoding: 'utf8' });
    console.log(result);
    
    console.log('');
    console.log('💡 Please run the following command manually with the correct function name:');
    console.log('');
    console.log('1. Create a zip file:');
    console.log('   cd infrastructure/src/handlers && zip -r ../../../movie-handler-fix.zip movie.js ../services/content-filter-service.js');
    console.log('');
    console.log('2. Update the Lambda function:');
    console.log('   aws lambda update-function-code --function-name [FUNCTION_NAME] --zip-file fileb://movie-handler-fix.zip');
    
  } catch (cliError) {
    console.error('❌ AWS CLI not available or not configured');
    console.log('');
    console.log('🔧 Manual deployment steps:');
    console.log('1. Go to AWS Lambda console');
    console.log('2. Find the movie handler function');
    console.log('3. Upload the updated movie.js file');
    console.log('4. Make sure content-filter-service.js is also available');
  }
}
