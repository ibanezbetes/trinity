/**
 * Trinity Deployment Configurations
 *
 * Environment-specific deployment configurations for Trinity infrastructure
 */
export interface DeploymentEnvironmentConfig {
    environment: 'dev' | 'staging' | 'production';
    region: string;
    stacks: string[];
    validation: {
        preDeployment: boolean;
        postDeployment: boolean;
        importCompatibility: boolean;
    };
    deployment: {
        requireApproval: boolean;
        hotswapEnabled: boolean;
        rollbackOnFailure: boolean;
        timeoutMinutes: number;
    };
    monitoring: {
        enableCloudWatch: boolean;
        enableXRay: boolean;
        logRetentionDays: number;
    };
    security: {
        enableEncryption: boolean;
        enablePointInTimeRecovery: boolean;
        enableVpcEndpoints: boolean;
    };
}
/**
 * Development Environment Configuration
 */
export declare const DEV_CONFIG: DeploymentEnvironmentConfig;
/**
 * Staging Environment Configuration
 */
export declare const STAGING_CONFIG: DeploymentEnvironmentConfig;
/**
 * Production Environment Configuration
 */
export declare const PRODUCTION_CONFIG: DeploymentEnvironmentConfig;
/**
 * Get deployment configuration for environment
 */
export declare function getDeploymentConfig(environment: string): DeploymentEnvironmentConfig;
/**
 * Validate deployment configuration
 */
export declare function validateDeploymentConfig(config: DeploymentEnvironmentConfig): string[];
/**
 * Import-specific configurations
 */
export interface ImportConfig {
    databaseStack: {
        enabled: boolean;
        tables: string[];
        validateSchema: boolean;
    };
    apiStack: {
        enabled: boolean;
        apis: string[];
        validateEndpoints: boolean;
    };
    cognitoStack: {
        enabled: boolean;
        userPools: string[];
        validateConfiguration: boolean;
    };
}
export declare const IMPORT_CONFIG: ImportConfig;
