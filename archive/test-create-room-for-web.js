#!/usr/bin/env node

/**
 * Script para crear una sala de prueba y obtener el código de invitación
 * para probar la funcionalidad web de unirse a salas
 */

require('dotenv').config();
const { CognitoIdentityProviderClient, AdminInitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const fetch = require('cross-fetch');

// Configuración AWS desde .env
const AWS_CONFIG = {
  region: process.env.AWS_REGION || 'eu-west-1',
  graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'eu-west-1_6UxioIj4z',
  userPoolWebClientId: process.env.COGNITO_CLIENT_ID || '59dpqsm580j14ulkcha19shl64'
};

// Usuario de prueba - usar uno existente
const TEST_USER = {
  email: 'test@trinity.app',
  password: 'Trinity2024!'
};

class RoomCreator {
  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({ 
      region: AWS_CONFIG.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.idToken = null;
  }

  /**
   * Autenticar usuario
   */
  async authenticate() {
    try {
      console.log('🔐 Authenticating user:', TEST_USER.email);
      
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
        this.idToken = authResult.AuthenticationResult.IdToken;
        console.log('✅ Authentication successful');
        return true;
      } else {
        console.error('❌ Authentication failed - no tokens received');
        return false;
      }
    } catch (error) {
      console.error('❌ Authentication error:', error.message);
      
      if (error.message.includes('NotAuthorizedException')) {
        console.log('💡 Tip: Check if the password is correct or if the user needs to reset password');
      }
      
      return false;
    }
  }

  /**
   * Crear sala usando GraphQL
   */
  async createRoom(roomName) {
    console.log('🏠 Creating room:', roomName);
    
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
      const response = await fetch(AWS_CONFIG.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.idToken}`
        },
        body: JSON.stringify({
          query: mutation,
          variables: { name: roomName }
        })
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`);
      }
      
      const room = result.data.createRoomSimple;
      console.log('✅ Room created successfully!');
      console.log('📋 Room details:');
      console.log(`   ID: ${room.id}`);
      console.log(`   Name: ${room.name}`);
      console.log(`   Invite Code: ${room.inviteCode}`);
      console.log(`   Host: ${room.hostId}`);
      console.log(`   Members: ${room.memberCount}`);
      
      return room;
    } catch (error) {
      console.error('❌ Failed to create room:', error.message);
      throw error;
    }
  }

  /**
   * Generar URLs de prueba para web
   */
  generateWebUrls(inviteCode) {
    const baseUrl = 'http://localhost:8081'; // Puerto por defecto de Expo Web
    
    console.log('\n🌐 Web URLs for testing:');
    console.log(`   Direct join: ${baseUrl}/join/${inviteCode}`);
    console.log(`   Manual join: ${baseUrl}/join`);
    console.log('\n📱 Mobile deep links:');
    console.log(`   trinity://join/${inviteCode}`);
    console.log(`   https://trinity.app/join/${inviteCode}`);
  }

  /**
   * Ejecutar creación de sala completa
   */
  async run() {
    console.log('🚀 Creating test room for web join functionality...\n');

    try {
      // 1. Autenticar
      const authSuccess = await this.authenticate();
      if (!authSuccess) {
        console.log('\n❌ Cannot proceed without authentication');
        console.log('💡 Solutions:');
        console.log('   1. Check if user exists: node list-cognito-users.js');
        console.log('   2. Reset password in AWS Console');
        console.log('   3. Create new test user');
        return false;
      }

      // 2. Crear sala
      const roomName = `Web Test Room ${new Date().toLocaleTimeString()}`;
      const room = await this.createRoom(roomName);
      
      // 3. Generar URLs
      this.generateWebUrls(room.inviteCode);
      
      console.log('\n✅ SUCCESS! Room created for web testing');
      console.log('\n📝 Next steps:');
      console.log('   1. Start web app: cd mobile && npm run web');
      console.log(`   2. Open: http://localhost:8081/join/${room.inviteCode}`);
      console.log('   3. Login with a different user to test joining');
      
      return {
        success: true,
        room,
        inviteCode: room.inviteCode
      };

    } catch (error) {
      console.error('\n❌ FAILED:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const creator = new RoomCreator();
  
  creator.run()
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 Room ready! Invite code: ${result.inviteCode}`);
        process.exit(0);
      } else {
        console.log('\n💥 Failed to create room');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = RoomCreator;