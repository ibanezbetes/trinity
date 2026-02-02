/**
 * Trinity API Stack - AppSync GraphQL APIs
 * Manages both main API and real-time API with exact schema matching
 * Designed for CDK import of existing resources
 */
import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
export interface TrinityApiStackProps extends cdk.StackProps {
    config: TrinityEnvironmentConfig;
    userPool: cognito.IUserPool;
    tables: Record<string, dynamodb.ITable>;
    lambdaFunctions: Record<string, lambda.IFunction>;
}
export declare class TrinityApiStack extends cdk.Stack {
    readonly mainApi: appsync.GraphqlApi;
    readonly realtimeApi: appsync.GraphqlApi;
    constructor(scope: Construct, id: string, props: TrinityApiStackProps);
    /**
     * Create data sources for main API
     */
    private createMainApiDataSources;
    /**
     * Create resolvers for main API
     */
    private createMainApiResolvers;
    /**
     * Create custom resolvers with JavaScript code (matching existing resolver files)
     */
    private createCustomResolvers;
    /**
     * Create data sources for real-time API
     */
    private createRealtimeApiDataSources;
    /**
     * Create resolvers for real-time API
     */
    private createRealtimeApiResolvers;
}
