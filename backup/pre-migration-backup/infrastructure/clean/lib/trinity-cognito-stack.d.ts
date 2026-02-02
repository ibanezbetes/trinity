/**
 * Trinity Cognito Stack - User Authentication
 * Manages Cognito User Pool and User Pool Client
 * Designed for CDK import of existing resources
 */
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
export interface TrinityCognitoStackProps extends cdk.StackProps {
    config: TrinityEnvironmentConfig;
}
export declare class TrinityCognitoStack extends cdk.Stack {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly preSignUpLambda: lambda.Function;
    constructor(scope: Construct, id: string, props: TrinityCognitoStackProps);
    /**
     * Add Google OAuth identity provider
     */
    addGoogleIdentityProvider(googleClientId: string, googleClientSecret: string): cognito.UserPoolIdentityProviderOidc;
    /**
     * Get User Pool for use in other stacks
     */
    getUserPool(): cognito.IUserPool;
    /**
     * Get User Pool Client for use in other stacks
     */
    getUserPoolClient(): cognito.IUserPoolClient;
}
