#!/usr/bin/env node
/**
 * Environment Configuration Validator
 * Validates that all required environment variables are present before deployment
 */
declare function validateEnvironmentConfiguration(): Promise<void>;
export { validateEnvironmentConfiguration };
