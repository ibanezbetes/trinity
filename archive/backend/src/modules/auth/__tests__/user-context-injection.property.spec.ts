import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { UserContextMiddleware, EnhancedUserContext, UserContextUtils } from '../middleware/user-context.middleware';
import { UserContext, UserId, UserEmail, UserPermissions } from '../decorators/user-context.decorator';
import { ExecutionContext } from '@nestjs/common';
import * as fc from 'fast-check';

/**
 * Property Test 9: User Context Injection
 * 
 * Validates Requirements 3.5: User context injection in requests
 * 
 * This test ensures that user context is properly injected into requests
 * and that all decorators work correctly with the enhanced user context.
 */
describe('Property Test 9: User Context Injection', () => {
  let middleware: UserContextMiddleware;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserContextMiddleware],
    }).compile();

    middleware = module.get<UserContextMiddleware>(UserContextMiddleware);
    
    mockRequest = {
      headers: {},
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    
    mockResponse = {
      setHeader: jest.fn(),
    };
    
    mockNext = jest.fn();
  });

  // Property 1: User context enhancement preserves original user data
  it('should preserve all original user data when enhancing context', () => {
    fc.assert(fc.property(
      fc.record({
        id: fc.string({ minLength: 1 }),
        sub: fc.string({ minLength: 1 }),
        email: fc.emailAddress(),
        username: fc.string({ minLength: 1 }),
        emailVerified: fc.boolean(),
        displayName: fc.option(fc.string({ minLength: 1 })),
        permissions: fc.option(fc.array(fc.string())),
        roles: fc.option(fc.array(fc.string())),
      }),
      (originalUser) => {
        mockRequest.user = originalUser as any;

        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

        const enhancedUser = mockRequest.user as EnhancedUserContext;
        
        // All original properties should be preserved
        expect(enhancedUser.id).toBe(originalUser.id);
        expect(enhancedUser.sub).toBe(originalUser.sub);
        expect(enhancedUser.email).toBe(originalUser.email);
        expect(enhancedUser.username).toBe(originalUser.username);
        expect(enhancedUser.emailVerified).toBe(originalUser.emailVerified);
        
        if (originalUser.displayName) {
          expect(enhancedUser.displayName).toBe(originalUser.displayName);
        }
        
        if (originalUser.permissions) {
          expect(enhancedUser.permissions).toEqual(originalUser.permissions);
        }
        
        if (originalUser.roles) {
          expect(enhancedUser.roles).toEqual(originalUser.roles);
        }
      }
    ));
  });

  // Property 2: Enhanced context includes required aliases
  it('should add required aliases for backward compatibility', () => {
    fc.assert(fc.property(
      fc.record({
        id: fc.string({ minLength: 1 }),
        sub: fc.string({ minLength: 1 }),
        email: fc.emailAddress(),
        username: fc.string({ minLength: 1 }),
        emailVerified: fc.boolean(),
      }),
      (originalUser) => {
        mockRequest.user = originalUser as any;

        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

        const enhancedUser = mockRequest.user as EnhancedUserContext;
        
        // Aliases should be properly set
        expect(enhancedUser.userId).toBe(originalUser.id);
        expect(enhancedUser.userSub).toBe(originalUser.sub);
        
        // Both user and userContext should reference the same enhanced object
        expect(mockRequest.userContext).toBe(enhancedUser);
      }
    ));
  });

  // Property 3: Request context is properly added
  it('should add request context information', () => {
    fc.assert(fc.property(
      fc.record({
        id: fc.string({ minLength: 1 }),
        sub: fc.string({ minLength: 1 }),
        email: fc.emailAddress(),
        username: fc.string({ minLength: 1 }),
        emailVerified: fc.boolean(),
      }),
      fc.string(),
      fc.string(),
      (originalUser, userAgent, forwardedFor) => {
        mockRequest.user = originalUser as any;
        mockRequest.headers = {
          'user-agent': userAgent,
          'x-forwarded-for': forwardedFor,
        };

        middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

        const enhancedUser = mockRequest.user as EnhancedUserContext;
        
        // Request context should be added
        expect(enhancedUser.requestId).toBeDefined();
        expect(enhancedUser.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
        
        // IP address should be forwardedFor if not empty, otherwise fallback
        const expectedIp = forwardedFor || '127.0.0.1';
        expect(enhancedUser.ipAddress).toBe(expectedIp);
        
        expect(enhancedUser.userAgent).toBe(userAgent);
        expect(enhancedUser.sessionId).toBeDefined();
      }
    ));
  });

  // Property 4: UserContextUtils functions work correctly with enhanced context
  it('should provide correct utility functions for enhanced user context', () => {
    fc.assert(fc.property(
      fc.record({
        id: fc.string({ minLength: 1 }),
        sub: fc.string({ minLength: 1 }),
        email: fc.emailAddress(),
        username: fc.string({ minLength: 1 }),
        emailVerified: fc.boolean(),
        permissions: fc.option(fc.array(fc.string())),
      }),
      (userData) => {
        const enhancedUserData = {
          ...userData,
          userId: userData.id,
          userSub: userData.sub,
          requestId: 'test-request-id',
        } as EnhancedUserContext;

        const mockRequest = {
          user: enhancedUserData,
        } as Request;

        // Test utility functions work with enhanced context
        expect(UserContextUtils.getUserId(mockRequest)).toBe(userData.id);
        expect(UserContextUtils.getUserEmail(mockRequest)).toBe(userData.email);
        expect(UserContextUtils.isAuthenticated(mockRequest)).toBe(true);
        expect(UserContextUtils.validateUserContext(mockRequest)).toBe(true);
        
        const displayName = UserContextUtils.getDisplayName(mockRequest);
        expect(displayName).toBe(userData.displayName || userData.username);
        
        const permissions = UserContextUtils.getUserPermissions(mockRequest);
        expect(permissions).toEqual(userData.permissions || []);
        
        if (userData.permissions && userData.permissions.length > 0) {
          const hasPermission = UserContextUtils.hasPermission(mockRequest, userData.permissions[0]);
          expect(hasPermission).toBe(true);
        }

        // Test enhanced context retrieval
        const enhancedContext = UserContextUtils.getEnhancedContext(mockRequest);
        expect(enhancedContext).toBe(enhancedUserData);
        expect(enhancedContext.userId).toBe(userData.id);
        expect(enhancedContext.userSub).toBe(userData.sub);
        expect(enhancedContext.requestId).toBe('test-request-id');
      }
    ));
  });

  // Property 5: User ID extraction handles all variations
  it('should handle all user ID variations correctly', () => {
    fc.assert(fc.property(
      fc.oneof(
        fc.record({ id: fc.string({ minLength: 1 }), sub: fc.string({ minLength: 1 }) }),
        fc.record({ id: fc.string({ minLength: 1 }) }),
        fc.record({ sub: fc.string({ minLength: 1 }) }),
      ),
      (userData) => {
        const mockRequest = {
          user: userData,
        } as Request;

        // UserContextUtils should handle all ID variations
        const extractedId = UserContextUtils.getUserId(mockRequest);
        
        // Should return id if available, otherwise sub
        const expectedId = userData.id || userData.sub;
        expect(extractedId).toBe(expectedId);
      }
    ));
  });

  // Property 6: UserContextUtils functions work correctly
  it('should provide correct utility functions for user context', () => {
    fc.assert(fc.property(
      fc.record({
        id: fc.string({ minLength: 1 }),
        sub: fc.string({ minLength: 1 }),
        email: fc.emailAddress(),
        username: fc.string({ minLength: 1 }),
        emailVerified: fc.boolean(),
        displayName: fc.option(fc.string({ minLength: 1 })),
        permissions: fc.option(fc.array(fc.string())),
      }),
      (userData) => {
        const mockRequest = {
          user: {
            ...userData,
            userId: userData.id,
            userSub: userData.sub,
          } as EnhancedUserContext,
        } as Request;

        // Test utility functions
        expect(UserContextUtils.getUserId(mockRequest)).toBe(userData.id);
        expect(UserContextUtils.getUserEmail(mockRequest)).toBe(userData.email);
        expect(UserContextUtils.isAuthenticated(mockRequest)).toBe(true);
        expect(UserContextUtils.validateUserContext(mockRequest)).toBe(true);
        
        const displayName = UserContextUtils.getDisplayName(mockRequest);
        expect(displayName).toBe(userData.displayName || userData.username);
        
        const permissions = UserContextUtils.getUserPermissions(mockRequest);
        expect(permissions).toEqual(userData.permissions || []);
        
        if (userData.permissions && userData.permissions.length > 0) {
          const hasPermission = UserContextUtils.hasPermission(mockRequest, userData.permissions[0]);
          expect(hasPermission).toBe(true);
        }
      }
    ));
  });

  // Property 7: Middleware handles missing user gracefully
  it('should handle requests without user context gracefully', () => {
    fc.assert(fc.property(
      fc.record({
        headers: fc.dictionary(fc.string(), fc.string()),
        connection: fc.record({ remoteAddress: fc.string() }),
      }),
      (requestData) => {
        const testRequest = {
          ...requestData,
          user: undefined, // No user context
        } as Request;

        // Should not throw and should call next
        expect(() => {
          middleware.use(testRequest, mockResponse as Response, mockNext);
        }).not.toThrow();
        
        expect(mockNext).toHaveBeenCalled();
        expect(testRequest.user).toBeUndefined();
        expect(testRequest.userContext).toBeUndefined();
      }
    ));
  });

  // Property 8: Error in enhancement doesn't break request flow
  it('should continue with original context if enhancement fails', () => {
    fc.assert(fc.property(
      fc.record({
        id: fc.string({ minLength: 1 }),
        email: fc.emailAddress(),
        username: fc.string({ minLength: 1 }),
        emailVerified: fc.boolean(),
      }),
      (userData) => {
        // Create a user object that will cause enhancement to fail
        const problematicUser = {
          ...userData,
          // Add a property that will cause JSON.stringify to fail
          get problematicProperty() {
            throw new Error('Enhancement error');
          },
        };

        mockRequest.user = problematicUser as any;

        // Should not throw and should call next
        expect(() => {
          middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
        }).not.toThrow();
        
        expect(mockNext).toHaveBeenCalled();
        
        // Original user should still be available
        expect(mockRequest.user).toBeDefined();
        expect(mockRequest.user.id).toBe(userData.id);
        expect(mockRequest.user.email).toBe(userData.email);
      }
    ));
  });
});