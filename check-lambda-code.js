const { LambdaClient, GetFunctionCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function checkLambdaCode() {
  console.log('🔍 Checking Lambda function code...');
  
  try {
    const functionName = 'trinity-room-dev';
    
    const command = new GetFunctionCommand({
      FunctionName: functionName
    });
    
    const response = await lambdaClient.send(command);
    
    console.log('✅ Lambda function found');
    console.log('📊 Function details:');
    console.log('- Runtime:', response.Configuration?.Runtime);
    console.log('- Handler:', response.Configuration?.Handler);
    console.log('- Last Modified:', response.Configuration?.LastModified);
    console.log('- Code Size:', response.Configuration?.CodeSize);
    console.log('- Code SHA256:', response.Configuration?.CodeSha256);
    
    // Check if there's a newer version
    console.log('\n🔍 Function configuration:');
    console.log('- Timeout:', response.Configuration?.Timeout);
    console.log('- Memory:', response.Configuration?.MemorySize);
    console.log('- State:', response.Configuration?.State);
    console.log('- Last Update Status:', response.Configuration?.LastUpdateStatus);
    
    if (response.Configuration?.LastUpdateStatus !== 'Successful') {
      console.log('❌ Last update was not successful!');
    } else {
      console.log('✅ Last update was successful');
    }
    
  } catch (error) {
    console.error('❌ Error checking Lambda function:', error);
  }
}

checkLambdaCode();
