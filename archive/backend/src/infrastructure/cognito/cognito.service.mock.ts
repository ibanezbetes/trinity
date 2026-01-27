import { Injectable } from '@nestjs/common';
import { CognitoUser, AuthResult } from './cognito.service';

@Injectable()
export class MockCognitoService {
  async signUp(
    email: string,
    username: string,
    password: string,
    phoneNumber?: string,
  ): Promise<{ userSub: string }> {
    return { userSub: `mock-user-${Date.now()}` };
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const mockUser: CognitoUser = {
      sub: `mock-user-${Date.now()}`,
      email,
      username: email.split('@')[0],
      email_verified: true,
      phone_number: '+1234567890',
      phone_number_verified: false,
    };

    return {
      accessToken: 'mock-access-token',
      idToken: 'mock-id-token',
      refreshToken: 'mock-refresh-token',
      user: mockUser,
    };
  }

  async getUserFromToken(accessToken: string): Promise<CognitoUser> {
    return {
      sub: 'mock-user-sub',
      email: 'test@example.com',
      username: 'testuser',
      email_verified: true,
      phone_number: undefined,
      phone_number_verified: false,
    };
  }

  async confirmSignUp(email: string, confirmationCode: string): Promise<void> {
    // Mock implementation - do nothing
  }

  async resendConfirmationCode(email: string): Promise<void> {
    // Mock implementation - do nothing
  }

  async forgotPassword(email: string): Promise<void> {
    // Mock implementation - do nothing
  }

  async confirmForgotPassword(
    email: string,
    confirmationCode: string,
    newPassword: string,
  ): Promise<void> {
    // Mock implementation - do nothing
  }

  async deleteUser(email: string): Promise<void> {
    // Mock implementation - do nothing
  }

  async validateAccessToken(accessToken: string): Promise<CognitoUser | null> {
    if (accessToken === 'invalid-token') {
      return null;
    }

    return {
      sub: 'mock-user-sub',
      email: 'test@example.com',
      username: 'testuser',
      email_verified: true,
      phone_number: undefined,
      phone_number_verified: false,
    };
  }
}
