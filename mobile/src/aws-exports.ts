import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: 'eu-west-1_6UxioIj4z',
  ClientId: '2a07bheqdh1mllkd1sn0i3s5m3',
};

const userPool = new CognitoUserPool(poolData);

export const awsConfig = {
  Auth: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_6UxioIj4z',
    userPoolWebClientId: '2a07bheqdh1mllkd1sn0i3s5m3',
    mandatorySignIn: true,
    authenticationFlowType: 'USER_SRP_AUTH',
  },
  API: {
    graphqlEndpoint: 'https://imx6fos5lnd3xkdchl4rqtv4pi.appsync-api.eu-west-1.amazonaws.com/graphql',
    realtimeEndpoint: 'wss://imx6fos5lnd3xkdchl4rqtv4pi.appsync-realtime-api.eu-west-1.amazonaws.com/graphql',
  },
};

export { userPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute };
export default awsConfig;