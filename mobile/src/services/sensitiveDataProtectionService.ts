/**
 * Sensitive Data Protection Service
 * Ensures passwords and tokens are never logged in plain text,
 * adds data sanitization for all authentication logs,
 * and implements proper secret management for configuration
 */

import { loggingService } from './loggingService';

export interface DataProtectionConfig {
  enableSanitization: boolean;
  enableSecretManagement: boolean;
  enableDataClassification: boolean;
  sanitizationLevel: 'basic' | 'strict' | 'paranoid';
  logSanitizationEvents: boolean;
  enableDataMasking: boolean;
  maskingCharacter: string;
  preserveDataLength: boolean;
  enableSecretRotation: boolean;
  secretRotationIntervalMs: number;
}

export interface SanitizationResult {
  sanitized: any;
  hadSensitiveData: boolean;
  sanitizedFields: string[];
  sanitizationLevel: string;
  processingTime: number;
}

export interface SecretMetadata {
  id: string;
  type: 'password' | 'token' | 'key' | 'certificate' | 'other';
  classification: 'public' | 'internal' | 'confidential' | 'secret' | 'top_secret';
  createdAt: number;
  lastRotated?: number;
  expiresAt?: number;
  rotationRequired: boolean;
}

export interface DataClassification {
  level: 'public' | 'internal' | 'confidential' | 'secret' | 'top_secret';
  categories: string[];
  requiresEncryption: boolean;
  requiresMasking: boolean;
  retentionPeriod?: number;
  accessRestrictions: string[];
}

class SensitiveDataProtectionService {
  private config: DataProtectionConfig = {
    enableSanitization: true,
    enableSecretManagement: true,
    enableDataClassification: true,
    sanitizationLevel: 'strict',
    logSanitizationEvents: false, // Avoid recursive logging
    enableDataMasking: true,
    maskingCharacter: '*',
    preserveDataLength: true,
    enableSecretRotation: false, // Disabled by default
    secretRotationIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  };

  private secretRegistry: Map<string, SecretMetadata> = new Map();
  private rotationInterval?: NodeJS.Timeout;

  // Enhanced sensitive data patterns with classification
  private readonly SENSITIVE_PATTERNS = [
    {
      pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
      replacement: 'Bearer [REDACTED_TOKEN]',
      classification: 'secret' as const,
      type: 'token' as const,
      description: 'Bearer tokens'
    },
    {
      pattern: /"accessToken"\s*:\s*"[^"]+"/gi,
      replacement: '"accessToken": "[REDACTED]"',
      classification: 'secret' as const,
      type: 'token' as const,
      description: 'Access tokens in JSON'
    },
    {
      pattern: /"idToken"\s*:\s*"[^"]+"/gi,
      replacement: '"idToken": "[REDACTED]"',
      classification: 'secret' as const,
      type: 'token' as const,
      description: 'ID tokens in JSON'
    },
    {
      pattern: /"refreshToken"\s*:\s*"[^"]+"/gi,
      replacement: '"refreshToken": "[REDACTED]"',
      classification: 'secret' as const,
      type: 'token' as const,
      description: 'Refresh tokens in JSON'
    },
    {
      pattern: /"password"\s*:\s*"[^"]+"/gi,
      replacement: '"password": "[REDACTED]"',
      classification: 'top_secret' as const,
      type: 'password' as const,
      description: 'Passwords in JSON'
    },
    {
      pattern: /password[=:]\s*[^\s&"']+/gi,
      replacement: 'password=[REDACTED]',
      classification: 'top_secret' as const,
      type: 'password' as const,
      description: 'Password parameters'
    },
    {
      pattern: /Authorization:\s*[^\r\n]+/gi,
      replacement: 'Authorization: [REDACTED]',
      classification: 'secret' as const,
      type: 'token' as const,
      description: 'Authorization headers'
    },
    {
      pattern: /X-Amz-Security-Token:\s*[^\r\n]+/gi,
      replacement: 'X-Amz-Security-Token: [REDACTED]',
      classification: 'secret' as const,
      type: 'token' as const,
      description: 'AWS security tokens'
    },
    {
      pattern: /api[_-]?key[=:]\s*[^\s&"']+/gi,
      replacement: 'api_key=[REDACTED]',
      classification: 'confidential' as const,
      type: 'key' as const,
      description: 'API keys'
    },
    {
      pattern: /secret[=:]\s*[^\s&"']+/gi,
      replacement: 'secret=[REDACTED]',
      classification: 'secret' as const,
      type: 'key' as const,
      description: 'Secret values'
    },
    {
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      replacement: '[EMAIL_REDACTED]',
      classification: 'internal' as const,
      type: 'other' as const,
      description: 'Email addresses'
    },
    {
      pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      replacement: '[CARD_NUMBER_REDACTED]',
      classification: 'top_secret' as const,
      type: 'other' as const,
      description: 'Credit card numbers'
    },
    {
      pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: '[SSN_REDACTED]',
      classification: 'top_secret' as const,
      type: 'other' as const,
      description: 'Social Security Numbers'
    },
    {
      pattern: /"sub"\s*:\s*"[^"]+"/gi,
      replacement: '"sub": "[USER_ID_REDACTED]"',
      classification: 'confidential' as const,
      type: 'other' as const,
      description: 'User IDs in JWT'
    },
    {
      pattern: /client[_-]?secret[=:]\s*[^\s&"']+/gi,
      replacement: 'client_secret=[REDACTED]',
      classification: 'secret' as const,
      type: 'key' as const,
      description: 'Client secrets'
    },
    {
      pattern: /private[_-]?key[=:]\s*[^\s&"']+/gi,
      replacement: 'private_key=[REDACTED]',
      classification: 'top_secret' as const,
      type: 'key' as const,
      description: 'Private keys'
    },
    // Additional patterns for enhanced security
    {
      pattern: /session[_-]?id[=:]\s*[^\s&"']+/gi,
      replacement: 'session_id=[REDACTED]',
      classification: 'confidential' as const,
      type: 'token' as const,
      description: 'Session IDs'
    },
    {
      pattern: /csrf[_-]?token[=:]\s*[^\s&"']+/gi,
      replacement: 'csrf_token=[REDACTED]',
      classification: 'confidential' as const,
      type: 'token' as const,
      description: 'CSRF tokens'
    },
    {
      pattern: /\b[A-Fa-f0-9]{32,}\b/g,
      replacement: '[HEX_HASH_REDACTED]',
      classification: 'confidential' as const,
      type: 'other' as const,
      description: 'Hexadecimal hashes'
    },
  ];

  // Field name patterns that indicate sensitive data
  private readonly SENSITIVE_FIELD_NAMES = [
    /password/i,
    /passwd/i,
    /pwd/i,
    /token/i,
    /secret/i,
    /key/i,
    /credential/i,
    /auth/i,
    /session/i,
    /refresh/i,
    /access/i,
    /bearer/i,
    /authorization/i,
    /signature/i,
    /hash/i,
    /salt/i,
    /nonce/i,
    /otp/i,
    /pin/i,
    /ssn/i,
    /social/i,
    /credit/i,
    /card/i,
    /cvv/i,
    /cvc/i,
  ];

  constructor() {
    this.initializeSecretRotation();
    
    loggingService.info('SensitiveDataProtection', 'Sensitive data protection service initialized', {
      config: this.config,
      patternsCount: this.SENSITIVE_PATTERNS.length,
      fieldPatternsCount: this.SENSITIVE_FIELD_NAMES.length,
    });
  }

  /**
   * Sanitize data to remove sensitive information
   */
  sanitizeData(data: any, customPatterns?: Array<{ pattern: RegExp; replacement: string }>): SanitizationResult {
    const startTime = Date.now();
    
    if (!this.config.enableSanitization) {
      return {
        sanitized: data,
        hadSensitiveData: false,
        sanitizedFields: [],
        sanitizationLevel: 'disabled',
        processingTime: Date.now() - startTime,
      };
    }

    try {
      const result = this.performSanitization(data, customPatterns);
      const processingTime = Date.now() - startTime;

      if (this.config.logSanitizationEvents && result.hadSensitiveData) {
        loggingService.debug('SensitiveDataProtection', 'Data sanitization performed', {
          sanitizedFieldsCount: result.sanitizedFields.length,
          sanitizationLevel: this.config.sanitizationLevel,
          processingTime,
        });
      }

      return {
        ...result,
        sanitizationLevel: this.config.sanitizationLevel,
        processingTime,
      };

    } catch (error: any) {
      loggingService.error('SensitiveDataProtection', 'Data sanitization failed', {
        error: error.message,
      });

      return {
        sanitized: '[SANITIZATION_ERROR]',
        hadSensitiveData: true,
        sanitizedFields: [],
        sanitizationLevel: this.config.sanitizationLevel,
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Register a secret for management and rotation
   */
  registerSecret(
    id: string,
    type: SecretMetadata['type'],
    classification: SecretMetadata['classification'],
    expiresAt?: number
  ): void {
    const metadata: SecretMetadata = {
      id,
      type,
      classification,
      createdAt: Date.now(),
      expiresAt,
      rotationRequired: false,
    };

    this.secretRegistry.set(id, metadata);

    loggingService.debug('SensitiveDataProtection', 'Secret registered', {
      secretId: id,
      type,
      classification,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
  }

  /**
   * Check if secret needs rotation
   */
  checkSecretRotation(secretId: string): {
    needsRotation: boolean;
    reason?: string;
    timeUntilExpiry?: number;
  } {
    const secret = this.secretRegistry.get(secretId);
    
    if (!secret) {
      return {
        needsRotation: false,
        reason: 'Secret not found in registry',
      };
    }

    const now = Date.now();
    
    // Check if manually marked for rotation
    if (secret.rotationRequired) {
      return {
        needsRotation: true,
        reason: 'Manual rotation required',
      };
    }

    // Check expiration
    if (secret.expiresAt && secret.expiresAt <= now) {
      return {
        needsRotation: true,
        reason: 'Secret expired',
        timeUntilExpiry: 0,
      };
    }

    // Check if approaching expiration (within 24 hours)
    if (secret.expiresAt && (secret.expiresAt - now) < 24 * 60 * 60 * 1000) {
      return {
        needsRotation: true,
        reason: 'Secret expiring soon',
        timeUntilExpiry: secret.expiresAt - now,
      };
    }

    // Check rotation interval
    if (secret.lastRotated && this.config.enableSecretRotation) {
      const timeSinceRotation = now - secret.lastRotated;
      if (timeSinceRotation >= this.config.secretRotationIntervalMs) {
        return {
          needsRotation: true,
          reason: 'Rotation interval exceeded',
        };
      }
    }

    return {
      needsRotation: false,
      timeUntilExpiry: secret.expiresAt ? secret.expiresAt - now : undefined,
    };
  }

  /**
   * Mark secret as rotated
   */
  markSecretRotated(secretId: string): boolean {
    const secret = this.secretRegistry.get(secretId);
    
    if (!secret) {
      return false;
    }

    secret.lastRotated = Date.now();
    secret.rotationRequired = false;

    loggingService.info('SensitiveDataProtection', 'Secret rotation completed', {
      secretId,
      type: secret.type,
      classification: secret.classification,
    });

    return true;
  }

  /**
   * Classify data based on sensitivity
   */
  classifyData(data: any): DataClassification {
    if (!this.config.enableDataClassification) {
      return {
        level: 'internal',
        categories: [],
        requiresEncryption: false,
        requiresMasking: false,
        accessRestrictions: [],
      };
    }

    const analysis = this.analyzeDataSensitivity(data);
    
    return {
      level: analysis.highestClassification,
      categories: analysis.categories,
      requiresEncryption: analysis.highestClassification === 'secret' || analysis.highestClassification === 'top_secret',
      requiresMasking: analysis.hasSensitiveFields,
      retentionPeriod: this.getRetentionPeriod(analysis.highestClassification),
      accessRestrictions: this.getAccessRestrictions(analysis.highestClassification),
    };
  }

  /**
   * Mask sensitive data while preserving structure
   */
  maskSensitiveData(data: any, preserveLength: boolean = true): any {
    if (!this.config.enableDataMasking) {
      return data;
    }

    return this.performDataMasking(data, preserveLength);
  }

  /**
   * Get all registered secrets
   */
  getRegisteredSecrets(): SecretMetadata[] {
    return Array.from(this.secretRegistry.values());
  }

  /**
   * Get secrets that need rotation
   */
  getSecretsNeedingRotation(): Array<SecretMetadata & { rotationReason: string }> {
    const secretsNeedingRotation: Array<SecretMetadata & { rotationReason: string }> = [];

    this.secretRegistry.forEach((secret) => {
      const rotationCheck = this.checkSecretRotation(secret.id);
      if (rotationCheck.needsRotation) {
        secretsNeedingRotation.push({
          ...secret,
          rotationReason: rotationCheck.reason || 'Unknown',
        });
      }
    });

    return secretsNeedingRotation;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<DataProtectionConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Restart rotation if interval changed
    if (oldConfig.secretRotationIntervalMs !== this.config.secretRotationIntervalMs ||
        oldConfig.enableSecretRotation !== this.config.enableSecretRotation) {
      this.initializeSecretRotation();
    }
    
    loggingService.info('SensitiveDataProtection', 'Configuration updated', {
      oldConfig,
      newConfig: this.config,
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): DataProtectionConfig {
    return { ...this.config };
  }

  /**
   * Get protection statistics
   */
  getStats(): {
    config: DataProtectionConfig;
    registeredSecretsCount: number;
    secretsNeedingRotation: number;
    patternsCount: number;
    fieldPatternsCount: number;
  } {
    return {
      config: this.config,
      registeredSecretsCount: this.secretRegistry.size,
      secretsNeedingRotation: this.getSecretsNeedingRotation().length,
      patternsCount: this.SENSITIVE_PATTERNS.length,
      fieldPatternsCount: this.SENSITIVE_FIELD_NAMES.length,
    };
  }

  // Private helper methods

  private performSanitization(
    data: any,
    customPatterns?: Array<{ pattern: RegExp; replacement: string }>
  ): { sanitized: any; hadSensitiveData: boolean; sanitizedFields: string[] } {
    if (!data) {
      return { sanitized: data, hadSensitiveData: false, sanitizedFields: [] };
    }

    let sanitized: any;
    let hadSensitiveData = false;
    const sanitizedFields: string[] = [];

    // Convert to string for pattern matching
    const dataString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    let sanitizedString = dataString;

    // Apply built-in patterns
    this.SENSITIVE_PATTERNS.forEach(patternInfo => {
      if (this.shouldApplyPattern(patternInfo.classification)) {
        const matches = sanitizedString.match(patternInfo.pattern);
        if (matches) {
          hadSensitiveData = true;
          sanitizedFields.push(patternInfo.description);
          sanitizedString = sanitizedString.replace(patternInfo.pattern, patternInfo.replacement);
        }
      }
    });

    // Apply custom patterns
    if (customPatterns) {
      customPatterns.forEach(({ pattern, replacement }) => {
        const matches = sanitizedString.match(pattern);
        if (matches) {
          hadSensitiveData = true;
          sanitizedFields.push('custom_pattern');
          sanitizedString = sanitizedString.replace(pattern, replacement);
        }
      });
    }

    // Try to parse back to original type
    try {
      if (typeof data === 'string') {
        sanitized = sanitizedString;
      } else {
        sanitized = JSON.parse(sanitizedString);
      }
    } catch {
      sanitized = sanitizedString;
    }

    // Additional object-level sanitization
    if (typeof data === 'object' && data !== null) {
      const objectResult = this.sanitizeObjectFields(sanitized);
      sanitized = objectResult.sanitized;
      if (objectResult.hadSensitiveData) {
        hadSensitiveData = true;
        sanitizedFields.push(...objectResult.sanitizedFields);
      }
    }

    return { sanitized, hadSensitiveData, sanitizedFields };
  }

  private sanitizeObjectFields(obj: any): { sanitized: any; hadSensitiveData: boolean; sanitizedFields: string[] } {
    if (!obj || typeof obj !== 'object') {
      return { sanitized: obj, hadSensitiveData: false, sanitizedFields: [] };
    }

    const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };
    let hadSensitiveData = false;
    const sanitizedFields: string[] = [];

    const processObject = (current: any, path: string = ''): void => {
      if (!current || typeof current !== 'object') return;

      Object.keys(current).forEach(key => {
        const fullPath = path ? `${path}.${key}` : key;
        
        // Check if field name indicates sensitive data
        const isSensitiveField = this.SENSITIVE_FIELD_NAMES.some(pattern => pattern.test(key));
        
        if (isSensitiveField && typeof current[key] === 'string') {
          hadSensitiveData = true;
          sanitizedFields.push(fullPath);
          current[key] = this.config.enableDataMasking 
            ? this.maskValue(current[key])
            : '[REDACTED]';
        } else if (typeof current[key] === 'object' && current[key] !== null) {
          processObject(current[key], fullPath);
        }
      });
    };

    processObject(sanitized);

    return { sanitized, hadSensitiveData, sanitizedFields };
  }

  private shouldApplyPattern(classification: string): boolean {
    switch (this.config.sanitizationLevel) {
      case 'basic':
        return classification === 'top_secret';
      case 'strict':
        return classification === 'top_secret' || classification === 'secret';
      case 'paranoid':
        return true; // Apply all patterns
      default:
        return true;
    }
  }

  private analyzeDataSensitivity(data: any): {
    highestClassification: DataClassification['level'];
    categories: string[];
    hasSensitiveFields: boolean;
  } {
    let highestClassification: DataClassification['level'] = 'public';
    const categories: Set<string> = new Set();
    let hasSensitiveFields = false;

    const dataString = typeof data === 'string' ? data : JSON.stringify(data);

    // Check against patterns
    this.SENSITIVE_PATTERNS.forEach(patternInfo => {
      if (patternInfo.pattern.test(dataString)) {
        hasSensitiveFields = true;
        categories.add(patternInfo.type);
        
        // Update highest classification
        if (this.getClassificationLevel(patternInfo.classification) > this.getClassificationLevel(highestClassification)) {
          highestClassification = patternInfo.classification;
        }
      }
    });

    // Check field names if it's an object
    if (typeof data === 'object' && data !== null) {
      const fieldAnalysis = this.analyzeObjectFields(data);
      if (fieldAnalysis.hasSensitiveFields) {
        hasSensitiveFields = true;
        fieldAnalysis.categories.forEach(cat => categories.add(cat));
        
        if (this.getClassificationLevel(fieldAnalysis.highestClassification) > this.getClassificationLevel(highestClassification)) {
          highestClassification = fieldAnalysis.highestClassification;
        }
      }
    }

    return {
      highestClassification,
      categories: Array.from(categories),
      hasSensitiveFields,
    };
  }

  private analyzeObjectFields(obj: any, path: string = ''): {
    highestClassification: DataClassification['level'];
    categories: string[];
    hasSensitiveFields: boolean;
  } {
    let highestClassification: DataClassification['level'] = 'public';
    const categories: Set<string> = new Set();
    let hasSensitiveFields = false;

    if (!obj || typeof obj !== 'object') {
      return { highestClassification, categories: [], hasSensitiveFields };
    }

    Object.keys(obj).forEach(key => {
      const isSensitiveField = this.SENSITIVE_FIELD_NAMES.some(pattern => pattern.test(key));
      
      if (isSensitiveField) {
        hasSensitiveFields = true;
        categories.add('sensitive_field');
        
        // Determine classification based on field name
        const fieldClassification = this.getFieldClassification(key);
        if (this.getClassificationLevel(fieldClassification) > this.getClassificationLevel(highestClassification)) {
          highestClassification = fieldClassification;
        }
      }

      // Recursively analyze nested objects
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const nestedAnalysis = this.analyzeObjectFields(obj[key], path ? `${path}.${key}` : key);
        if (nestedAnalysis.hasSensitiveFields) {
          hasSensitiveFields = true;
          nestedAnalysis.categories.forEach(cat => categories.add(cat));
          
          if (this.getClassificationLevel(nestedAnalysis.highestClassification) > this.getClassificationLevel(highestClassification)) {
            highestClassification = nestedAnalysis.highestClassification;
          }
        }
      }
    });

    return {
      highestClassification,
      categories: Array.from(categories),
      hasSensitiveFields,
    };
  }

  private getFieldClassification(fieldName: string): DataClassification['level'] {
    const lowerField = fieldName.toLowerCase();
    
    if (lowerField.includes('password') || lowerField.includes('pwd') || lowerField.includes('passwd')) {
      return 'top_secret';
    }
    if (lowerField.includes('token') || lowerField.includes('secret') || lowerField.includes('key')) {
      return 'secret';
    }
    if (lowerField.includes('auth') || lowerField.includes('credential') || lowerField.includes('session')) {
      return 'confidential';
    }
    
    return 'internal';
  }

  private getClassificationLevel(classification: DataClassification['level']): number {
    const levels = {
      'public': 0,
      'internal': 1,
      'confidential': 2,
      'secret': 3,
      'top_secret': 4,
    };
    
    return levels[classification] || 0;
  }

  private getRetentionPeriod(classification: DataClassification['level']): number {
    const periods = {
      'public': 365 * 24 * 60 * 60 * 1000, // 1 year
      'internal': 180 * 24 * 60 * 60 * 1000, // 6 months
      'confidential': 90 * 24 * 60 * 60 * 1000, // 3 months
      'secret': 30 * 24 * 60 * 60 * 1000, // 1 month
      'top_secret': 7 * 24 * 60 * 60 * 1000, // 1 week
    };
    
    return periods[classification] || periods['internal'];
  }

  private getAccessRestrictions(classification: DataClassification['level']): string[] {
    const restrictions = {
      'public': [],
      'internal': ['authenticated_users'],
      'confidential': ['authenticated_users', 'authorized_roles'],
      'secret': ['authenticated_users', 'authorized_roles', 'mfa_required'],
      'top_secret': ['authenticated_users', 'authorized_roles', 'mfa_required', 'audit_logged'],
    };
    
    return restrictions[classification] || restrictions['internal'];
  }

  private performDataMasking(data: any, preserveLength: boolean): any {
    if (!data) return data;

    if (typeof data === 'string') {
      return this.maskValue(data, preserveLength);
    }

    if (typeof data === 'object') {
      const masked = Array.isArray(data) ? [...data] : { ...data };
      
      Object.keys(masked).forEach(key => {
        if (typeof masked[key] === 'string') {
          const isSensitive = this.SENSITIVE_FIELD_NAMES.some(pattern => pattern.test(key));
          if (isSensitive) {
            masked[key] = this.maskValue(masked[key], preserveLength);
          }
        } else if (typeof masked[key] === 'object' && masked[key] !== null) {
          masked[key] = this.performDataMasking(masked[key], preserveLength);
        }
      });
      
      return masked;
    }

    return data;
  }

  private maskValue(value: string, preserveLength: boolean = true): string {
    if (!value || value.length === 0) return value;

    if (preserveLength) {
      return this.config.maskingCharacter.repeat(value.length);
    } else {
      return this.config.maskingCharacter.repeat(8); // Fixed length
    }
  }

  private initializeSecretRotation(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }

    if (this.config.enableSecretRotation) {
      this.rotationInterval = setInterval(() => {
        this.checkAllSecretsForRotation();
      }, this.config.secretRotationIntervalMs);
    }
  }

  private checkAllSecretsForRotation(): void {
    const secretsNeedingRotation = this.getSecretsNeedingRotation();
    
    if (secretsNeedingRotation.length > 0) {
      loggingService.warn('SensitiveDataProtection', 'Secrets need rotation', {
        count: secretsNeedingRotation.length,
        secrets: secretsNeedingRotation.map(s => ({
          id: s.id,
          type: s.type,
          reason: s.rotationReason,
        })),
      });
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = undefined;
    }
    
    this.secretRegistry.clear();
    
    loggingService.info('SensitiveDataProtection', 'Sensitive data protection service destroyed');
  }
}

export const sensitiveDataProtectionService = new SensitiveDataProtectionService();
export type { DataProtectionConfig, SanitizationResult, SecretMetadata, DataClassification };