#!/usr/bin/env node
/**
 * Trinity SSM Parameter Store Hydration Script
 * Reads .env file and creates/updates AWS Systems Manager parameters
 * Follows strict naming pattern: /trinity/{env}/{category}/{param}
 */
declare class SSMHydrator {
    private ssmClient;
    private environment;
    private envVars;
    private parameterMappings;
    constructor();
    /**
     * Load environment variables from .env file
     */
    private loadEnvFile;
    /**
     * Create or update a single parameter in SSM
     */
    private putParameter;
    /**
     * Create composite JSON parameters
     */
    private createCompositeParameters;
    /**
     * Hydrate all parameters from .env to SSM
     */
    hydrate(): Promise<void>;
    /**
     * Validate that all critical parameters exist
     */
    validate(): Promise<void>;
}
export { SSMHydrator };
