/**
 * Application Configuration
 * Centralized configuration management for the Trinity backend
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface GoogleAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  region: string;
}

export interface AppConfig {
  port: number;
  environment: 'development' | 'production' | 'test';
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  googleAuth: GoogleAuthConfig;
  cognito: CognitoConfig;
  corsOrigins: string[];
}

export const getAppConfig = (): AppConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  environment: (process.env.NODE_ENV as any) || 'development',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'trinity',
    username: process.env.DB_USERNAME || 'trinity',
    password: process.env.DB_PASSWORD || 'password',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'trinity-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  googleAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
  },
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID || '',
    clientId: process.env.COGNITO_CLIENT_ID || '',
    region: process.env.COGNITO_REGION || 'us-east-1',
  },
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
});