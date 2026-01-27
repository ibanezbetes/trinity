// Simulate Lambda environment variables
process.env.TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
process.env.HUGGINGFACE_API_KEY = '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';
process.env.ROOMS_TABLE = 'trinity-rooms-dev-v2';

async function testLambdaSimulation() {
  console.log('🚀 SIMULATING LAMBDA ENVIRONMENT\n');

  // Test 1: Check environment variables
  console.log('1️⃣ Environment variables in Lambda simulation:');
  console.log(`   TMDB_API_KEY: ${process.env.TMDB_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log('');

  // Test 2: Test TMDB API with correct key
  console.log('2️⃣ Testing TMDB API with Lambda environment...');
  try {
    const tmdbUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&with_genres=28,12&language=es-ES&sort_by=popularity.desc&page=1&include_adult=false`;
    
    const response = await fetch(tmdbUrl);
    console.log(`   Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ TMDB API working: ${data.results?.length || 0} movies found`);
      if (data.results && data.results.length > 0) {
        console.log(`   First movie: ${data.results[0].title} (${data.results[0].id})`);
      }
    } else {
      const errorText = await response.text();
      console.log(`   ❌ TMDB API error: ${response.statusText}`);
      console.log(`   Error details: ${errorText}`);
    }
  } catch (error) {
    console.log(`   ❌ TMDB API error: ${error.message}`);
  }
  console.log('');

  // Test 3: Test ContentFilterService with Lambda environment
  console.log('3️⃣ Testing ContentFilterService with Lambda environment...');
  try {
    const { ContentFilterService } = require('./infrastructure/src/services/content-filter-service');
    console.log('   ✅ ContentFilterService imported successfully');
    
    const service = new ContentFilterService();
    console.log('   ✅ ContentFilterService instantiated');
    
    // Test creating filtered room
    const criteria = {
      mediaType: 'MOVIE',
      genres: [28, 12], // Action, Adventure
      roomId: 'test-room-lambda-123'
    };
    
    console.log('   Testing createFilteredRoom...');
    const contentPool = await service.createFilteredRoom(criteria);
    console.log(`   ✅ Content pool created: ${contentPool.length} items`);
    
    if (contentPool.length > 0) {
      console.log(`   First item: ${contentPool[0].title} (${contentPool[0].tmdbId})`);
      console.log(`   Priority levels: ${contentPool.map(c => c.priority).join(', ')}`);
    }
    
  } catch (error) {
    console.log(`   ❌ ContentFilterService error: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
  }
  console.log('');

  // Test 4: Test room creation logic simulation
  console.log('4️⃣ Simulating room creation logic...');
  try {
    const input = {
      name: 'Test Room Lambda',
      mediaType: 'MOVIE',
      genreIds: [28, 12],
      isPrivate: false,
      maxMembers: 2
    };

    console.log('   Input:', JSON.stringify(input, null, 2));
    
    // Simulate the room creation logic from the handler
    let contentIds = [];
    let genreNames = [];
    let filterCriteria;

    if (input.mediaType && input.genreIds !== undefined) {
      console.log(`   🎯 New filtering system: ${input.mediaType}, genres: [${input.genreIds.join(', ')}]`);

      try {
        // Create filter criteria
        filterCriteria = {
          mediaType: input.mediaType,
          genres: input.genreIds,
          roomId: 'test-room-lambda-123'
        };

        // Get content filtering service
        const { ContentFilterService } = require('./infrastructure/src/services/content-filter-service');
        const contentService = new ContentFilterService();

        // Load genre names for UI
        if (input.genreIds.length > 0 && filterCriteria) {
          const availableGenres = await contentService.getAvailableGenres(filterCriteria.mediaType);
          const genreMap = new Map(availableGenres.map(g => [g.id, g.name]));
          genreNames = input.genreIds.map(id => genreMap.get(id) || 'Unknown');
          console.log(`   ✅ Genre names mapped: ${genreNames.join(', ')}`);
        }

        // Load initial content pool using content filtering service
        const contentPool = await contentService.createFilteredRoom(filterCriteria);
        contentIds = contentPool.map(content => content.tmdbId);
        
        console.log(`   ✅ Content filtering: loaded ${contentIds.length} titles for ${input.mediaType} with genres [${input.genreIds.join(', ')}]`);

      } catch (error) {
        console.error('   ❌ Content filtering failed:', error.message);
        
        // Reset to empty state (this is what happens in the actual handler)
        contentIds = [];
        genreNames = [];
        filterCriteria = undefined;
      }
    }

    console.log('   Final result:');
    console.log(`     contentIds: ${contentIds.length > 0 ? `[${contentIds.length} items]` : 'null'}`);
    console.log(`     genreNames: ${genreNames.length > 0 ? JSON.stringify(genreNames) : 'null'}`);
    console.log(`     filterCriteria: ${filterCriteria ? 'SET' : 'null'}`);
    
  } catch (error) {
    console.log(`   ❌ Room creation simulation error: ${error.message}`);
  }
}

testLambdaSimulation().catch(console.error);
