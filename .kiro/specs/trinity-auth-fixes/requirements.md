# Requirements Document - Trinity Authentication System Fixes

## Introduction

Este documento especifica los requisitos para resolver todos los problemas de autenticación en Trinity, incluyendo la integración con AWS Cognito, Google Sign-In, gestión de sesiones federadas, y sincronización entre backend y mobile app.

## Glossary

- **Trinity**: Sistema de votación colaborativa de películas
- **AWS_Cognito**: Servicio de autenticación y autorización de AWS
- **User_Pool**: Pool de usuarios de Cognito para gestión de identidades
- **App_Client**: Cliente de aplicación configurado en Cognito
- **Google_Identity_Provider**: Proveedor de identidad social de Google
- **Federated_Auth**: Autenticación federada usando proveedores externos
- **JWT_Token**: JSON Web Token para autenticación
- **Session_Management**: Gestión de sesiones de usuario
- **Auth_Flow**: Flujo de autenticación completo

## Requirements

### Requirement 1: Fix AWS Cognito User Pool Configuration

**User Story:** As a system administrator, I want properly configured Cognito User Pool settings, so that authentication works reliably across all platforms.

#### Acceptance Criteria

1. WHEN the system initializes, THE Cognito_Service SHALL connect to User Pool "trinity-users-dev" with ID "eu-west-1_6UxioIj4z"
2. WHEN mobile app authenticates, THE System SHALL use App Client "trinity-mobile-dev" with Client ID "59dpqsm580j14ulkcha19shl64"
3. WHEN Cognito configuration is validated, THE System SHALL verify all required settings are properly configured
4. WHEN authentication fails due to configuration, THE System SHALL provide clear error messages indicating the specific configuration issue
5. WHEN User Pool settings change, THE System SHALL automatically detect and adapt to the new configuration

### Requirement 2: Implement Google Social Authentication

**User Story:** As a user, I want to sign in with my Google account, so that I can access Trinity without creating a separate account.

#### Acceptance Criteria

1. WHEN a user chooses Google Sign-In, THE System SHALL use Google Identity Provider with Client ID "230498169556-cqb6dv3o58oeblrfrk49o0a6l7ecjtrn.apps.googleusercontent.com"
2. WHEN Google authentication succeeds, THE System SHALL create or link the user account in Cognito User Pool
3. WHEN Google tokens are received, THE System SHALL exchange them for Cognito JWT tokens
4. WHEN Google authentication fails, THE System SHALL provide specific error messages and fallback options
5. WHEN Google account is already linked, THE System SHALL automatically sign in the existing user

### Requirement 3: Fix Backend Authentication Service

**User Story:** As a backend service, I want reliable user authentication validation, so that I can properly authorize API requests.

#### Acceptance Criteria

1. WHEN API requests include JWT tokens, THE Auth_Service SHALL validate tokens against Cognito User Pool
2. WHEN tokens are expired, THE Auth_Service SHALL attempt automatic refresh using refresh tokens
3. WHEN token validation fails, THE Auth_Service SHALL return appropriate HTTP status codes (401/403)
4. WHEN user permissions are checked, THE Auth_Service SHALL verify user roles and permissions from Cognito attributes
5. WHEN authentication middleware processes requests, THE System SHALL attach user context to all authenticated requests

### Requirement 4: Implement Mobile App Authentication Flow

**User Story:** As a mobile user, I want seamless authentication, so that I can quickly access Trinity features.

#### Acceptance Criteria

1. WHEN the mobile app starts, THE Auth_Context SHALL check for existing valid sessions
2. WHEN users sign in, THE Mobile_Auth_Service SHALL handle both email/password and Google Sign-In flows
3. WHEN authentication succeeds, THE System SHALL store secure tokens in device keychain/keystore
4. WHEN tokens expire, THE System SHALL automatically refresh them in the background
5. WHEN users sign out, THE System SHALL clear all stored authentication data and revoke tokens

### Requirement 5: Fix Session Management and Persistence

**User Story:** As a user, I want to stay signed in between app sessions, so that I don't have to authenticate repeatedly.

#### Acceptance Criteria

1. WHEN users successfully authenticate, THE Session_Manager SHALL store refresh tokens securely
2. WHEN the app restarts, THE System SHALL automatically restore valid sessions using stored refresh tokens
3. WHEN sessions expire, THE System SHALL prompt users to re-authenticate with clear messaging
4. WHEN users switch between devices, THE System SHALL maintain consistent authentication state
5. WHEN network connectivity is restored, THE System SHALL sync authentication state with Cognito

### Requirement 6: Implement Federated User Management

**User Story:** As a system, I want to properly manage federated users from Google, so that user data is consistent across authentication methods.

#### Acceptance Criteria

1. WHEN Google users sign in for the first time, THE System SHALL create Cognito user profiles with Google attributes
2. WHEN user profiles are created, THE System SHALL map Google profile data to Cognito user attributes
3. WHEN users update their Google profiles, THE System SHALL sync changes to Cognito user attributes
4. WHEN federated users access the system, THE System SHALL maintain consistent user IDs across sessions
5. WHEN user data conflicts occur, THE System SHALL resolve conflicts using the most recent authoritative source

### Requirement 7: Fix Authentication Error Handling

**User Story:** As a user, I want clear error messages when authentication fails, so that I understand what went wrong and how to fix it.

#### Acceptance Criteria

1. WHEN Cognito returns error codes, THE System SHALL translate them to user-friendly messages
2. WHEN Google Sign-In fails, THE System SHALL provide specific guidance based on the failure type
3. WHEN network errors occur during authentication, THE System SHALL distinguish between connectivity and service issues
4. WHEN authentication timeouts happen, THE System SHALL provide retry options with exponential backoff
5. WHEN critical authentication errors occur, THE System SHALL log detailed information for debugging while showing simple messages to users

### Requirement 8: Implement Authentication State Synchronization

**User Story:** As a user, I want consistent authentication state across all app components, so that I don't encounter unexpected sign-out issues.

#### Acceptance Criteria

1. WHEN authentication state changes, THE System SHALL broadcast updates to all app components
2. WHEN tokens are refreshed, THE System SHALL update all services with new authentication credentials
3. WHEN users sign out, THE System SHALL ensure all components are notified and clear their authentication state
4. WHEN authentication errors occur, THE System SHALL coordinate error handling across all services
5. WHEN multiple authentication operations happen simultaneously, THE System SHALL prevent race conditions and state conflicts

### Requirement 9: Fix Test User Authentication

**User Story:** As a developer, I want to test authentication with the provided test account, so that I can verify all authentication flows work correctly.

#### Acceptance Criteria

1. WHEN using test credentials "paco@paco.com" with password "Contraseña!26", THE System SHALL authenticate successfully
2. WHEN test user signs in, THE System SHALL create proper session tokens and user context
3. WHEN test user accesses protected resources, THE System SHALL authorize requests correctly
4. WHEN test user signs out, THE System SHALL properly clean up session data
5. WHEN test authentication flows are executed, THE System SHALL log detailed information for debugging

### Requirement 10: Implement Authentication Security Best Practices

**User Story:** As a security-conscious system, I want to follow authentication best practices, so that user accounts and data are properly protected.

#### Acceptance Criteria

1. WHEN storing authentication tokens, THE System SHALL use secure storage mechanisms (keychain/keystore)
2. WHEN transmitting authentication data, THE System SHALL use HTTPS and proper encryption
3. WHEN handling sensitive authentication information, THE System SHALL never log passwords or tokens in plain text
4. WHEN authentication sessions are established, THE System SHALL implement proper session timeout policies
5. WHEN suspicious authentication activity is detected, THE System SHALL implement appropriate security measures