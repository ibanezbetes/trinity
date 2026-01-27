/**
 * Test Lambda Environment
 * 
 * Testing if Lambda has the correct environment variables
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testLambdaEnvironment() {
  console.log('🔍 Testing Lambda Environment...\n');

  try {
    // Get Lambda function configuration
    console.log('📡 Getting Lambda function configuration...');
    const config = await lambda.getFunctionConfiguration({
      FunctionName: 'trinity-movie-dev'
    }).promise();

    console.log('🔧 Environment Variables:');
    const envVars = config.Environment?.Variables || {};
    
    console.log(`   TMDB_API_KEY: ${envVars.TMDB_API_KEY ? '✅ Present' : '❌ Missing'}`);
    if (envVars.TMDB_API_KEY) {
      console.log(`   TMDB_API_KEY value: ${envVars.TMDB_API_KEY.substring(0, 8)}...`);
    }
    
    console.log(`   AWS_REGION: ${envVars.AWS_REGION || 'Not set'}`);
    console.log(`   NODE_ENV: ${envVars.NODE_ENV || 'Not set'}`);

    // Test a simple Lambda call to see if it can access TMDB
    console.log('\n📡 Testing Lambda TMDB access...');
    const testEvent = {
      info: { fieldName: 'getAvailableGenres' },
      arguments: {
        mediaType: 'TV'
      }
    };

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testEvent)
    }).promise();

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('❌ Lambda Error:', response.errorMessage);
      if (response.errorMessage.includes('TMDB_API_KEY')) {
        console.log('🔧 Lambda is missing TMDB_API_KEY environment variable');
      }
    } else {
      console.log(`✅ Lambda can access TMDB API - returned ${response.length} genres`);
    }

  } catch (error) {
    console.error('❌ Error testing Lambda environment:', error);
  }
}

// Run the test
testLambdaEnvironment().catch(console.error);
