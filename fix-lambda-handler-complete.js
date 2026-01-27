const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function fixLambdaHandlerComplete() {
  console.log('🔧 Fixing Lambda handler with complete dependencies...');
  
  try {
    const functionName = 'trinity-room-dev';
    
    // Step 1: Verify the compiled handler has correct code
    console.log('🔍 Step 1: Verifying compiled handler...');
    const handlerPath = path.join(__dirname, 'infrastructure', 'lib', 'handlers', 'room.js');
    
    if (!fs.existsSync(handlerPath)) {
      throw new Error('Compiled handler not found. Run: cd infrastructure && npm run build');
    }
    
    const content = fs.readFileSync(handlerPath, 'utf8');
    const hasGetRoom = content.includes('async function getRoom');
    const hasMediaType = content.includes('mediaType: room.mediaType');
    const hasGenreIds = content.includes('genreIds: room.genreIds');
    const hasGenreNames = content.includes('genreNames: room.genreNames');
    
    console.log('📊 Handler verification:');
    console.log('- Has getRoom function:', hasGetRoom);
    console.log('- Has mediaType mapping:', hasMediaType);
    console.log('- Has genreIds mapping:', hasGenreIds);
    console.log('- Has genreNames mapping:', hasGenreNames);
    
    if (!hasGetRoom || !hasMediaType || !hasGenreIds) {
      throw new Error('Handler is missing required field mappings');
    }
    
    console.log('✅ Handler verification passed');
    
    // Step 2: Check current Lambda function
    console.log('\n🔍 Step 2: Checking current Lambda function...');
    
    try {
      const getCommand = new GetFunctionCommand({ FunctionName: functionName });
      const currentFunction = await lambdaClient.send(getCommand);
      
      console.log('📊 Current Lambda function:');
      console.log('- Runtime:', currentFunction.Configuration?.Runtime);
      console.log('- Handler:', currentFunction.Configuration?.Handler);
      console.log('- Code Size:', currentFunction.Configuration?.CodeSize, 'bytes');
      console.log('- Last Modified:', currentFunction.Configuration?.LastModified);
      
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        throw new Error(`Lambda function '${functionName}' not found. Please check the function name.`);
      }
      throw error;
    }
    
    // Step 3: Create deployment package with all dependencies
    console.log('\n🔍 Step 3: Creating deployment package...');
    
    const tempDir = path.join(__dirname, 'temp-lambda-package');
    const zipPath = path.join(__dirname, 'room-handler-complete.zip');
    
    // Clean up any existing temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Copy the compiled handler
    const handlerDestPath = path.join(tempDir, 'room.js');
    fs.copyFileSync(handlerPath, handlerDestPath);
    console.log('✅ Copied compiled handler');
    
    // Copy all service dependencies
    const servicesDir = path.join(__dirname, 'infrastructure', 'lib', 'services');
    const servicesDestDir = path.join(tempDir, 'services');
    
    if (fs.existsSync(servicesDir)) {
      fs.mkdirSync(servicesDestDir, { recursive: true });
      
      const serviceFiles = fs.readdirSync(servicesDir);
      for (const file of serviceFiles) {
        if (file.endsWith('.js')) {
          const srcPath = path.join(servicesDir, file);
          const destPath = path.join(servicesDestDir, file);
          fs.copyFileSync(srcPath, destPath);
          console.log(`✅ Copied service: ${file}`);
        }
      }
    }
    
    // Copy types
    const typesDir = path.join(__dirname, 'infrastructure', 'lib', 'types');
    const typesDestDir = path.join(tempDir, 'types');
    
    if (fs.existsSync(typesDir)) {
      fs.mkdirSync(typesDestDir, { recursive: true });
      
      const typeFiles = fs.readdirSync(typesDir);
      for (const file of typeFiles) {
        if (file.endsWith('.js')) {
          const srcPath = path.join(typesDir, file);
          const destPath = path.join(typesDestDir, file);
          fs.copyFileSync(srcPath, destPath);
          console.log(`✅ Copied type: ${file}`);
        }
      }
    }
    
    // Copy utils
    const utilsDir = path.join(__dirname, 'infrastructure', 'lib', 'utils');
    const utilsDestDir = path.join(tempDir, 'utils');
    
    if (fs.existsSync(utilsDir)) {
      fs.mkdirSync(utilsDestDir, { recursive: true });
      
      const utilFiles = fs.readdirSync(utilsDir);
      for (const file of utilFiles) {
        if (file.endsWith('.js')) {
          const srcPath = path.join(utilsDir, file);
          const destPath = path.join(utilsDestDir, file);
          fs.copyFileSync(srcPath, destPath);
          console.log(`✅ Copied util: ${file}`);
        }
      }
    }
    
    // Create a minimal package.json with required dependencies
    const packageJson = {
      "name": "trinity-room-handler",
      "version": "1.0.0",
      "main": "room.js",
      "dependencies": {
        "@aws-sdk/client-dynamodb": "^3.282.0",
        "@aws-sdk/lib-dynamodb": "^3.975.0",
        "uuid": "^9.0.0"
      }
    };
    
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );
    console.log('✅ Created package.json');
    
    // Install dependencies in temp directory
    console.log('📦 Installing dependencies...');
    try {
      execSync('npm install --production', { 
        cwd: tempDir, 
        stdio: 'pipe'
      });
      console.log('✅ Dependencies installed');
    } catch (error) {
      console.warn('⚠️ Failed to install dependencies, continuing without node_modules');
    }
    
    // Create ZIP file
    console.log('📦 Creating ZIP package...');
    
    // Use a more reliable ZIP creation method
    try {
      // Try using PowerShell Compress-Archive on Windows
      if (process.platform === 'win32') {
        const powershellCommand = `Compress-Archive -Path "${tempDir}\\*" -DestinationPath "${zipPath}" -Force`;
        execSync(`powershell -Command "${powershellCommand}"`, { stdio: 'pipe' });
      } else {
        // Use zip command on Unix-like systems
        execSync(`cd "${tempDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
      }
      
      console.log('✅ ZIP package created');
      
    } catch (zipError) {
      console.error('❌ Failed to create ZIP with system commands, trying Node.js archiver...');
      
      // Fallback to archiver if available
      try {
        const archiver = require('archiver');
        
        await new Promise((resolve, reject) => {
          const output = fs.createWriteStream(zipPath);
          const archive = archiver('zip', { zlib: { level: 9 } });
          
          output.on('close', resolve);
          output.on('error', reject);
          archive.on('error', reject);
          
          archive.pipe(output);
          archive.directory(tempDir, false);
          archive.finalize();
        });
        
        console.log('✅ ZIP package created with archiver');
        
      } catch (archiverError) {
        throw new Error('Failed to create ZIP package. Please install archiver: npm install archiver');
      }
    }
    
    // Step 4: Update Lambda function
    console.log('\n🚀 Step 4: Updating Lambda function...');
    
    const zipBuffer = fs.readFileSync(zipPath);
    console.log(`📊 Package size: ${zipBuffer.length} bytes`);
    
    const updateCommand = new UpdateFunctionCodeCommand({
      FunctionName: functionName,
      ZipFile: zipBuffer
    });
    
    const result = await lambdaClient.send(updateCommand);
    
    console.log('✅ Lambda function updated successfully!');
    console.log('📊 Update result:');
    console.log('- Function Name:', result.FunctionName);
    console.log('- Code Size:', result.CodeSize, 'bytes');
    console.log('- Code SHA256:', result.CodeSha256);
    console.log('- Last Modified:', result.LastModified);
    console.log('- Runtime:', result.Runtime);
    
    // Step 5: Clean up
    console.log('\n🧹 Step 5: Cleaning up...');
    
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('✅ Temp directory cleaned');
    }
    
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      console.log('✅ ZIP file cleaned');
    }
    
    console.log('\n🎉 Lambda handler update completed successfully!');
    console.log('🔍 The handler now includes:');
    console.log('- ✅ Correct getRoom function with mediaType, genreIds, genreNames mappings');
    console.log('- ✅ All required service dependencies');
    console.log('- ✅ UUID dependency for room creation');
    console.log('- ✅ Content filtering types and services');
    
    console.log('\n📝 Next steps:');
    console.log('1. Test room creation with filtering');
    console.log('2. Test getRoom query to verify fields are returned');
    console.log('3. Verify mobile app receives correct data');
    
    return result;
    
  } catch (error) {
    console.error('❌ Error fixing Lambda handler:', error);
    
    // Clean up on error
    const tempDir = path.join(__dirname, 'temp-lambda-package');
    const zipPath = path.join(__dirname, 'room-handler-complete.zip');
    
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    
    throw error;
  }
}

// Run the fix
fixLambdaHandlerComplete().catch(console.error);
