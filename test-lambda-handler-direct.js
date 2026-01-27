const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// Configuration
const dynamoClient = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function testLambdaHandlerDirect() {
  console.log('🧪 Testing Lambda handler directly after update...');
  
  try {
    // Step 1: Find an existing room with filtering data
    console.log('\n🔍 Step 1: Finding existing room with filtering data...');
    
    const scanResponse = await docClient.send(new ScanCommand({
      TableName: 'trinity-rooms-dev-v2',
      FilterExpression: 'attribute_exists(mediaType) AND attribute_exists(genreIds)',
      Limit: 5
    }));
    
    if (!scanResponse.Items || scanResponse.Items.length === 0) {
      console.log('❌ No rooms with filtering data found');
      console.log('💡 Create a new room with filtering through the mobile app first');
      return;
    }
    
    const testRoom = scanResponse.Items[0];
    console.log('✅ Found test room:');
    console.log('- Room ID:', testRoom.roomId);
    console.log('- Name:', testRoom.name);
    console.log('- Media Type:', testRoom.mediaType);
    console.log('- Genre IDs:', testRoom.genreIds);
    console.log('- Genre Names:', testRoom.genreNames);
    
    // Step 2: Test the Lambda handler directly
    console.log('\n🔍 Step 2: Testing Lambda handler directly...');
    
    const lambdaEvent = {
      info: {
        fieldName: 'getRoom'
      },
      arguments: {
        roomId: testRoom.roomId
      },
      identity: {
        sub: testRoom.hostId // Use the host ID as the user
      }
    };
    
    console.log('📤 Invoking Lambda with event:', JSON.stringify(lambdaEvent, null, 2));
    
    const invokeCommand = new InvokeCommand({
      FunctionName: 'trinity-room-dev',
      Payload: JSON.stringify(lambdaEvent),
      InvocationType: 'RequestResponse'
    });
    
    const lambdaResponse = await lambdaClient.send(invokeCommand);
    
    if (lambdaResponse.FunctionError) {
      console.error('❌ Lambda function error:', lambdaResponse.FunctionError);
      
      if (lambdaResponse.Payload) {
        const errorPayload = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
        console.error('❌ Error details:', errorPayload);
      }
      
      return;
    }
    
    const responsePayload = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
    
    console.log('✅ Lambda response received:');
    console.log('📊 Response payload:', JSON.stringify(responsePayload, null, 2));
    
    // Step 3: Verify the fix
    console.log('\n🔬 Step 3: Verifying the fix...');
    
    if (!responsePayload || typeof responsePayload !== 'object') {
      console.log('❌ Invalid response format');
      return;
    }
    
    const hasMediaType = responsePayload.mediaType !== null && responsePayload.mediaType !== undefined;
    const hasGenreIds = responsePayload.genreIds !== null && responsePayload.genreIds !== undefined;
    const hasGenreNames = responsePayload.genreNames !== null && responsePayload.genreNames !== undefined;
    
    console.log('🔍 Fix verification results:');
    console.log('- mediaType field present:', hasMediaType, hasMediaType ? `(${responsePayload.mediaType})` : '');
    console.log('- genreIds field present:', hasGenreIds, hasGenreIds ? `(${JSON.stringify(responsePayload.genreIds)})` : '');
    console.log('- genreNames field present:', hasGenreNames, hasGenreNames ? `(${JSON.stringify(responsePayload.genreNames)})` : '');
    
    // Compare with DynamoDB data
    console.log('\n📊 Comparison with DynamoDB data:');
    console.log('- DynamoDB mediaType:', testRoom.mediaType);
    console.log('- Lambda mediaType:', responsePayload.mediaType);
    console.log('- Match:', testRoom.mediaType === responsePayload.mediaType ? '✅' : '❌');
    
    console.log('- DynamoDB genreIds:', JSON.stringify(testRoom.genreIds));
    console.log('- Lambda genreIds:', JSON.stringify(responsePayload.genreIds));
    console.log('- Match:', JSON.stringify(testRoom.genreIds) === JSON.stringify(responsePayload.genreIds) ? '✅' : '❌');
    
    if (hasMediaType && hasGenreIds) {
      console.log('\n🎉 SUCCESS! The Lambda handler fix is working correctly!');
      console.log('✅ getRoom function now returns mediaType and genreIds fields');
      console.log('✅ Advanced content filtering data is being properly returned');
      console.log('✅ Mobile app should now receive correct filtering data instead of using mock movies');
      
      return {
        success: true,
        roomId: testRoom.roomId,
        mediaType: responsePayload.mediaType,
        genreIds: responsePayload.genreIds,
        genreNames: responsePayload.genreNames
      };
    } else {
      console.log('\n❌ FAILURE! The fix did not work as expected');
      console.log('❌ Some required fields are still missing from Lambda response');
      
      return {
        success: false,
        issues: {
          missingMediaType: !hasMediaType,
          missingGenreIds: !hasGenreIds,
          missingGenreNames: !hasGenreNames
        }
      };
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('💡 Lambda function or DynamoDB table not found');
      console.log('💡 Check that the function name and table names are correct');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testLambdaHandlerDirect()
  .then(result => {
    console.log('\n📋 Test Summary:');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(console.error);
