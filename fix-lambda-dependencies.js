const { LambdaClient, UpdateFunctionCodeCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function fixLambdaDependencies() {
  console.log('🔍 Fixing Lambda dependencies...');
  
  try {
    const functionName = 'trinity-room-dev';
    
    // Create a proper Lambda package with dependencies
    const zipPath = path.join(__dirname, 'room-handler-with-deps.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        console.log(`✅ ZIP created: ${archive.pointer()} bytes`);
        
        try {
          // Read the ZIP file
          const zipBuffer = fs.readFileSync(zipPath);
          
          console.log('🚀 Updating Lambda function with dependencies...');
          
          // Update the Lambda function
          const updateCommand = new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            ZipFile: zipBuffer
          });
          
          const result = await lambdaClient.send(updateCommand);
          
          console.log('✅ Lambda function updated successfully!');
          console.log('📊 Update result:');
          console.log('- Code Size:', result.CodeSize);
          console.log('- Code SHA256:', result.CodeSha256);
          console.log('- Last Modified:', result.LastModified);
          
          // Clean up
          fs.unlinkSync(zipPath);
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      output.on('error', reject);
      archive.on('error', reject);
      
      archive.pipe(output);
      
      // Add the handler file
      const handlerPath = path.join(__dirname, 'infrastructure', 'lib', 'handlers', 'room.js');
      if (fs.existsSync(handlerPath)) {
        archive.file(handlerPath, { name: 'room.js' });
      } else {
        throw new Error('Handler file not found');
      }
      
      // Add package.json with dependencies
      const packageJson = {
        "name": "trinity-room-handler",
        "version": "1.0.0",
        "main": "room.js",
        "dependencies": {
          "uuid": "^9.0.0",
          "@aws-sdk/client-dynamodb": "^3.0.0",
          "@aws-sdk/lib-dynamodb": "^3.0.0"
        }
      };
      
      archive.append(JSON.stringify(packageJson, null, 2), { name: 'package.json' });
      
      // Add node_modules for uuid (simplified approach)
      const infrastructureNodeModules = path.join(__dirname, 'infrastructure', 'node_modules');
      
      if (fs.existsSync(infrastructureNodeModules)) {
        // Add uuid module
        const uuidPath = path.join(infrastructureNodeModules, 'uuid');
        if (fs.existsSync(uuidPath)) {
          console.log('📦 Adding uuid module...');
          archive.directory(uuidPath, 'node_modules/uuid');
        }
        
        // Add AWS SDK modules (they should already be available in Lambda runtime)
        console.log('📦 Package created with dependencies');
      } else {
        console.log('⚠️ Node modules not found, creating minimal package');
      }
      
      archive.finalize();
    });
    
  } catch (error) {
    console.error('❌ Error fixing Lambda dependencies:', error);
    throw error;
  }
}

fixLambdaDependencies().catch(console.error);
