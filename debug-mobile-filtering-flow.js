const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambdaClient = new LambdaClient({ region: 'eu-west-1' });

async function debugMobileFilteringFlow() {
  console.log('🔍 Debugging mobile app filtering flow...');
  
  try {
    // Step 1: Simulate creating a room with Comedy + Horror
    console.log('\n📱 Step 1: Simulating room creation with Comedy + Horror...');
    
    const createRoomEvent = {
      info: {
        fieldName: 'createRoom'
      },
      arguments: {
        input: {
          name: 'Test Room - Comedy + Horror',
          mediaType: 'MOVIE',
          genreIds: [35, 27], // Comedy + Horror
          isPrivate: false,
          maxMembers: 2
        }
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6'
      }
    };
    
    const createRoomResponse = await lambdaClient.send(new InvokeCommand({
      FunctionName: 'trinity-room-dev',
      Payload: JSON.stringify(createRoomEvent),
      InvocationType: 'RequestResponse'
    }));
    
    if (createRoomResponse.FunctionError) {
      console.error('❌ Room creation failed:', createRoomResponse.FunctionError);
      return;
    }
    
    const roomData = JSON.parse(Buffer.from(createRoomResponse.Payload).toString());
    console.log('✅ Room created successfully:');
    console.log('- Room ID:', roomData.id);
    console.log('- Media Type:', roomData.mediaType);
    console.log('- Genre IDs:', roomData.genreIds);
    console.log('- Content IDs count:', roomData.contentIds?.length || 0);
    
    // Step 2: Test getRoom to see what the mobile app receives
    console.log('\n📱 Step 2: Testing getRoom (what mobile app calls)...');
    
    const getRoomEvent = {
      info: {
        fieldName: 'getRoom'
      },
      arguments: {
        roomId: roomData.id
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6'
      }
    };
    
    const getRoomResponse = await lambdaClient.send(new InvokeCommand({
      FunctionName: 'trinity-room-dev',
      Payload: JSON.stringify(getRoomEvent),
      InvocationType: 'RequestResponse'
    }));
    
    if (getRoomResponse.FunctionError) {
      console.error('❌ getRoom failed:', getRoomResponse.FunctionError);
      return;
    }
    
    const roomDetails = JSON.parse(Buffer.from(getRoomResponse.Payload).toString());
    console.log('✅ getRoom response:');
    console.log('- Media Type:', roomDetails.mediaType);
    console.log('- Genre IDs:', roomDetails.genreIds);
    console.log('- Genre Names:', roomDetails.genreNames);
    console.log('- Content IDs count:', roomDetails.contentIds?.length || 0);
    
    // Step 3: Test getFilteredContent with the same parameters
    console.log('\n📱 Step 3: Testing getFilteredContent (advanced filtering)...');
    
    const getFilteredContentEvent = {
      info: {
        fieldName: 'getFilteredContent'
      },
      arguments: {
        mediaType: roomDetails.mediaType,
        genreIds: roomDetails.genreIds,
        limit: 30,
        excludeIds: []
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6'
      }
    };
    
    const filteredContentResponse = await lambdaClient.send(new InvokeCommand({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(getFilteredContentEvent),
      InvocationType: 'RequestResponse'
    }));
    
    if (filteredContentResponse.FunctionError) {
      console.error('❌ getFilteredContent failed:', filteredContentResponse.FunctionError);
      
      // This would cause mobile app to fall back to legacy system
      console.log('💡 This failure would cause mobile app to use legacy system');
      
      // Test legacy system
      console.log('\n📱 Step 4: Testing legacy getMovies (fallback)...');
      await testLegacyFallback(roomData.id);
      
      return;
    }
    
    const filteredContent = JSON.parse(Buffer.from(filteredContentResponse.Payload).toString());
    console.log('✅ getFilteredContent response:');
    console.log('- Movies returned:', filteredContent?.length || 0);
    
    if (filteredContent && filteredContent.length > 0) {
      console.log('- Sample movies:');
      filteredContent.slice(0, 3).forEach((movie, index) => {
        console.log(`  ${index + 1}. ${movie.title} (${movie.vote_average})`);
      });
      
      console.log('\n✅ Advanced filtering is working!');
      console.log('💡 If you\'re seeing "Regreso al Futuro", it\'s not coming from here');
      
    } else {
      console.log('❌ getFilteredContent returned 0 movies');
      console.log('💡 This would cause mobile app to fall back to legacy system');
      
      // Test legacy system
      console.log('\n📱 Step 4: Testing legacy getMovies (fallback)...');
      await testLegacyFallback(roomData.id);
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

async function testLegacyFallback(roomId) {
  try {
    const legacyEvent = {
      info: {
        fieldName: 'getMovies'
      },
      arguments: {
        genre: null,
        page: 1,
        limit: 20,
        roomId: roomId // This is what mobile app passes
      },
      identity: {
        sub: '22c53444-20b1-7095-0706-8f68d93726b6'
      }
    };
    
    const legacyResponse = await lambdaClient.send(new InvokeCommand({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(legacyEvent),
      InvocationType: 'RequestResponse'
    }));
    
    if (legacyResponse.FunctionError) {
      console.error('❌ Legacy getMovies failed:', legacyResponse.FunctionError);
      return;
    }
    
    const legacyMovies = JSON.parse(Buffer.from(legacyResponse.Payload).toString());
    console.log('✅ Legacy getMovies response:');
    console.log('- Movies returned:', legacyMovies?.length || 0);
    
    if (legacyMovies && legacyMovies.length > 0) {
      console.log('- Sample legacy movies:');
      legacyMovies.slice(0, 5).forEach((movie, index) => {
        console.log(`  ${index + 1}. ${movie.title}`);
      });
      
      // Check if problematic movies are here
      const hasBackToFuture = legacyMovies.some(movie => 
        movie.title.toLowerCase().includes('regreso al futuro') ||
        movie.title.toLowerCase().includes('back to the future')
      );
      
      const hasLordOfRings = legacyMovies.some(movie => 
        movie.title.toLowerCase().includes('señor de los anillos') ||
        movie.title.toLowerCase().includes('lord of the rings')
      );
      
      console.log('\n🔍 Problematic movies in legacy system:');
      console.log(`- "Regreso al Futuro": ${hasBackToFuture ? '🎯 FOUND HERE!' : 'Not found'}`);
      console.log(`- "El Señor de los Anillos": ${hasLordOfRings ? '🎯 FOUND HERE!' : 'Not found'}`);
      
      if (hasBackToFuture || hasLordOfRings) {
        console.log('\n🚨 ROOT CAUSE IDENTIFIED:');
        console.log('❌ The mobile app is falling back to the legacy system');
        console.log('❌ Legacy system returns generic movies regardless of genre preferences');
        console.log('💡 Need to fix why getFilteredContent is failing or returning 0 results');
      }
    }
    
  } catch (error) {
    console.error('❌ Legacy fallback test failed:', error);
  }
}

// Run the debug
debugMobileFilteringFlow().catch(console.error);
