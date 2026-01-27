/**
 * Authentication Service Unit Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GoogleAuthPayload, CognitoAuthPayload, RefreshTokenPayload } from './auth.interface';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);

    // Setup default mock returns
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config = {
        JWT_SECRET: 'test-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return config[key] || defaultValue;
    });

    mockJwtService.sign.mockReturnValue('mock-jwt-token');
    mockJwtService.verify.mockReturnValue({ sub: 'user-id', email: 'test@example.com' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateWithGoogle', () => {
    it('should authenticate user with valid Google token', async () => {
      const payload: GoogleAuthPayload = {
        idToken: 'valid-google-token',
      };

      // Mock the private method
      jest.spyOn(service as any, 'verifyGoogleToken').mockResolvedValue({
        sub: 'google-user-id',
        email: 'user@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      });

      jest.spyOn(service as any, 'findUserByEmail').mockResolvedValue(null);
      jest.spyOn(service as any, 'createUser').mockResolvedValue({
        id: 'user-id',
        email: 'user@example.com',
        name: 'Test User',
        provider: 'google',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });

      const result = await service.authenticateWithGoogle(payload);

      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.isNewUser).toBe(true);
      expect(result.user.provider).toBe('google');
    });

    it('should throw UnauthorizedException for invalid Google token', async () => {
      const payload: GoogleAuthPayload = {
        idToken: 'invalid-token',
      };

      jest.spyOn(service as any, 'verifyGoogleToken').mockRejectedValue(new Error('Invalid token'));

      await expect(service.authenticateWithGoogle(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('should handle existing user login', async () => {
      const payload: GoogleAuthPayload = {
        idToken: 'valid-google-token',
      };

      const existingUser = {
        id: 'existing-user-id',
        email: 'user@example.com',
        name: 'Existing User',
        provider: 'google' as const,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      jest.spyOn(service as any, 'verifyGoogleToken').mockResolvedValue({
        sub: 'google-user-id',
        email: 'user@example.com',
        name: 'Test User',
      });

      jest.spyOn(service as any, 'findUserByEmail').mockResolvedValue(existingUser);
      jest.spyOn(service as any, 'updateLastLogin').mockResolvedValue(existingUser);

      const result = await service.authenticateWithGoogle(payload);

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe('existing-user-id');
    });
  });

  describe('authenticateWithCognito', () => {
    it('should authenticate user with valid Cognito credentials', async () => {
      const payload: CognitoAuthPayload = {
        username: 'testuser',
        password: 'password123',
      };

      jest.spyOn(service as any, 'authenticateWithCognitoService').mockResolvedValue({
        sub: 'cognito-user-id',
        email: 'testuser@example.com',
        name: 'Test User',
      });

      jest.spyOn(service as any, 'findUserByCognitoSub').mockResolvedValue(null);
      jest.spyOn(service as any, 'createUser').mockResolvedValue({
        id: 'user-id',
        email: 'testuser@example.com',
        name: 'Test User',
        provider: 'cognito',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });

      const result = await service.authenticateWithCognito(payload);

      expect(result).toBeDefined();
      expect(result.user.provider).toBe('cognito');
      expect(result.isNewUser).toBe(true);
    });

    it('should throw UnauthorizedException for invalid Cognito credentials', async () => {
      const payload: CognitoAuthPayload = {
        username: 'testuser',
        password: 'wrongpassword',
      };

      jest.spyOn(service as any, 'authenticateWithCognitoService').mockRejectedValue(new Error('Invalid credentials'));

      await expect(service.authenticateWithCognito(payload)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const payload: RefreshTokenPayload = {
        refreshToken: 'valid-refresh-token',
      };

      const mockUser = {
        id: 'user-id',
        email: 'user@example.com',
        name: 'Test User',
        provider: 'google' as const,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      mockJwtService.verify.mockReturnValue({ sub: 'user-id' });
      jest.spyOn(service, 'getUserById').mockResolvedValue(mockUser);

      const result = await service.refreshTokens(payload);

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.tokenType).toBe('Bearer');
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      const payload: RefreshTokenPayload = {
        refreshToken: 'invalid-refresh-token',
      };

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refreshTokens(payload)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const payload: RefreshTokenPayload = {
        refreshToken: 'valid-refresh-token',
      };

      mockJwtService.verify.mockReturnValue({ sub: 'non-existent-user' });
      jest.spyOn(service, 'getUserById').mockResolvedValue(null);

      await expect(service.refreshTokens(payload)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateToken', () => {
    it('should validate token and return user', async () => {
      const token = 'valid-jwt-token';
      const mockUser = {
        id: 'user-id',
        email: 'user@example.com',
        name: 'Test User',
        provider: 'google' as const,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      mockJwtService.verify.mockReturnValue({ sub: 'user-id' });
      jest.spyOn(service, 'getUserById').mockResolvedValue(mockUser);

      const result = await service.validateToken(token);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      const token = 'invalid-token';

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.validateToken(token)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const token = 'valid-token';

      mockJwtService.verify.mockReturnValue({ sub: 'non-existent-user' });
      jest.spyOn(service, 'getUserById').mockResolvedValue(null);

      await expect(service.validateToken(token)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('revokeTokens', () => {
    it('should revoke tokens for user', async () => {
      const userId = 'user-id';
      const addTokenToBlacklistSpy = jest.spyOn(service as any, 'addTokenToBlacklist').mockResolvedValue(undefined);

      await service.revokeTokens(userId);

      expect(addTokenToBlacklistSpy).toHaveBeenCalledWith(userId);
    });
  });

  describe('updateUserProfile', () => {
    it('should update user profile', async () => {
      const userId = 'user-id';
      const updates = { name: 'Updated Name' };
      const existingUser = {
        id: userId,
        email: 'user@example.com',
        name: 'Old Name',
        provider: 'google' as const,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      jest.spyOn(service, 'getUserById').mockResolvedValue(existingUser);
      jest.spyOn(service as any, 'saveUser').mockResolvedValue(undefined);

      const result = await service.updateUserProfile(userId, updates);

      expect(result.name).toBe('Updated Name');
      expect(result.email).toBe('user@example.com');
    });

    it('should throw BadRequestException when user not found', async () => {
      const userId = 'non-existent-user';
      const updates = { name: 'Updated Name' };

      jest.spyOn(service, 'getUserById').mockResolvedValue(null);

      await expect(service.updateUserProfile(userId, updates)).rejects.toThrow(BadRequestException);
    });
  });

  describe('generateTokens', () => {
    it('should generate valid token structure', async () => {
      const mockUser = {
        id: 'user-id',
        email: 'user@example.com',
        name: 'Test User',
        provider: 'google' as const,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      const result = await (service as any).generateTokens(mockUser);

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.idToken).toBeDefined();
      expect(result.tokenType).toBe('Bearer');
      expect(typeof result.expiresIn).toBe('number');
      expect(mockJwtService.sign).toHaveBeenCalledTimes(3); // access, refresh, id tokens
    });
  });
});