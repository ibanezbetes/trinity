
const AWS = require('aws-sdk');
const https = require('https');
const { URL } = require('url');

const REGION = 'eu-west-1';
const GRAPHQL_ENDPOINT = 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql';
const USER_POOL_ID = 'eu-west-1_EMnWISSRn';
const CLIENT_ID = '4svfit1a4muis95knfa8uh841r';

AWS.config.update({ region: REGION });
const cognito = new AWS.CognitoIdentityServiceProvider();

const CREATE_ROOM = `
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) {
      id
      inviteCode
      name
    }
  }
`;

async function authenticateUser() {
    try {
        const auth = await cognito.adminInitiateAuth({
            UserPoolId: USER_POOL_ID,
            ClientId: CLIENT_ID,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: 'host_user',
                PASSWORD: 'Password123!'
            }
        }).promise();
        return auth.AuthenticationResult.IdToken;
    } catch (err) {
        console.error('Auth Error:', err);
        process.exit(1);
    }
}

async function executeGraphql(query, variables, token) {
    return new Promise((resolve, reject) => {
        const uri = new URL(GRAPHQL_ENDPOINT);
        const options = {
            hostname: uri.hostname,
            path: uri.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const json = JSON.parse(data);
                if (json.errors) reject(json.errors);
                else resolve(json.data);
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify({ query, variables }));
        req.end();
    });
}

async function run() {
    const token = await authenticateUser();
    console.log('Authenticated.');

    const data = await executeGraphql(CREATE_ROOM, {
        input: { name: 'Split Test Room', genrePreferences: ['action'] }
    }, token);

    console.log('ROOM_CREATED');
    console.log(`ID: ${data.createRoom.id}`);
    console.log(`CODE: ${data.createRoom.inviteCode}`);
}

run();
