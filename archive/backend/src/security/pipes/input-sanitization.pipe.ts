import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException, Logger } from '@nestjs/common';
import { SecurityService } from '../security.service';
import * as validator from 'class-validator';
import * as DOMPurify from 'isomorphic-dompurify';

@Injectable()
export class InputSanitizationPipe implements PipeTransform {
  private readonly logger = new Logger(InputSanitizationPipe.name);

  constructor(private securityService: SecurityService) {}

  transform(value: any, metadata: ArgumentMetadata): any {
    if (!value) {
      return value;
    }

    try {
      // Sanitize the input
      const sanitized = this.sanitizeValue(value);
      
      // Validate for malicious patterns
      if (!this.validateInput(sanitized)) {
        this.logger.warn('Malicious input detected and blocked', {
          originalValue: this.maskSensitiveData(value),
          sanitizedValue: this.maskSensitiveData(sanitized),
          metadata,
        });
        
        throw new BadRequestException('Invalid input detected');
      }

      return sanitized;
    } catch (error) {
      this.logger.error('Input sanitization failed', {
        error: error.message,
        value: this.maskSensitiveData(value),
        metadata,
      });
      
      throw new BadRequestException('Input validation failed');
    }
  }

  private sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      return this.sanitizeString(value);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeValue(item));
    }

    if (typeof value === 'object' && value !== null) {
      const sanitized = {};
      for (const [key, val] of Object.entries(value)) {
        // Sanitize both key and value
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeValue(val);
      }
      return sanitized;
    }

    return value;
  }

  private sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return input;
    }

    // Remove null bytes
    let sanitized = input.replace(/\0/g, '');

    // HTML sanitization using DOMPurify
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [], // No HTML tags allowed
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true,
    });

    // Remove potentially dangerous patterns
    sanitized = sanitized
      // Remove script tags and javascript: protocols
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/data:/gi, '')
      
      // Remove event handlers
      .replace(/on\w+\s*=/gi, '')
      
      // Remove SQL injection patterns
      .replace(/(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi, '')
      
      // Remove path traversal attempts
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      
      // Trim whitespace
      .trim();

    // Limit string length to prevent DoS
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
      this.logger.warn('Input truncated due to excessive length');
    }

    return sanitized;
  }

  private validateInput(value: any): boolean {
    // Check for remaining malicious patterns after sanitization
    const maliciousPatterns = [
      // XSS patterns
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+\s*=/i,
      
      // SQL injection patterns
      /(\bunion\b|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b)/i,
      
      // Command injection patterns
      /(\beval\b|\bexec\b|\bsystem\b|\bshell_exec\b)/i,
      
      // Path traversal
      /\.\.\//,
      /\.\.\\/,
      
      // LDAP injection
      /(\(\||\)\(|\*\))/,
      
      // NoSQL injection
      /(\$where|\$ne|\$gt|\$lt)/i,
    ];

    const inputString = JSON.stringify(value);
    
    for (const pattern of maliciousPatterns) {
      if (pattern.test(inputString)) {
        return false;
      }
    }

    return true;
  }

  private maskSensitiveData(value: any): any {
    if (typeof value === 'string') {
      // Mask potential passwords, tokens, etc.
      if (value.length > 20) {
        return value.substring(0, 10) + '***' + value.substring(value.length - 5);
      }
      return value;
    }

    if (typeof value === 'object' && value !== null) {
      const masked = {};
      for (const [key, val] of Object.entries(value)) {
        if (['password', 'token', 'secret', 'key'].some(sensitive => 
          key.toLowerCase().includes(sensitive))) {
          masked[key] = '***MASKED***';
        } else {
          masked[key] = this.maskSensitiveData(val);
        }
      }
      return masked;
    }

    return value;
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    return validator.isEmail(email);
  }

  /**
   * Validate URL format
   */
  static validateUrl(url: string): boolean {
    return validator.isURL(url);
  }

  /**
   * Validate UUID format
   */
  static validateUuid(uuid: string): boolean {
    return validator.isUUID(uuid);
  }

  /**
   * Validate phone number format
   */
  static validatePhoneNumber(phone: string): boolean {
    return validator.isMobilePhone(phone);
  }
}