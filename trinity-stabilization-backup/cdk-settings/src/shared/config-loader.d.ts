/**
 * Configuration Loading Utilities for Trinity Lambda functions
 * Provides specialized configuration loading patterns and validation
 */
import { TrinityConfig } from './types';
export interface ConfigValidationResult {
    isValid: boolean;
    missingParameters: string[];
    invalidParameters: string[];
    errors: string[];
}
export interface ParameterInfo {
    name: string;
    value: string;
    type: 'String' | 'SecureString' | 'StringList';
    lastModified?: Date;
    version?: number;
}
/**
 * Configuration loader with advanced validation and utilities
 */
export declare class ConfigLoader {
    private ssmClient;
    private environment;
    constructor();
    /**
     * Load configuration with comprehensive validation
     */
    loadValidatedConfig(): Promise<{
        config: TrinityConfig;
        validation: ConfigValidationResult;
    }>;
    /**
     * Validate configuration completeness and correctness
     */
    validateConfiguration(config: TrinityConfig): Promise<ConfigValidationResult>;
    /**
     * Validate external service configuration
     */
    private validateExternalConfig;
    /**
     * Validate DynamoDB table names
     */
    private validateTableNames;
    /**
     * Validate application configuration
     */
    private validateAppConfig;
    /**
     * Validate Lambda function names
     */
    private validateLambdaFunctions;
    /**
     * Validate feature flags
     */
    private validateFeatureFlags;
    /**
     * Get parameter information including metadata
     */
    getParameterInfo(parameterName: string): Promise<ParameterInfo | null>;
    /**
     * List all Trinity parameters for the current environment
     */
    listTrinityParameters(): Promise<ParameterInfo[]>;
    /**
     * Validate parameter store connectivity
     */
    validateParameterStoreConnectivity(): Promise<boolean>;
    /**
     * Get configuration summary for debugging
     */
    getConfigurationSummary(): Promise<{
        environment: string;
        region: string;
        parameterCount: number;
        connectivity: boolean;
        validation: ConfigValidationResult;
    }>;
}
/**
 * Utility functions for configuration management
 */
export declare const ConfigUtils: {
    /**
     * Load configuration with automatic fallback and validation
     */
    loadConfig: () => Promise<TrinityConfig>;
    /**
     * Validate current configuration
     */
    validateConfig: () => Promise<ConfigValidationResult>;
    /**
     * Get parameter by path with caching
     */
    getParameterByPath: (path: string, decrypt?: boolean) => Promise<string>;
    /**
     * Get multiple parameters by paths
     */
    getParametersByPaths: (paths: string[], decrypt?: boolean) => Promise<Record<string, string>>;
    /**
     * Check if running in development mode
     */
    isDevelopment: () => boolean;
    /**
     * Check if running in production mode
     */
    isProduction: () => boolean;
    /**
     * Get environment-specific parameter path
     */
    getParameterPath: (category: string, paramName: string, environment?: string) => string;
};
export declare const configLoader: ConfigLoader;
