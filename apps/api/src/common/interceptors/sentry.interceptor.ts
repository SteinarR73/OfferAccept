import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import type { Request } from 'express';
import type { JwtPayload } from '../auth/jwt-auth.guard';
import { TraceContext } from '../trace/trace.context';

// ─── SentryInterceptor ────────────────────────────────────────────────────────
// Attaches request-scoped metadata to the Sentry scope for every request:
//   - requestId  (from X-Request-ID / TraceContext)
//   - endpoint   (method + path)
//   - organizationId (if JWT is present)
//
// Does NOT capture errors itself — Sentry's NestJS integration hooks into the
// uncaught exception layer automatically. This interceptor only enriches scope.
//
// Sensitive data policy:
//   - Never sets user.email or user.username (PII)
//   - Never sets request body (may contain OTP codes, document data)
//   - Only sets non-PII structural metadata

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  constructor(private readonly traceContext: TraceContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isSentryLoaded = this.hasSentry();
    if (!isSentryLoaded) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as Request & { user?: JwtPayload }).user;
    const requestId = this.traceContext.get();
    const endpoint = `${req.method} ${req.route?.path ?? req.path}`;

    this.withScope(requestId, endpoint, user?.orgId);

    return next.handle().pipe(
      catchError((err: unknown) => {
        this.captureError(err, requestId, endpoint, user?.orgId);
        return throwError(() => err);
      }),
    );
  }

  private hasSentry(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@sentry/node');
      return !!process.env['SENTRY_DSN'];
    } catch {
      return false;
    }
  }

  private withScope(requestId?: string, endpoint?: string, orgId?: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node') as typeof import('@sentry/node');
      Sentry.setTag('requestId', requestId ?? '');
      Sentry.setTag('endpoint', endpoint ?? '');
      if (orgId) Sentry.setTag('organizationId', orgId);
    } catch {
      // Sentry not available — no-op
    }
  }

  private captureError(err: unknown, requestId?: string, endpoint?: string, orgId?: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/node') as typeof import('@sentry/node');
      Sentry.withScope((scope) => {
        scope.setTag('requestId', requestId ?? '');
        scope.setTag('endpoint', endpoint ?? '');
        if (orgId) scope.setTag('organizationId', orgId);
        Sentry.captureException(err);
      });
    } catch {
      // Sentry not available — no-op
    }
  }
}
