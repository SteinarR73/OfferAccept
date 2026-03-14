import { Module, Global } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
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
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRY', '7d') },
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
