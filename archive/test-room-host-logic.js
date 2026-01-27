/**
 * Test script to verify room host detection logic
 */

// Simulate user and room data
const testScenarios = [
  {
    name: 'User is creator/host',
    user: { sub: 'user-123', id: 'user-123' },
    roomDetails: {
      room: { hostId: 'user-123', creatorId: 'user-123' },
      userRole: 'creator'
    },
    expectedIsHost: true
  },
  {
    name: 'User is member',
    user: { sub: 'user-456', id: 'user-456' },
    roomDetails: {
      room: { hostId: 'user-123', creatorId: 'user-123' },
      userRole: 'member'
    },
    expectedIsHost: false
  },
  {
    name: 'User ID matches hostId but role is member',
    user: { sub: 'user-123', id: 'user-123' },
    roomDetails: {
      room: { hostId: 'user-123', creatorId: 'user-123' },
      userRole: 'member'
    },
    expectedIsHost: true // ID match takes precedence
  },
  {
    name: 'User role is creator but ID doesn\'t match',
    user: { sub: 'user-456', id: 'user-456' },
    roomDetails: {
      room: { hostId: 'user-123', creatorId: 'user-123' },
      userRole: 'creator'
    },
    expectedIsHost: true // Role takes precedence
  },
  {
    name: 'No user data',
    user: null,
    roomDetails: {
      room: { hostId: 'user-123', creatorId: 'user-123' },
      userRole: 'member'
    },
    expectedIsHost: false
  }
];

// Simulate the host detection logic
function determineIsHost(user, roomDetails) {
  const currentUserId = user?.sub || user?.id;
  const roomHostId = roomDetails.room.hostId || roomDetails.room.creatorId;
  
  console.log('🔍 Host check:', {
    currentUserId,
    roomHostId,
    userRole: roomDetails.userRole,
    isMatch: currentUserId === roomHostId
  });
  
  // User is host if their ID matches the hostId/creatorId OR if userRole indicates they're the creator
  const userIsHost = (currentUserId === roomHostId) || 
                    (roomDetails.userRole === 'creator') || 
                    (roomDetails.userRole === 'host');
  
  return userIsHost;
}

// Test share message generation
function testShareMessages() {
  console.log('\n📱 Testing Share Messages');
  console.log('==========================');

  const getShareMessage = (roomName, inviteCode) => {
    return `¡Únete a mi sala de Trinity! 🎬\n\nSala: ${roomName}\nCódigo: ${inviteCode}\n\nDescarga Trinity y usa el código para unirte.`;
  };

  const testRoom = { name: 'Noche de Películas', inviteCode: 'ABC123' };
  const message = getShareMessage(testRoom.name, testRoom.inviteCode);
  
  console.log('Room:', testRoom.name);
  console.log('Code:', testRoom.inviteCode);
  console.log('Message:');
  console.log(message);
  console.log('Length:', message.length, message.length < 160 ? '✅ SMS friendly' : '⚠️ Long for SMS');
}

// Run tests
function runTests() {
  console.log('🧪 ROOM HOST DETECTION TESTS');
  console.log('=============================\n');

  let passed = 0;
  let failed = 0;

  testScenarios.forEach((scenario, index) => {
    console.log(`Test ${index + 1}: ${scenario.name}`);
    
    const result = determineIsHost(scenario.user, scenario.roomDetails);
    const success = result === scenario.expectedIsHost;
    
    console.log(`Expected: ${scenario.expectedIsHost}`);
    console.log(`Got: ${result}`);
    console.log(`Result: ${success ? '✅ PASS' : '❌ FAIL'}`);
    console.log('---');
    
    if (success) {
      passed++;
    } else {
      failed++;
    }
  });

  console.log(`\n📊 RESULTS: ${passed} passed, ${failed} failed`);
  
  testShareMessages();

  console.log('\n🎯 EXPECTED BEHAVIOR:');
  console.log('1. ✅ Host sees "Empezar Votación" button');
  console.log('2. ✅ Members see "Esperando al host..." message');
  console.log('3. ✅ Share messages don\'t include localhost URLs');
  console.log('4. ✅ Invite code is prominently displayed');
}

runTests();