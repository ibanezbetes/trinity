/**
 * Test script to verify join room functionality from web
 * This tests the REST API endpoint that the web frontend uses
 */

const fetch = require('node-fetch');

// Configuration
const BACKEND_URL = 'http://localhost:3000';
const TEST_INVITE_CODE = 'ABC123'; // Replace with actual invite code from mobile app

// Test credentials
const TEST_EMAIL = 'test@trinity.com';
const TEST_PASSWORD = 'Trinity2024!';

async function testJoinRoomWeb() {
  console.log('🧪 Testing Join Room from Web\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Login to get token
    console.log('\n📝 Step 1: Logging in to get authentication token...');
    const loginResponse = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    if (!loginResponse.ok) {
      const errorData = await loginResponse.json().catch(() => ({}));
      throw new Error(`Login failed: ${loginResponse.status} - ${JSON.stringify(errorData)}`);
    }

    const loginData = await loginResponse.json();
    console.log('✅ Login successful!');
    console.log('   User ID:', loginData.user?.id || 'N/A');
    console.log('   Has Token:', !!loginData.tokens?.idToken);

    if (!loginData.tokens?.idToken) {
      throw new Error('No ID token received from login');
    }

    const token = loginData.tokens.idToken;

    // Step 2: Test join room endpoint
    console.log('\n📝 Step 2: Testing join room endpoint...');
    console.log('   Invite Code:', TEST_INVITE_CODE);
    
    const joinResponse = await fetch(`${BACKEND_URL}/rooms/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        inviteCode: TEST_INVITE_CODE,
      }),
    });

    console.log('   Response Status:', joinResponse.status, joinResponse.statusText);

    if (!joinResponse.ok) {
      const errorData = await joinResponse.json().catch(() => ({}));
      console.log('❌ Join room failed:', JSON.stringify(errorData, null, 2));
      
      // Provide helpful error messages
      if (joinResponse.status === 404) {
        console.log('\n💡 Tip: The invite code might be invalid or the room might not exist.');
        console.log('   Create a room from the mobile app and use its invite code.');
      } else if (joinResponse.status === 403) {
        console.log('\n💡 Tip: You might already be a member of this room or the room is inactive.');
      } else if (joinResponse.status === 401) {
        console.log('\n💡 Tip: Authentication failed. The token might be expired.');
      }
      
      return;
    }

    const roomData = await joinResponse.json();
    console.log('✅ Successfully joined room!');
    console.log('\n📊 Room Details:');
    console.log('   Room ID:', roomData.id);
    console.log('   Room Name:', roomData.name);
    console.log('   Invite Code:', roomData.inviteCode);
    console.log('   Is Active:', roomData.isActive);
    console.log('   Created At:', roomData.createdAt);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed! Join room functionality is working.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n🔍 Error details:', error);
    
    console.log('\n📋 Troubleshooting checklist:');
    console.log('   1. Is the backend running on http://localhost:3000?');
    console.log('   2. Are the test credentials correct?');
    console.log('   3. Does the invite code exist? (Create a room from mobile app)');
    console.log('   4. Is the room active?');
    console.log('   5. Are you already a member of the room?');
  }
}

// Instructions
console.log('📖 Instructions:');
console.log('   1. Make sure the backend is running: cd backend && npm run start:dev');
console.log('   2. Create a room from the mobile app and copy the invite code');
console.log('   3. Update TEST_INVITE_CODE in this file with the actual code');
console.log('   4. Run this script: node test-join-room-web.js');
console.log('');

// Run the test
testJoinRoomWeb();
