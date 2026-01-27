#!/usr/bin/env node

/**
 * Script para crear una sala de prueba directamente en DynamoDB
 * Esto evita el problema de la Lambda con uuid
 */

require('dotenv').config();
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

// Configuración AWS
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Generar código de invitación
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Crear sala de prueba
async function createTestRoom() {
  const roomId = crypto.randomUUID();
  const inviteCode = generateInviteCode();
  const now = new Date().toISOString();
  
  const room = {
    PK: `ROOM#${roomId}`,
    SK: 'METADATA',
    GSI1PK: `USER#test-user-id`,
    GSI1SK: `ROOM#${now}`,
    id: roomId,
    name: `Test Room ${new Date().toLocaleTimeString()}`,
    description: 'Sala de prueba para web join',
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
    
    const command = new PutCommand({
      TableName: 'trinity-rooms-dev-v2',
      Item: room
    });

    await docClient.send(command);
    
    console.log('✅ Test room created successfully!');
    console.log('📋 Room details:');
    console.log(`   ID: ${room.id}`);
    console.log(`   Name: ${room.name}`);
    console.log(`   Invite Code: ${room.inviteCode}`);
    console.log(`   Host: ${room.hostId}`);
    console.log(`   Members: ${room.memberCount}`);
    
    // También crear el miembro inicial
    await createRoomMember(roomId, 'test-user-id', 'creator');
    
    return room;
  } catch (error) {
    console.error('❌ Failed to create room:', error.message);
    throw error;
  }
}

// Crear miembro de la sala
async function createRoomMember(roomId, userId, role) {
  const member = {
    PK: `ROOM#${roomId}`,
    SK: `MEMBER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `ROOM#${roomId}`,
    roomId: roomId,
    userId: userId,
    role: role,
    status: 'active',
    joinedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString()
  };

  try {
    const command = new PutCommand({
      TableName: 'trinity-room-members-dev',
      Item: member
    });

    await docClient.send(command);
    console.log(`✅ Member ${role} added to room`);
  } catch (error) {
    console.error('❌ Failed to add member:', error.message);
  }
}

// Generar URLs de prueba
function generateTestUrls(inviteCode) {
  console.log('\n🌐 Test URLs:');
  console.log(`   Web (manual): http://localhost:8082/join`);
  console.log(`   Web (direct): http://localhost:8082/join/${inviteCode}`);
  console.log(`   Mobile: trinity://join/${inviteCode}`);
  console.log(`   Production: https://trinity.app/join/${inviteCode}`);
}

// Ejecutar script
async function main() {
  console.log('🚀 Creating test room directly in DynamoDB...\n');

  try {
    const room = await createTestRoom();
    generateTestUrls(room.inviteCode);
    
    console.log('\n✅ SUCCESS! Room created in DynamoDB');
    console.log('\n📝 Next steps:');
    console.log('   1. Web app is running at: http://localhost:8082');
    console.log(`   2. Test join: http://localhost:8082/join/${room.inviteCode}`);
    console.log('   3. Login with different user to test joining');
    console.log('   4. Should work even with Lambda uuid error!');
    
    return {
      success: true,
      room,
      inviteCode: room.inviteCode
    };

  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    
    if (error.message.includes('ResourceNotFoundException')) {
      console.log('💡 Tip: Make sure DynamoDB tables exist');
      console.log('   Run: cd infrastructure && cdk deploy');
    } else if (error.message.includes('UnrecognizedClientException')) {
      console.log('💡 Tip: Check AWS credentials in .env file');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

if (require.main === module) {
  main()
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 Ready to test! Code: ${result.inviteCode}`);
        process.exit(0);
      } else {
        console.log('\n💥 Failed to create test room');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = { createTestRoom, generateInviteCode };