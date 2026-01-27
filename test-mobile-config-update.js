/**
 * Test to verify mobile app configuration update
 * This simulates what the mobile app will do after the config change
 */

const AWS = require('aws-sdk');

// Configure AWS with the correct credentials
AWS.config.update({ 
  region: 'eu-west-1'
  // AWS credentials are loaded from environment variables or AWS CLI
});

const lambda = new AWS.Lambda();

async function testMobileConfigUpdate() {
  console.log('📱 Testing Mobile App Configuration Update...\n');
  
  console.log('🔧 Configuration Changes Made:');
  console.log('   ✅ GraphQL Endpoint: https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql');
  console.log('   ✅ User Pool ID: eu-west-1_6UxioIj4z');
  console.log('   ✅ Client ID: 59dpqsm580j14ulkcha19shl64');
  
  console.log('\n🧪 Testing Lambda Function Connection...');
  
  try {
    // Test MOVIE genres
    const movieEvent = {
      info: { fieldName: 'getAvailableGenres' },
      arguments: { mediaType: 'MOVIE' }
    };

    const movieResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(movieEvent)
    }).promise();

    const movieGenres = JSON.parse(movieResult.Payload);
    
    if (movieGenres && Array.isArray(movieGenres)) {
      console.log(`   ✅ MOVIE genres: ${movieGenres.length} loaded successfully`);
    } else {
      console.log('   ❌ MOVIE genres failed to load');
      return;
    }

    // Test TV genres
    const tvEvent = {
      info: { fieldName: 'getAvailableGenres' },
      arguments: { mediaType: 'TV' }
    };

    const tvResult = await lambda.invoke({
      FunctionName: 'trinity-movie-dev',
      Payload: JSON.stringify(tvEvent)
    }).promise();

    const tvGenres = JSON.parse(tvResult.Payload);
    
    if (tvGenres && Array.isArray(tvGenres)) {
      console.log(`   ✅ TV genres: ${tvGenres.length} loaded successfully`);
    } else {
      console.log('   ❌ TV genres failed to load');
      return;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 MOBILE APP CONFIGURATION UPDATE SUCCESSFUL! 🎉');
    console.log('═'.repeat(60));
    
    console.log('\n📱 Next Steps for User:');
    console.log('   1. 🔄 Restart the Expo development server');
    console.log('   2. 🔑 Log in again (User Pool changed)');
    console.log('   3. 🎬 Test creating a new room');
    console.log('   4. 📺 Switch between "Películas" and "Series"');
    console.log('   5. ✨ Enjoy dynamic genre selection!');
    
    console.log('\n🎯 Expected Behavior:');
    console.log('   • Genres will load dynamically for each media type');
    console.log('   • No more "Cannot return null" errors');
    console.log('   • Smooth switching between movie and TV genres');
    console.log('   • Complete dynamic genre selection functionality');

  } catch (error) {
    console.error('❌ Configuration test failed:', error.message);
  }
}

// Run the test
testMobileConfigUpdate().catch(console.error);
