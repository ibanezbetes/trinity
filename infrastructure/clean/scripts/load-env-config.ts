/**
 * Environment Variable Loader for CDK
 * Reads from root .env file and provides environment variables for Lambda functions
 */

import * as fs from 'fs';
import * as path from 'path';

export interface EnvironmentVariables {
  [key: string]: string;
}

export class EnvironmentLoader {
  private envVars: EnvironmentVariables = {};
  private rootEnvPath: string;

  constructor() {
    // Path to root .env file (two levels up from infrastructure/clean)
    this.rootEnvPath = path.join(__dirname, '..', '..', '..', '.env');
    this.loadEnvironmentVariables();
  }

  /**
   * Load environment variables from root .env file
   */
  private loadEnvironmentVariables(): void {
    try {
      if (!fs.existsSync(this.rootEnvPath)) {
        console.warn(`⚠️ Root .env file not found at ${this.rootEnvPath}`);
        return;
      }

      const envContent = fs.readFileSync(this.rootEnvPath, 'utf8');
      const lines = envContent.split('\n');

      for (const line of lines) {
        // Skip comments and empty lines
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
          continue;
        }

        // Parse key=value pairs
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex === -1) {
          continue;
        }

        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();

        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        
        this.envVars[key] = cleanValue;
      }

      console.log(`✅ Loaded ${Object.keys(this.envVars).length} environment variables from root .env`);
    } catch (error) {
      console.error(`❌ Failed to load environment variables: ${error}`);
      throw error;
    }
  }

  /**
   * Get all environment variables
   */
  public getAllVariables(): EnvironmentVariables {
    return { ...this.envVars };
  }

  /**
   * Get a specific environment variable
   */
  public getVariable(key: string): string | undefined {
    return this.envVars[key];
  }

  /**
   * Get required environment variable (throws if not found)
   */
  public getRequiredVariable(key: string): string {
    const value = this.envVars[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} not found in root .env file`);
    }
    return value;
  }

  /**
   * Get Lambda environment variables (filtered for Lambda use)
   */
  public getLambdaEnvironmentVariables(): EnvironmentVariables {
    const lambdaVars: EnvironmentVariables = {};
    
    // AWS Configuration (exclude AWS_REGION as it's reserved by Lambda runtime)
    if (this.envVars.AWS_ACCOUNT_ID) lambdaVars.AWS_ACCOUNT_ID = this.envVars.AWS_ACCOUNT_ID;
    
    // GraphQL API
    if (this.envVars.GRAPHQL_API_URL) lambdaVars.GRAPHQL_API_URL = this.envVars.GRAPHQL_API_URL;
    if (this.envVars.GRAPHQL_API_ID) lambdaVars.GRAPHQL_API_ID = this.envVars.GRAPHQL_API_ID;
    if (this.envVars.GRAPHQL_API_KEY) lambdaVars.GRAPHQL_API_KEY = this.envVars.GRAPHQL_API_KEY;
    
    // Cognito
    if (this.envVars.COGNITO_USER_POOL_ID) lambdaVars.COGNITO_USER_POOL_ID = this.envVars.COGNITO_USER_POOL_ID;
    if (this.envVars.COGNITO_CLIENT_ID) lambdaVars.COGNITO_CLIENT_ID = this.envVars.COGNITO_CLIENT_ID;
    
    // External APIs
    if (this.envVars.TMDB_API_KEY) lambdaVars.TMDB_API_KEY = this.envVars.TMDB_API_KEY;
    if (this.envVars.GOOGLE_CLIENT_ID) lambdaVars.GOOGLE_CLIENT_ID = this.envVars.GOOGLE_CLIENT_ID;
    
    // Lambda Functions
    if (this.envVars.CACHE_HANDLER_NAME) lambdaVars.CACHE_HANDLER_NAME = this.envVars.CACHE_HANDLER_NAME;
    if (this.envVars.ROOM_HANDLER_NAME) lambdaVars.ROOM_HANDLER_NAME = this.envVars.ROOM_HANDLER_NAME;
    if (this.envVars.VOTE_HANDLER_NAME) lambdaVars.VOTE_HANDLER_NAME = this.envVars.VOTE_HANDLER_NAME;
    if (this.envVars.MOVIE_HANDLER_NAME) lambdaVars.MOVIE_HANDLER_NAME = this.envVars.MOVIE_HANDLER_NAME;
    if (this.envVars.AUTH_HANDLER_NAME) lambdaVars.AUTH_HANDLER_NAME = this.envVars.AUTH_HANDLER_NAME;
    if (this.envVars.REALTIME_HANDLER_NAME) lambdaVars.REALTIME_HANDLER_NAME = this.envVars.REALTIME_HANDLER_NAME;
    if (this.envVars.MATCHMAKER_HANDLER_NAME) lambdaVars.MATCHMAKER_HANDLER_NAME = this.envVars.MATCHMAKER_HANDLER_NAME;
    
    // Security
    if (this.envVars.JWT_SECRET) lambdaVars.JWT_SECRET = this.envVars.JWT_SECRET;
    
    // Feature Flags
    if (this.envVars.ENABLE_DEBUG_LOGGING) lambdaVars.ENABLE_DEBUG_LOGGING = this.envVars.ENABLE_DEBUG_LOGGING;
    if (this.envVars.ENABLE_CACHE_SYSTEM) lambdaVars.ENABLE_CACHE_SYSTEM = this.envVars.ENABLE_CACHE_SYSTEM;
    if (this.envVars.ENABLE_MATCH_DETECTION) lambdaVars.ENABLE_MATCH_DETECTION = this.envVars.ENABLE_MATCH_DETECTION;
    
    return lambdaVars;
  }

  /**
   * Validate required environment variables
   */
  public validateRequiredVariables(): void {
    const requiredVars = [
      'AWS_REGION',
      'AWS_ACCOUNT_ID',
      'TMDB_API_KEY'
    ];

    const missingVars: string[] = [];
    
    for (const varName of requiredVars) {
      if (!this.envVars[varName]) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    console.log('✅ All required environment variables are present');
  }

  /**
   * Get CDK deployment environment
   */
  public getCDKEnvironment(): { account: string; region: string } {
    return {
      account: this.getRequiredVariable('AWS_ACCOUNT_ID'),
      region: this.getRequiredVariable('AWS_REGION')
    };
  }
}

// Export singleton instance
export const environmentLoader = new EnvironmentLoader();