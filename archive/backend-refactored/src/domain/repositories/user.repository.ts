/**
 * User Repository Interface (Port)
 * Defines the contract for user data persistence
 */

import { User } from '../entities/user.entity';

export interface IUserRepository {
  /**
   * Finds a user by their unique ID
   */
  findById(id: string): Promise<User | null>;

  /**
   * Finds a user by their email address
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Finds a user by their Google ID
   */
  findByGoogleId(googleId: string): Promise<User | null>;

  /**
   * Finds a user by their Cognito ID
   */
  findByCognitoId(cognitoId: string): Promise<User | null>;

  /**
   * Creates a new user
   */
  create(user: User): Promise<User>;

  /**
   * Updates an existing user
   */
  update(user: User): Promise<User>;

  /**
   * Deletes a user by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Finds all users with pagination
   */
  findAll(offset: number, limit: number): Promise<User[]>;

  /**
   * Counts total number of users
   */
  count(): Promise<number>;

  /**
   * Finds active users (last active within specified days)
   */
  findActiveUsers(days: number): Promise<User[]>;
}