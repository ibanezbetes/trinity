const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'eu-west-1' });
const docClient = DynamoDBDocumentClient.from(client);

async function testContentFiltering() {
  console.log('🧪 TESTING CONTENT FILTERING SYSTEM\n');

  // Test 1: Check environment variables
  console.log('1️⃣ Checking environment variables...');
  console.log(`   TMDB_API_KEY: ${process.env.TMDB_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log(`   HF_API_TOKEN: ${process.env.HF_API_TOKEN ? 'SET' : 'NOT SET'}`);
  console.log(`   HUGGINGFACE_API_KEY: ${process.env.HUGGINGFACE_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log('');

  // Test 2: Test TMDB API directly
  console.log('2️⃣ Testing TMDB API directly...');
  try {
    const tmdbUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${process.env.TMDB_API_KEY}&with_genres=28,12&language=es-ES&sort_by=popularity.desc&page=1&include_adult=false`;
    console.log(`   Making request to: ${tmdbUrl.replace(process.env.TMDB_API_KEY, 'HIDDEN')}`);
    
    const response = await fetch(tmdbUrl);
    console.log(`   Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`   ✅ TMDB API working: ${data.results?.length || 0} movies found`);
      if (data.results && data.results.length > 0) {
        console.log(`   First movie: ${data.results[0].title} (${data.results[0].id})`);
      }
    } else {
      console.log(`   ❌ TMDB API error: ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ TMDB API error: ${error.message}`);
  }
  console.log('');

  // Test 3: Test ContentFilterService locally
  console.log('3️⃣ Testing ContentFilterService locally...');
  try {
    // Import the service (this will fail if there are import issues)
    const { ContentFilterService } = require('./infrastructure/src/services/content-filter-service');
    console.log('   ✅ ContentFilterService imported successfully');
    
    const service = new ContentFilterService();
    console.log('   ✅ ContentFilterService instantiated');
    
    // Test creating filtered room
    const criteria = {
      mediaType: 'MOVIE',
      genres: [28, 12], // Action, Adventure
      roomId: 'test-room-123'
    };
    
    console.log('   Testing createFilteredRoom...');
    const contentPool = await service.createFilteredRoom(criteria);
    console.log(`   ✅ Content pool created: ${contentPool.length} items`);
    
    if (contentPool.length > 0) {
      console.log(`   First item: ${contentPool[0].title} (${contentPool[0].tmdbId})`);
    }
    
  } catch (error) {
    console.log(`   ❌ ContentFilterService error: ${error.message}`);
    console.log(`   Stack: ${error.stack}`);
  }
  console.log('');

  // Test 4: Check a recent room in DynamoDB
  console.log('4️⃣ Checking recent room in DynamoDB...');
  try {
    const scanResult = await docClient.send(new GetCommand({
      TableName: 'trinity-rooms-dev-v2',
      Key: { PK: '2fcc6ee6-214c-47e6-bf6a-624cc5f65f3f', SK: 'ROOM' }
    }));

    if (scanResult.Item) {
      const room = scanResult.Item;
      console.log(`   Room found: ${room.name}`);
      console.log(`   mediaType: ${room.mediaType}`);
      console.log(`   genreIds: ${JSON.stringify(room.genreIds)}`);
      console.log(`   genreNames: ${JSON.stringify(room.genreNames)}`);
      console.log(`   contentIds: ${room.contentIds ? `[${room.contentIds.length} items]` : 'null'}`);
      console.log(`   filterCriteria: ${room.filterCriteria ? 'SET' : 'null'}`);
      console.log(`   lastContentRefresh: ${room.lastContentRefresh || 'null'}`);
    } else {
      console.log('   ❌ Room not found');
    }
  } catch (error) {
    console.log(`   ❌ DynamoDB error: ${error.message}`);
  }
}

testContentFiltering().catch(console.error);
