/**
 * Authentication Service Interface
 * Core interface for user authentication and authorization
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'google' | 'cognito';
  cognitoSub?: string;
  googleId?: string;
  createdAt: Date;
  lastLoginAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface GoogleAuthPayload {
  idToken: string;
  accessToken?: string;
}

export interface CognitoAuthPayload {
  username: string;
  password: string;
}

export interface RefreshTokenPayload {
  refreshToken: string;
}

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
  isNewUser: boolean;
}

/**
 * Core Authentication Service Interface
 * Handles Google OAuth and Cognito authentication
 */
export interface IAuthService {
  /**
   * Authenticate user with Google OAuth
   */
  authenticateWithGoogle(payload: GoogleAuthPayload): Promise<AuthResult>;

  /**
   * Authenticate user with Cognito
   */
  authenticateWithCognito(payload: CognitoAuthPayload): Promise<AuthResult>;

  /**
   * Refresh authentication tokens
   */
  refreshTokens(payload: RefreshTokenPayload): Promise<AuthTokens>;

  /**
   * Validate JWT token and return user info
   */
  validateToken(token: string): Promise<AuthUser>;

  /**
   * Revoke user tokens (logout)
   */
  revokeTokens(userId: string): Promise<void>;

  /**
   * Get user by ID
   */
  getUserById(userId: string): Promise<AuthUser | null>;

  /**
   * Update user profile
   */
  updateUserProfile(userId: string, updates: Partial<AuthUser>): Promise<AuthUser>;
}