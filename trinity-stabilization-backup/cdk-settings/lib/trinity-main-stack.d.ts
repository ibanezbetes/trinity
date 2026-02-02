import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
import { TrinityDatabaseStack } from './trinity-database-stack';
import { TrinityLambdaStack } from './trinity-lambda-stack';
import { TrinityApiStack } from './trinity-api-stack';
import { TrinityCognitoStack } from './trinity-cognito-stack';
import { TrinityConfigStack } from './trinity-config-stack';
interface TrinityMainStackProps extends cdk.StackProps {
    config: TrinityEnvironmentConfig;
    databaseStack: TrinityDatabaseStack;
    lambdaStack: TrinityLambdaStack;
    cognitoStack: TrinityCognitoStack;
    apiStack: TrinityApiStack;
    configStack: TrinityConfigStack;
}
export declare class TrinityMainStack extends cdk.Stack {
    readonly webBucket: s3.Bucket;
    readonly distribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: TrinityMainStackProps);
}
export {};
