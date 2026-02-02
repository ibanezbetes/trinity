import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: 'eu-west-1_TSlG71OQi',
  ClientId: '3k120srs09npek1qbfhgip63n',
};

const userPool = new CognitoUserPool(poolData);

export const awsConfig = {
  Auth: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_TSlG71OQi',
    userPoolWebClientId: '3k120srs09npek1qbfhgip63n',
    mandatorySignIn: true,
    authenticationFlowType: 'USER_SRP_AUTH',
  },
  API: {
    graphqlEndpoint: 'https://b7vef3wm6jhfddfazbpru5ngki.appsync-api.eu-west-1.amazonaws.com/graphql',
    realtimeEndpoint: 'wss://b7vef3wm6jhfddfazbpru5ngki.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
  },
};

export { userPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute };
export default awsConfig;