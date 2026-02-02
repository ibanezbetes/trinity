/**
 * Environment Variable Loader for CDK
 * Reads from root .env file and provides environment variables for Lambda functions
 */
export interface EnvironmentVariables {
    [key: string]: string;
}
export declare class EnvironmentLoader {
    private envVars;
    private rootEnvPath;
    constructor();
    /**
     * Load environment variables from root .env file
     */
    private loadEnvironmentVariables;
    /**
     * Get all environment variables
     */
    getAllVariables(): EnvironmentVariables;
    /**
     * Get a specific environment variable
     */
    getVariable(key: string): string | undefined;
    /**
     * Get required environment variable (throws if not found)
     */
    getRequiredVariable(key: string): string;
    /**
     * Get Lambda environment variables (filtered for Lambda use)
     */
    getLambdaEnvironmentVariables(): EnvironmentVariables;
    /**
     * Validate required environment variables
     */
    validateRequiredVariables(): void;
    /**
     * Get CDK deployment environment
     */
    getCDKEnvironment(): {
        account: string;
        region: string;
    };
}
export declare const environmentLoader: EnvironmentLoader;
