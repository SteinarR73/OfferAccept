import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';

// ─── AuthModule (feature) ─────────────────────────────────────────────────────
// Thin feature module — only the login controller lives here.
// JWT infrastructure (JwtService, JwtAuthGuard) comes from the global
// AuthModule in common/auth.

@Module({
  controllers: [AuthController],
})
export class AuthFeatureModule {}
