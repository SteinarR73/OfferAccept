import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { JwtTokenService } from './jwt.service';
import { LoginLockoutService } from './login-lockout.service';

// ─── AuthFeatureModule ────────────────────────────────────────────────────────
// Full authentication feature module.
//
// JWT infrastructure (JwtService, JwtAuthGuard) comes from the global AuthModule
// in common/auth. This module provides the auth-specific business logic on top.
//
// RateLimitService and REDIS_CLIENT are provided globally — no explicit import
// needed here.

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    PasswordService,
    SessionService,
    JwtTokenService,
    LoginLockoutService,
  ],
  exports: [AuthService, SessionService],
})
export class AuthFeatureModule {}
