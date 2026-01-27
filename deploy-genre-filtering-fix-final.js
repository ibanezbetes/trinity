/**
 * Deploy Genre Filtering Fix - Final Solution
 * 
 * Fixes the genre validation logic in the TMDB client to properly handle:
 * - AND logic: Movies must have ALL requested genres (can have additional ones)
 * - OR logic: Movies must have AT LEAST ONE of the requested genres
 * 
 * This fixes the issue where movies with additional genres were being rejected.
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function deployGenreFilteringFix() {
  try {
    console.log('🔧 Deploying Genre Filtering Fix...');
    console.log('');

    // 1. Create deployment package
    console.log('📦 Creating Lambda deployment package...');
    const zipBuffer = await createLambdaPackage();
    
    // 2. Update Lambda function
    console.log('🚀 Updating Lambda function...');
    await updateLambdaFunction(zipBuffer);
    
    console.log('');
    console.log('✅ Genre Filtering Fix deployed successfully!');
    console.log('');
    console.log('🎯 What was fixed:');
    console.log('- AND logic: Movies must have ALL requested genres (can have additional ones)');
    console.log('- OR logic: Movies must have AT LEAST ONE of the requested genres');
    console.log('- Pipe-separated genres (|) now properly handled for OR logic');
    console.log('- Comma-separated genres (,) now properly handled for AND logic');
    console.log('');
    console.log('📱 Expected behavior:');
    console.log('- Room with Animación (16) + Comedia (35) will show movies that have BOTH genres');
    console.log('- Movies with additional genres (like Familia) will NOT be rejected');
    console.log('- Priority 1: Movies with ALL selected genres');
    console.log('- Priority 2: Movies with ANY selected genre');
    console.log('- Priority 3: Popular movies as fallback');

  } catch (error) {
    console.error('❌ Error deploying genre filtering fix:', error);
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

    // Add main handler
    archive.file('lambda-package-final/movie.js', { name: 'movie.js' });
    archive.file('lambda-package-final/package.json', { name: 'package.json' });

    // Add services
    archive.directory('lambda-package-final/services/', 'services/');
    archive.directory('lambda-package-final/types/', 'types/');
    archive.directory('lambda-package-final/utils/', 'utils/');

    archive.finalize();
  });
}

async function updateLambdaFunction(zipBuffer) {
  const functionName = 'trinity-movie-dev';
  
  const params = {
    FunctionName: functionName,
    ZipFile: zipBuffer,
    Publish: true
  };

  try {
    const result = await lambda.updateFunctionCode(params).promise();
    console.log(`✅ Lambda function updated: ${result.FunctionName}`);
    console.log(`📝 Version: ${result.Version}`);
    console.log(`🔄 Last Modified: ${result.LastModified}`);
    
    // Wait for function to be ready
    console.log('⏳ Waiting for function to be ready...');
    await waitForFunctionReady(functionName);
    
  } catch (error) {
    console.error('❌ Error updating Lambda function:', error);
    throw error;
  }
}

async function waitForFunctionReady(functionName) {
  const maxAttempts = 30;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const result = await lambda.getFunctionConfiguration({
        FunctionName: functionName
      }).promise();
      
      if (result.State === 'Active') {
        console.log('✅ Function is ready');
        return;
      }
      
      console.log(`⏳ Function state: ${result.State}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      
    } catch (error) {
      console.log(`⚠️ Error checking function state: ${error.message}`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('Function did not become ready within timeout');
}

// Run the deployment
if (require.main === module) {
  deployGenreFilteringFix()
    .then(() => {
      console.log('🎉 Deployment completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Deployment failed:', error);
      process.exit(1);
    });
}

module.exports = { deployGenreFilteringFix };
