/**
 * Trinity Cognito Stack - User Authentication
 * Manages Cognito User Pool and User Pool Client
 * Designed for CDK import of existing resources
 */

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';

export interface TrinityCognitoStackProps extends cdk.StackProps {
  config: TrinityEnvironmentConfig;
}

export class TrinityCognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly preSignUpLambda: lambda.Function;

  constructor(scope: Construct, id: string, props: TrinityCognitoStackProps) {
    super(scope, id, props);

    // Create Pre-SignUp Lambda function (auto-confirm users)
    this.preSignUpLambda = new lambda.Function(this, 'PreSignUpAutoConfirm', {
      functionName: `trinity-pre-signup-${props.config.environment}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Pre-SignUp trigger:', JSON.stringify(event, null, 2));
          
          // Auto-confirm user and email
          event.response.autoConfirmUser = true;
          event.response.autoVerifyEmail = true;
          
          console.log('User auto-confirmed:', event.request.userAttributes.email);
          return event;
        };
      `),
      description: 'Auto-confirm users during sign-up process',
      timeout: cdk.Duration.seconds(30),
    });

    // Create User Pool (matching existing trinity-users-dev-v2 configuration)
    this.userPool = new cognito.UserPool(this, 'TrinityUserPool', {
      userPoolName: 'trinity-users-dev-v2',
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: false,
        phone: false,
      },
      
      // Auto-verified attributes
      autoVerify: {
        email: true,
        phone: false,
      },
      
      // Password policy (matching existing configuration)
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // MFA configuration
      mfa: cognito.Mfa.OFF,
      
      // Email configuration (using Cognito default)
      email: cognito.UserPoolEmail.withCognito(),
      
      // Verification messages (matching existing configuration)
      userVerification: {
        emailSubject: 'Verify your new account',
        emailBody: 'The verification code to your new account is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
        smsMessage: 'The verification code to your new account is {####}',
      },
      
      // Lambda triggers
      lambdaTriggers: {
        preSignUp: this.preSignUpLambda,
      },
      
      // Admin create user configuration
      selfSignUpEnabled: true,
      userInvitation: {
        emailSubject: 'Your Trinity account',
        emailBody: 'Your username is {username} and temporary password is {####}',
        smsMessage: 'Your username is {username} and temporary password is {####}',
      },
      
      // Deletion protection
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      
      // Advanced security (optional)
      advancedSecurityMode: cognito.AdvancedSecurityMode.AUDIT,
    });

    // Create User Pool Client (matching existing trinity-client-dev configuration)
    this.userPoolClient = new cognito.UserPoolClient(this, 'TrinityUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'trinity-client-dev',
      
      // Authentication flows (matching existing configuration)
      authFlows: {
        adminUserPassword: true,
        userPassword: true,
        userSrp: true,
        custom: false,
      },
      
      // OAuth configuration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
          clientCredentials: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'https://example.com', // Matches existing configuration
        ],
        logoutUrls: [
          'https://example.com',
        ],
      },
      
      // Token validity (matching existing configuration)
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      
      // Supported identity providers
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      
      // Security settings
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      
      // Generate secret (set to false to match existing client)
      generateSecret: false,
    });

    // Grant Pre-SignUp Lambda permission to be invoked by Cognito
    this.preSignUpLambda.addPermission('CognitoInvokePermission', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      sourceArn: this.userPool.userPoolArn,
    });

    // Create User Pool Domain (optional, for hosted UI)
    const userPoolDomain = new cognito.UserPoolDomain(this, 'TrinityUserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `trinity-auth-${props.config.environment}`,
      },
    });

    // Output important values
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Trinity Cognito User Pool ID',
      exportName: `${props.config.environment}-trinity-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Trinity Cognito User Pool ARN',
      exportName: `${props.config.environment}-trinity-user-pool-arn`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Trinity Cognito User Pool Client ID',
      exportName: `${props.config.environment}-trinity-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomainUrl', {
      value: userPoolDomain.domainName,
      description: 'Trinity Cognito User Pool Domain',
      exportName: `${props.config.environment}-trinity-user-pool-domain`,
    });

    // Add tags
    cdk.Tags.of(this).add('Project', 'Trinity');
    cdk.Tags.of(this).add('Environment', props.config.environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }

  /**
   * Add Google OAuth identity provider
   */
  public addGoogleIdentityProvider(
    googleClientId: string,
    googleClientSecret: string
  ): cognito.UserPoolIdentityProviderOidc {
    
    const googleProvider = new cognito.UserPoolIdentityProviderOidc(this, 'GoogleProvider', {
      userPool: this.userPool,
      name: 'Google',
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      issuerUrl: 'https://accounts.google.com',
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });

    // Update User Pool Client to support Google
    const cfnUserPoolClient = this.userPoolClient.node.defaultChild as cognito.CfnUserPoolClient;
    cfnUserPoolClient.supportedIdentityProviders = [
      'COGNITO',
      googleProvider.providerName,
    ];

    return googleProvider;
  }

  /**
   * Get User Pool for use in other stacks
   */
  public getUserPool(): cognito.IUserPool {
    return this.userPool;
  }

  /**
   * Get User Pool Client for use in other stacks
   */
  public getUserPoolClient(): cognito.IUserPoolClient {
    return this.userPoolClient;
  }
}