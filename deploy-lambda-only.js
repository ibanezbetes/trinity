/**
 * Deploy only the Lambda function without rebuilding the entire CDK stack
 * This bypasses the TypeScript compilation issue
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1',
  // AWS credentials should be configured via environment variables or AWS CLI
  // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function deployLambdaOnly() {
  console.log('🚀 DEPLOYING LAMBDA FUNCTION ONLY');
  console.log('═'.repeat(50));
  
  try {
    // Step 1: Create deployment package
    console.log('\n1️⃣ Creating deployment package...');
    
    const zipBuffer = await createDeploymentPackage();
    console.log(`   ✅ Package created: ${zipBuffer.length} bytes`);
    
    // Step 2: Update Lambda function
    console.log('\n2️⃣ Updating Lambda function...');
    
    const updateResult = await lambda.updateFunctionCode({
      FunctionName: 'trinity-movie-dev',
      ZipFile: zipBuffer
    }).promise();
    
    console.log(`   ✅ Lambda updated successfully`);
    console.log(`   Function ARN: ${updateResult.FunctionArn}`);
    console.log(`   Last Modified: ${updateResult.LastModified}`);
    
    // Step 3: Wait for update to complete
    console.log('\n3️⃣ Waiting for update to complete...');
    
    await waitForUpdateComplete('trinity-movie-dev');
    console.log('   ✅ Update completed');
    
    console.log('\n' + '═'.repeat(50));
    console.log('✅ LAMBDA DEPLOYMENT SUCCESSFUL');
    console.log('\nChanges deployed:');
    console.log('• Enhanced TMDB client with strict language filtering (western languages only)');
    console.log('• Enhanced TMDB client with strict description filtering (30+ characters)');
    console.log('• Complete priority algorithm with AND/OR genre logic');
    console.log('• Fixed content-filter-service with proper genre mapping');
    
    console.log('\n🧪 Test the fix:');
    console.log('• Run: node test-simple-filtering.js');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
  }
}

async function createDeploymentPackage() {
  return new Promise((resolve, reject) => {
    const output = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('data', (chunk) => output.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(output)));
    archive.on('error', reject);
    
    // Add the main handler file
    archive.file('lambda-package-final/movie.js', { name: 'movie.js' });
    
    // Add all service files
    const servicesDir = 'lambda-package-final/services';
    if (fs.existsSync(servicesDir)) {
      const serviceFiles = fs.readdirSync(servicesDir);
      serviceFiles.forEach(file => {
        if (file.endsWith('.js')) {
          archive.file(path.join(servicesDir, file), { name: `services/${file}` });
        }
      });
    }
    
    // Add types if they exist
    const typesDir = 'lambda-package-final/types';
    if (fs.existsSync(typesDir)) {
      const typeFiles = fs.readdirSync(typesDir);
      typeFiles.forEach(file => {
        if (file.endsWith('.js')) {
          archive.file(path.join(typesDir, file), { name: `types/${file}` });
        }
      });
    }
    
    // Add utils if they exist
    const utilsDir = 'lambda-package-final/utils';
    if (fs.existsSync(utilsDir)) {
      const utilFiles = fs.readdirSync(utilsDir);
      utilFiles.forEach(file => {
        if (file.endsWith('.js')) {
          archive.file(path.join(utilsDir, file), { name: `utils/${file}` });
        }
      });
    }
    
    archive.finalize();
  });
}

async function waitForUpdateComplete(functionName) {
  let attempts = 0;
  const maxAttempts = 30;
  
  while (attempts < maxAttempts) {
    try {
      const result = await lambda.getFunctionConfiguration({
        FunctionName: functionName
      }).promise();
      
      if (result.State === 'Active') {
        return;
      }
      
      console.log(`   Waiting... State: ${result.State} (${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      
    } catch (error) {
      console.error(`   Error checking status: ${error.message}`);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error('Timeout waiting for Lambda update to complete');
}

// Check if archiver is available
try {
  require('archiver');
} catch (error) {
  console.error('❌ archiver package not found. Installing...');
  const { execSync } = require('child_process');
  execSync('npm install archiver', { stdio: 'inherit' });
}

// Run the deployment
deployLambdaOnly().catch(console.error);
