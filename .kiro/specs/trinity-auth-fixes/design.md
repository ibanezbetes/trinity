# Design Document - Trinity Authentication System Fixes

## Overview

This design document outlines the comprehensive solution for fixing all authentication issues in the Trinity application. The solution addresses AWS Cognito configuration problems, Google Sign-In integration issues, session management failures, federated authentication problems, and mobile app authentication flow inconsistencies. The design emphasizes security, reliability, and user experience while maintaining compatibility with the existing serverless architecture.

## Architecture

The authentication system follows a federated architecture with AWS Cognito as the central identity provider, supporting both native email/password authentication and Google Social Sign-In. The solution addresses critical configuration issues and implements robust error handling and session management.

### Core Components
- **Enhanced Cognito Service**: Fixed configuration and improved error handling
- **Google Authentication Integration**: Proper federated authentication with Cognito
- **Session Management Service**: Secure token storage and automatic refresh
- **Mobile Authentication Context**: Unified authentication state management
- **Backend Authentication Middleware**: JWT validation and user context injection

### Data Flow
```
User Authentication → Cognito User Pool → JWT Tokens → Secure Storage → Session Management
Google Sign-In → Google OAuth → Cognito Federation → JWT Tokens → User Profile Sync
API Requests → JWT Validation → User Context → Protected Resources
```

## Components and Interfaces

### 1. Enhanced AWS Cognito Service

**Purpose**: Properly configure and manage AWS Cognito User Pool integration with correct settings

**Key Fixes**:
- Correct User Pool ID configuration: `eu-west-1_6UxioIj4z`
- Proper App Client ID usage: `59dpqsm580j14ulkcha19shl64`
- Fixed region configuration: `eu-west-1`
- Enhanced error handling and user-friendly error messages

**Interface**:
```typescript
interface CognitoConfig {
  region: string;
  userPoolId: string;
  userPoolWebClientId: string;
  userPoolDomain: string;
  googleClientId: string;
}

interface CognitoService {
  validateConfiguration(): Promise<ConfigValidationResult>;
  signUp(email: string, password: string, name: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  validateAccessToken(token: string): Promise<CognitoUser | null>;
  refreshToken(refreshToken: string): Promise<TokenRefreshResult>;
  exchangeGoogleTokenForCognito(googleToken: string): Promise<CognitoTokens>;
}
```

### 2. Google Authentication Integration

**Purpose**: Implement proper Google Sign-In with Cognito federation

**Components**:
- **Google OAuth Handler**: Manages Google Sign-In flow
- **Token Exchange Service**: Converts Google tokens to Cognito tokens
- **User Profile Sync**: Synchronizes Google profile data with Cognito

**Interface**:
```typescript
interface GoogleAuthService {
  signInWithGoogle(): Promise<GoogleAuthResult>;
  verifyGoogleToken(idToken: string): Promise<GoogleUser>;
  exchangeForCognitoTokens(googleToken: string): Promise<CognitoTokens>;
  linkGoogleAccount(userId: string, googleToken: string): Promise<UserProfile>;
  unlinkGoogleAccount(userId: string): Promise<UserProfile>;
}

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  email_verified: boolean;
}
```

### 3. Session Management Service

**Purpose**: Handle secure token storage, automatic refresh, and session persistence

**Components**:
- **Secure Storage Manager**: Uses device keychain/keystore for token storage
- **Token Refresh Handler**: Automatic background token refresh
- **Session Validator**: Validates and restores sessions on app startup

**Interface**:
```typescript
interface SessionManager {
  storeTokens(tokens: CognitoTokens): Promise<void>;
  getStoredTokens(): Promise<CognitoTokens | null>;
  refreshTokensIfNeeded(): Promise<CognitoTokens | null>;
  clearSession(): Promise<void>;
  validateSession(): Promise<SessionValidationResult>;
}

interface SessionValidationResult {
  isValid: boolean;
  user?: UserProfile;
  tokens?: CognitoTokens;
  needsRefresh: boolean;
}
```

### 4. Mobile Authentication Context

**Purpose**: Unified authentication state management across the mobile app

**Components**:
- **Auth Context Provider**: React Context for authentication state
- **Auth State Manager**: Manages authentication state transitions
- **Network Resilience Handler**: Handles offline/online authentication scenarios

**Interface**:
```typescript
interface AuthContextValue {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
```

### 5. Backend Authentication Middleware

**Purpose**: Validate JWT tokens and inject user context into API requests

**Components**:
- **JWT Validation Guard**: Validates Cognito JWT tokens
- **User Context Injector**: Attaches user information to requests
- **Permission Validator**: Checks user permissions from Cognito attributes

**Interface**:
```typescript
interface AuthGuard {
  validateToken(token: string): Promise<CognitoUser | null>;
  extractUserContext(token: string): Promise<UserContext>;
  checkPermissions(user: UserContext, requiredPermissions: string[]): boolean;
}

interface UserContext {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  isEmailVerified: boolean;
}
```

## Data Models

### Enhanced User Model
```typescript
interface User {
  id: string;                    // Cognito sub
  email: string;
  username: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  phoneNumber?: string;
  displayName?: string;
  avatarUrl?: string;
  // Google Federation
  googleId?: string;
  isGoogleLinked: boolean;
  authProviders: string[];       // ['email', 'google']
  federatedIdentities?: FederatedIdentity[];
}
```

### Authentication Tokens Model
```typescript
interface CognitoTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn?: number;
  tokenType?: string;
}

interface StoredTokens extends CognitoTokens {
  storedAt: string;
  expiresAt: string;
}
```

### Federated Identity Model
```typescript
interface FederatedIdentity {
  provider: 'google';
  providerId: string;
  linkedAt: Date;
  isActive: boolean;
  providerData: {
    email: string;
    name: string;
    picture?: string;
    locale?: string;
  };
}
```

### Configuration Model
```typescript
interface AuthConfiguration {
  cognito: {
    region: string;
    userPoolId: string;
    userPoolWebClientId: string;
    userPoolDomain: string;
  };
  google: {
    clientId: string;
    androidClientId?: string;
    iosClientId?: string;
  };
  security: {
    tokenRefreshThreshold: number;  // seconds before expiry to refresh
    maxRetryAttempts: number;
    sessionTimeoutMinutes: number;
  };
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Cognito Configuration Validation
*For any* system initialization, the Cognito service should successfully connect to User Pool "eu-west-1_6UxioIj4z" with App Client "59dpqsm580j14ulkcha19shl64"
**Validates: Requirements 1.2**

### Property 2: Google Authentication Token Exchange
*For any* valid Google ID token, the system should successfully exchange it for valid Cognito JWT tokens
**Validates: Requirements 2.3**

### Property 3: Federated User Creation
*For any* first-time Google user authentication, the system should create a Cognito user profile with properly mapped Google attributes
**Validates: Requirements 2.2, 6.1, 6.2**

### Property 4: Authentication Error Translation
*For any* Cognito error code, the system should translate it to a user-friendly error message
**Validates: Requirements 1.4, 7.1**

### Property 5: Google Authentication Error Handling
*For any* Google Sign-In failure, the system should provide specific guidance based on the failure type
**Validates: Requirements 2.4, 7.2**

### Property 6: JWT Token Validation
*For any* API request with a JWT token, the authentication service should validate the token against the Cognito User Pool
**Validates: Requirements 3.1**

### Property 7: Automatic Token Refresh
*For any* expired access token with a valid refresh token, the system should automatically refresh the token without user intervention
**Validates: Requirements 3.2, 4.4**

### Property 8: Authentication Status Codes
*For any* token validation failure, the system should return appropriate HTTP status codes (401 for invalid tokens, 403 for insufficient permissions)
**Validates: Requirements 3.3**

### Property 9: User Context Injection
*For any* authenticated API request, the system should attach proper user context to the request
**Validates: Requirements 3.5**

### Property 10: Mobile Session Restoration
*For any* mobile app startup with stored valid tokens, the authentication context should restore the user session
**Validates: Requirements 4.1, 5.2**

### Property 11: Dual Authentication Flow Support
*For any* mobile authentication attempt, the system should support both email/password and Google Sign-In flows
**Validates: Requirements 4.2**

### Property 12: Secure Token Storage
*For any* successful authentication, the system should store tokens in secure device storage (keychain/keystore)
**Validates: Requirements 4.3, 5.1, 10.1**

### Property 13: Session Cleanup on Sign Out
*For any* user sign out, the system should clear all stored authentication data and revoke tokens
**Validates: Requirements 4.5**

### Property 14: Session Expiration Handling
*For any* expired session, the system should prompt users to re-authenticate with clear messaging
**Validates: Requirements 5.3**

### Property 15: Network Resilience Authentication Sync
*For any* network connectivity restoration, the system should sync authentication state with Cognito
**Validates: Requirements 5.5**

### Property 16: Google Profile Synchronization
*For any* Google profile update, the system should sync changes to Cognito user attributes
**Validates: Requirements 6.3**

### Property 17: Federated User ID Consistency
*For any* federated user session, the system should maintain consistent user IDs across all sessions
**Validates: Requirements 6.4**

### Property 18: User Data Conflict Resolution
*For any* user data conflict between providers, the system should resolve conflicts using the most recent authoritative source
**Validates: Requirements 6.5**

### Property 19: Network Error Classification
*For any* network error during authentication, the system should distinguish between connectivity and service issues
**Validates: Requirements 7.3**

### Property 20: Authentication Timeout Retry
*For any* authentication timeout, the system should provide retry options with exponential backoff
**Validates: Requirements 7.4**

### Property 21: Dual Error Logging
*For any* critical authentication error, the system should log detailed debugging information while showing simple messages to users
**Validates: Requirements 7.5**

### Property 22: Authentication State Broadcasting
*For any* authentication state change, the system should broadcast updates to all app components
**Validates: Requirements 8.1**

### Property 23: Service Credential Updates
*For any* token refresh, the system should update all services with new authentication credentials
**Validates: Requirements 8.2**

### Property 24: Sign Out State Propagation
*For any* user sign out, the system should ensure all components are notified and clear their authentication state
**Validates: Requirements 8.3**

### Property 25: Coordinated Error Handling
*For any* authentication error, the system should coordinate error handling across all services
**Validates: Requirements 8.4**

### Property 26: Concurrency Control
*For any* simultaneous authentication operations, the system should prevent race conditions and state conflicts
**Validates: Requirements 8.5**

### Property 27: Secure Data Transmission
*For any* authentication data transmission, the system should use HTTPS and proper encryption
**Validates: Requirements 10.2**

### Property 28: Sensitive Data Protection
*For any* authentication logging, the system should never log passwords or tokens in plain text
**Validates: Requirements 10.3**

### Property 29: Session Timeout Policy
*For any* established authentication session, the system should implement proper session timeout policies
**Validates: Requirements 10.4**

### Property 30: Security Monitoring
*For any* suspicious authentication activity, the system should implement appropriate security measures
**Validates: Requirements 10.5**

## Error Handling

### Cognito Configuration Errors
- **Missing Configuration**: Clear error messages indicating which configuration values are missing
- **Invalid User Pool ID**: Validation of User Pool ID format and existence
- **Invalid Client ID**: Validation of App Client ID and permissions
- **Region Mismatch**: Ensure region consistency across all AWS services

### Google Authentication Errors
- **Invalid Google Token**: Handle expired or malformed Google ID tokens
- **Google Service Unavailable**: Fallback mechanisms when Google services are down
- **Account Linking Conflicts**: Handle cases where Google accounts are already linked to other users
- **Permission Denied**: Handle cases where users deny Google permissions

### Token Management Errors
- **Expired Tokens**: Automatic refresh with fallback to re-authentication
- **Invalid Refresh Tokens**: Clear session and prompt for re-authentication
- **Token Storage Failures**: Graceful degradation when secure storage is unavailable
- **Network Failures**: Queue operations and retry when connectivity is restored

### Session Management Errors
- **Session Corruption**: Detect and recover from corrupted session data
- **Concurrent Session Conflicts**: Handle multiple simultaneous authentication attempts
- **Device Storage Limitations**: Handle cases where device storage is full or unavailable

### User-Facing Error Messages
- **Configuration Errors**: "Authentication service is temporarily unavailable. Please try again later."
- **Google Sign-In Errors**: "Google Sign-In failed. Please check your Google account and try again."
- **Network Errors**: "Connection error. Please check your internet connection and try again."
- **Session Errors**: "Your session has expired. Please sign in again."

## Testing Strategy

### Dual Testing Approach
The testing strategy combines unit tests for specific scenarios with property-based tests for comprehensive coverage:

**Unit Tests**:
- Specific configuration scenarios (valid/invalid User Pool IDs, Client IDs)
- Edge cases (expired tokens, network failures, corrupted sessions)
- Integration points (Cognito API responses, Google OAuth flows)
- User interface interactions (sign-in forms, error displays)

**Property-Based Tests**:
- Universal properties across all inputs (token validation, session management)
- Comprehensive input coverage through randomization (various token formats, user data)
- Concurrency testing (simultaneous authentication attempts, token refresh)
- Error injection testing (network failures, service unavailability)

**Property Test Configuration**:
- Minimum 100 iterations per property test
- Each property test references its design document property
- Tag format: **Feature: trinity-auth-fixes, Property {number}: {property_text}**

**Testing Libraries**:
- **Jest** for unit testing framework
- **fast-check** for property-based testing in TypeScript
- **AWS SDK mocks** for Cognito service testing
- **MSW** for Google OAuth API mocking
- **React Native Testing Library** for mobile component testing

### Key Test Scenarios

**Configuration Tests**:
- Cognito User Pool connection with correct credentials
- Google OAuth configuration validation
- Error handling for missing or invalid configuration

**Authentication Flow Tests**:
- Email/password authentication with test user (paco@paco.com)
- Google Sign-In flow with token exchange
- Federated user creation and profile mapping
- Session restoration on app startup

**Token Management Tests**:
- JWT token validation and expiration handling
- Automatic token refresh with valid refresh tokens
- Secure token storage in device keychain/keystore
- Token cleanup on sign out

**Error Handling Tests**:
- Cognito error code translation to user-friendly messages
- Google authentication failure handling
- Network error classification and retry logic
- Concurrent authentication operation handling

**Security Tests**:
- Sensitive data protection in logs
- Secure transmission validation (HTTPS)
- Session timeout policy enforcement
- Suspicious activity detection and response

The comprehensive testing approach ensures reliability and security across all authentication components while maintaining excellent user experience and proper error handling.