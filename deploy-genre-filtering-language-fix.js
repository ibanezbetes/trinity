/**
 * Deploy Genre Filtering Language Fix
 * 
 * Deploys the fixed TMDB client that removes API-level language filtering
 * to prevent conflicts with genre filtering
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function deployGenreFilteringLanguageFix() {
  console.log('🚀 Deploying Genre Filtering Language Fix...\n');

  try {
    // Create deployment package
    console.log('📦 Creating deployment package...');
    const zipBuffer = await createDeploymentPackage();
    
    console.log('📤 Updating Lambda function...');
    const updateResult = await lambda.updateFunctionCode({
      FunctionName: 'trinity-movie-dev',
      ZipFile: zipBuffer
    }).promise();

    console.log('✅ Lambda function updated successfully!');
    console.log(`   Function ARN: ${updateResult.FunctionArn}`);
    console.log(`   Last Modified: ${updateResult.LastModified}`);
    console.log(`   Code Size: ${updateResult.CodeSize} bytes`);

    // Wait a moment for deployment to complete
    console.log('\n⏳ Waiting for deployment to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n🎯 Fix Summary:');
    console.log('   • Removed API-level language filter from TMDB client');
    console.log('   • Kept client-side language filtering for safety');
    console.log('   • This should fix genre filtering conflicts');
    console.log('   • Priority 1 (AND logic) should now work correctly');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    throw error;
  }
}

async function createDeploymentPackage() {
  return new Promise((resolve, reject) => {
    const output = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', chunk => output.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(output)));
    archive.on('error', reject);

    // Add the main handler
    const handlerPath = path.join(__dirname, 'lambda-package-final', 'movie.js');
    if (fs.existsSync(handlerPath)) {
      archive.file(handlerPath, { name: 'movie.js' });
    }

    // Add package.json
    const packagePath = path.join(__dirname, 'lambda-package-final', 'package.json');
    if (fs.existsSync(packagePath)) {
      archive.file(packagePath, { name: 'package.json' });
    }

    // Add all service files
    const servicesDir = path.join(__dirname, 'lambda-package-final', 'services');
    if (fs.existsSync(servicesDir)) {
      archive.directory(servicesDir, 'services');
    }

    // Add all type files
    const typesDir = path.join(__dirname, 'lambda-package-final', 'types');
    if (fs.existsSync(typesDir)) {
      archive.directory(typesDir, 'types');
    }

    // Add all util files
    const utilsDir = path.join(__dirname, 'lambda-package-final', 'utils');
    if (fs.existsSync(utilsDir)) {
      archive.directory(utilsDir, 'utils');
    }

    archive.finalize();
  });
}

// Run the deployment
deployGenreFilteringLanguageFix().catch(console.error);
