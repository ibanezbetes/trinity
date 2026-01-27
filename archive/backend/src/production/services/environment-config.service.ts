import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggingService } from '../../monitoring/services/structured-logging.service';

export interface EnvironmentConfig {
  name: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  isStaging: boolean;
  features: {
    debugging: boolean;
    detailedLogging: boolean;
    performanceMonitoring: boolean;
    errorTracking: boolean;
    metricsCollection: boolean;
    healthChecks: boolean;
    swagger: boolean;
    cors: boolean;
  };
  security: {
    rateLimiting: boolean;
    inputValidation: boolean;
    securityHeaders: boolean;
    httpsOnly: boolean;
    csrfProtection: boolean;
  };
  performance: {
    compression: boolean;
    caching: boolean;
    connectionPooling: boolean;
    memoryOptimization: boolean;
    staticAssetOptimization: boolean;
  };
  monitoring: {
    structuredLogging: boolean;
    metricsCollection: boolean;
    errorTracking: boolean;
    performanceMonitoring: boolean;
    healthChecks: boolean;
  };
}

@Injectable()
export class EnvironmentConfigService {
  private readonly logger = new Logger(EnvironmentConfigService.name);
  private readonly environment: string;
  private readonly config: EnvironmentConfig;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly loggingService?: StructuredLoggingService,
  ) {
    try {
      this.environment = this.configService.get<string>('NODE_ENV', 'development');
      this.config = this.buildEnvironmentConfig();
      
      this.validateConfiguration();
      this.logConfiguration();
      
      this.logger.log('EnvironmentConfigService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize EnvironmentConfigService', error);
      throw error;
    }
  }

  private buildEnvironmentConfig(): EnvironmentConfig {
    const env = this.environment.toLowerCase();
    const isProduction = env === 'production';
    
    return {
      name: env,
      isProduction,
      isDevelopment: env === 'development',
      isTest: env === 'test',
      isStaging: env === 'staging',
      
      features: {
        debugging: this.getFeatureFlag('ENABLE_DEBUGGING', !isProduction),
        detailedLogging: this.getFeatureFlag('ENABLE_DETAILED_LOGGING', true),
        performanceMonitoring: this.getFeatureFlag('ENABLE_PERFORMANCE_MONITORING', true),
        errorTracking: this.getFeatureFlag('ENABLE_ERROR_TRACKING', true),
        metricsCollection: this.getFeatureFlag('ENABLE_METRICS_COLLECTION', true),
        healthChecks: this.getFeatureFlag('ENABLE_HEALTH_CHECKS', true),
        swagger: this.getFeatureFlag('ENABLE_SWAGGER', !isProduction),
        cors: this.getFeatureFlag('ENABLE_CORS', true),
      },
      
      security: {
        rateLimiting: this.getFeatureFlag('ENABLE_RATE_LIMITING', true),
        inputValidation: this.getFeatureFlag('ENABLE_INPUT_VALIDATION', true),
        securityHeaders: this.getFeatureFlag('ENABLE_SECURITY_HEADERS', true),
        httpsOnly: this.getFeatureFlag('ENABLE_HTTPS_ONLY', isProduction),
        csrfProtection: this.getFeatureFlag('ENABLE_CSRF_PROTECTION', isProduction),
      },
      
      performance: {
        compression: this.getFeatureFlag('ENABLE_COMPRESSION', true),
        caching: this.getFeatureFlag('ENABLE_CACHING', true),
        connectionPooling: this.getFeatureFlag('ENABLE_CONNECTION_POOLING', true),
        memoryOptimization: this.getFeatureFlag('ENABLE_MEMORY_OPTIMIZATION', true),
        staticAssetOptimization: this.getFeatureFlag('ENABLE_STATIC_ASSET_OPTIMIZATION', true),
      },
      
      monitoring: {
        structuredLogging: this.getFeatureFlag('ENABLE_STRUCTURED_LOGGING', true),
        metricsCollection: this.getFeatureFlag('ENABLE_METRICS_COLLECTION', true),
        errorTracking: this.getFeatureFlag('ENABLE_ERROR_TRACKING', true),
        performanceMonitoring: this.getFeatureFlag('ENABLE_PERFORMANCE_MONITORING', true),
        healthChecks: this.getFeatureFlag('ENABLE_HEALTH_CHECKS', true),
      },
    };
  }

  private getFeatureFlag(key: string, defaultValue: boolean): boolean {
    const value = this.configService.get<string>(key);
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  private validateConfiguration(): void {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validaciones críticas para producción
    if (this.config.isProduction) {
      if (!this.config.security.rateLimiting) {
        errors.push('Rate limiting must be enabled in production');
      }
      
      if (!this.config.security.inputValidation) {
        errors.push('Input validation must be enabled in production');
      }
      
      if (!this.config.security.securityHeaders) {
        errors.push('Security headers must be enabled in production');
      }
      
      if (this.config.features.debugging) {
        warnings.push('Debugging should be disabled in production');
      }
      
      if (this.config.features.swagger) {
        warnings.push('Swagger should be disabled in production');
      }
    }

    // Validaciones de Google Auth y Cognito
    this.validateGoogleAuthConfiguration(errors, warnings);
    this.validateCognitoConfiguration(errors, warnings);

    // Validaciones de monitoreo
    if (!this.config.monitoring.structuredLogging) {
      warnings.push('Structured logging is recommended for better observability');
    }
    
    if (!this.config.monitoring.errorTracking) {
      warnings.push('Error tracking is recommended for production systems');
    }

    // Validaciones de performance
    if (!this.config.performance.compression && this.config.isProduction) {
      warnings.push('Compression is recommended for production');
    }
    
    if (!this.config.performance.caching) {
      warnings.push('Caching is recommended for better performance');
    }

    // Log errores y warnings
    if (errors.length > 0) {
      errors.forEach(error => {
        this.logger.error(`Configuration Error: ${error}`);
      });
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    if (warnings.length > 0) {
      warnings.forEach(warning => {
        this.logger.warn(`Configuration Warning: ${warning}`);
      });
    }
  }

  private validateGoogleAuthConfiguration(errors: string[], warnings: string[]): void {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const googleClientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const googleAuthEnabled = this.configService.get<string>('AUTH_GOOGLE_ENABLED', 'true') === 'true';

    if (googleAuthEnabled) {
      // Validar Google Client ID
      if (!googleClientId || googleClientId === 'your-google-web-client-id') {
        errors.push('GOOGLE_CLIENT_ID must be configured when Google Auth is enabled');
      } else {
        // Validar formato del Client ID
        if (!googleClientId.endsWith('.apps.googleusercontent.com')) {
          warnings.push('GOOGLE_CLIENT_ID should end with .apps.googleusercontent.com');
        }
        
        if (googleClientId.length < 50) {
          warnings.push('GOOGLE_CLIENT_ID appears to be too short - verify it is correct');
        }
      }

      // Validar Google Client Secret (solo en producción)
      if (this.config.isProduction) {
        if (!googleClientSecret || googleClientSecret === 'your-google-client-secret') {
          errors.push('GOOGLE_CLIENT_SECRET must be configured in production');
        } else if (googleClientSecret.length < 20) {
          warnings.push('GOOGLE_CLIENT_SECRET appears to be too short - verify it is correct');
        }
      }

      // Validar dominios permitidos
      const allowedDomains = this.configService.get<string>('GOOGLE_ALLOWED_DOMAINS');
      if (allowedDomains) {
        const domains = allowedDomains.split(',').map(d => d.trim()).filter(Boolean);
        if (domains.length === 0) {
          warnings.push('GOOGLE_ALLOWED_DOMAINS is set but empty - remove or configure properly');
        } else {
          // Validar formato de dominios
          const invalidDomains = domains.filter(domain => !this.isValidDomain(domain));
          if (invalidDomains.length > 0) {
            warnings.push(`Invalid domains in GOOGLE_ALLOWED_DOMAINS: ${invalidDomains.join(', ')}`);
          }
        }
      }
    }
  }

  private validateCognitoConfiguration(errors: string[], warnings: string[]): void {
    const cognitoUserPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    const cognitoClientId = this.configService.get<string>('COGNITO_CLIENT_ID');
    const cognitoRegion = this.configService.get<string>('COGNITO_REGION');
    const cognitoIdentityPoolId = this.configService.get<string>('COGNITO_IDENTITY_POOL_ID');
    const federatedEnabled = this.configService.get<string>('COGNITO_FEDERATED_IDENTITY_ENABLED', 'false') === 'true';

    // Validar configuración básica de Cognito
    if (!cognitoUserPoolId || cognitoUserPoolId === 'your-cognito-user-pool-id') {
      errors.push('COGNITO_USER_POOL_ID must be configured');
    } else {
      // Validar formato del User Pool ID
      if (!cognitoUserPoolId.match(/^[a-z0-9-]+_[A-Za-z0-9]+$/)) {
        warnings.push('COGNITO_USER_POOL_ID format appears invalid (should be region_poolId)');
      }
    }

    if (!cognitoClientId || cognitoClientId === 'your-cognito-client-id') {
      errors.push('COGNITO_CLIENT_ID must be configured');
    } else if (cognitoClientId.length < 20) {
      warnings.push('COGNITO_CLIENT_ID appears to be too short - verify it is correct');
    }

    if (!cognitoRegion) {
      errors.push('COGNITO_REGION must be configured');
    } else if (!cognitoRegion.match(/^[a-z0-9-]+$/)) {
      warnings.push('COGNITO_REGION format appears invalid');
    }

    // Validar configuración de Identity Pool para autenticación federada
    if (federatedEnabled) {
      if (!cognitoIdentityPoolId || cognitoIdentityPoolId === 'your-cognito-identity-pool-id') {
        errors.push('COGNITO_IDENTITY_POOL_ID must be configured when federated identity is enabled');
      } else {
        // Validar formato del Identity Pool ID
        if (!cognitoIdentityPoolId.match(/^[a-z0-9-]+:[a-f0-9-]{36}$/)) {
          warnings.push('COGNITO_IDENTITY_POOL_ID format appears invalid (should be region:uuid)');
        }
      }

      const googleProviderName = this.configService.get<string>('COGNITO_GOOGLE_PROVIDER_NAME');
      if (!googleProviderName || googleProviderName === 'your-google-provider-name') {
        warnings.push('COGNITO_GOOGLE_PROVIDER_NAME should be configured for federated auth (usually accounts.google.com)');
      }
    }

    // Validar consistencia de regiones
    const identityPoolRegion = this.configService.get<string>('COGNITO_IDENTITY_POOL_REGION');
    if (identityPoolRegion && identityPoolRegion !== cognitoRegion) {
      warnings.push('COGNITO_IDENTITY_POOL_REGION differs from COGNITO_REGION - ensure this is intentional');
    }

    // Validar configuración de AWS
    const awsRegion = this.configService.get<string>('AWS_REGION');
    const awsAccessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const awsSecretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!awsRegion) {
      errors.push('AWS_REGION must be configured');
    }

    if (!awsAccessKeyId || awsAccessKeyId === 'your-aws-access-key-id') {
      errors.push('AWS_ACCESS_KEY_ID must be configured');
    } else if (awsAccessKeyId.length < 16) {
      warnings.push('AWS_ACCESS_KEY_ID appears to be too short - verify it is correct');
    }

    if (!awsSecretAccessKey || awsSecretAccessKey === 'your-aws-secret-access-key') {
      errors.push('AWS_SECRET_ACCESS_KEY must be configured');
    } else if (awsSecretAccessKey.length < 30) {
      warnings.push('AWS_SECRET_ACCESS_KEY appears to be too short - verify it is correct');
    }
  }

  private isValidDomain(domain: string): boolean {
    // Validación básica de formato de dominio
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  private logConfiguration(): void {
    const configData = {
      environment: this.config.name,
      isProduction: this.config.isProduction,
      featuresEnabled: Object.entries(this.config.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature),
      securityEnabled: Object.entries(this.config.security)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature),
      performanceEnabled: Object.entries(this.config.performance)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature),
      monitoringEnabled: Object.entries(this.config.monitoring)
        .filter(([_, enabled]) => enabled)
        .map(([feature, _]) => feature),
    };

    if (this.loggingService) {
      this.loggingService.log('Environment configuration loaded', {
        metadata: configData,
      });
    } else {
      this.logger.log('Environment configuration loaded', JSON.stringify(configData, null, 2));
    }
  }

  public getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  public isProduction(): boolean {
    return this.config.isProduction;
  }

  public isDevelopment(): boolean {
    return this.config.isDevelopment;
  }

  public isTest(): boolean {
    return this.config.isTest;
  }

  public isStaging(): boolean {
    return this.config.isStaging;
  }

  public isFeatureEnabled(feature: keyof EnvironmentConfig['features']): boolean {
    return this.config.features[feature];
  }

  public isSecurityEnabled(security: keyof EnvironmentConfig['security']): boolean {
    return this.config.security[security];
  }

  public isPerformanceEnabled(performance: keyof EnvironmentConfig['performance']): boolean {
    return this.config.performance[performance];
  }

  public isMonitoringEnabled(monitoring: keyof EnvironmentConfig['monitoring']): boolean {
    return this.config.monitoring[monitoring];
  }

  public getEnvironmentSpecificConfig<T>(configs: {
    production?: T;
    staging?: T;
    development?: T;
    test?: T;
    default: T;
  }): T {
    if (this.config.isProduction && configs.production !== undefined) {
      return configs.production;
    }
    
    if (this.config.isStaging && configs.staging !== undefined) {
      return configs.staging;
    }
    
    if (this.config.isDevelopment && configs.development !== undefined) {
      return configs.development;
    }
    
    if (this.config.isTest && configs.test !== undefined) {
      return configs.test;
    }
    
    return configs.default;
  }

  public getOptimalSettings(): {
    cors: {
      origin: string[] | boolean;
      credentials: boolean;
    };
    rateLimit: {
      windowMs: number;
      max: number;
    };
    compression: {
      threshold: number;
      level: number;
    };
    logging: {
      level: string;
      format: string;
    };
  } {
    return {
      cors: this.getEnvironmentSpecificConfig({
        production: {
          origin: this.configService.get<string>('CORS_ORIGIN', '').split(',').filter(Boolean),
          credentials: true,
        },
        development: {
          origin: ['http://localhost:3000', 'http://localhost:19006'],
          credentials: true,
        },
        default: {
          origin: false,
          credentials: false,
        },
      }),
      
      rateLimit: this.getEnvironmentSpecificConfig({
        production: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 100, // limit each IP to 100 requests per windowMs
        },
        development: {
          windowMs: 15 * 60 * 1000,
          max: 1000, // More permissive for development
        },
        default: {
          windowMs: 15 * 60 * 1000,
          max: 500,
        },
      }),
      
      compression: this.getEnvironmentSpecificConfig({
        production: {
          threshold: 1024, // Only compress responses > 1KB
          level: 6, // Good balance between compression and speed
        },
        development: {
          threshold: 0, // Compress everything for testing
          level: 1, // Fast compression for development
        },
        default: {
          threshold: 1024,
          level: 6,
        },
      }),
      
      logging: this.getEnvironmentSpecificConfig({
        production: {
          level: 'warn',
          format: 'json',
        },
        development: {
          level: 'debug',
          format: 'pretty',
        },
        test: {
          level: 'error',
          format: 'json',
        },
        default: {
          level: 'info',
          format: 'json',
        },
      }),
    };
  }
}