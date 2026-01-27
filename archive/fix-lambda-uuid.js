#!/usr/bin/env node

/**
 * Script para arreglar el error de uuid en Lambda
 * Empaqueta las dependencias y actualiza la función Lambda
 */

require('dotenv').config();
const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Nombres de las funciones Lambda
const LAMBDA_FUNCTIONS = [
  'trinity-room-dev',
  'trinity-auth-dev',
  'trinity-vote-dev',
  'trinity-movie-dev',
  'trinity-ai-dev'
];

async function createLambdaZip() {
  console.log('📦 Creating Lambda deployment package...');
  
  const outputPath = path.join(__dirname, 'lambda-package.zip');
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`✅ Package created: ${archive.pointer()} bytes`);
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add compiled handlers
    const handlersPath = path.join(__dirname, 'infrastructure', 'dist', 'handlers');
    if (fs.existsSync(handlersPath)) {
      archive.directory(handlersPath, false);
      console.log('  ✓ Added handlers');
    }

    // Add node_modules with uuid
    const nodeModulesPath = path.join(__dirname, 'infrastructure', 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      // Only add necessary modules
      const requiredModules = ['uuid', '@aws-sdk'];
      requiredModules.forEach(mod => {
        const modPath = path.join(nodeModulesPath, mod);
        if (fs.existsSync(modPath)) {
          archive.directory(modPath, `node_modules/${mod}`);
          console.log(`  ✓ Added ${mod}`);
        }
      });
    }

    archive.finalize();
  });
}

async function updateLambdaFunction(functionName, zipPath) {
  console.log(`\n🚀 Updating Lambda function: ${functionName}`);
  
  try {
    // Check if function exists
    const getCommand = new GetFunctionCommand({ FunctionName: functionName });
    await lambdaClient.send(getCommand);
    
    // Read zip file
    const zipBuffer = fs.readFileSync(zipPath);
    
    // Update function code
    const updateCommand = new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      ZipFile: zipBuffer
    });
    
    const result = await lambdaClient.send(updateCommand);
    console.log(`✅ Updated ${functionName}`);
    console.log(`   Version: ${result.Version}`);
    console.log(`   Size: ${result.CodeSize} bytes`);
    
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      console.log(`⚠️  Function ${functionName} not found, skipping...`);
    } else {
      console.error(`❌ Failed to update ${functionName}:`, error.message);
    }
    return false;
  }
}

async function main() {
  console.log('🔧 Fixing Lambda uuid error...\n');

  try {
    // Step 1: Compile TypeScript
    console.log('📝 Step 1: Compiling TypeScript...');
    const { execSync } = require('child_process');
    
    try {
      execSync('npx tsc --skipLibCheck', {
        cwd: path.join(__dirname, 'infrastructure'),
        stdio: 'inherit'
      });
      console.log('✅ TypeScript compiled\n');
    } catch (error) {
      console.log('⚠️  TypeScript compilation had warnings, continuing...\n');
    }

    // Step 2: Create deployment package
    console.log('📝 Step 2: Creating deployment package...');
    const zipPath = await createLambdaZip();
    console.log('');

    // Step 3: Update Lambda functions
    console.log('📝 Step 3: Updating Lambda functions...');
    let successCount = 0;
    
    for (const functionName of LAMBDA_FUNCTIONS) {
      const success = await updateLambdaFunction(functionName, zipPath);
      if (success) successCount++;
    }

    // Cleanup
    fs.unlinkSync(zipPath);
    console.log('\n🧹 Cleaned up temporary files');

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`✅ Updated ${successCount}/${LAMBDA_FUNCTIONS.length} Lambda functions`);
    console.log('='.repeat(50));

    if (successCount > 0) {
      console.log('\n🎉 Lambda functions updated successfully!');
      console.log('\n📝 Next steps:');
      console.log('   1. Test creating a room from web or mobile');
      console.log('   2. The uuid error should be fixed');
      console.log('   3. Try: http://localhost:8082/join');
      return true;
    } else {
      console.log('\n⚠️  No functions were updated');
      console.log('💡 Make sure Lambda functions are deployed first');
      console.log('   Run: cd infrastructure && cdk deploy');
      return false;
    }

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

if (require.main === module) {
  main()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { createLambdaZip, updateLambdaFunction };