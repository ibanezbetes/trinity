const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function testFilteredContentResolver() {
  console.log('🧪 Testing getFilteredContent resolver...');
  
  try {
    // Test the movie handler directly
    const movieLambdaEvent = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [12, 878], // Adventure, Science Fiction
        limit: 30,
        excludeIds: []
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6' // Test user ID
      }
    };
    
    console.log('📤 Invoking movie Lambda with event:', JSON.stringify(movieLambdaEvent, null, 2));
    
    const invokeCommand = new InvokeCommand({
      FunctionName: 'trinity-movie-dev', // Movie handler function
      Payload: JSON.stringify(movieLambdaEvent),
      InvocationType: 'RequestResponse'
    });
    
    const lambdaResponse = await lambdaClient.send(invokeCommand);
    
    if (lambdaResponse.FunctionError) {
      console.error('❌ Movie Lambda function error:', lambdaResponse.FunctionError);
      
      if (lambdaResponse.Payload) {
        const errorPayload = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
        console.error('❌ Error details:', errorPayload);
      }
      
      return;
    }
    
    const responsePayload = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
    
    console.log('✅ Movie Lambda response received:');
    console.log('📊 Response payload:', JSON.stringify(responsePayload, null, 2));
    
    // Analyze the response
    if (Array.isArray(responsePayload)) {
      console.log(`✅ Filtered content returned: ${responsePayload.length} items`);
      
      if (responsePayload.length > 0) {
        console.log('📊 Sample movie:', JSON.stringify(responsePayload[0], null, 2));
      } else {
        console.log('❌ No movies returned - this is the problem!');
      }
    } else if (responsePayload && responsePayload.length !== undefined) {
      console.log(`✅ Filtered content returned: ${responsePayload.length} items`);
    } else {
      console.log('❌ Unexpected response format:', typeof responsePayload);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error.name === 'ResourceNotFoundException') {
      console.log('💡 Movie Lambda function not found');
      console.log('💡 Check that the function name is correct');
    }
  }
}

// Also test the legacy getMovies to compare
async function testLegacyMovies() {
  console.log('\n🧪 Testing legacy getMovies for comparison...');
  
  try {
    const legacyEvent = {
      info: {
        fieldName: 'getMovies'
      },
      arguments: {
        genre: null,
        page: 1,
        limit: 20
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6'
      }
    };
    
    console.log('📤 Invoking movie Lambda with legacy event:', JSON.stringify(legacyEvent, null, 2));
    
    const invokeCommand = new InvokeCommand({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(legacyEvent),
      InvocationType: 'RequestResponse'
    });
    
    const lambdaResponse = await lambdaClient.send(invokeCommand);
    
    if (lambdaResponse.FunctionError) {
      console.error('❌ Legacy Lambda function error:', lambdaResponse.FunctionError);
      return;
    }
    
    const responsePayload = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
    
    console.log('✅ Legacy movies response:');
    console.log(`📊 Movies returned: ${responsePayload?.length || 0}`);
    
    if (responsePayload && responsePayload.length > 0) {
      console.log('📊 Sample legacy movie:', JSON.stringify(responsePayload[0], null, 2));
    }
    
  } catch (error) {
    console.error('❌ Legacy test failed:', error);
  }
}

// Run both tests
async function runAllTests() {
  await testFilteredContentResolver();
  await testLegacyMovies();
  
  console.log('\n📋 Summary:');
  console.log('- If getFilteredContent returns 0 items but getMovies returns items,');
  console.log('  then the movie handler needs to be updated with the filtering logic');
  console.log('- If both return 0 items, there might be a broader issue with the movie data');
}

runAllTests().catch(console.error);
