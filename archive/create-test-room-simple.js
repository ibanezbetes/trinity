#!/usr/bin/env node

/**
 * Script simple para crear una sala de prueba usando el backend REST
 */

const crypto = require('crypto');

// Generar código de invitación simple
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Crear sala mock para pruebas
function createMockRoom() {
  const inviteCode = generateInviteCode();
  const room = {
    id: crypto.randomUUID(),
    name: `Test Room ${new Date().toLocaleTimeString()}`,
    inviteCode: inviteCode,
    hostId: 'test-user-id',
    memberCount: 1,
    status: 'active',
    createdAt: new Date().toISOString()
  };

  console.log('🏠 Mock room created for testing:');
  console.log('📋 Room details:');
  console.log(`   ID: ${room.id}`);
  console.log(`   Name: ${room.name}`);
  console.log(`   Invite Code: ${room.inviteCode}`);
  console.log(`   Members: ${room.memberCount}`);
  
  console.log('\n🌐 Test URLs (when web app is running):');
  console.log(`   Direct join: http://localhost:8081/join/${room.inviteCode}`);
  console.log(`   Manual join: http://localhost:8081/join`);
  
  console.log('\n📝 To test:');
  console.log('   1. Start web app: cd mobile && npm run web');
  console.log(`   2. Open: http://localhost:8081/join/${room.inviteCode}`);
  console.log('   3. Login and try to join (will show error but tests the UI)');
  
  return room;
}

if (require.main === module) {
  const room = createMockRoom();
  console.log(`\n🎉 Test room ready! Code: ${room.inviteCode}`);
}

module.exports = { generateInviteCode, createMockRoom };