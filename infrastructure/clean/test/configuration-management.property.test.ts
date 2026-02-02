/**
 * Property Test 10: Configuration Management Integrity
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 * 
 * This property test validates that configuration management maintains
 * integrity across all deployed Lambda functions and environments.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Property Test 10: Configuration Management Integrity', () => {
  const TRINITY_FUNCTIONS = [
    'trinity-auth-dev',
    'trinity-room-dev', 
    'trinity-vote-dev',
    'trinity-movie-dev',
    'trinity-cache-dev',
    'trinity-realtime-dev',
    'trinity-vote-consensus-dev'
  ];

  const CRITICAL_ENV_VARS = [
    'NODE_ENV',
    'USERS_TABLE',
    'ROOMS_TABLE',
    'VOTES_TABLE',
    'TMDB_API_KEY',
    'AWS_ACCOUNT_ID'
  ];

  /**
   * Property 10.1: Configuration consistency across all functions
   */
  test('Property 10.1: All Lambda functions have consistent configuration', async () => {
    const functionConfigs: Record<string, any> = {};
    
    // Collect configuration from all functions
    for (const functionName of TRINITY_FUNCTIONS) {
      try {
        const command = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
        const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
        const config = JSON.parse(result);
        functionConfigs[functionName] = config.Environment?.Variables || {};
      } catch (error) {
        console.error(`Failed to get config for ${functionName}:`, error);
        throw error;
      }
    }
    
    // Property: All functions should have the same values for critical environment variables
    const referenceConfig = functionConfigs[TRINITY_FUNCTIONS[0]];
    
    for (const functionName of TRINITY_FUNCTIONS.slice(1)) {
      const currentConfig = functionConfigs[functionName];
      
      for (const envVar of CRITICAL_ENV_VARS) {
        expect(currentConfig[envVar]).toBe(referenceConfig[envVar]);
      }
    }
    
    console.log('✅ Property 10.1: Configuration consistency verified across all functions');
  }, 300000);

  /**
   * Property 10.2: Environment variable completeness
   */
  test('Property 10.2: All functions have complete environment variable sets', async () => {
    for (const functionName of TRINITY_FUNCTIONS) {
      try {
        const command = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
        const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
        const config = JSON.parse(result);
        const envVars = config.Environment?.Variables || {};
        
        // Property: All critical environment variables must be present and non-empty
        for (const envVar of CRITICAL_ENV_VARS) {
          expect(envVars[envVar]).toBeDefined();
          expect(envVars[envVar]).not.toBe('');
          expect(typeof envVars[envVar]).toBe('string');
        }
        
        // Property: Trinity-specific environment variables must follow naming convention
        expect(envVars.TRINITY_ENV).toBe('dev');
        expect(envVars.NODE_ENV).toMatch(/^(dev|development|prod|production)$/);
        
      } catch (error) {
        console.error(`Environment validation failed for ${functionName}:`, error);
        throw error;
      }
    }
    
    console.log('✅ Property 10.2: Environment variable completeness verified');
  }, 300000);

  /**
   * Property 10.3: Configuration source integrity
   */
  test('Property 10.3: Root .env file is the single source of truth', () => {
    const envPath = path.resolve('../../.env');
    
    // Property: Root .env file must exist and be readable
    expect(fs.existsSync(envPath)).toBe(true);
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Property: All critical configuration must be present in root .env
    // Note: Some variables like TRINITY_ENV are set by CDK, not in .env
    const envFileVars = ['NODE_ENV', 'USERS_TABLE', 'ROOMS_TABLE', 'VOTES_TABLE', 'TMDB_API_KEY', 'AWS_ACCOUNT_ID'];
    
    for (const envVar of envFileVars) {
      const pattern = new RegExp(`${envVar}=.+`, 'm');
      expect(envContent).toMatch(pattern);
    }
    
    // Property: No duplicate configuration files should exist
    const duplicatePaths = [
      'src/.env',
      'lib/.env',
      'test/.env',
      '.env.local',
      '.env.development',
      '.env.production'
    ];
    
    for (const duplicatePath of duplicatePaths) {
      expect(fs.existsSync(duplicatePath)).toBe(false);
    }
    
    console.log('✅ Property 10.3: Configuration source integrity verified');
  });

  /**
   * Property 10.4: Configuration value format validation
   */
  test('Property 10.4: Configuration values follow expected formats', async () => {
    const envPath = path.resolve('../../.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Property: AWS region must be eu-west-1
    expect(envContent).toMatch(/AWS_REGION=eu-west-1/);
    expect(envContent).toMatch(/CDK_DEFAULT_REGION=eu-west-1/);
    
    // Property: Table names must follow Trinity naming convention
    const tableNamePattern = /trinity-[a-z-]+(-dev)?(-v\d+)?/;
    const tableMatches = envContent.match(/TABLE=trinity-[a-z-]+/g) || [];
    
    for (const match of tableMatches) {
      const tableName = match.split('=')[1];
      expect(tableName).toMatch(tableNamePattern);
    }
    
    // Property: TMDB API key must be present and have reasonable length
    const tmdbMatch = envContent.match(/TMDB_API_KEY=(.+)/);
    expect(tmdbMatch).toBeTruthy();
    const tmdbKey = tmdbMatch?.[1]?.trim();
    expect(tmdbKey).toBeDefined();
    expect(tmdbKey!.length).toBeGreaterThan(10);
    
    console.log('✅ Property 10.4: Configuration value formats verified');
  });

  /**
   * Property 10.5: Configuration propagation integrity
   */
  test('Property 10.5: Environment variables propagate correctly to all functions', async () => {
    const envPath = path.resolve('../../.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Extract expected values from .env file
    const expectedValues: Record<string, string> = {};
    const envLines = envContent.split('\n');
    
    for (const line of envLines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        expectedValues[key] = valueParts.join('=');
      }
    }
    
    // Property: Values in Lambda functions must match .env file
    for (const functionName of TRINITY_FUNCTIONS) {
      const command = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
      const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
      const config = JSON.parse(result);
      const actualEnvVars = config.Environment?.Variables || {};
      
      // Check critical variables that should propagate directly
      const directPropagationVars = ['TMDB_API_KEY', 'AWS_ACCOUNT_ID'];
      
      for (const envVar of directPropagationVars) {
        if (expectedValues[envVar]) {
          expect(actualEnvVars[envVar]).toBe(expectedValues[envVar]);
        }
      }
    }
    
    console.log('✅ Property 10.5: Configuration propagation integrity verified');
  }, 300000);
});