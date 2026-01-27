import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { EnhancedUserContext, UserContextUtils } from '../middleware/user-context.middleware';

/**
 * Decorator to inject user context into controller methods
 * 
 * Usage examples:
 * - @UserContext() user: EnhancedUserContext
 * - @UserContext('id') userId: string
 * - @UserContext('email') userEmail: string
 * - @UserContext('permissions') permissions: string[]
 */
export const UserContext = createParamDecorator(
  (data: keyof EnhancedUserContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as EnhancedUserContext;

    if (!user) {
      return undefined;
    }

    // If no specific field requested, return entire user context
    if (!data) {
      return user;
    }

    // Return specific field
    return user[data];
  },
);

/**
 * Decorator to inject user ID (handles all variations: id, sub, userId)
 */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return UserContextUtils.getUserId(request);
  },
);

/**
 * Decorator to inject user email
 */
export const UserEmail = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return UserContextUtils.getUserEmail(request);
  },
);

/**
 * Decorator to inject user permissions
 */
export const UserPermissions = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest();
    return UserContextUtils.getUserPermissions(request);
  },
);

/**
 * Decorator to inject request context information
 */
export const RequestContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return UserContextUtils.getRequestContext(request);
  },
);

/**
 * Decorator to inject user display name
 */
export const UserDisplayName = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return UserContextUtils.getDisplayName(request);
  },
);

/**
 * Decorator to check if user has specific permission
 * Usage: @HasPermission('ADMIN') hasAdmin: boolean
 */
export const HasPermission = createParamDecorator(
  (permission: string, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest();
    return UserContextUtils.hasPermission(request, permission);
  },
);

/**
 * Decorator to inject authentication status
 */
export const IsAuthenticated = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest();
    return UserContextUtils.isAuthenticated(request);
  },
);