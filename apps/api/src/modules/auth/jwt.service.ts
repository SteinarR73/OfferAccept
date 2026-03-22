import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../common/auth/jwt-auth.guard';

// ─── JwtTokenService ───────────────────────────────────────────────────────────
// Thin wrapper around @nestjs/jwt's JwtService for access-token operations.
//
// Access tokens are short-lived JWTs (15m default).
// TTL is configured via JWT_ACCESS_TTL in env.ts and passed to JwtModule.registerAsync
// as signOptions.expiresIn — no need to pass it here.
//
// Refresh tokens are NOT JWTs — they are handled by SessionService.

export interface AccessTokenPayload {
  sub: string;       // userId
  orgId: string;     // primary org from Membership
  orgRole: string;   // OrgRole from Membership (OWNER/ADMIN/MEMBER/VIEWER)
  role: string;      // platform UserRole (OWNER/ADMIN/MEMBER/INTERNAL_SUPPORT)
  sessionId: string;
}

@Injectable()
export class JwtTokenService {
  constructor(private readonly jwtService: NestJwtService) {}

  sign(payload: AccessTokenPayload): string {
    return this.jwtService.sign(payload);
  }

  verify(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }
}
