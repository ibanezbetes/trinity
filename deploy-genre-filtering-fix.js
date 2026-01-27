/**
 * Deploy Genre Filtering Fix
 * 
 * This script deploys the updated Lambda package with the fixed genre filtering logic:
 * 1. Priority 1 (AND logic) now tries to get up to 30 items instead of 15
 * 2. Fixed OR logic implementation using individual genre searches
 * 3. Better prioritization to show Priority 1 content first
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function deployGenreFilteringFix() {
  console.log('🚀 Deploying Genre Filtering Fix...\n');

  try {
    // 1. Create the Lambda package
    console.log('📦 Creating Lambda deployment package...');
    const zipBuffer = await createLambdaPackage();
    
    // 2. Update the Lambda function
    console.log('🔄 Updating Lambda function...');
    const updateResult = await lambda.updateFunctionCode({
      FunctionName: 'trinity-movie-dev',
      ZipFile: zipBuffer
    }).promise();
    
    console.log('✅ Lambda function updated successfully');
    console.log(`   Function ARN: ${updateResult.FunctionArn}`);
    console.log(`   Last Modified: ${updateResult.LastModified}`);
    console.log(`   Code Size: ${updateResult.CodeSize} bytes`);
    
    // 3. Wait for the update to complete
    console.log('\n⏳ Waiting for function update to complete...');
    await waitForFunctionUpdate();
    
    console.log('\n🎯 Genre Filtering Fix Deployed Successfully!');
    console.log('\n📋 Changes Applied:');
    console.log('   ✅ Priority 1 (AND logic) now fetches up to 30 items instead of 15');
    console.log('   ✅ Fixed OR logic using individual genre searches instead of pipe-separated');
    console.log('   ✅ Better filtering to exclude Priority 1 content from Priority 2');
    console.log('   ✅ Multi-page fetching for more Priority 1 content');
    
    console.log('\n🧪 Ready for Testing:');
    console.log('   - Animation + Comedy should now show mostly Priority 1 content');
    console.log('   - Priority 2 content should only appear when Priority 1 is exhausted');
    console.log('   - No more "Friends" or "Modern Family" mixed with animated comedies');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    throw error;
  }
}

async function createLambdaPackage() {
  return new Promise((resolve, reject) => {
    const output = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('data', (chunk) => output.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(output)));
    archive.on('error', reject);
    
    // Add the main handler file
    archive.file('lambda-package-final/movie.js', { name: 'movie.js' });
    archive.file('lambda-package-final/package.json', { name: 'package.json' });
    
    // Add services directory
    archive.directory('lambda-package-final/services/', 'services/');
    archive.directory('lambda-package-final/types/', 'types/');
    archive.directory('lambda-package-final/utils/', 'utils/');
    
    // Add the updated infrastructure services
    archive.file('infrastructure/src/services/content-filter-service.js', { name: 'services/content-filter-service.js' });
    archive.file('infrastructure/src/services/enhanced-tmdb-client.js', { name: 'services/enhanced-tmdb-client.js' });
    archive.file('infrastructure/src/services/priority-algorithm.js', { name: 'services/priority-algorithm.js' });
    
    archive.finalize();
  });
}

async function waitForFunctionUpdate() {
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    try {
      const result = await lambda.getFunctionConfiguration({
        FunctionName: 'trinity-movie-dev'
      }).promise();
      
      if (result.State === 'Active') {
        console.log('✅ Function is active and ready');
        return;
      }
      
      console.log(`   State: ${result.State}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      
    } catch (error) {
      console.log(`   Attempt ${attempts + 1}: ${error.message}`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('Function update did not complete within expected time');
}

// Run the deployment
deployGenreFilteringFix().catch(console.error);
