#!/usr/bin/env node

/**
 * Test script to verify the backend joinRoom functionality works
 */

const https = require('https');

const CONFIG = {
  APPSYNC_ENDPOINT: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  // Test token - you'll need to get this from the web app after login
  TEST_TOKEN: 'YOUR_TOKEN_HERE'
};

const testJoinRoom = async (inviteCode, token) => {
  const query = `
    mutation JoinRoomByInvite($inviteCode: String!) {
      joinRoomByInvite(inviteCode: $inviteCode) {
        id
        name
        description
        status
        hostId
        inviteCode
        memberCount
        createdAt
      }
    }
  `;

  const payload = JSON.stringify({
    query,
    variables: { inviteCode }
  });

  const options = {
    hostname: 'imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com',
    path: '/graphql',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'Content-Length': payload.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

// Test function
async function runTest() {
  console.log('🧪 Testing joinRoomByInvite mutation...\n');
  
  if (CONFIG.TEST_TOKEN === 'YOUR_TOKEN_HERE') {
    console.log('❌ Please update TEST_TOKEN in the script with a real JWT token from the web app');
    console.log('   1. Go to http://localhost:3000/test');
    console.log('   2. Login with test@trinity.app / Trinity2024!');
    console.log('   3. Open browser dev tools > Application > Local Storage');
    console.log('   4. Copy the "trinity_tokens" idToken value');
    console.log('   5. Update TEST_TOKEN in this script\n');
    return;
  }

  try {
    // Test with a sample invite code
    const result = await testJoinRoom('ABC123', CONFIG.TEST_TOKEN);
    
    console.log('✅ GraphQL Response:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.errors) {
      console.log('\n❌ GraphQL Errors found:');
      result.errors.forEach(error => {
        console.log(`   - ${error.message}`);
      });
    }
    
    if (result.data && result.data.joinRoomByInvite) {
      console.log('\n🎉 Success! joinRoomByInvite mutation is working');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

if (require.main === module) {
  runTest();
}

module.exports = { testJoinRoom };