#!/usr/bin/env node

/**
 * Test script para verificar la funcionalidad de unirse a salas desde web
 * 
 * Este script:
 * 1. Crea una sala de prueba usando AppSync
 * 2. Obtiene el código de invitación
 * 3. Simula unirse a la sala usando el código
 * 4. Verifica que todo funcione correctamente
 */

const { AppSyncClient, EvaluateMappingTemplateCommand } = require('@aws-sdk/client-appsync');
const { CognitoIdentityProviderClient, AdminInitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const fetch = require('cross-fetch');

// Configuración AWS
const AWS_CONFIG = {
  region: 'eu-west-1',
  graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: 'eu-west-1_6UxioIj4z',
  userPoolWebClientId: '59dpqsm580j14ulkcha19shl64'
};

// Credenciales de prueba (usuario de test)
const TEST_USER = {
  email: 'test@trinity.app',
  password: 'TestPassword123!'
};

class WebJoinRoomTester {
  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({ region: AWS_CONFIG.region });
    this.accessToken = null;
    this.idToken = null;
  }

  /**
   * Autenticar usuario de prueba
   */
  async authenticate() {
    try {
      console.log('🔐 Authenticating test user...');
      
      const authCommand = new AdminInitiateAuthCommand({
        UserPoolId: AWS_CONFIG.userPoolId,
        ClientId: AWS_CONFIG.userPoolWebClientId,
        AuthFlow: 'ADMIN_NO_SRP_AUTH',
        AuthParameters: {
          USERNAME: TEST_USER.email,
          PASSWORD: TEST_USER.password
        }
      });

      const authResult = await this.cognitoClient.send(authCommand);
      
      if (authResult.AuthenticationResult) {
        this.accessToken = authResult.AuthenticationResult.AccessToken;
        this.idToken = authResult.AuthenticationResult.IdToken;
        console.log('✅ Authentication successful');
        return true;
      } else {
        console.error('❌ Authentication failed - no tokens received');
        return false;
      }
    } catch (error) {
      console.error('❌ Authentication error:', error.message);
      return false;
    }
  }

  /**
   * Ejecutar query/mutation GraphQL
   */
  async graphqlRequest(query, variables = {}) {
    try {
      const response = await fetch(AWS_CONFIG.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.idToken}`
        },
        body: JSON.stringify({
          query,
          variables
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
      }
      
      return result.data;
    } catch (error) {
      console.error('❌ GraphQL request failed:', error.message);
      throw error;
    }
  }

  /**
   * Crear una sala de prueba
   */
  async createTestRoom() {
    console.log('🏠 Creating test room...');
    
    const mutation = `
      mutation CreateRoomSimple($name: String!) {
        createRoomSimple(name: $name) {
          id
          name
          inviteCode
          hostId
          memberCount
          status
          createdAt
        }
      }
    `;

    try {
      const result = await this.graphqlRequest(mutation, {
        name: `Test Room ${Date.now()}`
      });

      const room = result.createRoomSimple;
      console.log('✅ Test room created:', {
        id: room.id,
        name: room.name,
        inviteCode: room.inviteCode,
        memberCount: room.memberCount
      });

      return room;
    } catch (error) {
      console.error('❌ Failed to create test room:', error.message);
      throw error;
    }
  }

  /**
   * Unirse a sala usando código de invitación
   */
  async joinRoomByCode(inviteCode) {
    console.log(`🚪 Joining room with code: ${inviteCode}`);
    
    const mutation = `
      mutation JoinRoomByInvite($inviteCode: String!) {
        joinRoomByInvite(inviteCode: $inviteCode) {
          id
          name
          inviteCode
          hostId
          memberCount
          status
          createdAt
        }
      }
    `;

    try {
      const result = await this.graphqlRequest(mutation, {
        inviteCode: inviteCode
      });

      const room = result.joinRoomByInvite;
      console.log('✅ Successfully joined room:', {
        id: room.id,
        name: room.name,
        memberCount: room.memberCount
      });

      return room;
    } catch (error) {
      console.error('❌ Failed to join room:', error.message);
      throw error;
    }
  }

  /**
   * Obtener salas del usuario
   */
  async getUserRooms() {
    console.log('📋 Getting user rooms...');
    
    const query = `
      query GetMyHistory {
        getMyHistory {
          id
          name
          memberCount
          status
          createdAt
        }
      }
    `;

    try {
      const result = await this.graphqlRequest(query);
      const rooms = result.getMyHistory || [];
      
      console.log(`✅ User has ${rooms.length} rooms`);
      rooms.forEach(room => {
        console.log(`  - ${room.name} (${room.memberCount} members)`);
      });

      return rooms;
    } catch (error) {
      console.error('❌ Failed to get user rooms:', error.message);
      throw error;
    }
  }

  /**
   * Ejecutar test completo
   */
  async runFullTest() {
    console.log('🧪 Starting Web Join Room Test...\n');

    try {
      // 1. Autenticar
      const authSuccess = await this.authenticate();
      if (!authSuccess) {
        throw new Error('Authentication failed');
      }

      // 2. Crear sala de prueba
      const testRoom = await this.createTestRoom();
      
      // 3. Simular unirse a la sala (mismo usuario, pero simula el flujo web)
      console.log('\n🌐 Simulating web join flow...');
      const joinedRoom = await this.joinRoomByCode(testRoom.inviteCode);
      
      // 4. Verificar que el usuario ahora tiene la sala
      console.log('\n📋 Verifying user rooms...');
      const userRooms = await this.getUserRooms();
      
      // 5. Verificar resultados
      const hasTestRoom = userRooms.some(room => room.id === testRoom.id);
      
      if (hasTestRoom) {
        console.log('\n✅ SUCCESS: Web join room functionality is working!');
        console.log(`📱 Mobile app can create rooms with invite codes`);
        console.log(`🌐 Web users can join using: trinity.app/join/${testRoom.inviteCode}`);
        console.log(`🔗 Direct link: trinity.app/join/${testRoom.inviteCode}`);
      } else {
        console.log('\n❌ FAILURE: Room not found in user\'s room list');
      }

      return {
        success: hasTestRoom,
        testRoom,
        joinedRoom,
        userRooms
      };

    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Ejecutar test si se llama directamente
if (require.main === module) {
  const tester = new WebJoinRoomTester();
  
  tester.runFullTest()
    .then(result => {
      if (result.success) {
        console.log('\n🎉 All tests passed! Web join functionality is ready.');
        process.exit(0);
      } else {
        console.log('\n💥 Tests failed. Check the error messages above.');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = WebJoinRoomTester;