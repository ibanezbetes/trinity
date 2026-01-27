const { LambdaClient, UpdateFunctionCodeCommand, GetFunctionCommand } = require('@aws-sdk/client-lambda');
const fs = require('fs');
const path = require('path');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function forceRedeployHandlers() {
  console.log('🔍 Forcing redeploy of handlers...');
  
  try {
    // First, let's check the current handler
    const functionName = 'trinity-room-dev';
    
    console.log(`🔍 Checking current handler: ${functionName}`);
    
    const getCommand = new GetFunctionCommand({
      FunctionName: functionName
    });
    
    const currentFunction = await lambdaClient.send(getCommand);
    
    console.log('📊 Current function details:');
    console.log('- Runtime:', currentFunction.Configuration?.Runtime);
    console.log('- Handler:', currentFunction.Configuration?.Handler);
    console.log('- Last Modified:', currentFunction.Configuration?.LastModified);
    console.log('- Code Size:', currentFunction.Configuration?.CodeSize);
    console.log('- Code SHA256:', currentFunction.Configuration?.CodeSha256);
    
    // Check if the handler file exists locally
    const handlerPath = path.join(__dirname, 'infrastructure', 'lib', 'handlers', 'room.js');
    
    if (fs.existsSync(handlerPath)) {
      console.log('✅ Local handler file exists');
      
      // Get file stats
      const stats = fs.statSync(handlerPath);
      console.log('📊 Local handler file:');
      console.log('- Size:', stats.size, 'bytes');
      console.log('- Modified:', stats.mtime);
      
      // Read a small portion to verify it's the right file
      const content = fs.readFileSync(handlerPath, 'utf8');
      const hasGetRoom = content.includes('async function getRoom');
      const hasMediaType = content.includes('mediaType:');
      const hasGenreIds = content.includes('genreIds:');
      
      console.log('🔍 Handler content analysis:');
      console.log('- Has getRoom function:', hasGetRoom);
      console.log('- Has mediaType mapping:', hasMediaType);
      console.log('- Has genreIds mapping:', hasGenreIds);
      
      if (hasGetRoom && hasMediaType && hasGenreIds) {
        console.log('✅ Local handler appears to have correct code');
      } else {
        console.log('❌ Local handler may be missing required code');
      }
      
    } else {
      console.log('❌ Local handler file not found at:', handlerPath);
    }
    
    console.log('\n🔧 To force redeploy, run:');
    console.log('cd infrastructure && npm run deploy');
    
  } catch (error) {
    console.error('❌ Error checking handlers:', error);
  }
}

forceRedeployHandlers();
