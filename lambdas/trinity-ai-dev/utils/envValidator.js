/**
 * Environment Variable Validator for Trinity AI Assistant
 * 
 * This utility validates that all required environment variables are properly
 * configured and provides secure credential management for the AI service.
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3**
 * 
 * @author Trinity AI Team
 * @version 1.0.0
 */

class EnvironmentValidator {
    constructor() {
        this.requiredVars = {
            // Hugging Face API Configuration
            'HF_API_TOKEN': {
                description: 'Hugging Face API token for Qwen model access via Serverless Inference',
                pattern: /^hf_[a-zA-Z0-9]{20,}$/,
                required: true
            },
            
            // TMDB API Configuration
            'TMDB_API_KEY': {
                description: 'The Movie Database API key for movie verification',
                pattern: /^[a-f0-9]{32}$/,
                required: true
            },
            
            // AWS Configuration
            'AWS_REGION': {
                description: 'AWS region for DynamoDB and other services',
                pattern: /^[a-z0-9-]+$/,
                required: true,
                defaultValue: 'eu-west-1'
            },
            
            // Optional Configuration
            'LOG_LEVEL': {
                description: 'Logging level for the application',
                pattern: /^(debug|info|warn|error)$/,
                required: false,
                defaultValue: 'info'
            }
        };
        
        this.validationResults = {};
        this.isValid = false;
    }

    /**
     * Validate all required environment variables
     * **Validates: Requirement 8.1** - Environment variable validation on startup
     * 
     * @returns {Object} Validation results with status and details
     */
    validateEnvironment() {
        console.log('[EnvValidator] Starting environment validation...');
        
        const results = {
            valid: true,
            errors: [],
            warnings: [],
            variables: {}
        };

        // Check each required variable
        for (const [varName, config] of Object.entries(this.requiredVars)) {
            const result = this.validateVariable(varName, config);
            results.variables[varName] = result;
            
            if (!result.valid && config.required) {
                results.valid = false;
                results.errors.push(result.error);
            } else if (!result.valid && !config.required) {
                results.warnings.push(result.error);
            }
        }

        // Check for hardcoded credentials in process.env
        this.checkForHardcodedCredentials(results);

        this.validationResults = results;
        this.isValid = results.valid;

        // Log results
        this.logValidationResults(results);

        return results;
    }

    /**
     * Validate a single environment variable
     * **Validates: Requirement 8.2** - Use environment variables from centralized .env
     * 
     * @param {string} varName - Name of the environment variable
     * @param {Object} config - Variable configuration
     * @returns {Object} Validation result for the variable
     */
    validateVariable(varName, config) {
        const value = process.env[varName];
        
        const result = {
            name: varName,
            valid: false,
            present: false,
            hasValue: false,
            matchesPattern: false,
            value: null, // Never log actual values for security
            error: null
        };

        // Check if variable is present
        if (value !== undefined) {
            result.present = true;
        }

        // Check if variable has a value
        if (value && value.trim().length > 0) {
            result.hasValue = true;
        }

        // If required but missing
        if (config.required && !result.hasValue) {
            if (config.defaultValue) {
                // Use default value
                process.env[varName] = config.defaultValue;
                result.hasValue = true;
                result.valid = true;
                result.error = `Using default value for ${varName}`;
            } else {
                result.error = `Required environment variable ${varName} is missing or empty`;
                return result;
            }
        }

        // If not required and missing, that's okay
        if (!config.required && !result.hasValue) {
            result.valid = true;
            return result;
        }

        // Validate pattern if value exists
        if (result.hasValue && config.pattern) {
            result.matchesPattern = config.pattern.test(value);
            if (!result.matchesPattern) {
                result.error = `Environment variable ${varName} does not match expected format`;
                return result;
            }
        }

        // All checks passed
        result.valid = true;
        return result;
    }

    /**
     * Check for hardcoded credentials in the environment
     * **Validates: Requirement 8.3** - Never hardcode API keys or tokens
     * 
     * @param {Object} results - Validation results object to update
     */
    checkForHardcodedCredentials(results) {
        const suspiciousPatterns = [
            { name: 'Hardcoded HF Token', pattern: /hf_[a-zA-Z0-9]{20,}/ },
            { name: 'Hardcoded TMDB Key', pattern: /[a-f0-9]{32}/ },
            { name: 'Hardcoded AWS Key', pattern: /AKIA[0-9A-Z]{16}/ }
        ];

        // This is a placeholder - in a real implementation, you would scan source files
        // For now, we just ensure environment variables are being used
        const envVarUsage = {
            'HF_API_TOKEN': process.env.HF_API_TOKEN ? 'configured' : 'missing',
            'TMDB_API_KEY': process.env.TMDB_API_KEY ? 'configured' : 'missing'
        };

        console.log('[EnvValidator] Environment variable usage check:', envVarUsage);
    }

    /**
     * Get secure configuration object with validated environment variables
     * **Validates: Requirement 8.2** - Use process.env for all API credentials
     * 
     * @returns {Object} Secure configuration object
     */
    getSecureConfig() {
        if (!this.isValid) {
            throw new Error('Environment validation failed. Cannot provide secure configuration.');
        }

        return {
            // AI Service Configuration
            ai: {
                hfToken: process.env.HF_API_TOKEN,
                modelName: 'Qwen/Qwen2.5-1.5B-Instruct',
                baseUrl: 'https://router.huggingface.co/v1',
                timeout: parseInt(process.env.AI_TIMEOUT) || 8000
            },
            
            // TMDB Service Configuration
            tmdb: {
                apiKey: process.env.TMDB_API_KEY,
                baseUrl: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
                imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
                timeout: parseInt(process.env.TMDB_TIMEOUT) || 5000
            },
            
            // AWS Configuration
            aws: {
                region: process.env.AWS_REGION || 'eu-west-1'
            },
            
            // Application Configuration
            app: {
                logLevel: process.env.LOG_LEVEL || 'info',
                environment: process.env.NODE_ENV || 'development'
            }
        };
    }

    /**
     * Log validation results in a secure manner
     * @param {Object} results - Validation results
     */
    logValidationResults(results) {
        console.log('[EnvValidator] Environment validation completed');
        console.log(`[EnvValidator] Overall status: ${results.valid ? '✅ VALID' : '❌ INVALID'}`);
        
        if (results.errors.length > 0) {
            console.error('[EnvValidator] Errors:');
            results.errors.forEach(error => console.error(`  - ${error}`));
        }
        
        if (results.warnings.length > 0) {
            console.warn('[EnvValidator] Warnings:');
            results.warnings.forEach(warning => console.warn(`  - ${warning}`));
        }

        // Log variable status (without values for security)
        console.log('[EnvValidator] Variable status:');
        for (const [varName, result] of Object.entries(results.variables)) {
            const status = result.valid ? '✅' : '❌';
            const presence = result.hasValue ? 'configured' : 'missing';
            console.log(`  ${status} ${varName}: ${presence}`);
        }
    }

    /**
     * Get validation results
     * @returns {Object} Current validation results
     */
    getValidationResults() {
        return this.validationResults;
    }

    /**
     * Check if environment is valid
     * @returns {boolean} True if all required variables are valid
     */
    isEnvironmentValid() {
        return this.isValid;
    }
}

module.exports = {
    EnvironmentValidator
};