const https = require('https');

async function testGraphQLGetRoom() {
  console.log('🔍 Testing GraphQL getRoom directly...');
  
  const roomId = '34ad9d7f-199a-48a5-b9b8-2c5561762420';
  
  const query = `
    query GetRoom($roomId: ID!) {
      getRoom(roomId: $roomId) {
        id
        name
        description
        status
        resultMovieId
        hostId
        inviteCode
        isActive
        isPrivate
        memberCount
        maxMembers
        matchCount
        mediaType
        genreIds
        genreNames
        contentIds
        createdAt
        updatedAt
      }
    }
  `;
  
  const variables = { roomId };
  
  const postData = JSON.stringify({
    query,
    variables
  });
  
  const options = {
    hostname: 'qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com',
    port: 443,
    path: '/graphql',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'x-api-key': 'da2-ley6uvfgz5axjgpejgtisxctlq' // From CDK outputs
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('✅ GraphQL Response received');
          console.log('📊 Full response:', JSON.stringify(response, null, 2));
          
          if (response.data && response.data.getRoom) {
            const room = response.data.getRoom;
            console.log('\n🔍 Specific field analysis:');
            console.log('- mediaType:', room.mediaType);
            console.log('- genreIds:', room.genreIds);
            console.log('- genreNames:', room.genreNames);
            console.log('- contentIds:', room.contentIds);
            
            if (room.mediaType && room.genreIds) {
              console.log('✅ Fields are present in GraphQL response');
            } else {
              console.log('❌ Fields are missing in GraphQL response');
            }
          } else {
            console.log('❌ No room data in response');
          }
          
          resolve(response);
        } catch (error) {
          console.error('❌ Error parsing response:', error);
          console.log('Raw response:', data);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

testGraphQLGetRoom().catch(console.error);
