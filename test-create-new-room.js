const https = require('https');

async function testCreateNewRoom() {
  console.log('🔍 Testing creation of new room with filtering...');
  
  const mutation = `
    mutation CreateRoom($input: CreateRoomInput!) {
      createRoom(input: $input) {
        id
        name
        description
        status
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
  
  const variables = {
    input: {
      name: "Test Room - Debug",
      mediaType: "MOVIE",
      genreIds: [28, 35], // Action, Comedy
      maxMembers: 4,
      isPrivate: false
    }
  };
  
  const postData = JSON.stringify({
    query: mutation,
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
          
          if (response.data && response.data.createRoom) {
            const room = response.data.createRoom;
            console.log('\n🔍 Created room analysis:');
            console.log('- ID:', room.id);
            console.log('- Name:', room.name);
            console.log('- MediaType:', room.mediaType);
            console.log('- GenreIds:', room.genreIds);
            console.log('- GenreNames:', room.genreNames);
            console.log('- ContentIds:', room.contentIds);
            
            if (room.mediaType && room.genreIds) {
              console.log('✅ Room created with filtering data');
              
              // Now test getRoom immediately
              setTimeout(() => {
                testGetRoomImmediately(room.id);
              }, 1000);
              
            } else {
              console.log('❌ Room created without filtering data');
            }
          } else if (response.errors) {
            console.log('❌ GraphQL errors:', response.errors);
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

async function testGetRoomImmediately(roomId) {
  console.log(`\n🔍 Testing getRoom immediately after creation for room: ${roomId}`);
  
  const query = `
    query GetRoom($roomId: ID!) {
      getRoom(roomId: $roomId) {
        id
        name
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
      'x-api-key': 'da2-ley6uvfgz5axjgpejgtisxctlq'
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
          console.log('✅ GetRoom Response received');
          
          if (response.data && response.data.getRoom) {
            const room = response.data.getRoom;
            console.log('\n🔍 GetRoom result analysis:');
            console.log('- MediaType:', room.mediaType);
            console.log('- GenreIds:', room.genreIds);
            console.log('- GenreNames:', room.genreNames);
            console.log('- ContentIds:', room.contentIds);
            
            if (room.mediaType && room.genreIds) {
              console.log('✅ GetRoom returned filtering data correctly');
            } else {
              console.log('❌ GetRoom returned null for filtering data');
              console.log('📊 Full getRoom response:', JSON.stringify(room, null, 2));
            }
          } else if (response.errors) {
            console.log('❌ GetRoom errors:', response.errors);
          } else {
            console.log('❌ No room data in getRoom response');
          }
          
          resolve(response);
        } catch (error) {
          console.error('❌ Error parsing getRoom response:', error);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ GetRoom request error:', error);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

testCreateNewRoom().catch(console.error);
