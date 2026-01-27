const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function testHandlerAfterFix() {
  console.log('🔍 Testing handler after dependency fix...');
  
  try {
    const functionName = 'trinity-room-dev';
    
    // Create a test event for getUserRooms
    const testEvent = {
      info: {
        fieldName: 'getUserRooms'
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6' // Your user ID
      },
      arguments: {}
    };
    
    console.log('🚀 Invoking Lambda function...');
    
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(testEvent)
    });
    
    const result = await lambdaClient.send(command);
    
    if (result.Payload) {
      const response = JSON.parse(Buffer.from(result.Payload).toString());
      
      console.log('✅ Lambda invocation successful!');
      console.log('📊 Response:', JSON.stringify(response, null, 2));
      
      if (response.errorMessage) {
        console.log('❌ Handler returned error:', response.errorMessage);
      } else {
        console.log('✅ Handler executed successfully');
        
        if (Array.isArray(response)) {
          console.log(`📋 Found ${response.length} rooms`);
          
          // Check if any room has the filtering fields
          const roomsWithFiltering = response.filter(room => room.mediaType && room.genreIds);
          console.log(`🎯 Rooms with filtering: ${roomsWithFiltering.length}`);
          
          if (roomsWithFiltering.length > 0) {
            console.log('✅ Filtering fields are being returned correctly!');
            roomsWithFiltering.forEach((room, index) => {
              console.log(`Room ${index + 1}:`, {
                id: room.id,
                name: room.name,
                mediaType: room.mediaType,
                genreIds: room.genreIds,
                genreNames: room.genreNames
              });
            });
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing handler:', error);
  }
}

testHandlerAfterFix();
