import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

// ─── JwtAuthGuard ──────────────────────────────────────────────────────────────
// Reads the Authorization: Bearer <token> header, verifies the JWT,
// and attaches the decoded payload to request.user.
//
// Usage: @UseGuards(JwtAuthGuard) on controller or handler.

export interface JwtPayload {
  sub: string;         // userId
  orgId: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      // Attach to request so controllers can access via @CurrentUser()
      (request as Request & { user: JwtPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}
