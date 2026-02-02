/**
 * Trinity Parameter Store Configuration
 * Manages environment-specific parameters with proper hierarchy
 * Hierarchy: /trinity/{env}/category/parameter
 */
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { TrinityEnvironmentConfig } from './environments';
export interface ParameterStoreConfig {
    tmdbApiKey: ssm.IParameter;
    cognitoUserPoolId: ssm.IParameter;
    cognitoClientId: ssm.IParameter;
    appsyncApiId: ssm.IParameter;
    appsyncApiUrl: ssm.IParameter;
    realtimeApiUrl: ssm.IParameter;
    googleWebClientId: ssm.IParameter;
    googleClientSecret: ssm.IParameter;
    googleAndroidClientId: ssm.IParameter;
    googleIosClientId: ssm.IParameter;
    jwtSecret: ssm.IParameter;
    tableNames: ssm.IParameter;
    lambdaFunctionNames: ssm.IParameter;
    appConfig: ssm.IParameter;
    featureFlags: ssm.IParameter;
}
/**
 * Create or import Parameter Store parameters for Trinity
 */
export declare class TrinityParameterStore extends Construct {
    readonly parameters: ParameterStoreConfig;
    constructor(scope: Construct, id: string, config: TrinityEnvironmentConfig);
    /**
     * Grant read access to parameters for Lambda functions
     */
    grantReadAccess(grantee: cdk.aws_iam.IGrantable): void;
}
/**
 * Utility functions for accessing parameters in Lambda functions
 */
export declare const ParameterStoreUtils: {
    /**
     * Get parameter path for environment
     */
    getParameterPath: (environment: string, category: string, name: string) => string;
    /**
     * Get all parameter paths for an environment
     */
    getAllParameterPaths: (environment: string) => {
        tmdbApiKey: string;
        cognitoUserPoolId: string;
        cognitoClientId: string;
        googleWebClientId: string;
        googleClientSecret: string;
        googleAndroidClientId: string;
        googleIosClientId: string;
        appsyncApiId: string;
        appsyncApiUrl: string;
        realtimeApiUrl: string;
        jwtSecret: string;
        tableNames: string;
        lambdaFunctionNames: string;
        appConfig: string;
        featureFlags: string;
    };
};
