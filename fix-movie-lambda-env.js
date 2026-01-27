const { LambdaClient, UpdateFunctionConfigurationCommand, GetFunctionCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function fixMovieLambdaEnv() {
  console.log('🔧 Fixing movie Lambda environment variables...');
  
  try {
    const functionName = 'trinity-movie-dev';
    
    // Step 1: Get current configuration
    console.log('🔍 Step 1: Getting current Lambda configuration...');
    
    const getCommand = new GetFunctionCommand({
      FunctionName: functionName
    });
    
    const currentFunction = await lambdaClient.send(getCommand);
    const currentEnvVars = currentFunction.Configuration?.Environment?.Variables || {};
    
    console.log('📊 Current environment variables:');
    Object.keys(currentEnvVars).forEach(key => {
      const value = currentEnvVars[key];
      const maskedValue = (key.includes('KEY') || key.includes('TOKEN')) && value
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : value || 'EMPTY';
      console.log(`- ${key}: ${maskedValue}`);
    });
    
    // Step 2: Prepare updated environment variables
    console.log('\n🔍 Step 2: Preparing updated environment variables...');
    
    const updatedEnvVars = {
      ...currentEnvVars,
      // Add missing TMDB API key
      TMDB_API_KEY: 'dc4dbcd2404c1ca852f8eb964add267d',
      // Add missing Hugging Face token
      HF_API_TOKEN: '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',
      HUGGINGFACE_API_KEY: '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',
      // Add other missing variables
      TMDB_BASE_URL: 'https://api.themoviedb.org/3',
      NODE_ENV: 'development',
      STAGE: 'dev',
      LOG_LEVEL: 'info',
      ENABLE_METRICS: 'true',
      DEBUG_MODE: 'true',
      VERBOSE_LOGGING: 'true'
    };
    
    console.log('✅ Updated environment variables prepared');
    console.log('📊 Key additions:');
    console.log('- TMDB_API_KEY: dc4d...267d');
    console.log('- HF_API_TOKEN: hf_m...kuK');
    console.log('- HUGGINGFACE_API_KEY: hf_m...kuK');
    console.log('- TMDB_BASE_URL: https://api.themoviedb.org/3');
    console.log('- NODE_ENV: development');
    
    // Step 3: Update Lambda function configuration
    console.log('\n🚀 Step 3: Updating Lambda function configuration...');
    
    const updateCommand = new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Environment: {
        Variables: updatedEnvVars
      }
    });
    
    const result = await lambdaClient.send(updateCommand);
    
    console.log('✅ Lambda function configuration updated successfully!');
    console.log('📊 Update result:');
    console.log('- Function Name:', result.FunctionName);
    console.log('- Last Modified:', result.LastModified);
    console.log('- State:', result.State);
    
    // Step 4: Verify the update
    console.log('\n🔍 Step 4: Verifying the update...');
    
    // Wait a moment for the update to propagate
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const verifyCommand = new GetFunctionCommand({
      FunctionName: functionName
    });
    
    const verifiedFunction = await lambdaClient.send(verifyCommand);
    const verifiedEnvVars = verifiedFunction.Configuration?.Environment?.Variables || {};
    
    console.log('📊 Verification results:');
    
    const criticalVars = ['TMDB_API_KEY', 'HF_API_TOKEN', 'HUGGINGFACE_API_KEY'];
    let allGood = true;
    
    for (const varName of criticalVars) {
      const value = verifiedEnvVars[varName];
      if (value && value.trim() !== '') {
        console.log(`✅ ${varName}: Set correctly`);
      } else {
        console.log(`❌ ${varName}: Still missing or empty`);
        allGood = false;
      }
    }
    
    if (allGood) {
      console.log('\n🎉 SUCCESS! All critical environment variables are now set!');
      console.log('✅ TMDB_API_KEY is configured - getFilteredContent should now work');
      console.log('✅ HF_API_TOKEN is configured - AI recommendations should work');
      console.log('✅ Movie Lambda is ready for advanced content filtering');
      
      console.log('\n📝 Next steps:');
      console.log('1. Test the getFilteredContent resolver again');
      console.log('2. Create a new room in the mobile app');
      console.log('3. Verify that real TMDB movies are loaded instead of mock movies');
      
      return {
        success: true,
        functionName,
        environmentUpdated: true,
        criticalVarsSet: criticalVars.length
      };
    } else {
      console.log('\n❌ Some environment variables are still missing');
      return {
        success: false,
        missingVars: criticalVars.filter(v => !verifiedEnvVars[v] || verifiedEnvVars[v].trim() === '')
      };
    }
    
  } catch (error) {
    console.error('❌ Error fixing movie Lambda environment:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('💡 Movie Lambda function not found');
      console.log('💡 Check that the function name is correct');
    } else if (error.name === 'InvalidParameterValueException') {
      console.log('💡 Invalid parameter in environment variables');
      console.log('💡 Check that all values are valid strings');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the fix
fixMovieLambdaEnv()
  .then(result => {
    console.log('\n📋 Fix Summary:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(console.error);
