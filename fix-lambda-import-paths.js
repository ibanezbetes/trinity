const { LambdaClient, UpdateFunctionCodeCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function fixLambdaImportPaths() {
  console.log('🔧 Fixing Lambda import paths and redeploying...');
  
  try {
    const functionName = 'trinity-room-dev';
    
    // Step 1: Create a modified version of the handler with correct import paths
    console.log('🔍 Step 1: Modifying handler import paths...');
    
    const originalHandlerPath = path.join(__dirname, 'infrastructure', 'lib', 'handlers', 'room.js');
    const tempDir = path.join(__dirname, 'temp-lambda-package-fixed');
    const modifiedHandlerPath = path.join(tempDir, 'room.js');
    
    // Clean up any existing temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });
    
    // Read the original handler
    let handlerContent = fs.readFileSync(originalHandlerPath, 'utf8');
    
    // Fix import paths to match the flat structure we'll create
    handlerContent = handlerContent.replace(
      /require\("\.\.\/services\/([^"]+)"\)/g,
      'require("./services/$1")'
    );
    
    handlerContent = handlerContent.replace(
      /require\("\.\.\/types\/([^"]+)"\)/g,
      'require("./types/$1")'
    );
    
    handlerContent = handlerContent.replace(
      /require\("\.\.\/utils\/([^"]+)"\)/g,
      'require("./utils/$1")'
    );
    
    // Write the modified handler
    fs.writeFileSync(modifiedHandlerPath, handlerContent);
    console.log('✅ Handler import paths fixed');
    
    // Step 2: Copy all dependencies with correct structure
    console.log('🔍 Step 2: Copying dependencies with correct structure...');
    
    // Copy services
    const servicesDir = path.join(__dirname, 'infrastructure', 'lib', 'services');
    const servicesDestDir = path.join(tempDir, 'services');
    
    if (fs.existsSync(servicesDir)) {
      fs.mkdirSync(servicesDestDir, { recursive: true });
      
      const serviceFiles = fs.readdirSync(servicesDir);
      for (const file of serviceFiles) {
        if (file.endsWith('.js')) {
          const srcPath = path.join(servicesDir, file);
          const destPath = path.join(servicesDestDir, file);
          
          // Read and fix import paths in service files too
          let serviceContent = fs.readFileSync(srcPath, 'utf8');
          
          // Fix relative imports within services
          serviceContent = serviceContent.replace(
            /require\("\.\.\/types\/([^"]+)"\)/g,
            'require("../types/$1")'
          );
          
          serviceContent = serviceContent.replace(
            /require\("\.\.\/utils\/([^"]+)"\)/g,
            'require("../utils/$1")'
          );
          
          fs.writeFileSync(destPath, serviceContent);
          console.log(`✅ Copied and fixed service: ${file}`);
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
    
    // Create package.json
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
    
    // Install dependencies
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
    
    // Step 3: Create ZIP package
    console.log('📦 Creating ZIP package...');
    const zipPath = path.join(__dirname, 'room-handler-fixed.zip');
    
    try {
      // Use archiver for reliable ZIP creation
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
      
      console.log('✅ ZIP package created');
      
    } catch (archiverError) {
      console.error('❌ Failed to create ZIP with archiver:', archiverError);
      
      // Fallback to PowerShell on Windows
      if (process.platform === 'win32') {
        const powershellCommand = `Compress-Archive -Path "${tempDir}\\*" -DestinationPath "${zipPath}" -Force`;
        execSync(`powershell -Command "${powershellCommand}"`, { stdio: 'pipe' });
        console.log('✅ ZIP package created with PowerShell');
      } else {
        throw new Error('Failed to create ZIP package');
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
    
    console.log('\n🎉 Lambda handler import paths fixed and deployed!');
    console.log('✅ All import paths now match the Lambda package structure');
    console.log('✅ Dependencies should now be found correctly');
    
    return result;
    
  } catch (error) {
    console.error('❌ Error fixing Lambda import paths:', error);
    
    // Clean up on error
    const tempDir = path.join(__dirname, 'temp-lambda-package-fixed');
    const zipPath = path.join(__dirname, 'room-handler-fixed.zip');
    
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
fixLambdaImportPaths().catch(console.error);
