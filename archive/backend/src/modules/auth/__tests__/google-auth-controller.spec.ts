import { Test, TestingModule } from '@nestjs/testing';
import { GoogleAuthController } from '../google-auth.controller';
import { AuthService } from '../auth.service';

describe('GoogleAuthController - Unit Tests', () => {
  let controller: GoogleAuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoogleAuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            isGoogleAuthAvailable: jest.fn(),
            loginWithGoogleFederated: jest.fn(),
            loginWithGoogle: jest.fn(),
            linkGoogleAccountFederated: jest.fn(),
            linkGoogleAccount: jest.fn(),
            unlinkGoogleAccountFederated: jest.fn(),
            unlinkGoogleAccount: jest.fn(),
            canUnlinkGoogle: jest.fn(),
            exchangeGoogleTokenForCognito: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GoogleAuthController>(GoogleAuthController);
    authService = module.get<AuthService>(AuthService);
  });

  describe('checkGoogleAuthAvailability', () => {
    /**
     * Test: Google authentication availability endpoint
     * Validates: Requirements 10.1
     */
    it('should return availability status when Google Auth is configured', async () => {
      // Arrange
      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(true);

      // Act
      const result = await controller.checkGoogleAuthAvailability();

      // Assert
      expect(result).toBeDefined();
      expect(result.available).toBe(true);
      expect(result.message).toContain('configurado y disponible');
      expect(authService.isGoogleAuthAvailable).toHaveBeenCalled();
    });

    it('should return unavailable status when Google Auth is not configured', async () => {
      // Arrange
      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(false);

      // Act
      const result = await controller.checkGoogleAuthAvailability();

      // Assert
      expect(result).toBeDefined();
      expect(result.available).toBe(false);
      expect(result.message).toContain('no está configurado');
      expect(result.message).toContain('GOOGLE_CLIENT_ID');
      expect(authService.isGoogleAuthAvailable).toHaveBeenCalled();
    });

    it('should have consistent response structure', async () => {
      // Arrange
      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(true);

      // Act
      const result = await controller.checkGoogleAuthAvailability();

      // Assert
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('message');
      expect(typeof result.available).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });

  describe('getFederatedConfiguration', () => {
    it('should return federated configuration status', async () => {
      // Arrange
      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(true);
      // Mock del método privado checkFederatedAuthConfiguration
      jest.spyOn(controller as any, 'checkFederatedAuthConfiguration').mockResolvedValue(true);

      // Act
      const result = await controller.getFederatedConfiguration();

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty('federatedAuthConfigured');
      expect(result).toHaveProperty('googleAuthAvailable');
      expect(result).toHaveProperty('capabilities');
      expect(result).toHaveProperty('message');

      expect(result.capabilities).toHaveProperty('tokenExchange');
      expect(result.capabilities).toHaveProperty('federatedLogin');
      expect(result.capabilities).toHaveProperty('legacyLogin');
    });

    it('should indicate when federated auth is not configured', async () => {
      // Arrange
      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(true);
      jest.spyOn(controller as any, 'checkFederatedAuthConfiguration').mockResolvedValue(false);

      // Act
      const result = await controller.getFederatedConfiguration();

      // Assert
      expect(result.federatedAuthConfigured).toBe(false);
      expect(result.message).toContain('no configurada');
      expect(result.message).toContain('legacy');
    });
  });

  describe('exchangeGoogleToken', () => {
    it('should exchange Google token for Cognito tokens successfully', async () => {
      // Arrange
      const mockTokens = {
        accessToken: 'cognito-access-token',
        idToken: 'cognito-id-token',
        refreshToken: 'cognito-refresh-token',
        expiresIn: 3600,
      };
      
      (authService.exchangeGoogleTokenForCognito as jest.Mock).mockResolvedValue(mockTokens);

      const googleTokenDto = { idToken: 'google-id-token' };

      // Act
      const result = await controller.exchangeGoogleToken(googleTokenDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('exitosamente');
      expect(result.tokens).toEqual(mockTokens);
      expect(authService.exchangeGoogleTokenForCognito).toHaveBeenCalledWith('google-id-token');
    });

    it('should handle token exchange errors', async () => {
      // Arrange
      (authService.exchangeGoogleTokenForCognito as jest.Mock).mockRejectedValue(
        new Error('Token exchange failed')
      );

      const googleTokenDto = { idToken: 'invalid-token' };

      // Act & Assert
      await expect(controller.exchangeGoogleToken(googleTokenDto)).rejects.toThrow('Token exchange failed');
      expect(authService.exchangeGoogleTokenForCognito).toHaveBeenCalledWith('invalid-token');
    });
  });

  describe('loginWithGoogle', () => {
    it('should prioritize federated authentication', async () => {
      // Arrange
      const mockResult = {
        user: { id: 'user-123', email: 'test@example.com' },
        tokens: { accessToken: 'token', idToken: 'id-token', refreshToken: 'refresh', expiresIn: 3600 },
      };

      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(true);
      (authService.loginWithGoogleFederated as jest.Mock).mockResolvedValue(mockResult);

      const googleTokenDto = { idToken: 'google-token' };

      // Act
      const result = await controller.loginWithGoogle(googleTokenDto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.federatedAuth).toBe(true);
      expect(result.message).toContain('federado');
      expect(authService.loginWithGoogleFederated).toHaveBeenCalledWith('google-token');
    });

    it('should fallback to legacy authentication when federated fails', async () => {
      // Arrange
      const mockResult = {
        user: { id: 'user-123', email: 'test@example.com' },
        tokens: { accessToken: 'token', idToken: 'id-token', refreshToken: 'refresh', expiresIn: 3600 },
      };

      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(true);
      (authService.loginWithGoogleFederated as jest.Mock).mockRejectedValue(new Error('Federated auth failed'));
      (authService.loginWithGoogle as jest.Mock).mockResolvedValue(mockResult);

      const googleTokenDto = { idToken: 'google-token' };

      // Act
      const result = await controller.loginWithGoogle(googleTokenDto);

      // Assert
      expect(result.success).toBe(true);
      expect(result.federatedAuth).toBe(false);
      expect(result.message).toContain('legacy');
      expect(authService.loginWithGoogle).toHaveBeenCalledWith('google-token');
    });

    it('should throw error when Google Auth is not available', async () => {
      // Arrange
      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(false);

      const googleTokenDto = { idToken: 'google-token' };

      // Act & Assert
      await expect(controller.loginWithGoogle(googleTokenDto)).rejects.toThrow('Google Auth no está configurado');
    });
  });

  describe('getGoogleLinkStatus', () => {
    it('should return comprehensive link status', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        isGoogleLinked: true,
        authProviders: ['email', 'google'],
      };

      (authService.isGoogleAuthAvailable as jest.Mock).mockReturnValue(true);
      (authService.canUnlinkGoogle as jest.Mock).mockResolvedValue(true);
      jest.spyOn(controller as any, 'checkFederatedAuthConfiguration').mockResolvedValue(true);

      const mockRequest = { user: mockUser };

      // Act
      const result = await controller.getGoogleLinkStatus(mockRequest);

      // Assert
      expect(result).toBeDefined();
      expect(result.isGoogleLinked).toBe(true);
      expect(result.authProviders).toEqual(['email', 'google']);
      expect(result.canUnlinkGoogle).toBe(true);
      expect(result.googleAuthAvailable).toBe(true);
      expect(result.federatedAuthConfigured).toBe(true);
    });

    it('should handle user without Google linking', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        isGoogleLinked: false,
        authProviders: ['email'],
      };

      (authService.canUnlinkGoogle as jest.Mock).mockResolvedValue(false);
      jest.spyOn(controller as any, 'checkFederatedAuthConfiguration').mockResolvedValue(false);

      const mockRequest = { user: mockUser };

      // Act
      const result = await controller.getGoogleLinkStatus(mockRequest);

      // Assert
      expect(result.isGoogleLinked).toBe(false);
      expect(result.authProviders).toEqual(['email']);
      expect(result.canUnlinkGoogle).toBe(false);
    });
  });
});