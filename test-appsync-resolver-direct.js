const { CognitoIdentityProviderClient, AdminInitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');

// Configuration
const config = {
  region: 'eu-west-1',
  appSyncEndpoint: 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: 'eu-west-1_EtOx2swvP',
  clientId: 'l08ofv6tef7dp8eorn022fqpj',
  username: 'testuser@example.com',
  password: 'TempPassword123!'
};

const cognitoClient = new CognitoIdentityProviderClient({ region: config.region });

async function testAppSyncResolverDirect() {
  console.log('🔍 Testing AppSync getFilteredContent resolver directly...');
  
  try {
    // Step 1: Get authentication token
    console.log('🔐 Step 1: Getting authentication token...');
    
    // Try to use an existing user or create a test
    let accessToken;
    
    try {
      const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: config.userPoolId,
        ClientId: config.clientId,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: config.username,
          PASSWORD: config.password,
        },
      });
      
      const authResult = await cognitoClient.send(authCommand);
      accessToken = authResult.AuthenticationResult?.AccessToken;
      
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }
      
      console.log('✅ Authentication successful');
      
    } catch (authError) {
      console.log('⚠️ Test user authentication failed, using a different approach...');
      console.log('💡 We\'ll test the GraphQL query structure instead');
      
      // Test without authentication to see the query structure
      await testGraphQLQueryStructure();
      return;
    }
    
    // Step 2: Test the exact GraphQL query that mobile app uses
    console.log('\n📱 Step 2: Testing exact mobile app GraphQL query...');
    
    const getFilteredContentQuery = `
      query GetFilteredContent($mediaType: MediaType!, $genreIds: [Int!]!, $limit: Int, $excludeIds: [String!]) {
        getFilteredContent(mediaType: $mediaType, genreIds: $genreIds, limit: $limit, excludeIds: $excludeIds) {
          id
          tmdbId
          title
          originalTitle
          overview
          posterPath
          backdropPath
          releaseDate
          year
          rating
          voteCount
          genres
          mediaType
          runtime
          tagline
          budget
          revenue
          trailerKey
          watchProviders {
            id
            name
            logoPath
            type
          }
          cast {
            id
            name
            character
            profilePath
          }
          director
          creator
        }
      }
    `;
    
    const variables = {
      mediaType: 'MOVIE',
      genreIds: [35, 27], // Comedy + Horror
      limit: 30,
      excludeIds: []
    };
    
    console.log('📤 GraphQL Query Variables:', JSON.stringify(variables, null, 2));
    
    const response = await fetch(config.appSyncEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: getFilteredContentQuery,
        variables: variables,
      }),
    });
    
    const result = await response.json();
    
    console.log('📊 AppSync Response Status:', response.status);
    console.log('📊 AppSync Response Headers:', Object.fromEntries(response.headers.entries()));
    
    if (result.errors) {
      console.error('❌ GraphQL Errors:', JSON.stringify(result.errors, null, 2));
      
      // Check if it's a resolver configuration issue
      const hasResolverError = result.errors.some(error => 
        error.message.includes('resolver') || 
        error.message.includes('mapping') ||
        error.message.includes('not found')
      );
      
      if (hasResolverError) {
        console.log('\n🚨 RESOLVER CONFIGURATION ISSUE DETECTED:');
        console.log('❌ The getFilteredContent resolver is not properly configured in AppSync');
        console.log('💡 This explains why mobile app gets 0 results and falls back to legacy');
      }
      
      return;
    }
    
    if (result.data && result.data.getFilteredContent) {
      const movies = result.data.getFilteredContent;
      console.log(`✅ AppSync returned ${movies.length} movies`);
      
      if (movies.length > 0) {
        console.log('\n🎬 Sample movies from AppSync:');
        movies.slice(0, 3).forEach((movie, index) => {
          console.log(`${index + 1}. ${movie.title}`);
          console.log(`   - TMDB ID: ${movie.tmdbId}`);
          console.log(`   - Rating: ${movie.rating}`);
          console.log(`   - Genres: ${movie.genres?.join(', ') || 'N/A'}`);
        });
        
        console.log('\n✅ AppSync resolver is working correctly!');
        console.log('💡 The issue might be in the mobile app\'s query or response handling');
        
      } else {
        console.log('❌ AppSync returned 0 movies');
        console.log('💡 This matches what the mobile app is experiencing');
      }
      
    } else {
      console.log('❌ No data in AppSync response');
      console.log('📊 Full response:', JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.error('❌ AppSync test failed:', error);
    
    if (error.message?.includes('fetch')) {
      console.log('💡 Network error - check AppSync endpoint and authentication');
    }
  }
}

async function testGraphQLQueryStructure() {
  console.log('\n🔍 Testing GraphQL query structure (without auth)...');
  
  // Test the query structure to see if there are any syntax issues
  const getFilteredContentQuery = `
    query GetFilteredContent($mediaType: MediaType!, $genreIds: [Int!]!, $limit: Int, $excludeIds: [String!]) {
      getFilteredContent(mediaType: $mediaType, genreIds: $genreIds, limit: $limit, excludeIds: $excludeIds) {
        id
        title
        overview
        rating
      }
    }
  `;
  
  console.log('📝 GraphQL Query Structure:');
  console.log(getFilteredContentQuery);
  
  console.log('\n💡 Key points to check:');
  console.log('1. MediaType enum should be defined in AppSync schema');
  console.log('2. getFilteredContent resolver should be configured');
  console.log('3. Lambda function should be connected to the resolver');
  console.log('4. Response mapping should transform Lambda output to GraphQL format');
}

// Run the test
testAppSyncResolverDirect().catch(console.error);
