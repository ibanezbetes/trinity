/**
 * Configuration Loading Utilities for Trinity Lambda functions
 * Provides specialized configuration loading patterns and validation
 */

import { SSMClient, GetParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';
import { TrinityConfig } from './types';
import { logger } from './logger';
import { getTrinityConfig, getParameter, getParameters } from './config';

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
export class ConfigLoader {
  private ssmClient: SSMClient;
  private environment: string;

  constructor() {
    this.environment = process.env.TRINITY_ENV || 'dev';
    this.ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'eu-west-1' });
  }

  /**
   * Load configuration with comprehensive validation
   */
  async loadValidatedConfig(): Promise<{ config: TrinityConfig; validation: ConfigValidationResult }> {
    try {
      logger.info('🔧 Loading and validating Trinity configuration');

      const config = await getTrinityConfig();
      const validation = await this.validateConfiguration(config);

      if (!validation.isValid) {
        logger.warn('⚠️ Configuration validation issues found', {
          missingParameters: validation.missingParameters,
          invalidParameters: validation.invalidParameters,
          errors: validation.errors
        });
      } else {
        logger.info('✅ Configuration validation passed');
      }

      return { config, validation };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to load validated configuration', err);
      throw error;
    }
  }

  /**
   * Validate configuration completeness and correctness
   */
  async validateConfiguration(config: TrinityConfig): Promise<ConfigValidationResult> {
    const result: ConfigValidationResult = {
      isValid: true,
      missingParameters: [],
      invalidParameters: [],
      errors: []
    };

    try {
      // Validate critical external parameters
      this.validateExternalConfig(config.external, result);

      // Validate table names
      this.validateTableNames(config.tables, result);

      // Validate application configuration
      this.validateAppConfig(config.app, result);

      // Validate optional configurations
      if (config.lambdaFunctions) {
        this.validateLambdaFunctions(config.lambdaFunctions, result);
      }

      if (config.featureFlags) {
        this.validateFeatureFlags(config.featureFlags, result);
      }

      // Set overall validity
      result.isValid = result.missingParameters.length === 0 && 
                      result.invalidParameters.length === 0 && 
                      result.errors.length === 0;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.errors.push(`Validation error: ${err.message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate external service configuration
   */
  private validateExternalConfig(external: TrinityConfig['external'], result: ConfigValidationResult): void {
    const requiredFields = [
      'tmdbApiKey',
      'cognitoUserPoolId',
      'cognitoClientId',
      'appsyncApiId',
      'appsyncApiUrl',
      'realtimeApiUrl'
    ];

    for (const field of requiredFields) {
      const value = external[field as keyof typeof external];
      if (!value || value.trim() === '') {
        result.missingParameters.push(`external.${field}`);
      } else {
        // Validate specific formats
        if (field === 'appsyncApiUrl' && !value.startsWith('https://')) {
          result.invalidParameters.push(`external.${field} - must be HTTPS URL`);
        }
        if (field === 'realtimeApiUrl' && !value.startsWith('wss://')) {
          result.invalidParameters.push(`external.${field} - must be WSS URL`);
        }
        if (field === 'cognitoUserPoolId' && !value.match(/^[a-z0-9-]+_[a-zA-Z0-9]+$/)) {
          result.invalidParameters.push(`external.${field} - invalid Cognito User Pool ID format`);
        }
      }
    }
  }

  /**
   * Validate DynamoDB table names
   */
  private validateTableNames(tables: TrinityConfig['tables'], result: ConfigValidationResult): void {
    const requiredTables = [
      'users', 'rooms', 'roomMembers', 'roomInvites', 'votes', 'moviesCache',
      'roomMatches', 'connections', 'roomMovieCache', 'roomCacheMetadata',
      'matchmaking', 'filterCache'
    ];

    for (const tableName of requiredTables) {
      const value = tables[tableName as keyof typeof tables];
      if (!value || value.trim() === '') {
        result.missingParameters.push(`tables.${tableName}`);
      } else if (!value.startsWith('trinity-')) {
        result.invalidParameters.push(`tables.${tableName} - must start with 'trinity-'`);
      }
    }
  }

  /**
   * Validate application configuration
   */
  private validateAppConfig(app: TrinityConfig['app'], result: ConfigValidationResult): void {
    // Validate cache configuration
    if (!app.cache) {
      result.missingParameters.push('app.cache');
    } else {
      if (app.cache.ttlDays <= 0 || app.cache.ttlDays > 30) {
        result.invalidParameters.push('app.cache.ttlDays - must be between 1 and 30');
      }
      if (app.cache.batchSize <= 0 || app.cache.batchSize > 100) {
        result.invalidParameters.push('app.cache.batchSize - must be between 1 and 100');
      }
    }

    // Validate voting configuration
    if (!app.voting) {
      result.missingParameters.push('app.voting');
    } else {
      if (app.voting.maxRoomCapacity < 2 || app.voting.maxRoomCapacity > 10) {
        result.invalidParameters.push('app.voting.maxRoomCapacity - must be between 2 and 10');
      }
      if (app.voting.defaultRoomCapacity < 2 || app.voting.defaultRoomCapacity > app.voting.maxRoomCapacity) {
        result.invalidParameters.push('app.voting.defaultRoomCapacity - must be between 2 and maxRoomCapacity');
      }
    }

    // Validate movies configuration
    if (!app.movies) {
      result.missingParameters.push('app.movies');
    } else {
      if (app.movies.cacheSize !== 50) {
        result.invalidParameters.push('app.movies.cacheSize - must be exactly 50 (business requirement)');
      }
      if (app.movies.maxGenres < 1 || app.movies.maxGenres > 3) {
        result.invalidParameters.push('app.movies.maxGenres - must be between 1 and 3');
      }
    }
  }

  /**
   * Validate Lambda function names
   */
  private validateLambdaFunctions(lambdaFunctions: NonNullable<TrinityConfig['lambdaFunctions']>, result: ConfigValidationResult): void {
    const requiredFunctions = ['auth', 'room', 'vote', 'movie', 'cache', 'realtime', 'matchmaker'];

    for (const funcName of requiredFunctions) {
      const value = lambdaFunctions[funcName as keyof typeof lambdaFunctions];
      if (!value || value.trim() === '') {
        result.missingParameters.push(`lambdaFunctions.${funcName}`);
      } else if (!value.startsWith('trinity-')) {
        result.invalidParameters.push(`lambdaFunctions.${funcName} - must start with 'trinity-'`);
      }
    }
  }

  /**
   * Validate feature flags
   */
  private validateFeatureFlags(featureFlags: NonNullable<TrinityConfig['featureFlags']>, result: ConfigValidationResult): void {
    const requiredFlags = [
      'enableRealTimeNotifications',
      'enableCircuitBreaker',
      'enableMetricsLogging',
      'enableGoogleSignin',
      'debugMode'
    ];

    for (const flagName of requiredFlags) {
      const value = featureFlags[flagName as keyof typeof featureFlags];
      if (typeof value !== 'boolean') {
        result.invalidParameters.push(`featureFlags.${flagName} - must be boolean`);
      }
    }
  }

  /**
   * Get parameter information including metadata
   */
  async getParameterInfo(parameterName: string): Promise<ParameterInfo | null> {
    try {
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: false // Don't decrypt for metadata
      });

      const response = await this.ssmClient.send(command);
      
      if (!response.Parameter) {
        return null;
      }

      return {
        name: response.Parameter.Name || parameterName,
        value: response.Parameter.Value || '',
        type: response.Parameter.Type as 'String' | 'SecureString' | 'StringList',
        lastModified: response.Parameter.LastModifiedDate,
        version: response.Parameter.Version
      };

    } catch (error) {
      logger.debug(`Parameter ${parameterName} not found or inaccessible`);
      return null;
    }
  }

  /**
   * List all Trinity parameters for the current environment
   */
  async listTrinityParameters(): Promise<ParameterInfo[]> {
    try {
      const parameterPrefix = `/trinity/${this.environment}`;
      const parameters: ParameterInfo[] = [];

      // Define all expected parameter paths
      const expectedPaths = [
        `${parameterPrefix}/external/tmdb-api-key`,
        `${parameterPrefix}/auth/cognito-user-pool-id`,
        `${parameterPrefix}/auth/cognito-client-id`,
        `${parameterPrefix}/auth/google-web-client-id`,
        `${parameterPrefix}/auth/google-client-secret`,
        `${parameterPrefix}/auth/google-android-client-id`,
        `${parameterPrefix}/auth/google-ios-client-id`,
        `${parameterPrefix}/api/appsync-api-id`,
        `${parameterPrefix}/api/appsync-api-url`,
        `${parameterPrefix}/api/realtime-api-url`,
        `${parameterPrefix}/security/jwt-secret`,
        `${parameterPrefix}/dynamodb/table-names`,
        `${parameterPrefix}/lambda/function-names`,
        `${parameterPrefix}/app/config`,
        `${parameterPrefix}/app/feature-flags`
      ];

      // Get information for each parameter
      for (const path of expectedPaths) {
        const info = await this.getParameterInfo(path);
        if (info) {
          parameters.push(info);
        }
      }

      logger.info(`📋 Found ${parameters.length} Trinity parameters for environment ${this.environment}`);
      return parameters;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to list Trinity parameters', err);
      throw error;
    }
  }

  /**
   * Validate parameter store connectivity
   */
  async validateParameterStoreConnectivity(): Promise<boolean> {
    try {
      // Try to get a simple parameter to test connectivity
      const testPath = `/trinity/${this.environment}/external/tmdb-api-key`;
      await this.getParameterInfo(testPath);
      
      logger.info('✅ Parameter Store connectivity validated');
      return true;

    } catch (error) {
      logger.warn('⚠️ Parameter Store connectivity issue', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Get configuration summary for debugging
   */
  async getConfigurationSummary(): Promise<{
    environment: string;
    region: string;
    parameterCount: number;
    connectivity: boolean;
    validation: ConfigValidationResult;
  }> {
    try {
      const config = await getTrinityConfig();
      const parameters = await this.listTrinityParameters();
      const connectivity = await this.validateParameterStoreConnectivity();
      const validation = await this.validateConfiguration(config);

      return {
        environment: this.environment,
        region: config.region,
        parameterCount: parameters.length,
        connectivity,
        validation
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('❌ Failed to get configuration summary', err);
      throw error;
    }
  }
}

/**
 * Utility functions for configuration management
 */
export const ConfigUtils = {
  /**
   * Load configuration with automatic fallback and validation
   */
  loadConfig: async (): Promise<TrinityConfig> => {
    const loader = new ConfigLoader();
    const { config, validation } = await loader.loadValidatedConfig();
    
    if (!validation.isValid) {
      logger.warn('⚠️ Configuration has validation issues but proceeding with fallback values');
    }
    
    return config;
  },

  /**
   * Validate current configuration
   */
  validateConfig: async (): Promise<ConfigValidationResult> => {
    const loader = new ConfigLoader();
    const config = await getTrinityConfig();
    return loader.validateConfiguration(config);
  },

  /**
   * Get parameter by path with caching
   */
  getParameterByPath: async (path: string, decrypt: boolean = false): Promise<string> => {
    return getParameter(path, decrypt);
  },

  /**
   * Get multiple parameters by paths
   */
  getParametersByPaths: async (paths: string[], decrypt: boolean = false): Promise<Record<string, string>> => {
    return getParameters(paths, decrypt);
  },

  /**
   * Check if running in development mode
   */
  isDevelopment: (): boolean => {
    return process.env.NODE_ENV === 'development' || process.env.TRINITY_ENV === 'dev';
  },

  /**
   * Check if running in production mode
   */
  isProduction: (): boolean => {
    return process.env.NODE_ENV === 'production' || process.env.TRINITY_ENV === 'production';
  },

  /**
   * Get environment-specific parameter path
   */
  getParameterPath: (category: string, paramName: string, environment?: string): string => {
    const env = environment || process.env.TRINITY_ENV || 'dev';
    return `/trinity/${env}/${category}/${paramName}`;
  }
};

// Export singleton instance
export const configLoader = new ConfigLoader();