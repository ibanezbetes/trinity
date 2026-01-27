export interface User {
  id: string; // Cognito Sub (UUID)
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Campos adicionales de Cognito
  cognitoUsername?: string;
  phoneNumber?: string;
  phoneNumberVerified?: boolean;
  displayName?: string; // Nombre completo del usuario
  avatarUrl?: string;
  // Campos de Google Auth
  googleId?: string;
  isGoogleLinked?: boolean;
  authProviders?: string[];
  lastGoogleSync?: Date;
  // Campos de Identidad Federada
  federatedIdentities?: FederatedIdentity[];
  primaryAuthProvider?: string;
  cognitoIdentityId?: string; // Cognito Identity Pool ID
  federatedTokens?: FederatedTokenMetadata;
  accountLinkingHistory?: AccountLinkingEvent[];
}

export interface FederatedIdentity {
  provider: string; // 'google', 'facebook', 'apple', etc.
  providerId: string; // ID único del proveedor
  providerEmail?: string;
  providerName?: string;
  providerPicture?: string;
  providerLocale?: string;
  providerDomain?: string; // Para Google Workspace
  linkedAt: Date;
  lastSyncAt?: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface FederatedTokenMetadata {
  cognitoIdentityId?: string;
  lastTokenRefresh?: Date;
  tokenExpiresAt?: Date;
  refreshTokenHash?: string; // Hash del refresh token para seguridad
}

export interface AccountLinkingEvent {
  eventType: 'linked' | 'unlinked' | 'sync_failed' | 'token_refreshed';
  provider: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface CreateUserDto {
  email: string;
  username: string;
  password: string;
  phoneNumber?: string;
  displayName?: string;
}

export interface LoginUserDto {
  email: string;
  password: string;
}

export interface ConfirmSignUpDto {
  email: string;
  confirmationCode: string;
}

export interface ResendConfirmationDto {
  email: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface ResetPasswordDto {
  email: string;
  confirmationCode: string;
  newPassword: string;
}

export interface UserProfile {
  id: string;
  sub: string; // Alias for id - compatibility with JWT/Cognito
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  phoneNumber?: string;
  displayName?: string;
  avatarUrl?: string;
  // Campos de Google Auth
  googleId?: string;
  isGoogleLinked?: boolean;
  authProviders?: string[];
  // Campos de Identidad Federada
  federatedIdentities?: FederatedIdentity[];
  primaryAuthProvider?: string;
  cognitoIdentityId?: string;
}

export interface FederatedAuthResult {
  user: UserProfile;
  cognitoTokens: CognitoTokens;
  isNewUser: boolean;
  federatedIdentity: FederatedIdentity;
}

export interface CreateFederatedUserDto {
  googleUser: any; // GoogleUserInfo
  cognitoIdentityId: string;
  cognitoTokens: CognitoTokens;
}

export interface LinkFederatedAccountDto {
  userId: string;
  provider: string;
  providerId: string;
  providerData: any;
}

export interface UpdateFederatedUserDto {
  userId: string;
  federatedIdentity: Partial<FederatedIdentity>;
  syncData?: any;
}

export interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn?: number;
}
