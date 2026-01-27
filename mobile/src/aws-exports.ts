import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: 'eu-west-1_EtOx2swvP',
  ClientId: 'l08ofv6tef7dp8eorn022fqpj',
};

const userPool = new CognitoUserPool(poolData);

export const awsConfig = {
  Auth: {
    region: 'eu-west-1',
    userPoolId: 'eu-west-1_EtOx2swvP',
    userPoolWebClientId: 'l08ofv6tef7dp8eorn022fqpj',
    mandatorySignIn: true,
    authenticationFlowType: 'USER_SRP_AUTH',
  },
};

export { userPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute };
export default awsConfig;