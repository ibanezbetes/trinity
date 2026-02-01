/**
 * Confirm Cognito User by Email
 * Usage: node scripts/confirm-user-by-email.js <email>
 */

require('dotenv').config();
const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-1' });

const cognito = new AWS.CognitoIdentityServiceProvider();
const UserPoolId = process.env.COGNITO_USER_POOL_ID;

async function confirmUser(email) {
    try {
        console.log(`🔍 Buscando usuario con email: ${email}`);

        // Find user by email
        const listResult = await cognito.listUsers({
            UserPoolId,
            Filter: `email = "${email}"`,
            Limit: 1
        }).promise();

        if (!listResult.Users || listResult.Users.length === 0) {
            console.log(`❌ No se encontró usuario con email: ${email}`);
            return;
        }

        const user = listResult.Users[0];
        const username = user.Username;

        console.log(`✅ Usuario encontrado: ${username}`);
        console.log(`📧 Email: ${email}`);
        console.log(`📊 Estado: ${user.UserStatus}`);

        if (user.UserStatus === 'CONFIRMED') {
            console.log(`✅ El usuario ya está confirmado`);
            return;
        }

        // Confirm user
        console.log(`🔄 Confirmando usuario...`);
        await cognito.adminConfirmSignUp({
            UserPoolId,
            Username: username
        }).promise();

        console.log(`✅ Usuario confirmado exitosamente`);
        console.log(`🎉 Ahora puedes iniciar sesión con: ${email}`);

    } catch (error) {
        console.error(`❌ Error:`, error.message);
    }
}

const email = process.argv[2];

if (!email) {
    console.log(`Uso: node scripts/confirm-user-by-email.js <email>`);
    console.log(`Ejemplo: node scripts/confirm-user-by-email.js test@trinity.app`);
    process.exit(1);
}

confirmUser(email);
