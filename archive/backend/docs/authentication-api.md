# Trinity Authentication API Documentation

## Overview

This document provides comprehensive documentation for the Trinity authentication API endpoints, including error responses, authentication requirements, and examples for all authentication flows.

## Base URL

```
Production: https://api.trinity.com/v1
Development: https://dev-api.trinity.com/v1
Local: http://localhost:3000/v1
```

## Authentication

All protected endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

## Common Response Format

All API responses follow a consistent format:

```json
{
  "success": boolean,
  "data": object | null,
  "error": {
    "code": string,
    "message": string,
    "details": object | null
  } | null,
  "metadata": {
    "timestamp": string,
    "requestId": string,
    "version": string
  }
}
```

## Error Codes

### Authentication Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid email or password |
| `AUTH_ACCOUNT_LOCKED` | 423 | Account temporarily locked |
| `AUTH_ACCOUNT_DISABLED` | 403 | Account permanently disabled |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token has expired |
| `AUTH_TOKEN_INVALID` | 401 | Invalid or malformed token |
| `AUTH_REFRESH_TOKEN_EXPIRED` | 401 | Refresh token has expired |
| `AUTH_REFRESH_TOKEN_INVALID` | 401 | Invalid refresh token |
| `AUTH_SESSION_EXPIRED` | 401 | Session has expired |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `AUTH_MFA_REQUIRED` | 428 | Multi-factor authentication required |
| `AUTH_MFA_INVALID` | 400 | Invalid MFA code |
| `AUTH_RATE_LIMITED` | 429 | Too many authentication attempts |

### Validation Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_REQUIRED_FIELD` | 400 | Required field missing |
| `VALIDATION_INVALID_EMAIL` | 400 | Invalid email format |
| `VALIDATION_WEAK_PASSWORD` | 400 | Password doesn't meet requirements |
| `VALIDATION_PASSWORD_MISMATCH` | 400 | Password confirmation doesn't match |
| `VALIDATION_INVALID_FORMAT` | 400 | Invalid data format |

### Service Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `SERVICE_UNAVAILABLE` | 503 | Authentication service unavailable |
| `SERVICE_TIMEOUT` | 504 | Request timeout |
| `SERVICE_INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_MAINTENANCE` | 503 | Service under maintenance |

## Endpoints

### 1. Email/Password Authentication

#### POST /auth/login

Authenticate user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "rememberMe": false,
  "deviceInfo": {
    "deviceId": "device_123",
    "platform": "ios",
    "version": "1.0.0"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "profilePicture": "https://example.com/avatar.jpg",
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00Z",
      "lastLoginAt": "2024-01-15T10:30:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "refresh_token_here",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    },
    "session": {
      "sessionId": "session_123",
      "expiresAt": "2024-01-15T11:30:00Z"
    }
  },
  "metadata": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_123",
    "version": "1.0.0"
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password",
    "details": {
      "field": "credentials",
      "attemptCount": 3,
      "lockoutTime": null
    }
  },
  "metadata": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_123",
    "version": "1.0.0"
  }
}
```

#### POST /auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "firstName": "Jane",
  "lastName": "Smith",
  "acceptTerms": true,
  "deviceInfo": {
    "deviceId": "device_456",
    "platform": "android",
    "version": "1.0.0"
  }
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_456",
      "email": "newuser@example.com",
      "firstName": "Jane",
      "lastName": "Smith",
      "emailVerified": false,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "refresh_token_here",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    },
    "verificationRequired": true
  }
}
```

### 2. Google Sign-In Authentication

#### POST /auth/google

Authenticate user with Google ID token.

**Request Body:**
```json
{
  "idToken": "google_id_token_here",
  "deviceInfo": {
    "deviceId": "device_789",
    "platform": "web",
    "version": "1.0.0"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_789",
      "email": "googleuser@gmail.com",
      "firstName": "Google",
      "lastName": "User",
      "profilePicture": "https://lh3.googleusercontent.com/...",
      "provider": "google",
      "googleId": "google_user_id",
      "emailVerified": true,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refreshToken": "refresh_token_here",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    },
    "isNewUser": false
  }
}
```

### 3. Token Management

#### POST /auth/refresh

Refresh access token using refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "new_access_token_here",
      "refreshToken": "new_refresh_token_here",
      "expiresIn": 3600,
      "tokenType": "Bearer"
    }
  }
}
```

#### POST /auth/validate

Validate access token and return user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "expiresAt": "2024-01-15T11:30:00Z"
  }
}
```

#### POST /auth/revoke

Revoke refresh token (sign out).

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Token revoked successfully"
  }
}
```

### 4. Password Management

#### POST /auth/forgot-password

Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Password reset email sent",
    "resetTokenExpiry": "2024-01-15T11:30:00Z"
  }
}
```

#### POST /auth/reset-password

Reset password with reset token.

**Request Body:**
```json
{
  "resetToken": "reset_token_here",
  "newPassword": "NewSecurePassword123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Password reset successfully"
  }
}
```

#### POST /auth/change-password

Change password for authenticated user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewSecurePassword123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully"
  }
}
```

### 5. User Profile Management

#### GET /auth/profile

Get current user profile.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "profilePicture": "https://example.com/avatar.jpg",
      "emailVerified": true,
      "phoneNumber": "+1234567890",
      "phoneVerified": false,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z",
      "lastLoginAt": "2024-01-15T10:30:00Z",
      "preferences": {
        "language": "en",
        "timezone": "UTC",
        "notifications": true
      }
    }
  }
}
```

#### PUT /auth/profile

Update user profile.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "preferences": {
    "language": "en",
    "timezone": "America/New_York",
    "notifications": true
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "updatedAt": "2024-01-15T10:35:00Z"
    }
  }
}
```

### 6. Session Management

#### GET /auth/sessions

Get active sessions for current user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "session_123",
        "deviceInfo": {
          "platform": "ios",
          "version": "1.0.0",
          "deviceId": "device_123"
        },
        "ipAddress": "192.168.1.1",
        "location": {
          "country": "US",
          "city": "New York"
        },
        "createdAt": "2024-01-15T10:30:00Z",
        "lastActivity": "2024-01-15T10:35:00Z",
        "isCurrent": true
      }
    ]
  }
}
```

#### DELETE /auth/sessions/:sessionId

Terminate specific session.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Session terminated successfully"
  }
}
```

#### DELETE /auth/sessions

Terminate all sessions except current.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "All other sessions terminated",
    "terminatedCount": 3
  }
}
```

### 7. Security Endpoints

#### GET /auth/security/events

Get security events for current user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `limit` (optional): Number of events to return (default: 50, max: 100)
- `offset` (optional): Offset for pagination (default: 0)
- `type` (optional): Filter by event type
- `severity` (optional): Filter by severity level

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "event_123",
        "type": "login_success",
        "severity": "info",
        "timestamp": "2024-01-15T10:30:00Z",
        "ipAddress": "192.168.1.1",
        "location": {
          "country": "US",
          "city": "New York"
        },
        "deviceInfo": {
          "platform": "ios",
          "version": "1.0.0"
        },
        "details": {
          "userAgent": "Trinity iOS App 1.0.0"
        }
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

#### POST /auth/security/report

Report suspicious activity.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "type": "suspicious_login",
  "description": "I didn't log in from this location",
  "eventId": "event_123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "reportId": "report_123",
    "message": "Security report submitted successfully"
  }
}
```

## Rate Limiting

All authentication endpoints are rate limited to prevent abuse:

- **Login attempts**: 5 attempts per 15 minutes per IP
- **Registration**: 3 attempts per hour per IP
- **Password reset**: 3 attempts per hour per email
- **Token refresh**: 10 requests per minute per user
- **General API**: 100 requests per minute per user

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1642248000
```

## Security Headers

All responses include security headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'
```

## Webhook Events

Authentication events can be sent to configured webhooks:

### Event Types

- `user.created` - New user registration
- `user.login` - Successful login
- `user.logout` - User logout
- `user.password_changed` - Password change
- `user.profile_updated` - Profile update
- `security.suspicious_login` - Suspicious login detected
- `security.account_locked` - Account locked due to security

### Webhook Payload

```json
{
  "event": "user.login",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "userId": "user_123",
    "email": "user@example.com",
    "ipAddress": "192.168.1.1",
    "deviceInfo": {
      "platform": "ios",
      "version": "1.0.0"
    }
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { TrinityAuth } from '@trinity/auth-sdk';

const auth = new TrinityAuth({
  baseUrl: 'https://api.trinity.com/v1',
  apiKey: 'your_api_key'
});

// Login
try {
  const result = await auth.login({
    email: 'user@example.com',
    password: 'password123'
  });
  console.log('Login successful:', result.user);
} catch (error) {
  console.error('Login failed:', error.message);
}

// Google Sign-In
try {
  const result = await auth.googleSignIn(googleIdToken);
  console.log('Google sign-in successful:', result.user);
} catch (error) {
  console.error('Google sign-in failed:', error.message);
}
```

### React Native

```typescript
import { TrinityAuthRN } from '@trinity/auth-react-native';

const auth = new TrinityAuthRN({
  baseUrl: 'https://api.trinity.com/v1'
});

// Auto token refresh
auth.onTokenRefresh((tokens) => {
  console.log('Tokens refreshed:', tokens);
});

// Authentication state changes
auth.onAuthStateChange((user) => {
  if (user) {
    console.log('User signed in:', user);
  } else {
    console.log('User signed out');
  }
});
```

## Testing

### Test Credentials

For development and testing, use these test accounts:

```
Email: paco@paco.com
Password: Contraseña!26
```

### Mock Responses

Enable mock responses by adding the header:

```
X-Trinity-Mock: true
```

## Support

For API support and questions:

- Documentation: https://docs.trinity.com/auth
- Support Email: api-support@trinity.com
- Status Page: https://status.trinity.com
- GitHub Issues: https://github.com/trinity/api/issues

## Changelog

### Version 1.0.0 (2024-01-15)
- Initial release
- Email/password authentication
- Google Sign-In integration
- JWT token management
- Session management
- Security monitoring
- Rate limiting
- Comprehensive error handling