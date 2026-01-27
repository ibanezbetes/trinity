import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EnvironmentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  securityScore: number;
}

@Injectable()
export class EnvironmentValidator implements OnModuleInit {
  private readonly logger = new Logger(EnvironmentValidator.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const validation = this.validateEnvironment();
    
    if (!validation.isValid) {
      this.logger.error('Environment validation failed', {
        errors: validation.errors,
        warnings: validation.warnings,
        securityScore: validation.securityScore,
      });
      
      // In production, we might want to exit the process
      if (this.configService.get('NODE_ENV') === 'production') {
        this.logger.error('Critical environment issues detected in production. Exiting...');
        process.exit(1);
      }
    } else {
      this.logger.log('Environment validation passed', {
        securityScore: validation.securityScore,
        warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      });
    }
  }

  validateEnvironment(): EnvironmentValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let securityScore = 100;

    // Required environment variables
    const requiredVars = this.getRequiredEnvironmentVariables();
    
    for (const [varName, config] of Object.entries(requiredVars)) {
      const value = this.configService.get(varName);
      
      if (!value) {
        if (config.required) {
          errors.push(`Missing required environment variable: ${varName}`);
          securityScore -= config.securityImpact || 10;
        } else {
          warnings.push(`Missing optional environment variable: ${varName}`);
          securityScore -= 2;
        }
      } else {
        // Validate the value
        const validation = this.validateEnvironmentVariable(varName, value, config);
        if (!validation.isValid) {
          errors.push(...validation.errors);
          warnings.push(...validation.warnings);
          securityScore -= validation.securityImpact;
        }
      }
    }

    // Additional security checks
    const securityChecks = this.performSecurityChecks();
    errors.push(...securityChecks.errors);
    warnings.push(...securityChecks.warnings);
    securityScore -= securityChecks.securityImpact;

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      securityScore: Math.max(0, securityScore),
    };
  }

  private getRequiredEnvironmentVariables(): Record<string, {
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'url' | 'email';
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    securityImpact?: number;
    description: string;
  }> {
    return {
      NODE_ENV: {
        required: true,
        type: 'string',
        pattern: /^(development|production|test)$/,
        securityImpact: 20,
        description: 'Application environment',
      },
      PORT: {
        required: false,
        type: 'number',
        securityImpact: 5,
        description: 'Application port',
      },
      AWS_REGION: {
        required: true,
        type: 'string',
        minLength: 5,
        securityImpact: 15,
        description: 'AWS region',
      },
      AWS_ACCESS_KEY_ID: {
        required: true,
        type: 'string',
        minLength: 16,
        securityImpact: 25,
        description: 'AWS access key',
      },
      AWS_SECRET_ACCESS_KEY: {
        required: true,
        type: 'string',
        minLength: 32,
        securityImpact: 25,
        description: 'AWS secret key',
      },
      COGNITO_USER_POOL_ID: {
        required: true,
        type: 'string',
        pattern: /^[a-z0-9-]+_[a-zA-Z0-9]+$/,
        securityImpact: 20,
        description: 'Cognito user pool ID',
      },
      COGNITO_CLIENT_ID: {
        required: true,
        type: 'string',
        minLength: 20,
        securityImpact: 20,
        description: 'Cognito client ID',
      },
      TMDB_API_KEY: {
        required: true,
        type: 'string',
        minLength: 20,
        securityImpact: 10,
        description: 'TMDB API key',
      },
      HF_API_TOKEN: {
        required: true,
        type: 'string',
        pattern: /^hf_[a-zA-Z0-9]+$/,
        securityImpact: 15,
        description: 'Hugging Face API token',
      },
      DYNAMODB_TABLE_NAME: {
        required: true,
        type: 'string',
        minLength: 3,
        securityImpact: 15,
        description: 'DynamoDB table name',
      },
      APPSYNC_API_URL: {
        required: true,
        type: 'url',
        securityImpact: 15,
        description: 'AppSync API URL',
      },
      APPSYNC_API_KEY: {
        required: true,
        type: 'string',
        minLength: 20,
        securityImpact: 20,
        description: 'AppSync API key',
      },
    };
  }

  private validateEnvironmentVariable(
    name: string,
    value: string,
    config: any,
  ): { isValid: boolean; errors: string[]; warnings: string[]; securityImpact: number } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let securityImpact = 0;

    // Type validation
    switch (config.type) {
      case 'number':
        if (isNaN(Number(value))) {
          errors.push(`${name} must be a valid number`);
          securityImpact += 5;
        }
        break;
      
      case 'boolean':
        if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
          errors.push(`${name} must be a valid boolean`);
          securityImpact += 5;
        }
        break;
      
      case 'url':
        try {
          new URL(value);
        } catch {
          errors.push(`${name} must be a valid URL`);
          securityImpact += 10;
        }
        break;
      
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors.push(`${name} must be a valid email address`);
          securityImpact += 5;
        }
        break;
    }

    // Length validation
    if (config.minLength && value.length < config.minLength) {
      errors.push(`${name} must be at least ${config.minLength} characters long`);
      securityImpact += 10;
    }

    if (config.maxLength && value.length > config.maxLength) {
      warnings.push(`${name} is longer than recommended (${config.maxLength} characters)`);
      securityImpact += 2;
    }

    // Pattern validation
    if (config.pattern && !config.pattern.test(value)) {
      errors.push(`${name} does not match the required pattern`);
      securityImpact += 10;
    }

    // Security-specific validations
    if (this.containsWeakCredentials(name, value)) {
      errors.push(`${name} appears to contain weak or default credentials`);
      securityImpact += 20;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      securityImpact,
    };
  }

  private performSecurityChecks(): { errors: string[]; warnings: string[]; securityImpact: number } {
    const errors: string[] = [];
    const warnings: string[] = [];
    let securityImpact = 0;

    const nodeEnv = this.configService.get('NODE_ENV');

    // Production-specific checks
    if (nodeEnv === 'production') {
      // Check for development-only configurations
      const devOnlyVars = ['DEBUG', 'DEVELOPMENT_MODE'];
      for (const varName of devOnlyVars) {
        if (this.configService.get(varName)) {
          warnings.push(`Development variable ${varName} is set in production`);
          securityImpact += 5;
        }
      }

      // Check for secure protocols
      const apiUrl = this.configService.get('APPSYNC_API_URL');
      if (apiUrl && !apiUrl.startsWith('https://')) {
        errors.push('API URLs must use HTTPS in production');
        securityImpact += 15;
      }
    }

    // Check for common security misconfigurations
    const corsOrigin = this.configService.get('CORS_ORIGIN');
    if (corsOrigin === '*') {
      if (nodeEnv === 'production') {
        errors.push('CORS origin should not be wildcard (*) in production');
        securityImpact += 20;
      } else {
        warnings.push('CORS origin is set to wildcard (*)');
        securityImpact += 5;
      }
    }

    return { errors, warnings, securityImpact };
  }

  private containsWeakCredentials(name: string, value: string): boolean {
    const weakPatterns = [
      /^(admin|password|123456|qwerty|test|demo)$/i,
      /^(default|example|sample|temp|temporary)$/i,
      /^(secret|key|token)$/i,
    ];

    // Check for common weak values
    for (const pattern of weakPatterns) {
      if (pattern.test(value)) {
        return true;
      }
    }

    // Check for credentials that are too simple
    if (name.toLowerCase().includes('password') && value.length < 8) {
      return true;
    }

    if (name.toLowerCase().includes('secret') && value.length < 16) {
      return true;
    }

    return false;
  }

  /**
   * Get current environment status
   */
  getEnvironmentStatus(): {
    environment: string;
    isProduction: boolean;
    validation: EnvironmentValidationResult;
    recommendations: string[];
  } {
    const nodeEnv = this.configService.get('NODE_ENV');
    const validation = this.validateEnvironment();
    const recommendations = this.getSecurityRecommendations(validation);

    return {
      environment: nodeEnv,
      isProduction: nodeEnv === 'production',
      validation,
      recommendations,
    };
  }

  private getSecurityRecommendations(validation: EnvironmentValidationResult): string[] {
    const recommendations: string[] = [];

    if (validation.securityScore < 80) {
      recommendations.push('Review and fix environment variable issues');
    }

    if (validation.errors.length > 0) {
      recommendations.push('Address all critical environment errors before deployment');
    }

    if (validation.warnings.length > 0) {
      recommendations.push('Consider addressing environment warnings for better security');
    }

    const nodeEnv = this.configService.get('NODE_ENV');
    if (nodeEnv === 'production') {
      recommendations.push('Regularly rotate API keys and secrets');
      recommendations.push('Monitor environment variables for unauthorized changes');
      recommendations.push('Use AWS Secrets Manager for sensitive credentials');
    }

    return recommendations;
  }
}