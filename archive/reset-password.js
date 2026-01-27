// Script para resetear password de usuario en Cognito
const { CognitoIdentityProviderClient, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const path = require('path');

// Load credentials from .env file
require('dotenv').config({ path: path.join(__dirname, '.env') });

const client = new CognitoIdentityProviderClient({
    region: 'eu-west-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

async function resetPassword(username, newPassword) {
    try {
        const command = new AdminSetUserPasswordCommand({
            UserPoolId: 'eu-west-1_6UxioIj4z',
            Username: username,
            Password: newPassword,
            Permanent: true
        });
        
        await client.send(command);
        console.log(`✅ Password reseteada para: ${username}`);
        console.log(`   Nueva password: ${newPassword}`);
    } catch (error) {
        console.error(`❌ Error:`, error.message);
    }
}

// Resetear password para test@trinity.com
resetPassword('test@trinity.com', 'Trinity2024!');
