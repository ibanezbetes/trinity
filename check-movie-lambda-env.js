const { LambdaClient, GetFunctionCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function checkMovieLambdaEnv() {
  console.log('🔍 Checking movie Lambda environment variables...');
  
  try {
    const functionName = 'trinity-movie-dev';
    
    const getCommand = new GetFunctionCommand({
      FunctionName: functionName
    });
    
    const functionDetails = await lambdaClient.send(getCommand);
    
    console.log('📊 Movie Lambda function details:');
    console.log('- Function Name:', functionDetails.Configuration?.FunctionName);
    console.log('- Runtime:', functionDetails.Configuration?.Runtime);
    console.log('- Handler:', functionDetails.Configuration?.Handler);
    console.log('- Last Modified:', functionDetails.Configuration?.LastModified);
    console.log('- Code Size:', functionDetails.Configuration?.CodeSize, 'bytes');
    
    const envVars = functionDetails.Configuration?.Environment?.Variables || {};
    
    console.log('\n🔍 Environment Variables:');
    
    const importantVars = [
      'TMDB_API_KEY',
      'HF_API_TOKEN',
      'HUGGINGFACE_API_KEY',
      'MOVIES_TABLE',
      'ROOMS_TABLE',
      'NODE_ENV'
    ];
    
    for (const varName of importantVars) {
      const value = envVars[varName];
      if (value) {
        // Mask sensitive values
        const maskedValue = varName.includes('KEY') || varName.includes('TOKEN') 
          ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
          : value;
        console.log(`✅ ${varName}: ${maskedValue}`);
      } else {
        console.log(`❌ ${varName}: NOT SET`);
      }
    }
    
    // Check if TMDB_API_KEY is missing
    if (!envVars.TMDB_API_KEY) {
      console.log('\n🚨 PROBLEM IDENTIFIED:');
      console.log('❌ TMDB_API_KEY is not set in the movie Lambda function');
      console.log('❌ This is why getFilteredContent is failing');
      console.log('❌ The advanced filtering system needs TMDB API access');
      
      console.log('\n💡 SOLUTION:');
      console.log('1. The movie Lambda function needs the TMDB_API_KEY environment variable');
      console.log('2. This should be set during CDK deployment');
      console.log('3. Since CDK stack is missing, we need to update the Lambda env vars directly');
      
      return {
        hasTmdbKey: false,
        needsUpdate: true,
        envVars
      };
    } else {
      console.log('\n✅ TMDB_API_KEY is configured');
      return {
        hasTmdbKey: true,
        needsUpdate: false,
        envVars
      };
    }
    
  } catch (error) {
    console.error('❌ Error checking movie Lambda:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('💡 Movie Lambda function not found');
      console.log('💡 Check that the function name is correct');
    }
    
    return {
      error: error.message
    };
  }
}

checkMovieLambdaEnv()
  .then(result => {
    console.log('\n📋 Check Summary:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(console.error);
