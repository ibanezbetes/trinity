import { Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { SecurityMiddleware } from './middleware/security.middleware';
import { RateLimitingGuard } from './guards/rate-limiting.guard';
import { IPWhitelistGuard } from './guards/ip-whitelist.guard';
import { InputSanitizationPipe } from './pipes/input-sanitization.pipe';
import { ProductionErrorFilter } from './filters/production-error.filter';
import { SecurityInterceptor } from './interceptors/security.interceptor';
import { EnvironmentValidator } from './validators/environment.validator';
import { SecurityController } from './security.controller';
import { PublicSecurityController } from './controllers/public-security.controller';
import { SecurityService } from './security.service';
import { SecurityLoggerService } from './services/security-logger.service';

@Module({
  imports: [
    // Rate limiting configuration
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 10000, // 10 seconds
        limit: 50, // 50 requests per 10 seconds
      },
      {
        name: 'long',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),
  ],
  controllers: [SecurityController, PublicSecurityController],
  providers: [
    SecurityService,
    SecurityLoggerService,
    EnvironmentValidator,
    IPWhitelistGuard,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitingGuard,
    },
    {
      provide: APP_PIPE,
      useClass: InputSanitizationPipe,
    },
    {
      provide: APP_FILTER,
      useClass: ProductionErrorFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: SecurityInterceptor,
    },
  ],
  exports: [SecurityService, SecurityLoggerService, EnvironmentValidator, IPWhitelistGuard],
})
export class SecurityModule {}