import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SecurityService } from './security.service';

describe('SecurityService', () => {
  let service: SecurityService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                NODE_ENV: 'test',
                AWS_REGION: 'eu-west-1',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitizeInput', () => {
    it('should remove script tags', () => {
      const maliciousInput = '<script>alert("xss")</script>Hello';
      const sanitized = service.sanitizeInput(maliciousInput);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('Hello');
    });

    it('should remove javascript: protocols', () => {
      const maliciousInput = 'javascript:alert("xss")';
      const sanitized = service.sanitizeInput(maliciousInput);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should sanitize nested objects', () => {
      const maliciousInput = {
        name: 'John',
        bio: '<script>alert("xss")</script>Safe content',
        nested: {
          value: 'javascript:alert("nested")',
        },
      };
      
      const sanitized = service.sanitizeInput(maliciousInput);
      expect(sanitized.bio).not.toContain('<script>');
      expect(sanitized.nested.value).not.toContain('javascript:');
      expect(sanitized.name).toBe('John');
    });

    it('should handle arrays', () => {
      const maliciousInput = [
        'safe string',
        '<script>alert("xss")</script>',
        { key: 'javascript:alert("array")' },
      ];
      
      const sanitized = service.sanitizeInput(maliciousInput);
      expect(sanitized[0]).toBe('safe string');
      expect(sanitized[1]).not.toContain('<script>');
      expect(sanitized[2].key).not.toContain('javascript:');
    });
  });

  describe('validateRequest', () => {
    it('should return true for safe requests', () => {
      const safeRequest = {
        url: '/api/rooms',
        body: { name: 'My Room' },
        query: { page: 1 },
        headers: { 'user-agent': 'Mozilla/5.0' },
      };
      
      const isValid = service.validateRequest(safeRequest);
      expect(isValid).toBe(true);
    });

    it('should return false for requests with script injection', () => {
      const maliciousRequest = {
        url: '/api/rooms',
        body: { name: '<script>alert("xss")</script>' },
        query: {},
        headers: { 'user-agent': 'Mozilla/5.0' },
      };
      
      const isValid = service.validateRequest(maliciousRequest);
      expect(isValid).toBe(false);
    });

    it('should return false for SQL injection attempts', () => {
      const sqlInjectionRequest = {
        url: '/api/rooms',
        body: { name: "'; DROP TABLE users; --" },
        query: {},
        headers: { 'user-agent': 'Mozilla/5.0' },
      };
      
      const isValid = service.validateRequest(sqlInjectionRequest);
      expect(isValid).toBe(false);
    });

    it('should return false for path traversal attempts', () => {
      const pathTraversalRequest = {
        url: '/api/../../../etc/passwd',
        body: {},
        query: {},
        headers: { 'user-agent': 'Mozilla/5.0' },
      };
      
      const isValid = service.validateRequest(pathTraversalRequest);
      expect(isValid).toBe(false);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate tokens of correct length', () => {
      const token = service.generateSecureToken(16);
      expect(token).toHaveLength(32); // hex encoding doubles the length
    });

    it('should generate different tokens each time', () => {
      const token1 = service.generateSecureToken();
      const token2 = service.generateSecureToken();
      expect(token1).not.toBe(token2);
    });

    it('should generate tokens with only hex characters', () => {
      const token = service.generateSecureToken();
      expect(token).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('hashSensitiveData', () => {
    it('should hash data consistently', () => {
      const data = 'sensitive-data';
      const hash1 = service.hashSensitiveData(data);
      const hash2 = service.hashSensitiveData(data);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = service.hashSensitiveData('data1');
      const hash2 = service.hashSensitiveData('data2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character SHA256 hashes', () => {
      const hash = service.hashSensitiveData('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('getSecurityConfig', () => {
    it('should return development config for non-production environment', () => {
      const config = service.getSecurityConfig();
      expect(config.cors.origin).toContain('http://localhost:3000');
      expect(config.cors.origin).toContain('http://localhost:8081');
    });

    it('should include security headers configuration', () => {
      const config = service.getSecurityConfig();
      expect(config.helmet.contentSecurityPolicy).toBeDefined();
      expect(config.helmet.hsts).toBeDefined();
      expect(config.helmet.hsts.maxAge).toBe(31536000); // 1 year
    });

    it('should include rate limiting configuration', () => {
      const config = service.getSecurityConfig();
      expect(config.rateLimit.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(config.rateLimit.max).toBe(100);
    });
  });

  describe('performSecurityHealthCheck', () => {
    it('should return healthy status for good configuration', () => {
      const healthCheck = service.performSecurityHealthCheck();
      expect(healthCheck.status).toBe('healthy');
      expect(healthCheck.score).toBeGreaterThan(80);
    });

    it('should include recommendations when issues are found', () => {
      // Simulate multiple security issues to trigger recommendations
      for (let i = 0; i < 15; i++) {
        service.recordSuspiciousActivity();
      }
      
      const healthCheck = service.performSecurityHealthCheck();
      expect(healthCheck.recommendations.length).toBeGreaterThan(0);
      expect(healthCheck.status).not.toBe('healthy');
    });
  });

  describe('security metrics', () => {
    it('should track blocked requests', () => {
      const initialMetrics = service.getSecurityMetrics();
      service.recordBlockedRequest();
      const updatedMetrics = service.getSecurityMetrics();
      
      expect(updatedMetrics.blockedRequests).toBe(initialMetrics.blockedRequests + 1);
    });

    it('should track rate limit hits', () => {
      const initialMetrics = service.getSecurityMetrics();
      service.recordRateLimitHit();
      const updatedMetrics = service.getSecurityMetrics();
      
      expect(updatedMetrics.rateLimitHits).toBe(initialMetrics.rateLimitHits + 1);
    });

    it('should reset metrics correctly', () => {
      service.recordBlockedRequest();
      service.recordRateLimitHit();
      service.resetSecurityMetrics();
      
      const metrics = service.getSecurityMetrics();
      expect(metrics.blockedRequests).toBe(0);
      expect(metrics.rateLimitHits).toBe(0);
      expect(metrics.suspiciousActivity).toBe(0);
      expect(metrics.securityScore).toBe(100);
    });
  });
});