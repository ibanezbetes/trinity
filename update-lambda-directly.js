const { LambdaClient, UpdateFunctionCodeCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const archiver = require('archiver');
const path = require('path');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function updateLambdaDirectly() {
  console.log('🔍 Updating Lambda function directly...');
  
  try {
    const functionName = 'trinity-room-dev';
    const handlerPath = path.join(__dirname, 'infrastructure', 'lib', 'handlers', 'room.js');
    
    // Verify the handler file exists and has the correct content
    if (!fs.existsSync(handlerPath)) {
      throw new Error('Handler file not found');
    }
    
    const content = fs.readFileSync(handlerPath, 'utf8');
    const hasMediaType = content.includes('mediaType:');
    const hasGenreIds = content.includes('genreIds:');
    
    console.log('🔍 Handler verification:');
    console.log('- Has mediaType mapping:', hasMediaType);
    console.log('- Has genreIds mapping:', hasGenreIds);
    
    if (!hasMediaType || !hasGenreIds) {
      throw new Error('Handler file is missing required fields');
    }
    
    console.log('✅ Handler file verified, creating ZIP...');
    
    // Create a ZIP file with the handler
    const zipPath = path.join(__dirname, 'room-handler-updated.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    return new Promise((resolve, reject) => {
      output.on('close', async () => {
        console.log(`✅ ZIP created: ${archive.pointer()} bytes`);
        
        try {
          // Read the ZIP file
          const zipBuffer = fs.readFileSync(zipPath);
          
          console.log('🚀 Updating Lambda function...');
          
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
      
      // Add the handler file to the ZIP
      archive.file(handlerPath, { name: 'room.js' });
      
      // Add package.json if it exists
      const packagePath = path.join(__dirname, 'infrastructure', 'package.json');
      if (fs.existsSync(packagePath)) {
        archive.file(packagePath, { name: 'package.json' });
      }
      
      archive.finalize();
    });
    
  } catch (error) {
    console.error('❌ Error updating Lambda:', error);
    throw error;
  }
}

// Check if archiver is available
try {
  require('archiver');
  updateLambdaDirectly().catch(console.error);
} catch (error) {
  console.log('❌ archiver package not found. Installing...');
  console.log('Run: npm install archiver');
  console.log('Then run this script again.');
}
