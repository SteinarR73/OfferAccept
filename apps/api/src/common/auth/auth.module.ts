import { Module, Global } from '@nestjs/common';
import { JwtModule, JwtModuleOptions, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';

// ─── AuthModule ────────────────────────────────────────────────────────────────
// Provides JwtService for token signing/verification and JwtAuthGuard.
//
// @Global() makes JwtService and JwtAuthGuard available application-wide
// without each feature module needing to import JwtModule separately.

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // JWT_ACCESS_TTL controls the short-lived access token lifetime (default: 15m).
        // This replaces the old JWT_EXPIRY (7d) default which was too long.
        // Cast required: @types/jsonwebtoken@9 narrows expiresIn to StringValue | number,
        // but ConfigService.get() returns plain string. Runtime value is always a valid
        // ms duration string (e.g. "15m", "1h").
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', '15m') as unknown as number },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [JwtAuthGuard],
  // JwtModule exports JwtService; re-exporting JwtModule makes JwtService
  // available to any module that imports AuthModule.
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}

// Re-export so feature modules can type-hint without importing @nestjs/jwt directly
export { JwtService };
