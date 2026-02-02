/**
 * Configuration Validation Test
 * Task 8.1: Validate configuration management
 * 
 * This test validates that all configuration exists only in root .env file
 * and that environment variables propagate correctly to deployed functions.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Task 8.1: Configuration Management Validation', () => {
  const TRINITY_FUNCTIONS = [
    'trinity-auth-dev',
    'trinity-room-dev', 
    'trinity-vote-dev',
    'trinity-movie-dev',
    'trinity-cache-dev',
    'trinity-realtime-dev',
    'trinity-vote-consensus-dev'
  ];

  const REQUIRED_ENV_VARS = [
    'NODE_ENV',
    'TRINITY_ENV',
    'USERS_TABLE',
    'ROOMS_TABLE',
    'VOTES_TABLE',
    'TMDB_API_KEY'
  ];

  test('Root .env file exists and contains required configuration', () => {
    const envPath = path.resolve('../../.env');
    
    // Verify .env file exists
    expect(fs.existsSync(envPath)).toBe(true);
    
    // Read .env file content
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Verify required configuration sections exist
    expect(envContent).toContain('AWS CONFIGURATION');
    expect(envContent).toContain('DYNAMODB CONFIGURATION');
    expect(envContent).toContain('LAMBDA FUNCTIONS');
    expect(envContent).toContain('EXTERNAL API KEYS');
    
    // Verify specific required variables
    expect(envContent).toContain('TMDB_API_KEY=');
    expect(envContent).toContain('USERS_TABLE=');
    expect(envContent).toContain('ROOMS_TABLE=');
    expect(envContent).toContain('VOTES_TABLE=');
    expect(envContent).toContain('AWS_REGION=');
    
    console.log('✅ Root .env file contains all required configuration');
  });

  test('No duplicate configuration files exist', () => {
    const duplicateConfigPaths = [
      'src/.env',
      'lib/.env',
      'test/.env',
      '.env.local',
      '.env.development'
    ];
    
    for (const configPath of duplicateConfigPaths) {
      expect(fs.existsSync(configPath)).toBe(false);
    }
    
    console.log('✅ No duplicate configuration files found');
  });

  test('Environment variables propagate to deployed Lambda functions', async () => {
    for (const functionName of TRINITY_FUNCTIONS) {
      try {
        console.log(`🧪 Checking environment variables for function: ${functionName}`);
        
        // Get function configuration
        const command = `aws lambda get-function-configuration --function-name ${functionName} --region eu-west-1`;
        const result = execSync(command, { encoding: 'utf8', timeout: 30000 });
        const functionConfig = JSON.parse(result);
        
        // Verify environment variables exist
        const envVars = functionConfig.Environment?.Variables || {};
        
        for (const requiredVar of REQUIRED_ENV_VARS) {
          expect(envVars[requiredVar]).toBeDefined();
          expect(envVars[requiredVar]).not.toBe('');
        }
        
        // Verify specific Trinity configuration
        expect(envVars.TRINITY_ENV).toBe('dev');
        expect(envVars.NODE_ENV).toBeDefined();
        
        console.log(`✅ Function ${functionName}: All required environment variables present`);
        
      } catch (error) {
        console.error(`❌ Function ${functionName} environment validation failed:`, error);
        throw error;
      }
    }
  }, 300000); // 5 minute timeout

  test('TMDB API key is properly configured and accessible', () => {
    const envPath = path.resolve('../../.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Extract TMDB API key
    const tmdbKeyMatch = envContent.match(/TMDB_API_KEY=(.+)/);
    expect(tmdbKeyMatch).toBeTruthy();
    
    const tmdbKey = tmdbKeyMatch?.[1]?.trim();
    expect(tmdbKey).toBeDefined();
    expect(tmdbKey).not.toBe('');
    expect(tmdbKey!.length).toBeGreaterThan(10); // TMDB keys are typically longer
    
    console.log('✅ TMDB API key is properly configured');
  });

  test('AWS credentials are properly configured', () => {
    const envPath = path.resolve('../../.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // Verify AWS configuration exists
    expect(envContent).toContain('AWS_ACCESS_KEY_ID=');
    expect(envContent).toContain('AWS_SECRET_ACCESS_KEY=');
    expect(envContent).toContain('AWS_REGION=eu-west-1');
    expect(envContent).toContain('CDK_DEFAULT_REGION=eu-west-1');
    
    console.log('✅ AWS credentials are properly configured');
  });

  test('Database table names are consistently configured', () => {
    const envPath = path.resolve('../../.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    
    const expectedTables = [
      'trinity-users-dev',
      'trinity-rooms-dev',
      'trinity-room-members-dev',
      'trinity-votes-dev',
      'trinity-movies-cache-dev'
    ];
    
    for (const tableName of expectedTables) {
      expect(envContent).toContain(tableName);
    }
    
    console.log('✅ Database table names are consistently configured');
  });
});