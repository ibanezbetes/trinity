
const AWS = require('aws-sdk');
const https = require('https');
const { URL } = require('url');

// Configure AWS Region
AWS.config.update({ region: 'eu-west-1' });

// Configuration inputs
const args = process.argv.slice(2);
const ACTION = args[0]; // 'join' or 'vote'
const ROOM_ID = args[1];
const TARGET_ID = args[2]; // INVITE_CODE for 'join', MOVIE_ID for 'vote'

if (!ACTION || !ROOM_ID || !TARGET_ID) {
    console.error('Usage: node simulate-partner.js <join|vote> <ROOM_ID> <INVITE_CODE|MOVIE_ID> [USER_ID]');
    process.exit(1);
}

// Fixed "Partner" Identity
const PARTNER_USER_ID = args[3] || 'partner_user_automated';

// AppSync Configuration
const GRAPHQL_ENDPOINT = 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql';

const MUTATIONS = {
    join: `
    mutation JoinRoom($inviteCode: String!) {
      joinRoomByInvite(inviteCode: $inviteCode) {
        id
        status
        memberCount
      }
    }
  `,
    vote: `
    mutation Vote($input: VoteInput!) {
      vote(input: $input) {
        id
        status
        resultMovieId
        memberCount
      }
    }
  `
};

async function executeGraphql(query, variables) {
    const uri = new URL(GRAPHQL_ENDPOINT);
    const httpRequest = new AWS.HttpRequest(uri.href, 'eu-west-1');
    httpRequest.headers.host = uri.host;
    httpRequest.headers['Content-Type'] = 'application/json';
    httpRequest.method = 'POST';
    httpRequest.body = JSON.stringify({ query, variables });

    // Use IAM Signing (assuming running with credentials that have AppSync access)
    // In a real scenario, this should be a User Pool token, but for backend script we can use IAM 
    // IF the API allows IAM. Let's check trinity-stack.ts...
    // It allows USER_POOL and API_KEY. It does NOT explicitly allow IAM in `additionalAuthorizationModes`.
    // Wait, `trinity-stack.ts` says: 
    // authorizationType: appsync.AuthorizationType.USER_POOL 
    // additionalAuthorizationModes: API_KEY.

    // So we MUST use either a valid User Pool Token or an API Key.
    // The API Key is printed in cdk-outputs.json!

    // Let's use the API Key if available, otherwise we need to simulate a login.
    // Checking cdk-outputs.json... it says "No API Key" in the output value (default fallback in my quick check?) 
    // actually line 566: value: this.api.apiKey || 'No API Key'

    // If no API Key, we must login as a user.
    // We can use cognito-idp to initiate auth for the partner user.

    return executeWithCognito(query, variables);
}

async function executeWithCognito(query, variables) {
    const generateRandomPassword = () => {
        return 'P' + Math.random().toString(36).slice(-8) + '!';
    };

    const cognito = new AWS.CognitoIdentityServiceProvider();
    const ClientId = '4svfit1a4muis95knfa8uh841r'; // From cdk-outputs.json (UserPoolClientId)
    const UserPoolId = 'eu-west-1_EMnWISSRn';

    // 1. Ensure Partner User Exists (Skip for pre-defined test user)
    // We assume test@trinity.app exists or is handled by the main auth flow.
    // If it doesn't exist, initiateAuth will fail, which is fine for this specific test case.
    /*
    try {
        await cognito.signUp({ ... });
    } catch (err) { ... }
    */

    // 2. Login to get Token
    const auth = await cognito.initiateAuth({
        ClientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
            USERNAME: 'test@trinity.app',
            PASSWORD: 'Trinity2024!'
        }
    }).promise();

    const token = auth.AuthenticationResult.AccessToken; // Or IdToken depending on AppSync config. Usually AccessToken or IdToken.
    // trinity-stack.ts sends headers Authorization: Bearer ${token}.
    // AppSync usually expects Authorization header with the token.

    const uri = new URL(GRAPHQL_ENDPOINT);
    const options = {
        hostname: uri.hostname,
        port: 443,
        path: uri.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.errors) reject(json.errors);
                    else resolve(json.data);
                } catch (e) {
                    reject(data);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(JSON.stringify({ query, variables }));
        req.end();
    });
}

async function main() {
    try {
        if (ACTION === 'join') {
            const inviteCode = TARGET_ID;
            console.log(`Joining Room ${ROOM_ID} with code ${inviteCode}...`);
            const res = await executeGraphql(MUTATIONS.join, {
                inviteCode: inviteCode
            });
            console.log('Join Result:', JSON.stringify(res, null, 2));
        } else if (ACTION === 'vote') {
            const movieId = TARGET_ID;
            console.log(`Voting LIKE on movie ${movieId} in room ${ROOM_ID}...`);
            const res = await executeGraphql(MUTATIONS.vote, {
                input: {
                    roomId: ROOM_ID,
                    movieId: movieId,
                    voteType: 'LIKE'
                }
            });
            console.log('Vote Result:', JSON.stringify(res, null, 2));
        }
    } catch (err) {
        console.error('Error:', JSON.stringify(err, null, 2));
        process.exit(1);
    }
}

main();
