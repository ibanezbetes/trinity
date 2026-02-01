/**
 * Trinity Auth Handler
 * Handles user authentication and authorization operations
 */

import { BaseHandler, createHandler } from './base-handler';
import { AppSyncEvent, TrinityUser, ValidationError, NotFoundError, ConflictError } from '../shared/types';
import { HandlerUtils } from './base-handler';

interface CreateUserArgs {
  username: string;
  email: string;
  displayName?: string;
}

interface UpdateUserArgs {
  displayName?: string;
  avatar?: string;
}

interface GetUserArgs {
  userId?: string;
}

class AuthHandler extends BaseHandler {
  async handle(event: AppSyncEvent): Promise<any> {
    const { fieldName } = HandlerUtils.getOperationInfo(event);
    const { userId } = HandlerUtils.getUserInfo(event);

    this.logger.info(`🔐 Auth operation: ${fieldName}`, { userId, fieldName });

    switch (fieldName) {
      case 'createUser':
        return this.createUser(event.arguments as CreateUserArgs, userId!);
      
      case 'updateUser':
        return this.updateUser(event.arguments as UpdateUserArgs, userId!);
      
      case 'getUser':
        return this.getUser(event.arguments as GetUserArgs, userId!);
      
      case 'getCurrentUser':
        return this.getCurrentUser(userId!);
      
      case 'deleteUser':
        return this.deleteUser(userId!);
      
      default:
        throw new ValidationError(`Unknown auth operation: ${fieldName}`);
    }
  }

  /**
   * Create a new user profile
   */
  private async createUser(args: CreateUserArgs, userId: string): Promise<TrinityUser> {
    // Validate required fields
    this.validateArgs<CreateUserArgs>(args, ['username', 'email']);

    // Sanitize inputs
    const username = HandlerUtils.sanitizeString(args.username, 50);
    const email = HandlerUtils.sanitizeString(args.email, 255);
    const displayName = args.displayName ? HandlerUtils.sanitizeString(args.displayName, 100) : username;

    // Check if user already exists
    const existingUser = await this.db.get<TrinityUser>(
      this.config.tables.users,
      { id: userId }
    );

    if (existingUser) {
      throw new ConflictError('User already exists', { userId });
    }

    // Check if username is taken
    const usernameCheck = await this.db.query<TrinityUser>(
      this.config.tables.users,
      'username = :username',
      {
        indexName: 'UsernameIndex',
        expressionAttributeValues: { ':username': username },
        limit: 1,
      }
    );

    if (usernameCheck.count > 0) {
      throw new ConflictError('Username already taken', { username });
    }

    // Create user object
    const now = new Date().toISOString();
    const user: TrinityUser = {
      id: userId,
      username,
      email,
      displayName,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    };

    // Save user to database
    await this.db.put(this.config.tables.users, user);

    this.logger.info('✅ User created successfully', { userId, username });
    return user;
  }

  /**
   * Update user profile
   */
  private async updateUser(args: UpdateUserArgs, userId: string): Promise<TrinityUser> {
    // Get existing user
    const existingUser = await this.db.get<TrinityUser>(
      this.config.tables.users,
      { id: userId }
    );

    if (!existingUser) {
      throw new NotFoundError('User', userId);
    }

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (args.displayName !== undefined) {
      updateExpressions.push('#displayName = :displayName');
      expressionAttributeNames['#displayName'] = 'displayName';
      expressionAttributeValues[':displayName'] = HandlerUtils.sanitizeString(args.displayName, 100);
    }

    if (args.avatar !== undefined) {
      updateExpressions.push('#avatar = :avatar');
      expressionAttributeNames['#avatar'] = 'avatar';
      expressionAttributeValues[':avatar'] = HandlerUtils.sanitizeString(args.avatar, 500);
    }

    if (updateExpressions.length === 0) {
      return existingUser; // No changes
    }

    // Add updatedAt
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    const updateExpression = `SET ${updateExpressions.join(', ')}`;

    // Update user
    const updatedUser = await this.db.update<TrinityUser>(
      this.config.tables.users,
      { id: userId },
      updateExpression,
      {
        expressionAttributeNames,
        expressionAttributeValues,
        returnValues: 'ALL_NEW',
      }
    );

    this.logger.info('✅ User updated successfully', { userId });
    return updatedUser!;
  }

  /**
   * Get user by ID
   */
  private async getUser(args: GetUserArgs, requestingUserId: string): Promise<TrinityUser> {
    const targetUserId = args.userId || requestingUserId;

    const user = await this.db.get<TrinityUser>(
      this.config.tables.users,
      { id: targetUserId }
    );

    if (!user) {
      throw new NotFoundError('User', targetUserId);
    }

    if (!user.isActive) {
      throw new NotFoundError('User', targetUserId);
    }

    return user;
  }

  /**
   * Get current authenticated user
   */
  private async getCurrentUser(userId: string): Promise<TrinityUser> {
    return this.getUser({}, userId);
  }

  /**
   * Soft delete user (deactivate)
   */
  private async deleteUser(userId: string): Promise<boolean> {
    // Check if user exists
    const existingUser = await this.db.get<TrinityUser>(
      this.config.tables.users,
      { id: userId }
    );

    if (!existingUser) {
      throw new NotFoundError('User', userId);
    }

    // Soft delete by setting isActive to false
    await this.db.update(
      this.config.tables.users,
      { id: userId },
      'SET #isActive = :isActive, #updatedAt = :updatedAt',
      {
        expressionAttributeNames: {
          '#isActive': 'isActive',
          '#updatedAt': 'updatedAt',
        },
        expressionAttributeValues: {
          ':isActive': false,
          ':updatedAt': new Date().toISOString(),
        },
      }
    );

    this.logger.info('✅ User deactivated successfully', { userId });
    return true;
  }
}

// Export the handler
export const handler = createHandler(AuthHandler);