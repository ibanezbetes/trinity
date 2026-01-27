/**
 * Deploy Lambda with correct file structure
 * The issue is that Lambda expects files in the root, not in subdirectories
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

// Configure AWS
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are loaded from environment variables or AWS CLI
});

const lambda = new AWS.Lambda();

async function deployLambdaFixed() {
  console.log('🚀 DEPLOYING LAMBDA WITH CORRECT STRUCTURE');
  console.log('═'.repeat(50));
  
  try {
    // Step 1: Create deployment package with correct structure
    console.log('\n1️⃣ Creating deployment package with correct structure...');
    
    const zipBuffer = await createCorrectDeploymentPackage();
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
    console.log('• Fixed import path structure for Lambda');
    console.log('• Updated content-filter-service with complete genre mapping');
    console.log('• Fixed TV genre filtering');
    
    console.log('\n🧪 Test the fix:');
    console.log('• Run: node debug-filtering-issue.js');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
  }
}

async function createCorrectDeploymentPackage() {
  return new Promise((resolve, reject) => {
    const output = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('data', (chunk) => output.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(output)));
    archive.on('error', reject);
    
    // First, let's create a modified version of movie.js with correct imports
    const movieHandlerContent = fs.readFileSync('infrastructure/src/handlers/movie.js', 'utf8');
    
    // Fix the import paths for Lambda environment (flat structure)
    const fixedMovieHandler = movieHandlerContent
      .replace('require("../services/content-filter-service")', 'require("./content-filter-service")')
      .replace('require("../services/', 'require("./')
      .replace('require("../types/', 'require("./')
      .replace('require("../utils/', 'require("./');
    
    // Add the main handler file with fixed imports
    archive.append(fixedMovieHandler, { name: 'movie.js' });
    
    // Add all service files to root level
    const servicesDir = 'infrastructure/src/services';
    if (fs.existsSync(servicesDir)) {
      const serviceFiles = fs.readdirSync(servicesDir);
      serviceFiles.forEach(file => {
        if (file.endsWith('.js')) {
          let serviceContent = fs.readFileSync(path.join(servicesDir, file), 'utf8');
          
          // Fix imports in service files too
          serviceContent = serviceContent
            .replace(/require\("\.\/([^"]+)"\)/g, 'require("./$1")')
            .replace(/require\("\.\.\/([^"]+)"\)/g, 'require("./$1")');
          
          archive.append(serviceContent, { name: file });
        }
      });
    }
    
    // Add types if they exist
    const typesDir = 'infrastructure/src/types';
    if (fs.existsSync(typesDir)) {
      const typeFiles = fs.readdirSync(typesDir);
      typeFiles.forEach(file => {
        if (file.endsWith('.js')) {
          const typeContent = fs.readFileSync(path.join(typesDir, file), 'utf8');
          archive.append(typeContent, { name: file });
        }
      });
    }
    
    // Add utils if they exist
    const utilsDir = 'infrastructure/src/utils';
    if (fs.existsSync(utilsDir)) {
      const utilFiles = fs.readdirSync(utilsDir);
      utilFiles.forEach(file => {
        if (file.endsWith('.js')) {
          const utilContent = fs.readFileSync(path.join(utilsDir, file), 'utf8');
          archive.append(utilContent, { name: file });
        }
      });
    }
    
    console.log('   📦 Package structure:');
    console.log('   • movie.js (main handler)');
    console.log('   • content-filter-service.js');
    console.log('   • enhanced-tmdb-client.js');
    console.log('   • priority-algorithm.js');
    console.log('   • filter-cache-manager.js');
    console.log('   • Other service/type/util files...');
    
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

// Run the deployment
deployLambdaFixed().catch(console.error);
