const { LambdaClient, GetFunctionCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function checkLambdaEnvironment() {
  console.log('🔍 Checking Lambda environment variables...');
  
  try {
    const functionName = 'trinity-room-dev'; // From CDK outputs
    
    const command = new GetFunctionCommand({
      FunctionName: functionName
    });
    
    const response = await lambdaClient.send(command);
    
    console.log('✅ Lambda function found');
    console.log('📊 Environment variables:');
    
    const envVars = response.Configuration?.Environment?.Variables || {};
    
    // Check specific variables we care about
    const importantVars = [
      'ROOMS_TABLE',
      'ROOM_MEMBERS_TABLE',
      'USERS_TABLE',
      'VOTES_TABLE'
    ];
    
    importantVars.forEach(varName => {
      const value = envVars[varName];
      console.log(`- ${varName}: ${value || 'NOT SET'}`);
    });
    
    console.log('\n🔍 All environment variables:');
    Object.entries(envVars).forEach(([key, value]) => {
      console.log(`- ${key}: ${value}`);
    });
    
    // Check if ROOMS_TABLE matches what we expect
    const expectedRoomsTable = 'trinity-rooms-dev-v2';
    const actualRoomsTable = envVars.ROOMS_TABLE;
    
    if (actualRoomsTable === expectedRoomsTable) {
      console.log(`✅ ROOMS_TABLE is correct: ${actualRoomsTable}`);
    } else {
      console.log(`❌ ROOMS_TABLE mismatch: Expected ${expectedRoomsTable}, Got ${actualRoomsTable}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking Lambda environment:', error);
  }
}

checkLambdaEnvironment();
