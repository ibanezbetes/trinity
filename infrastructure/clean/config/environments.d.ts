/**
 * Environment Configuration for Trinity Infrastructure
 * Manages environment-specific settings for dev, staging, and production
 */
export interface TrinityEnvironmentConfig {
    environment: 'dev' | 'staging' | 'production';
    region: string;
    resourcePrefix: string;
    dynamodb: {
        billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
        pointInTimeRecovery: boolean;
        encryption: boolean;
        ttlEnabled: boolean;
        ttlAttributeName: string;
    };
    lambda: {
        runtime: string;
        timeout: number;
        memorySize: number;
        logRetention: number;
        enableXRay: boolean;
    };
    api: {
        enableLogging: boolean;
        logLevel: 'NONE' | 'ERROR' | 'ALL';
        enableMetrics: boolean;
    };
    security: {
        enableWaf: boolean;
        enableCloudTrail: boolean;
        encryptionAtRest: boolean;
        encryptionInTransit: boolean;
    };
    monitoring: {
        enableDashboard: boolean;
        enableAlarms: boolean;
        retentionDays: number;
        alertEmail?: string;
    };
    external: {
        tmdbApiKey: string;
        cognitoUserPoolId: string;
        cognitoClientId: string;
        appsyncApiId: string;
        appsyncApiUrl: string;
        realtimeApiUrl: string;
    };
}
/**
 * Development Environment Configuration
 */
export declare const DEV_CONFIG: TrinityEnvironmentConfig;
/**
 * Staging Environment Configuration
 */
export declare const STAGING_CONFIG: TrinityEnvironmentConfig;
/**
 * Production Environment Configuration
 */
export declare const PRODUCTION_CONFIG: TrinityEnvironmentConfig;
/**
 * Get configuration for the specified environment
 */
export declare function getEnvironmentConfig(env?: string): TrinityEnvironmentConfig;
/**
 * Validate environment configuration
 */
export declare function validateEnvironmentConfig(config: TrinityEnvironmentConfig): void;
