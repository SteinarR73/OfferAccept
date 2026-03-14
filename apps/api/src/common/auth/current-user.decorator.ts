import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './jwt-auth.guard';

// ─── @CurrentUser() ────────────────────────────────────────────────────────────
// Parameter decorator that extracts the authenticated user from the request.
// Only valid inside handlers protected by JwtAuthGuard.
//
// Usage: async myHandler(@CurrentUser() user: JwtPayload) { ... }

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
