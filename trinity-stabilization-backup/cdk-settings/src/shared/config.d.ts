/**
 * Configuration management for Trinity Lambda functions
 * Loads configuration from AWS Systems Manager Parameter Store with in-memory caching
 */
import { TrinityConfig } from './types';
declare class ConfigurationManager {
    private ssmClient;
    private cache;
    private cacheExpiry;
    private readonly CACHE_TTL;
    private configCache;
    private configCacheExpiry;
    constructor();
    /**
     * Get a single parameter from Parameter Store with caching
     */
    getParameter(parameterName: string, decrypt?: boolean): Promise<string>;
    /**
     * Get multiple parameters from Parameter Store with caching
     */
    getParameters(parameterNames: string[], decrypt?: boolean): Promise<Record<string, string>>;
    /**
     * Load complete Trinity configuration with caching
     */
    loadTrinityConfig(): Promise<TrinityConfig>;
    /**
     * Get configuration with fallback to environment variables
     */
    getConfigWithFallback(): Promise<TrinityConfig>;
    /**
     * Load configuration from environment variables (fallback)
     */
    private loadFromEnvironmentVariables;
    /**
     * Check if cached value is still valid
     */
    private isCacheValid;
    /**
     * Clear configuration cache (useful for testing or forced refresh)
     */
    clearCache(): void;
}
export declare function getTrinityConfig(): Promise<TrinityConfig>;
export declare function getParameter(parameterName: string, decrypt?: boolean): Promise<string>;
export declare function getParameters(parameterNames: string[], decrypt?: boolean): Promise<Record<string, string>>;
export declare function clearConfigCache(): void;
export { ConfigurationManager };
