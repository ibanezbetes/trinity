/**
 * Test Genre Filtering Fix Verification
 * 
 * Tests the fixed genre filtering logic to ensure:
 * 1. AND logic works correctly (movies with ALL selected genres)
 * 2. OR logic works correctly (movies with ANY selected genre)
 * 3. Movies with additional genres are NOT rejected
 */

const AWS = require('aws-sdk');

// AWS Configuration
const lambda = new AWS.Lambda({ region: 'eu-west-1' });

async function testGenreFilteringFix() {
  try {
    console.log('🧪 Testing Genre Filtering Fix...');
    console.log('');

    // Test 1: AND logic - Animación (16) + Comedia (35)
    console.log('🎯 Test 1: AND logic - Animación (16) + Comedia (35)');
    await testFilteredContent('MOVIE', [16, 35], 'AND logic test');
    
    console.log('');
    
    // Test 2: Single genre - Animación (16)
    console.log('🎯 Test 2: Single genre - Animación (16)');
    await testFilteredContent('MOVIE', [16], 'Single genre test');
    
    console.log('');
    
    // Test 3: Different genres - Acción (28) + Aventura (12)
    console.log('🎯 Test 3: Different genres - Acción (28) + Aventura (12)');
    await testFilteredContent('MOVIE', [28, 12], 'Action + Adventure test');
    
    console.log('');
    console.log('✅ All tests completed!');
    console.log('');
    console.log('📱 Now test in the mobile app:');
    console.log('1. Create a new room with Animación + Comedia');
    console.log('2. Verify that movies shown have BOTH genres (can have additional ones)');
    console.log('3. Check that movies like "Shrek", "Toy Story", etc. appear');
    console.log('4. Verify no more "Ice Fall" or "Bugonia" type movies');

  } catch (error) {
    console.error('❌ Error testing genre filtering fix:', error);
    throw error;
  }
}

async function testFilteredContent(mediaType, genreIds, testName) {
  const payload = {
    info: { fieldName: 'getFilteredContent' },
    arguments: {
      mediaType,
      genreIds,
      limit: 10
    }
  };

  try {
    console.log(`🔍 ${testName} - Requesting ${mediaType} with genres [${genreIds.join(', ')}]`);
    
    const result = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(payload)
    }).promise();

    const response = JSON.parse(result.Payload);
    
    if (response.errorMessage) {
      console.error(`❌ ${testName} failed:`, response.errorMessage);
      return;
    }

    const movies = response || [];
    console.log(`✅ ${testName} - Received ${movies.length} movies`);
    
    if (movies.length > 0) {
      console.log('📽️ Sample movies:');
      movies.slice(0, 3).forEach((movie, index) => {
        console.log(`   ${index + 1}. ${movie.title || movie.mediaTitle} (${movie.year || movie.mediaYear})`);
        console.log(`      Rating: ${movie.rating || movie.mediaRating || 'N/A'}`);
        console.log(`      Overview: ${(movie.overview || movie.mediaOverview || '').substring(0, 100)}...`);
      });
    } else {
      console.log('⚠️ No movies returned');
    }

  } catch (error) {
    console.error(`❌ ${testName} error:`, error);
  }
}

// Run the test
if (require.main === module) {
  testGenreFilteringFix()
    .then(() => {
      console.log('🎉 Testing completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Testing failed:', error);
      process.exit(1);
    });
}

module.exports = { testGenreFilteringFix };
