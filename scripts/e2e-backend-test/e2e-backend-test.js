const https = require('https');
const crypto = require('crypto');
const AWS = require('aws-sdk');

// Configuración
const REGION = 'eu-west-1';
const GRAPHQL_ENDPOINT = 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql';
const USER_POOL_ID = 'eu-west-1_EtOx2swvP';
// Este script intentará obtener el Client ID dinámicamente

// Configurar AWS SDK
AWS.config.update({ region: REGION });
const cognito = new AWS.CognitoIdentityServiceProvider();

// Función helper para requests GraphQL
async function graphqlRequest(query, variables, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(GRAPHQL_ENDPOINT);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(JSON.stringify({ query, variables }));
        req.end();
    });
}

async function runTest() {
    console.log('🚀 Iniciando Test E2E Backend...');

    try {
        // 1. Obtener Client ID
        console.log('🔍 Buscando App Client ID...');
        const clients = await cognito.listUserPoolClients({ UserPoolId: USER_POOL_ID, MaxResults: 1 }).promise();
        if (!clients.UserPoolClients || clients.UserPoolClients.length === 0) {
            throw new Error('No se encontró App Client en el User Pool');
        }
        const clientId = clients.UserPoolClients[0].ClientId;
        console.log(`✅ Client ID encontrado: ${clientId}`);

        // 2. Crear/Autenticar Usuario Host
        const hostEmail = `host_${Date.now()}@test.com`;
        const password = 'Password123!';
        console.log(`👤 Creando Host: ${hostEmail}`);

        await cognito.adminCreateUser({
            UserPoolId: USER_POOL_ID,
            Username: hostEmail,
            TemporaryPassword: password,
            UserAttributes: [
                { Name: 'email', Value: hostEmail },
                { Name: 'email_verified', Value: 'true' }
            ],
            MessageAction: 'SUPPRESS'
        }).promise();

        // Set permanent password
        await cognito.adminSetUserPassword({
            UserPoolId: USER_POOL_ID,
            Username: hostEmail,
            Password: password,
            Permanent: true
        }).promise();

        // Authenticate Host
        console.log('🔑 Autenticando Host...');
        const hostAuth = await cognito.initiateAuth({
            ClientId: clientId,
            AuthFlow: 'USER_PASSWORD_AUTH',
            AuthParameters: {
                USERNAME: hostEmail,
                PASSWORD: password
            }
        }).promise();
        const hostToken = hostAuth.AuthenticationResult.IdToken;

        // 3. Crear Sala (Host)
        console.log('🏠 Host creando sala...');
        const createRoomQuery = `
      mutation CreateRoomSimple($name: String!) {
        createRoomSimple(name: $name) {
          id
          name
          inviteCode
          status
        }
      }
    `;
        const roomRes = await graphqlRequest(createRoomQuery, { name: 'E2E Test Room' }, hostToken);

        if (roomRes.errors) {
            console.error("❌ Error creando sala:", JSON.stringify(roomRes.errors, null, 2));
            throw new Error("Fallo al crear sala");
        }

        const room = roomRes.data.createRoomSimple;
        console.log(`✅ Sala creada: ${room.id} (Código: ${room.inviteCode})`);

        // 4. Crear/Autenticar Usuario Guest
        const guestEmail = `guest_${Date.now()}@test.com`;
        console.log(`👤 Creando Guest: ${guestEmail}`);

        await cognito.adminCreateUser({
            UserPoolId: USER_POOL_ID,
            Username: guestEmail,
            TemporaryPassword: password,
            UserAttributes: [
                { Name: 'email', Value: guestEmail },
                { Name: 'email_verified', Value: 'true' }
            ],
            MessageAction: 'SUPPRESS'
        }).promise();

        await cognito.adminSetUserPassword({
            UserPoolId: USER_POOL_ID,
            Username: guestEmail,
            Password: password,
            Permanent: true
        }).promise();

        console.log('🔑 Autenticando Guest...');
        const guestAuth = await cognito.initiateAuth({
            ClientId: clientId,
            AuthFlow: 'USER_PASSWORD_AUTH',
            AuthParameters: {
                USERNAME: guestEmail,
                PASSWORD: password
            }
        }).promise();
        const guestToken = guestAuth.AuthenticationResult.IdToken;

        // 5. Guest se une a la sala
        console.log('👋 Guest uniéndose a la sala...');
        const joinQuery = `
      mutation JoinRoomByInvite($inviteCode: String!) {
        joinRoomByInvite(inviteCode: $inviteCode) {
          id
          memberCount
        }
      }
    `;
        const joinRes = await graphqlRequest(joinQuery, { inviteCode: room.inviteCode }, guestToken);
        if (joinRes.errors) throw new Error(JSON.stringify(joinRes.errors));
        console.log('✅ Guest unido correctamente');

        // 6. Obtener Películas (Host) - Verificar que getMovies funciona
        console.log('🎬 Host obteniendo películas...');
        const getMoviesQuery = `
      query GetMovies {
        getMovies {
          id
          title
        }
      }
    `;
        const moviesRes = await graphqlRequest(getMoviesQuery, {}, hostToken);
        if (moviesRes.errors) throw new Error(JSON.stringify(moviesRes.errors));

        // Check for data.getMovies vs just getMovies if wrapped
        const movies = moviesRes.data.getMovies;
        if (!movies || movies.length === 0) throw new Error('No se devolvieron películas. ¿Es posible que la Lambda falle o devuelva array vacío?');

        const targetMovie = movies[0];
        console.log(`✅ Películas cargadas. Objetivo: ${targetMovie.title} (ID: ${targetMovie.id})`);

        // 7. Votar (Host)
        console.log('🗳️ Host votando LIKE...');
        const voteMutation = `
      mutation Vote($input: VoteInput!) {
        vote(input: $input) {
          success
          responseType
          room {
            id
            status
          }
          matchInfo {
            movieId
            movieTitle
            roomId
          }
          message
          error
        }
      }
    `;
        const hostVoteRes = await graphqlRequest(voteMutation, {
            input: {
                roomId: room.id,
                movieId: targetMovie.id,
                voteType: 'LIKE'
            }
        }, hostToken);

        if (hostVoteRes.errors) {
            console.error('❌ Error Host votando:', JSON.stringify(hostVoteRes.errors, null, 2));
        } else {
            const voteResponse = hostVoteRes.data.vote;
            console.log(`✅ Host voto registrado. Tipo: ${voteResponse.responseType}`);
            if (voteResponse.matchInfo) {
                console.log(`🎉 ¡MATCH ENCONTRADO! Película: ${voteResponse.matchInfo.movieTitle}`);
            }
        }

        // 8. Votar (Guest)
        console.log('🗳️ Guest votando LIKE...');
        const guestVoteRes = await graphqlRequest(voteMutation, {
            input: {
                roomId: room.id,
                movieId: targetMovie.id,
                voteType: 'LIKE'
            }
        }, guestToken);

        if (guestVoteRes.errors) {
            console.error('❌ Error Guest votando:', JSON.stringify(guestVoteRes.errors, null, 2));
        } else {
            // Check response structure
            if (!guestVoteRes.data || !guestVoteRes.data.vote) {
                console.log('⚠️ Respuesta inesperada de voto:', JSON.stringify(guestVoteRes));
            } else {
                const voteResponse = guestVoteRes.data.vote;
                console.log(`✅ Guest voto registrado. Tipo: ${voteResponse.responseType}`);
                
                if (voteResponse.matchInfo) {
                    console.log(`🎉 ¡MATCH CONFIRMADO! Película: ${voteResponse.matchInfo.movieTitle}`);
                } else if (voteResponse.room) {
                    console.log(`⚠️ No hubo match. Estado sala: ${voteResponse.room.status}`);
                } else {
                    console.log('⚠️ Respuesta sin match ni información de sala');
                }
            }
        }

    } catch (error) {
        console.error('❌ TEST FALLIDO:', error);
        if (error.stack) console.error(error.stack);
    }
}

runTest();
