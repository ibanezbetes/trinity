/**
 * Trinity Configuration Stack
 * Manages AWS Systems Manager Parameter Store configuration
 */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TrinityParameterStore } from '../config/parameter-store';
import { TrinityEnvironmentConfig } from '../config/environments';
interface TrinityConfigStackProps extends cdk.StackProps {
    config: TrinityEnvironmentConfig;
}
export declare class TrinityConfigStack extends cdk.Stack {
    readonly parameterStore: TrinityParameterStore;
    constructor(scope: Construct, id: string, props: TrinityConfigStackProps);
}
export {};
