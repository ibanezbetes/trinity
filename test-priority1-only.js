/**
 * Test Priority 1 Only
 * 
 * Testing just Priority 1 logic to see if it's working
 */

const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({
  region: 'eu-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const lambda = new AWS.Lambda();

async function testPriority1Only() {
  console.log('🔍 Testing Priority 1 Only...\n');

  try {
    // Create a custom test event that will help us debug Priority 1
    const testEvent = {
      info: { fieldName: 'testPriority1Debug' }, // Custom field name for debugging
      arguments: {
        mediaType: 'TV',
        genreIds: [16, 35], // Animation + Comedy
        excludeIds: []
      }
    };

    console.log('📡 Testing Priority 1 logic directly...');
    console.log('Parameters:', JSON.stringify(testEvent.arguments, null, 2));

    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(testEvent),
      LogType: 'Tail' // Get the logs
    }).promise();

    // Decode and display logs
    if (result.LogResult) {
      const logs = Buffer.from(result.LogResult, 'base64').toString();
      console.log('\n📋 Lambda Logs:');
      console.log('=' .repeat(80));
      console.log(logs);
      console.log('=' .repeat(80));
    }

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error('\n❌ Lambda Error:', response.errorMessage);
      
      // If it's an unsupported operation, that's expected
      if (response.errorMessage.includes('testPriority1Debug')) {
        console.log('\n✅ This is expected - we used a custom field name to trigger debug logging');
        console.log('The important part is the logs above showing Priority 1 execution');
      }
    } else {
      console.log('\n📊 Unexpected success - got response:', response);
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }
}

// Run the test
testPriority1Only().catch(console.error);
