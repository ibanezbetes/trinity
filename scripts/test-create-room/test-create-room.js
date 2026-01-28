// Script para probar la creación de salas directamente con AppSync
const https = require('https');

const CONFIG = {
    APPSYNC_ENDPOINT: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
    COGNITO_REGION: 'eu-west-1',
    COGNITO_CLIENT_ID: '59dpqsm580j14ulkcha19shl64'
};

// Primero autenticamos
async function authenticate(email, password) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: CONFIG.COGNITO_CLIENT_ID,
            AuthParameters: {
                USERNAME: email,
                PASSWORD: password
            }
        });

        const options = {
            hostname: `cognito-idp.${CONFIG.COGNITO_REGION}.amazonaws.com`,
            port: 443,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                const result = JSON.parse(body);
                if (result.AuthenticationResult) {
                    resolve(result.AuthenticationResult.IdToken);
                } else {
                    reject(new Error(result.message || 'Auth failed'));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Luego creamos la sala
async function createRoom(idToken, roomName) {
    return new Promise((resolve, reject) => {
        const query = {
            query: `
                mutation CreateRoom($input: CreateRoomInput!) {
                    createRoom(input: $input) {
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
            `,
            variables: {
                input: {
                    name: roomName,
                    description: 'Sala de prueba desde script'
                }
            }
        };

        const data = JSON.stringify(query);
        const url = new URL(CONFIG.APPSYNC_ENDPOINT);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': idToken,
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                console.log('Response status:', res.statusCode);
                console.log('Response body:', body);
                try {
                    const result = JSON.parse(body);
                    resolve(result);
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Obtener salas del usuario
async function getUserRooms(idToken) {
    return new Promise((resolve, reject) => {
        const query = {
            query: `
                query GetUserRooms {
                    getUserRooms {
                        id
                        name
                        description
                        status
                        hostId
                        inviteCode
                        memberCount
                        matchCount
                        createdAt
                    }
                }
            `
        };

        const data = JSON.stringify(query);
        const url = new URL(CONFIG.APPSYNC_ENDPOINT);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': idToken,
                'Content-Length': data.length
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                console.log('GetUserRooms Response:', body);
                try {
                    const result = JSON.parse(body);
                    resolve(result);
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function main() {
    try {
        console.log('🔐 Autenticando...');
        const idToken = await authenticate('test@trinity.com', 'Trinity2024!');
        console.log('✅ Autenticado!\n');

        console.log('📋 Obteniendo salas existentes...');
        const existingRooms = await getUserRooms(idToken);
        console.log('\n');

        console.log('🏠 Creando nueva sala...');
        const roomName = 'Test Room ' + Date.now();
        const result = await createRoom(idToken, roomName);
        console.log('\n');

        if (result.data && result.data.createRoom) {
            console.log('✅ Sala creada exitosamente!');
            console.log('   ID:', result.data.createRoom.id);
            console.log('   Nombre:', result.data.createRoom.name);
            console.log('   Código:', result.data.createRoom.inviteCode);
        } else if (result.errors) {
            console.log('❌ Error creando sala:');
            result.errors.forEach(e => console.log('  -', e.message));
        }

        console.log('\n📋 Verificando salas después de crear...');
        await getUserRooms(idToken);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

main();
