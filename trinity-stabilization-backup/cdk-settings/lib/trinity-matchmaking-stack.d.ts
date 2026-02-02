import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
export declare class TrinityMatchmakingStack extends cdk.Stack {
    readonly matchmakingFunction: lambda.Function;
    readonly matchmakingTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
