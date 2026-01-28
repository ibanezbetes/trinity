
const AWS = require('aws-sdk');
const fetch = require('node-fetch'); // NOTE: Assuming node-fetch or native fetch is available.
// If using node 18+, native fetch is used.

// Configuration
const REGION = 'eu-west-1';
const GRAPHQL_ENDPOINT = 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql';
const USER_POOL_ID = 'eu-west-1_EMnWISSRn';
const CLIENT_ID = '4svfit1a4muis95knfa8uh841r';

AWS.config.update({ region: REGION });
const cognito = new AWS.CognitoIdentityServiceProvider();

const JOIN_ROOM = `
  mutation JoinRoom($inviteCode: String!) {
    joinRoomByInvite(inviteCode: $inviteCode) {
      id
      memberCount
    }
  }
`;

const VOTE = `
  mutation Vote($input: VoteInput!) {
    vote(input: $input) {
      id
      status
      resultMovieId
    }
  }
`;

async function authenticateUser(username, password) {
    console.log(`🔐 Authenticating ${username}...`);
    try {
        const authResponse = await cognito.adminInitiateAuth({
            UserPoolId: USER_POOL_ID,
            ClientId: CLIENT_ID,
            AuthFlow: 'ADMIN_NO_SRP_AUTH',
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password
            }
        }).promise();
        return authResponse.AuthenticationResult.IdToken;
    } catch (err) {
        console.error(`❌ Authentication failed for ${username}:`, err);
        throw err;
    }
}

async function executeGraphQL(query, variables, token) {
    const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify({ query, variables })
    });

    const body = await response.json();
    if (body.errors) {
        throw new Error(`GraphQL Error: ${JSON.stringify(body.errors)}`);
    }
    return body.data;
}

async function run() {
    const inviteCode = process.argv[2];
    const targetMovieId = process.argv[3];

    if (!inviteCode || !targetMovieId) {
        console.error('Usage: node join-and-vote.js <INVITE_CODE> <MOVIE_ID>');
        process.exit(1);
    }

    try {
        // 1. Auth as Guest
        const guestUser = 'guest_user_manual';
        // Ensure user exists (optional, or assume pre-created, but let's try login)
        // We'll reuse 'guest_user' from previous test if possible, or create new.
        // For simplicity, let's use a dynamic guest?
        // Using fixed guest for simplicity.
        const token = await authenticateUser('guest_user', 'Password123!');

        // 2. Join Room
        console.log(`\n👤 Joining Room with code: ${inviteCode}`);
        const joinData = await executeGraphQL(JOIN_ROOM, { inviteCode }, token);
        const roomId = joinData.joinRoomByInvite.id;
        console.log(`✅ Joined Room: ${roomId}`);

        // 3. Vote Like
        console.log(`\n👍 Voting LIKE on movie: ${targetMovieId}`);
        const voteData = await executeGraphQL(VOTE, {
            input: {
                roomId: roomId,
                movieId: targetMovieId,
                voteType: 'LIKE'
            }
        }, token);

        console.log(`✅ Vote recorded. Room Status: ${voteData.vote.status}`);
        if (voteData.vote.status === 'MATCHED') {
            console.log('🎉 MATCH FOUND!');
        } else {
            console.log('⏳ Waiting for other votes...');
        }

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

run();
