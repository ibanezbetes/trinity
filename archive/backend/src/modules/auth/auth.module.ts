import { Module, forwardRef, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { GoogleAuthController } from './google-auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { FederatedUserManagementService } from './federated-user-management.service';
import { FederatedSessionManagementService } from './federated-session-management.service';
import { GoogleAuthAnalyticsService } from './google-auth-analytics.service';
import { AuthStatusCodeService } from './services/auth-status-code.service';
import { UserContextMiddleware } from './middleware/user-context.middleware';
import { CognitoJwtStrategy } from './strategies/cognito-jwt.strategy';
import { CognitoService } from '../../infrastructure/cognito/cognito.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    PassportModule, 
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService, 
    GoogleAuthService, 
    CognitoService, 
    CognitoJwtStrategy,
    FederatedUserManagementService,
    FederatedSessionManagementService,
    GoogleAuthAnalyticsService,
    AuthStatusCodeService,
    UserContextMiddleware,
  ],
  exports: [
    AuthService, 
    GoogleAuthService, 
    CognitoService,
    FederatedUserManagementService,
    FederatedSessionManagementService,
    GoogleAuthAnalyticsService,
    AuthStatusCodeService,
    UserContextMiddleware,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply user context middleware to all routes except auth endpoints
    consumer
      .apply(UserContextMiddleware)
      .exclude(
        'auth/login',
        'auth/register',
        'auth/confirm-signup',
        'auth/resend-confirmation',
        'auth/forgot-password',
        'auth/reset-password',
        'auth/refresh-token',
        'auth/google/(.*)',
      )
      .forRoutes('*');
  }
}
