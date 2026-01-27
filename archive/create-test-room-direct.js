#!/usr/bin/env node

/**
 * Crear sala de prueba directamente en DynamoDB
 * para probar la funcionalidad web de unirse
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function createTestRoom() {
  const roomId = 'web-test-room-' + Date.now();
  const inviteCode = 'WEB123';
  const now = new Date().toISOString();
  
  // Crear sala
  const room = {
    PK: `ROOM#${roomId}`,
    SK: 'METADATA',
    GSI1PK: `USER#test-user-id`,
    GSI1SK: `ROOM#${now}`,
    id: roomId,
    name: 'Sala de Prueba Web',
    description: 'Sala creada para probar funcionalidad web',
    status: 'active',
    hostId: 'test-user-id',
    creatorId: 'test-user-id',
    inviteCode: inviteCode,
    inviteUrl: `https://trinity.app/join/${inviteCode}`,
    isActive: true,
    isPrivate: false,
    memberCount: 1,
    maxMembers: 10,
    matchCount: 0,
    masterList: [],
    filters: {
      genres: [],
      releaseYearFrom: 2000,
      releaseYearTo: 2024,
      minRating: 6.0,
      contentTypes: ['movie']
    },
    createdAt: now,
    updatedAt: now
  };

  try {
    console.log('🏠 Creating test room in DynamoDB...');
    
    await docClient.send(new PutCommand({
      TableName: 'trinity-rooms-dev-v2',
      Item: room
    }));
    
    console.log('✅ Room created successfully!');
    console.log('📋 Room details:');
    console.log(`   ID: ${room.id}`);
    console.log(`   Name: ${room.name}`);
    console.log(`   Invite Code: ${room.inviteCode}`);
    console.log(`   Host: ${room.hostId}`);
    
    // Crear miembro inicial
    const member = {
      PK: `ROOM#${roomId}`,
      SK: `MEMBER#test-user-id`,
      GSI1PK: `USER#test-user-id`,
      GSI1SK: `ROOM#${roomId}`,
      roomId: roomId,
      userId: 'test-user-id',
      role: 'creator',
      status: 'active',
      joinedAt: now,
      lastActivityAt: now
    };

    await docClient.send(new PutCommand({
      TableName: 'trinity-room-members-dev',
      Item: member
    }));
    
    console.log('✅ Creator member added');
    
    console.log('\n🌐 Test URLs:');
    console.log(`   Direct join: http://localhost:8082/join/${inviteCode}`);
    console.log(`   Manual join: http://localhost:8082/join`);
    
    console.log('\n📝 To test:');
    console.log('   1. Go to: http://localhost:8082/join/WEB123');
    console.log('   2. Login with: dani@dani.com / Trinity2024!');
    console.log('   3. Should join the room successfully');
    
    return { success: true, room, inviteCode };

  } catch (error) {
    console.error('❌ Failed to create room:', error.message);
    return { success: false, error: error.message };
  }
}

if (require.main === module) {
  createTestRoom()
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 Test room ready! Code: ${result.inviteCode}`);
      } else {
        console.log('\n💥 Failed to create test room');
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error);
    });
}

module.exports = { createTestRoom };