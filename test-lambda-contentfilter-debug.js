// Test ContentFilterService in Lambda-like environment
process.env.TMDB_API_KEY = 'dc4dbcd2404c1ca852f8eb964add267d';
process.env.HUGGINGFACE_API_KEY = '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';
process.env.AWS_REGION = 'eu-west-1';

async function testContentFilterServiceDebug() {
  console.log('🔍 DEBUGGING CONTENTFILTERSERVICE IN LAMBDA ENVIRONMENT\n');

  try {
    console.log('1️⃣ Testing individual service imports...');

    // Test EnhancedTMDBClient
    console.log('   Testing EnhancedTMDBClient...');
    try {
      const { EnhancedTMDBClient } = require('./infrastructure/src/services/enhanced-tmdb-client');
      const tmdbClient = new EnhancedTMDBClient();
      console.log('   ✅ EnhancedTMDBClient instantiated successfully');
      
      // Test a simple API call
      const genres = await tmdbClient.getGenres('MOVIE');
      console.log(`   ✅ TMDB API call successful: ${genres.length} genres`);
    } catch (error) {
      console.log(`   ❌ EnhancedTMDBClient failed: ${error.message}`);
      console.log(`   Stack: ${error.stack}`);
    }

    // Test PriorityAlgorithmEngine
    console.log('   Testing PriorityAlgorithmEngine...');
    try {
      const { PriorityAlgorithmEngine } = require('./infrastructure/src/services/priority-algorithm');
      const priorityAlgorithm = new PriorityAlgorithmEngine();
      console.log('   ✅ PriorityAlgorithmEngine instantiated successfully');
    } catch (error) {
      console.log(`   ❌ PriorityAlgorithmEngine failed: ${error.message}`);
      console.log(`   Stack: ${error.stack}`);
    }

    // Test FilterCacheManager (most likely to fail)
    console.log('   Testing FilterCacheManager...');
    try {
      const { FilterCacheManager } = require('./infrastructure/src/services/filter-cache-manager');
      const cacheManager = new FilterCacheManager();
      console.log('   ✅ FilterCacheManager instantiated successfully');
      
      // Test a simple cache operation (this will likely fail)
      const testCriteria = {
        mediaType: 'MOVIE',
        genres: [28, 12],
        roomId: 'test-room'
      };
      
      console.log('   Testing cache operation...');
      const cachedContent = await cacheManager.getCachedContent(testCriteria);
      console.log(`   ✅ Cache operation successful: ${cachedContent ? 'found' : 'not found'}`);
    } catch (error) {
      console.log(`   ❌ FilterCacheManager failed: ${error.message}`);
      console.log(`   Stack: ${error.stack}`);
    }

    console.log('\n2️⃣ Testing ContentFilterService instantiation...');
    try {
      const { ContentFilterService } = require('./infrastructure/src/services/content-filter-service');
      const contentService = new ContentFilterService();
      console.log('   ✅ ContentFilterService instantiated successfully');

      console.log('\n3️⃣ Testing ContentFilterService.getAvailableGenres...');
      const genres = await contentService.getAvailableGenres('MOVIE');
      console.log(`   ✅ getAvailableGenres successful: ${genres.length} genres`);

      console.log('\n4️⃣ Testing ContentFilterService.createFilteredRoom...');
      const criteria = {
        mediaType: 'MOVIE',
        genres: [28, 12], // Action, Adventure
        roomId: 'test-room-debug'
      };

      console.log('   Calling createFilteredRoom...');
      const contentPool = await contentService.createFilteredRoom(criteria);
      console.log(`   ✅ createFilteredRoom successful: ${contentPool.length} items`);

      if (contentPool.length > 0) {
        console.log(`   First item: ${contentPool[0].title} (${contentPool[0].tmdbId})`);
        console.log(`   Priority distribution: ${contentPool.map(c => c.priority).join(', ')}`);
      }

    } catch (error) {
      console.log(`   ❌ ContentFilterService failed: ${error.message}`);
      console.log(`   Error name: ${error.name}`);
      console.log(`   Stack: ${error.stack}`);
      
      // Check if it's a specific type of error
      if (error.message.includes('ResourceNotFoundException')) {
        console.log('\n   💡 This looks like a DynamoDB table issue');
        console.log('   The FilterCacheManager is trying to access tables that don\'t exist');
        console.log('   This is expected in local testing - the service should gracefully degrade');
      }
      
      if (error.message.includes('TMDB')) {
        console.log('\n   💡 This looks like a TMDB API issue');
        console.log('   Check API key and network connectivity');
      }
    }

    console.log('\n5️⃣ Testing the exact same flow as Lambda handler...');
    try {
      // Simulate the exact same code as in the Lambda handler
      const { ContentFilterService } = require('./infrastructure/src/services/content-filter-service');
      
      const input = {
        name: 'Test Room Debug',
        mediaType: 'MOVIE',
        genreIds: [12, 878], // Adventure, Science Fiction
        maxMembers: 2,
        isPrivate: false
      };

      console.log('   Input:', JSON.stringify(input, null, 2));

      // Create filter criteria (same as handler)
      const filterCriteria = {
        mediaType: input.mediaType,
        genres: input.genreIds,
        roomId: 'test-room-lambda-debug'
      };

      console.log('   Filter criteria:', JSON.stringify(filterCriteria, null, 2));

      // Get content filtering service (same as handler)
      const contentService = new ContentFilterService();
      console.log('   ✅ ContentFilterService instantiated');

      // Load genre names for UI (same as handler)
      if (input.genreIds.length > 0 && filterCriteria) {
        const availableGenres = await contentService.getAvailableGenres(filterCriteria.mediaType);
        const genreMap = new Map(availableGenres.map(g => [g.id, g.name]));
        const genreNames = input.genreIds.map(id => genreMap.get(id) || 'Unknown');
        console.log(`   ✅ Genre names mapped: ${genreNames.join(', ')}`);
      }

      // Load initial content pool using content filtering service (same as handler)
      console.log('   Calling createFilteredRoom...');
      const contentPool = await contentService.createFilteredRoom(filterCriteria);
      const contentIds = contentPool.map(content => content.tmdbId);
      
      console.log(`   ✅ Content filtering: loaded ${contentIds.length} titles for ${input.mediaType} with genres [${input.genreIds.join(', ')}]`);

      console.log('\n   🎉 SUCCESS: ContentFilterService works perfectly!');
      console.log(`   Generated ${contentIds.length} filtered content IDs`);
      console.log(`   This means the issue is elsewhere in the Lambda environment`);

    } catch (error) {
      console.log(`   ❌ Lambda simulation failed: ${error.message}`);
      console.log(`   Error name: ${error.name}`);
      console.log(`   Stack: ${error.stack}`);
      
      console.log('\n   🔍 This is the exact error happening in Lambda!');
      console.log('   The ContentFilterService is failing during execution');
    }

  } catch (error) {
    console.error('❌ Debug test failed:', error);
  }
}

testContentFilterServiceDebug().catch(console.error);
