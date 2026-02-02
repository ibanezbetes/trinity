"use strict";
/**
 * Trinity Cognito Stack - User Authentication
 * Manages Cognito User Pool and User Pool Client
 * Designed for CDK import of existing resources
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrinityCognitoStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cognito = __importStar(require("aws-cdk-lib/aws-cognito"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class TrinityCognitoStack extends cdk.Stack {
    constructor(scope, id, props) {
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
    addGoogleIdentityProvider(googleClientId, googleClientSecret) {
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
        const cfnUserPoolClient = this.userPoolClient.node.defaultChild;
        cfnUserPoolClient.supportedIdentityProviders = [
            'COGNITO',
            googleProvider.providerName,
        ];
        return googleProvider;
    }
    /**
     * Get User Pool for use in other stacks
     */
    getUserPool() {
        return this.userPool;
    }
    /**
     * Get User Pool Client for use in other stacks
     */
    getUserPoolClient() {
        return this.userPoolClient;
    }
}
exports.TrinityCognitoStack = TrinityCognitoStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbml0eS1jb2duaXRvLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidHJpbml0eS1jb2duaXRvLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMsaUVBQW1EO0FBQ25ELCtEQUFpRDtBQUNqRCx5REFBMkM7QUFRM0MsTUFBYSxtQkFBb0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUtoRCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQStCO1FBQ3ZFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHlEQUF5RDtRQUN6RCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDdkUsWUFBWSxFQUFFLHNCQUFzQixLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRTtZQUM5RCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxlQUFlO1lBQ3hCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQzs7Ozs7Ozs7Ozs7T0FXNUIsQ0FBQztZQUNGLFdBQVcsRUFBRSwyQ0FBMkM7WUFDeEQsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztTQUNsQyxDQUFDLENBQUM7UUFFSCwwRUFBMEU7UUFDMUUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQzVELFlBQVksRUFBRSxzQkFBc0I7WUFFcEMsd0JBQXdCO1lBQ3hCLGFBQWEsRUFBRTtnQkFDYixLQUFLLEVBQUUsSUFBSTtnQkFDWCxRQUFRLEVBQUUsS0FBSztnQkFDZixLQUFLLEVBQUUsS0FBSzthQUNiO1lBRUQsMkJBQTJCO1lBQzNCLFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTtnQkFDWCxLQUFLLEVBQUUsS0FBSzthQUNiO1lBRUQsb0RBQW9EO1lBQ3BELGNBQWMsRUFBRTtnQkFDZCxTQUFTLEVBQUUsQ0FBQztnQkFDWixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsY0FBYyxFQUFFLEtBQUs7Z0JBQ3JCLG9CQUFvQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzthQUMzQztZQUVELG1CQUFtQjtZQUNuQixlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1lBRW5ELG9CQUFvQjtZQUNwQixHQUFHLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBRXBCLDhDQUE4QztZQUM5QyxLQUFLLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxXQUFXLEVBQUU7WUFFMUMsMERBQTBEO1lBQzFELGdCQUFnQixFQUFFO2dCQUNoQixZQUFZLEVBQUUseUJBQXlCO2dCQUN2QyxTQUFTLEVBQUUscURBQXFEO2dCQUNoRSxVQUFVLEVBQUUsT0FBTyxDQUFDLHNCQUFzQixDQUFDLElBQUk7Z0JBQy9DLFVBQVUsRUFBRSxxREFBcUQ7YUFDbEU7WUFFRCxrQkFBa0I7WUFDbEIsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxJQUFJLENBQUMsZUFBZTthQUNoQztZQUVELGtDQUFrQztZQUNsQyxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLGNBQWMsRUFBRTtnQkFDZCxZQUFZLEVBQUUsc0JBQXNCO2dCQUNwQyxTQUFTLEVBQUUsOERBQThEO2dCQUN6RSxVQUFVLEVBQUUsOERBQThEO2FBQzNFO1lBRUQsc0JBQXNCO1lBQ3RCLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU07WUFFdkMsK0JBQStCO1lBQy9CLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxLQUFLO1NBQ3pELENBQUMsQ0FBQztRQUVILCtFQUErRTtRQUMvRSxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksT0FBTyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDOUUsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLGtCQUFrQixFQUFFLG9CQUFvQjtZQUV4Qyx5REFBeUQ7WUFDekQsU0FBUyxFQUFFO2dCQUNULGlCQUFpQixFQUFFLElBQUk7Z0JBQ3ZCLFlBQVksRUFBRSxJQUFJO2dCQUNsQixPQUFPLEVBQUUsSUFBSTtnQkFDYixNQUFNLEVBQUUsS0FBSzthQUNkO1lBRUQsc0JBQXNCO1lBQ3RCLEtBQUssRUFBRTtnQkFDTCxLQUFLLEVBQUU7b0JBQ0wsc0JBQXNCLEVBQUUsSUFBSTtvQkFDNUIsaUJBQWlCLEVBQUUsSUFBSTtvQkFDdkIsaUJBQWlCLEVBQUUsS0FBSztpQkFDekI7Z0JBQ0QsTUFBTSxFQUFFO29CQUNOLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSztvQkFDeEIsT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNO29CQUN6QixPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU87aUJBQzNCO2dCQUNELFlBQVksRUFBRTtvQkFDWixxQkFBcUIsRUFBRSxpQ0FBaUM7aUJBQ3pEO2dCQUNELFVBQVUsRUFBRTtvQkFDVixxQkFBcUI7aUJBQ3RCO2FBQ0Y7WUFFRCxtREFBbUQ7WUFDbkQsb0JBQW9CLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzNDLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUMxQyxlQUFlLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBRXRDLCtCQUErQjtZQUMvQiwwQkFBMEIsRUFBRTtnQkFDMUIsT0FBTyxDQUFDLDhCQUE4QixDQUFDLE9BQU87YUFDL0M7WUFFRCxvQkFBb0I7WUFDcEIscUJBQXFCLEVBQUUsSUFBSTtZQUMzQiwwQkFBMEIsRUFBRSxJQUFJO1lBRWhDLDBEQUEwRDtZQUMxRCxjQUFjLEVBQUUsS0FBSztTQUN0QixDQUFDLENBQUM7UUFFSCw4REFBOEQ7UUFDOUQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMseUJBQXlCLEVBQUU7WUFDNUQsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLGdCQUFnQixDQUFDLDJCQUEyQixDQUFDO1lBQ2hFLFNBQVMsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7U0FDckMsQ0FBQyxDQUFDO1FBRUgsb0RBQW9EO1FBQ3BELE1BQU0sY0FBYyxHQUFHLElBQUksT0FBTyxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsdUJBQXVCLEVBQUU7WUFDL0UsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLGFBQWEsRUFBRTtnQkFDYixZQUFZLEVBQUUsZ0JBQWdCLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFO2FBQ3pEO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsMEJBQTBCO1FBQzFCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVU7WUFDL0IsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsdUJBQXVCO1NBQy9ELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDaEMsV0FBVyxFQUFFLCtCQUErQjtZQUM1QyxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsd0JBQXdCO1NBQ2hFLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsZ0JBQWdCO1lBQzNDLFdBQVcsRUFBRSxxQ0FBcUM7WUFDbEQsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxXQUFXLDhCQUE4QjtTQUN0RSxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzNDLEtBQUssRUFBRSxjQUFjLENBQUMsVUFBVTtZQUNoQyxXQUFXLEVBQUUsa0NBQWtDO1lBQy9DLFVBQVUsRUFBRSxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVywyQkFBMkI7U0FDbkUsQ0FBQyxDQUFDO1FBRUgsV0FBVztRQUNYLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQy9ELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUVEOztPQUVHO0lBQ0kseUJBQXlCLENBQzlCLGNBQXNCLEVBQ3RCLGtCQUEwQjtRQUcxQixNQUFNLGNBQWMsR0FBRyxJQUFJLE9BQU8sQ0FBQyw0QkFBNEIsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDdEYsUUFBUSxFQUFFLElBQUksQ0FBQyxRQUFRO1lBQ3ZCLElBQUksRUFBRSxRQUFRO1lBQ2QsUUFBUSxFQUFFLGNBQWM7WUFDeEIsWUFBWSxFQUFFLGtCQUFrQjtZQUNoQyxTQUFTLEVBQUUsNkJBQTZCO1lBQ3hDLE1BQU0sRUFBRSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDO1lBQ3RDLGdCQUFnQixFQUFFO2dCQUNoQixLQUFLLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixDQUFDLFlBQVk7Z0JBQzdDLFNBQVMsRUFBRSxPQUFPLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCO2dCQUN0RCxVQUFVLEVBQUUsT0FBTyxDQUFDLGlCQUFpQixDQUFDLGtCQUFrQjtnQkFDeEQsY0FBYyxFQUFFLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjO2FBQ3pEO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsNENBQTRDO1FBQzVDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsWUFBeUMsQ0FBQztRQUM3RixpQkFBaUIsQ0FBQywwQkFBMEIsR0FBRztZQUM3QyxTQUFTO1lBQ1QsY0FBYyxDQUFDLFlBQVk7U0FDNUIsQ0FBQztRQUVGLE9BQU8sY0FBYyxDQUFDO0lBQ3hCLENBQUM7SUFFRDs7T0FFRztJQUNJLFdBQVc7UUFDaEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3ZCLENBQUM7SUFFRDs7T0FFRztJQUNJLGlCQUFpQjtRQUN0QixPQUFPLElBQUksQ0FBQyxjQUFjLENBQUM7SUFDN0IsQ0FBQztDQUNGO0FBM09ELGtEQTJPQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxyXG4gKiBUcmluaXR5IENvZ25pdG8gU3RhY2sgLSBVc2VyIEF1dGhlbnRpY2F0aW9uXHJcbiAqIE1hbmFnZXMgQ29nbml0byBVc2VyIFBvb2wgYW5kIFVzZXIgUG9vbCBDbGllbnRcclxuICogRGVzaWduZWQgZm9yIENESyBpbXBvcnQgb2YgZXhpc3RpbmcgcmVzb3VyY2VzXHJcbiAqL1xyXG5cclxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XHJcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgVHJpbml0eUVudmlyb25tZW50Q29uZmlnIH0gZnJvbSAnLi4vY29uZmlnL2Vudmlyb25tZW50cyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRyaW5pdHlDb2duaXRvU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBjb25maWc6IFRyaW5pdHlFbnZpcm9ubWVudENvbmZpZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFRyaW5pdHlDb2duaXRvU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcclxuICBwdWJsaWMgcmVhZG9ubHkgdXNlclBvb2xDbGllbnQ6IGNvZ25pdG8uVXNlclBvb2xDbGllbnQ7XHJcbiAgcHVibGljIHJlYWRvbmx5IHByZVNpZ25VcExhbWJkYTogbGFtYmRhLkZ1bmN0aW9uO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogVHJpbml0eUNvZ25pdG9TdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgUHJlLVNpZ25VcCBMYW1iZGEgZnVuY3Rpb24gKGF1dG8tY29uZmlybSB1c2VycylcclxuICAgIHRoaXMucHJlU2lnblVwTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUHJlU2lnblVwQXV0b0NvbmZpcm0nLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogYHRyaW5pdHktcHJlLXNpZ251cC0ke3Byb3BzLmNvbmZpZy5lbnZpcm9ubWVudH1gLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcclxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcclxuICAgICAgICBleHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQpID0+IHtcclxuICAgICAgICAgIGNvbnNvbGUubG9nKCdQcmUtU2lnblVwIHRyaWdnZXI6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgLy8gQXV0by1jb25maXJtIHVzZXIgYW5kIGVtYWlsXHJcbiAgICAgICAgICBldmVudC5yZXNwb25zZS5hdXRvQ29uZmlybVVzZXIgPSB0cnVlO1xyXG4gICAgICAgICAgZXZlbnQucmVzcG9uc2UuYXV0b1ZlcmlmeUVtYWlsID0gdHJ1ZTtcclxuICAgICAgICAgIFxyXG4gICAgICAgICAgY29uc29sZS5sb2coJ1VzZXIgYXV0by1jb25maXJtZWQ6JywgZXZlbnQucmVxdWVzdC51c2VyQXR0cmlidXRlcy5lbWFpbCk7XHJcbiAgICAgICAgICByZXR1cm4gZXZlbnQ7XHJcbiAgICAgICAgfTtcclxuICAgICAgYCksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXV0by1jb25maXJtIHVzZXJzIGR1cmluZyBzaWduLXVwIHByb2Nlc3MnLFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgVXNlciBQb29sIChtYXRjaGluZyBleGlzdGluZyB0cmluaXR5LXVzZXJzLWRldi12MiBjb25maWd1cmF0aW9uKVxyXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdUcmluaXR5VXNlclBvb2wnLCB7XHJcbiAgICAgIHVzZXJQb29sTmFtZTogJ3RyaW5pdHktdXNlcnMtZGV2LXYyJyxcclxuICAgICAgXHJcbiAgICAgIC8vIFNpZ24taW4gY29uZmlndXJhdGlvblxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgICAgdXNlcm5hbWU6IGZhbHNlLFxyXG4gICAgICAgIHBob25lOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIC8vIEF1dG8tdmVyaWZpZWQgYXR0cmlidXRlc1xyXG4gICAgICBhdXRvVmVyaWZ5OiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgICAgcGhvbmU6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gUGFzc3dvcmQgcG9saWN5IChtYXRjaGluZyBleGlzdGluZyBjb25maWd1cmF0aW9uKVxyXG4gICAgICBwYXNzd29yZFBvbGljeToge1xyXG4gICAgICAgIG1pbkxlbmd0aDogOCxcclxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXHJcbiAgICAgICAgdGVtcFBhc3N3b3JkVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gQWNjb3VudCByZWNvdmVyeVxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXHJcbiAgICAgIFxyXG4gICAgICAvLyBNRkEgY29uZmlndXJhdGlvblxyXG4gICAgICBtZmE6IGNvZ25pdG8uTWZhLk9GRixcclxuICAgICAgXHJcbiAgICAgIC8vIEVtYWlsIGNvbmZpZ3VyYXRpb24gKHVzaW5nIENvZ25pdG8gZGVmYXVsdClcclxuICAgICAgZW1haWw6IGNvZ25pdG8uVXNlclBvb2xFbWFpbC53aXRoQ29nbml0bygpLFxyXG4gICAgICBcclxuICAgICAgLy8gVmVyaWZpY2F0aW9uIG1lc3NhZ2VzIChtYXRjaGluZyBleGlzdGluZyBjb25maWd1cmF0aW9uKVxyXG4gICAgICB1c2VyVmVyaWZpY2F0aW9uOiB7XHJcbiAgICAgICAgZW1haWxTdWJqZWN0OiAnVmVyaWZ5IHlvdXIgbmV3IGFjY291bnQnLFxyXG4gICAgICAgIGVtYWlsQm9keTogJ1RoZSB2ZXJpZmljYXRpb24gY29kZSB0byB5b3VyIG5ldyBhY2NvdW50IGlzIHsjIyMjfScsXHJcbiAgICAgICAgZW1haWxTdHlsZTogY29nbml0by5WZXJpZmljYXRpb25FbWFpbFN0eWxlLkNPREUsXHJcbiAgICAgICAgc21zTWVzc2FnZTogJ1RoZSB2ZXJpZmljYXRpb24gY29kZSB0byB5b3VyIG5ldyBhY2NvdW50IGlzIHsjIyMjfScsXHJcbiAgICAgIH0sXHJcbiAgICAgIFxyXG4gICAgICAvLyBMYW1iZGEgdHJpZ2dlcnNcclxuICAgICAgbGFtYmRhVHJpZ2dlcnM6IHtcclxuICAgICAgICBwcmVTaWduVXA6IHRoaXMucHJlU2lnblVwTGFtYmRhLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gQWRtaW4gY3JlYXRlIHVzZXIgY29uZmlndXJhdGlvblxyXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogdHJ1ZSxcclxuICAgICAgdXNlckludml0YXRpb246IHtcclxuICAgICAgICBlbWFpbFN1YmplY3Q6ICdZb3VyIFRyaW5pdHkgYWNjb3VudCcsXHJcbiAgICAgICAgZW1haWxCb2R5OiAnWW91ciB1c2VybmFtZSBpcyB7dXNlcm5hbWV9IGFuZCB0ZW1wb3JhcnkgcGFzc3dvcmQgaXMgeyMjIyN9JyxcclxuICAgICAgICBzbXNNZXNzYWdlOiAnWW91ciB1c2VybmFtZSBpcyB7dXNlcm5hbWV9IGFuZCB0ZW1wb3JhcnkgcGFzc3dvcmQgaXMgeyMjIyN9JyxcclxuICAgICAgfSxcclxuICAgICAgXHJcbiAgICAgIC8vIERlbGV0aW9uIHByb3RlY3Rpb25cclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICBcclxuICAgICAgLy8gQWR2YW5jZWQgc2VjdXJpdHkgKG9wdGlvbmFsKVxyXG4gICAgICBhZHZhbmNlZFNlY3VyaXR5TW9kZTogY29nbml0by5BZHZhbmNlZFNlY3VyaXR5TW9kZS5BVURJVCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBVc2VyIFBvb2wgQ2xpZW50IChtYXRjaGluZyBleGlzdGluZyB0cmluaXR5LWNsaWVudC1kZXYgY29uZmlndXJhdGlvbilcclxuICAgIHRoaXMudXNlclBvb2xDbGllbnQgPSBuZXcgY29nbml0by5Vc2VyUG9vbENsaWVudCh0aGlzLCAnVHJpbml0eVVzZXJQb29sQ2xpZW50Jywge1xyXG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcclxuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAndHJpbml0eS1jbGllbnQtZGV2JyxcclxuICAgICAgXHJcbiAgICAgIC8vIEF1dGhlbnRpY2F0aW9uIGZsb3dzIChtYXRjaGluZyBleGlzdGluZyBjb25maWd1cmF0aW9uKVxyXG4gICAgICBhdXRoRmxvd3M6IHtcclxuICAgICAgICBhZG1pblVzZXJQYXNzd29yZDogdHJ1ZSxcclxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXHJcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcclxuICAgICAgICBjdXN0b206IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gT0F1dGggY29uZmlndXJhdGlvblxyXG4gICAgICBvQXV0aDoge1xyXG4gICAgICAgIGZsb3dzOiB7XHJcbiAgICAgICAgICBhdXRob3JpemF0aW9uQ29kZUdyYW50OiB0cnVlLFxyXG4gICAgICAgICAgaW1wbGljaXRDb2RlR3JhbnQ6IHRydWUsXHJcbiAgICAgICAgICBjbGllbnRDcmVkZW50aWFsczogZmFsc2UsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBzY29wZXM6IFtcclxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5FTUFJTCxcclxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5PUEVOSUQsXHJcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xyXG4gICAgICAgICAgJ2h0dHBzOi8vZXhhbXBsZS5jb20nLCAvLyBNYXRjaGVzIGV4aXN0aW5nIGNvbmZpZ3VyYXRpb25cclxuICAgICAgICBdLFxyXG4gICAgICAgIGxvZ291dFVybHM6IFtcclxuICAgICAgICAgICdodHRwczovL2V4YW1wbGUuY29tJyxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgICBcclxuICAgICAgLy8gVG9rZW4gdmFsaWRpdHkgKG1hdGNoaW5nIGV4aXN0aW5nIGNvbmZpZ3VyYXRpb24pXHJcbiAgICAgIHJlZnJlc2hUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uZGF5cygzMCksXHJcbiAgICAgIGFjY2Vzc1Rva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcclxuICAgICAgaWRUb2tlblZhbGlkaXR5OiBjZGsuRHVyYXRpb24uaG91cnMoMSksXHJcbiAgICAgIFxyXG4gICAgICAvLyBTdXBwb3J0ZWQgaWRlbnRpdHkgcHJvdmlkZXJzXHJcbiAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXHJcbiAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcclxuICAgICAgXSxcclxuICAgICAgXHJcbiAgICAgIC8vIFNlY3VyaXR5IHNldHRpbmdzXHJcbiAgICAgIGVuYWJsZVRva2VuUmV2b2NhdGlvbjogdHJ1ZSxcclxuICAgICAgcHJldmVudFVzZXJFeGlzdGVuY2VFcnJvcnM6IHRydWUsXHJcbiAgICAgIFxyXG4gICAgICAvLyBHZW5lcmF0ZSBzZWNyZXQgKHNldCB0byBmYWxzZSB0byBtYXRjaCBleGlzdGluZyBjbGllbnQpXHJcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiBmYWxzZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IFByZS1TaWduVXAgTGFtYmRhIHBlcm1pc3Npb24gdG8gYmUgaW52b2tlZCBieSBDb2duaXRvXHJcbiAgICB0aGlzLnByZVNpZ25VcExhbWJkYS5hZGRQZXJtaXNzaW9uKCdDb2duaXRvSW52b2tlUGVybWlzc2lvbicsIHtcclxuICAgICAgcHJpbmNpcGFsOiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2NvZ25pdG8taWRwLmFtYXpvbmF3cy5jb20nKSxcclxuICAgICAgc291cmNlQXJuOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sQXJuLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFVzZXIgUG9vbCBEb21haW4gKG9wdGlvbmFsLCBmb3IgaG9zdGVkIFVJKVxyXG4gICAgY29uc3QgdXNlclBvb2xEb21haW4gPSBuZXcgY29nbml0by5Vc2VyUG9vbERvbWFpbih0aGlzLCAnVHJpbml0eVVzZXJQb29sRG9tYWluJywge1xyXG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcclxuICAgICAgY29nbml0b0RvbWFpbjoge1xyXG4gICAgICAgIGRvbWFpblByZWZpeDogYHRyaW5pdHktYXV0aC0ke3Byb3BzLmNvbmZpZy5lbnZpcm9ubWVudH1gLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IGltcG9ydGFudCB2YWx1ZXNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbElkJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaW5pdHkgQ29nbml0byBVc2VyIFBvb2wgSUQnLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5jb25maWcuZW52aXJvbm1lbnR9LXRyaW5pdHktdXNlci1wb29sLWlkYCxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbEFybicsIHtcclxuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xBcm4sXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpbml0eSBDb2duaXRvIFVzZXIgUG9vbCBBUk4nLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5jb25maWcuZW52aXJvbm1lbnR9LXRyaW5pdHktdXNlci1wb29sLWFybmAsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcclxuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdUcmluaXR5IENvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXHJcbiAgICAgIGV4cG9ydE5hbWU6IGAke3Byb3BzLmNvbmZpZy5lbnZpcm9ubWVudH0tdHJpbml0eS11c2VyLXBvb2wtY2xpZW50LWlkYCxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyUG9vbERvbWFpblVybCcsIHtcclxuICAgICAgdmFsdWU6IHVzZXJQb29sRG9tYWluLmRvbWFpbk5hbWUsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVHJpbml0eSBDb2duaXRvIFVzZXIgUG9vbCBEb21haW4nLFxyXG4gICAgICBleHBvcnROYW1lOiBgJHtwcm9wcy5jb25maWcuZW52aXJvbm1lbnR9LXRyaW5pdHktdXNlci1wb29sLWRvbWFpbmAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgdGFnc1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdQcm9qZWN0JywgJ1RyaW5pdHknKTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnRW52aXJvbm1lbnQnLCBwcm9wcy5jb25maWcuZW52aXJvbm1lbnQpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcykuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XHJcbiAgfVxyXG5cclxuICAvKipcclxuICAgKiBBZGQgR29vZ2xlIE9BdXRoIGlkZW50aXR5IHByb3ZpZGVyXHJcbiAgICovXHJcbiAgcHVibGljIGFkZEdvb2dsZUlkZW50aXR5UHJvdmlkZXIoXHJcbiAgICBnb29nbGVDbGllbnRJZDogc3RyaW5nLFxyXG4gICAgZ29vZ2xlQ2xpZW50U2VjcmV0OiBzdHJpbmdcclxuICApOiBjb2duaXRvLlVzZXJQb29sSWRlbnRpdHlQcm92aWRlck9pZGMge1xyXG4gICAgXHJcbiAgICBjb25zdCBnb29nbGVQcm92aWRlciA9IG5ldyBjb2duaXRvLlVzZXJQb29sSWRlbnRpdHlQcm92aWRlck9pZGModGhpcywgJ0dvb2dsZVByb3ZpZGVyJywge1xyXG4gICAgICB1c2VyUG9vbDogdGhpcy51c2VyUG9vbCxcclxuICAgICAgbmFtZTogJ0dvb2dsZScsXHJcbiAgICAgIGNsaWVudElkOiBnb29nbGVDbGllbnRJZCxcclxuICAgICAgY2xpZW50U2VjcmV0OiBnb29nbGVDbGllbnRTZWNyZXQsXHJcbiAgICAgIGlzc3VlclVybDogJ2h0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbScsXHJcbiAgICAgIHNjb3BlczogWydvcGVuaWQnLCAnZW1haWwnLCAncHJvZmlsZSddLFxyXG4gICAgICBhdHRyaWJ1dGVNYXBwaW5nOiB7XHJcbiAgICAgICAgZW1haWw6IGNvZ25pdG8uUHJvdmlkZXJBdHRyaWJ1dGUuR09PR0xFX0VNQUlMLFxyXG4gICAgICAgIGdpdmVuTmFtZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfR0lWRU5fTkFNRSxcclxuICAgICAgICBmYW1pbHlOYW1lOiBjb2duaXRvLlByb3ZpZGVyQXR0cmlidXRlLkdPT0dMRV9GQU1JTFlfTkFNRSxcclxuICAgICAgICBwcm9maWxlUGljdHVyZTogY29nbml0by5Qcm92aWRlckF0dHJpYnV0ZS5HT09HTEVfUElDVFVSRSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFVwZGF0ZSBVc2VyIFBvb2wgQ2xpZW50IHRvIHN1cHBvcnQgR29vZ2xlXHJcbiAgICBjb25zdCBjZm5Vc2VyUG9vbENsaWVudCA9IHRoaXMudXNlclBvb2xDbGllbnQubm9kZS5kZWZhdWx0Q2hpbGQgYXMgY29nbml0by5DZm5Vc2VyUG9vbENsaWVudDtcclxuICAgIGNmblVzZXJQb29sQ2xpZW50LnN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzID0gW1xyXG4gICAgICAnQ09HTklUTycsXHJcbiAgICAgIGdvb2dsZVByb3ZpZGVyLnByb3ZpZGVyTmFtZSxcclxuICAgIF07XHJcblxyXG4gICAgcmV0dXJuIGdvb2dsZVByb3ZpZGVyO1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogR2V0IFVzZXIgUG9vbCBmb3IgdXNlIGluIG90aGVyIHN0YWNrc1xyXG4gICAqL1xyXG4gIHB1YmxpYyBnZXRVc2VyUG9vbCgpOiBjb2duaXRvLklVc2VyUG9vbCB7XHJcbiAgICByZXR1cm4gdGhpcy51c2VyUG9vbDtcclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIEdldCBVc2VyIFBvb2wgQ2xpZW50IGZvciB1c2UgaW4gb3RoZXIgc3RhY2tzXHJcbiAgICovXHJcbiAgcHVibGljIGdldFVzZXJQb29sQ2xpZW50KCk6IGNvZ25pdG8uSVVzZXJQb29sQ2xpZW50IHtcclxuICAgIHJldHVybiB0aGlzLnVzZXJQb29sQ2xpZW50O1xyXG4gIH1cclxufSJdfQ==