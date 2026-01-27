const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function testGenreFilteringDebug() {
  console.log('🔍 Testing genre filtering for Comedy + Horror...');
  
  try {
    // Test with Comedy (35) + Horror (27) genres
    const movieLambdaEvent = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [35, 27], // Comedy + Horror
        limit: 10,
        excludeIds: []
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6'
      }
    };
    
    console.log('📤 Testing Comedy + Horror filtering...');
    console.log('🎭 Genre IDs: 35 (Comedy), 27 (Horror)');
    
    const invokeCommand = new InvokeCommand({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(movieLambdaEvent),
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
    
    console.log('✅ Lambda response received');
    console.log(`📊 Movies returned: ${responsePayload?.length || 0}`);
    
    if (responsePayload && responsePayload.length > 0) {
      console.log('\n🎬 Movies returned for Comedy + Horror:');
      
      responsePayload.slice(0, 5).forEach((movie, index) => {
        console.log(`${index + 1}. ${movie.title}`);
        console.log(`   - ID: ${movie.id}`);
        console.log(`   - Overview: ${movie.overview?.substring(0, 100)}...`);
        console.log(`   - Rating: ${movie.vote_average}`);
        console.log('');
      });
      
      // Check if these are actually Comedy + Horror movies
      console.log('🔍 Genre Analysis:');
      console.log('- Expected: Movies that are BOTH Comedy AND Horror');
      console.log('- Or: Movies that have EITHER Comedy OR Horror genres');
      console.log('');
      
      // Let's check what "Regreso al Futuro" would return
      console.log('🔍 Let\'s check what genres "Regreso al Futuro" actually has...');
      
    } else {
      console.log('❌ No movies returned for Comedy + Horror combination');
      console.log('💡 This might indicate the filtering logic is too restrictive');
    }
    
    // Test with just Comedy to see what we get
    console.log('\n🧪 Testing with just Comedy (35) for comparison...');
    
    const comedyOnlyEvent = {
      ...movieLambdaEvent,
      arguments: {
        ...movieLambdaEvent.arguments,
        genreIds: [35] // Just Comedy
      }
    };
    
    const comedyResponse = await lambdaClient.send(new InvokeCommand({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(comedyOnlyEvent),
      InvocationType: 'RequestResponse'
    }));
    
    if (!comedyResponse.FunctionError) {
      const comedyPayload = JSON.parse(Buffer.from(comedyResponse.Payload).toString());
      console.log(`📊 Comedy-only movies returned: ${comedyPayload?.length || 0}`);
      
      if (comedyPayload && comedyPayload.length > 0) {
        console.log('\n🎭 Sample Comedy movies:');
        comedyPayload.slice(0, 3).forEach((movie, index) => {
          console.log(`${index + 1}. ${movie.title} (Rating: ${movie.vote_average})`);
        });
      }
    }
    
    // Test with just Horror to see what we get
    console.log('\n🧪 Testing with just Horror (27) for comparison...');
    
    const horrorOnlyEvent = {
      ...movieLambdaEvent,
      arguments: {
        ...movieLambdaEvent.arguments,
        genreIds: [27] // Just Horror
      }
    };
    
    const horrorResponse = await lambdaClient.send(new InvokeCommand({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(horrorOnlyEvent),
      InvocationType: 'RequestResponse'
    }));
    
    if (!horrorResponse.FunctionError) {
      const horrorPayload = JSON.parse(Buffer.from(horrorResponse.Payload).toString());
      console.log(`📊 Horror-only movies returned: ${horrorPayload?.length || 0}`);
      
      if (horrorPayload && horrorPayload.length > 0) {
        console.log('\n👻 Sample Horror movies:');
        horrorPayload.slice(0, 3).forEach((movie, index) => {
          console.log(`${index + 1}. ${movie.title} (Rating: ${movie.vote_average})`);
        });
      }
    }
    
    console.log('\n📋 Analysis Summary:');
    console.log('1. If Comedy + Horror returns 0 movies: The filtering is too restrictive (AND logic)');
    console.log('2. If Comedy + Horror returns wrong movies: The filtering logic is incorrect');
    console.log('3. If individual genres work but combination doesn\'t: Need to fix the combination logic');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Also test what the mobile app is actually sending
async function testMobileAppScenario() {
  console.log('\n🔍 Testing exact mobile app scenario...');
  
  try {
    // This simulates what the mobile app sends when user selects Comedy + Horror
    const mobileAppEvent = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: 'MOVIE',
        genreIds: [35, 27], // Comedy + Horror as selected in mobile
        limit: 30,
        excludeIds: []
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6'
      }
    };
    
    console.log('📱 Simulating mobile app request:');
    console.log('- Media Type: MOVIE');
    console.log('- Genres: [35, 27] (Comedy + Horror)');
    console.log('- Limit: 30');
    
    const invokeCommand = new InvokeCommand({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(mobileAppEvent),
      InvocationType: 'RequestResponse'
    });
    
    const lambdaResponse = await lambdaClient.send(invokeCommand);
    
    if (lambdaResponse.FunctionError) {
      console.error('❌ Mobile app scenario failed:', lambdaResponse.FunctionError);
      return;
    }
    
    const responsePayload = JSON.parse(Buffer.from(lambdaResponse.Payload).toString());
    
    console.log(`📊 Mobile app would receive: ${responsePayload?.length || 0} movies`);
    
    if (responsePayload && responsePayload.length > 0) {
      console.log('\n🎬 Movies that mobile app is receiving:');
      
      responsePayload.slice(0, 5).forEach((movie, index) => {
        console.log(`${index + 1}. "${movie.title}"`);
        console.log(`   - Should this be Comedy + Horror? Let's check...`);
        
        // Check if title suggests it's actually Comedy or Horror
        const title = movie.title.toLowerCase();
        const overview = movie.overview?.toLowerCase() || '';
        
        const seemsComedy = title.includes('comedy') || title.includes('funny') || 
                           overview.includes('comedy') || overview.includes('funny') ||
                           overview.includes('humor');
        
        const seemsHorror = title.includes('horror') || title.includes('terror') || 
                           title.includes('scary') || overview.includes('horror') ||
                           overview.includes('terror') || overview.includes('miedo');
        
        console.log(`   - Seems Comedy: ${seemsComedy ? '✅' : '❌'}`);
        console.log(`   - Seems Horror: ${seemsHorror ? '✅' : '❌'}`);
        console.log('');
      });
      
      // Check if "Regreso al Futuro" or "El Señor de los Anillos" are in the results
      const hasBackToFuture = responsePayload.some(movie => 
        movie.title.toLowerCase().includes('regreso al futuro') ||
        movie.title.toLowerCase().includes('back to the future')
      );
      
      const hasLordOfRings = responsePayload.some(movie => 
        movie.title.toLowerCase().includes('señor de los anillos') ||
        movie.title.toLowerCase().includes('lord of the rings')
      );
      
      console.log('🔍 Problematic movies check:');
      console.log(`- "Regreso al Futuro" in results: ${hasBackToFuture ? '❌ YES (WRONG!)' : '✅ No'}`);
      console.log(`- "El Señor de los Anillos" in results: ${hasLordOfRings ? '❌ YES (WRONG!)' : '✅ No'}`);
      
      if (hasBackToFuture || hasLordOfRings) {
        console.log('\n🚨 PROBLEM CONFIRMED:');
        console.log('❌ The filtering is returning movies that don\'t match Comedy + Horror');
        console.log('💡 The movie handler filtering logic needs to be fixed');
      }
    }
    
  } catch (error) {
    console.error('❌ Mobile app scenario test failed:', error);
  }
}

// Run both tests
async function runAllTests() {
  await testGenreFilteringDebug();
  await testMobileAppScenario();
}

runAllTests().catch(console.error);
