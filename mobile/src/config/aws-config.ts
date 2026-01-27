/**
 * AWS Configuration for Trinity Mobile App
 * Production values from deployed infrastructure
 */

export interface AWSConfig {
  region: string;
  graphqlEndpoint: string;
  realtimeEndpoint: string;
  userPoolId: string;
  userPoolWebClientId: string;
  identityPoolId: string;
  userPoolDomain?: string;
  apiKey?: string; // Optional API key for AppSync
  // Google Federation
  googleClientId?: string;
  oauth?: {
    domain: string;
    scope: string[];
    redirectSignIn: string;
    redirectSignOut: string;
    responseType: string;
  };
}

// Production AWS Configuration
export const AWS_CONFIG: AWSConfig = {
  region: 'eu-west-1',
  graphqlEndpoint: 'https://qdvhkkwneza2pkpaofehnvmubq.appsync-api.eu-west-1.amazonaws.com/graphql',
  realtimeEndpoint: 'wss://qdvhkkwneza2pkpaofehnvmubq.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
  userPoolId: 'eu-west-1_EtOx2swvP',
  userPoolWebClientId: 'l08ofv6tef7dp8eorn022fqpj', // From CDK deployment
  identityPoolId: '', // Will be populated by setup script
  userPoolDomain: 'trinity-auth-dev.auth.eu-west-1.amazoncognito.com',
  // Google Federation Configuration
  googleClientId: '230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com',
  oauth: {
    domain: 'trinity-auth-dev.auth.eu-west-1.amazoncognito.com',
    scope: ['email', 'openid', 'profile'],
    redirectSignIn: 'trinity://auth/callback',
    redirectSignOut: 'trinity://auth/logout',
    responseType: 'code',
  },
};

// Environment detection
export const getAWSConfig = (): AWSConfig => {
  if (__DEV__) {
    console.log('🔧 Using AWS Production Config in Development Mode');
    console.log('📍 Region:', AWS_CONFIG.region);
    console.log('🔗 GraphQL Endpoint:', AWS_CONFIG.graphqlEndpoint);
    console.log('👤 User Pool ID:', AWS_CONFIG.userPoolId);
  }

  return AWS_CONFIG;
};

// GraphQL Queries and Mutations
export const GRAPHQL_OPERATIONS = {
  // Mutations
  CREATE_ROOM: `
    mutation CreateRoom($input: CreateRoomInput!) {
      createRoom(input: $input) {
        id
        name
        description
        hostId
        status
        inviteCode
        isActive
        isPrivate
        memberCount
        maxMembers
        createdAt
      }
    }
  `,

  JOIN_ROOM: `
    mutation JoinRoom($input: JoinRoomInput!) {
      joinRoom(input: $input) {
        id
        name
        description
        hostId
        status
        inviteCode
        memberCount
        isActive
      }
    }
  `,

  VOTE: `
    mutation Vote($input: VoteInput!) {
      vote(input: $input) {
        id
        status
        resultMovieId
        hostId
        memberCount
      }
    }
  `,

  GET_AI_RECOMMENDATIONS: `
    mutation GetAIRecommendations($userText: String!) {
      getAIRecommendations(userText: $userText) {
        chatResponse
        recommendedGenres
        recommendedMovies {
          id
          title
          overview
          poster_path
          vote_average
          release_date
        }
      }
    }
  `,

  // Queries
  GET_ROOM: `
    query GetRoom($roomId: ID!) {
      getRoom(roomId: $roomId) {
        id
        name
        description
        hostId
        status
        inviteCode
        resultMovieId
        isActive
        isPrivate
        memberCount
        maxMembers
        createdAt
        updatedAt
      }
    }
  `,

  GET_USER_ROOMS: `
    query GetMyHistory {
      getMyHistory {
        id
        name
        description
        hostId
        status
        memberCount
        isActive
        createdAt
      }
    }
  `,

  GET_MOVIE_DETAILS: `
    query GetMovieDetails($movieId: String!) {
      getMovieDetails(movieId: $movieId) {
        id
        title
        overview
        poster
        vote_average
        release_date
        genres {
          id
          name
        }
        runtime
      }
    }
  `,

  GET_MOVIES: `
    query GetMovies($genre: String) {
      getMovies(genre: $genre) {
        id
        title
        overview
        poster
        vote_average
        release_date
      }
    }
  `,

  // Subscriptions
  ON_VOTE_UPDATE: `
    subscription OnVoteUpdate($roomId: ID!) {
      onVoteUpdate(roomId: $roomId) {
        roomId
        userId
        movieId
        voteType
        currentVotes
        totalMembers
        timestamp
      }
    }
  `,

  ON_MATCH_FOUND: `
    subscription OnMatchFound($roomId: ID!) {
      onMatchFound(roomId: $roomId) {
        roomId
        movieId
        movieTitle
        participants
        timestamp
      }
    }
  `,

  ON_ROOM_UPDATE: `
    subscription OnRoomUpdate($roomId: ID!) {
      onRoomUpdate(roomId: $roomId) {
        id
        status
        resultMovieId
        memberCount
        updatedAt
      }
    }
  `
};

export default AWS_CONFIG;