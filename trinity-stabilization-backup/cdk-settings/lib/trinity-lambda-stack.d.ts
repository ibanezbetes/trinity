/**
 * Trinity Lambda Stack
 * Defines all Lambda functions with TypeScript source code
 * Using regular Lambda functions to avoid Windows bundling issues
 */
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from '../config/environments';
export interface TrinityLambdaStackProps extends cdk.StackProps {
    config: TrinityEnvironmentConfig;
    tables: Record<string, cdk.aws_dynamodb.Table>;
    parameterStore: any;
}
export declare class TrinityLambdaStack extends cdk.Stack {
    readonly functions: Record<string, lambda.Function>;
    constructor(scope: Construct, id: string, props: TrinityLambdaStackProps);
}
