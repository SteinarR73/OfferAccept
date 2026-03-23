import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { Request, Response } from 'express';

// ─── RequestIdInterceptor ──────────────────────────────────────────────────────
// Attaches a unique X-Request-ID header to every response.
//
// If the incoming request already carries an X-Request-ID header, that value is
// echoed back (useful when API gateways / load balancers generate IDs). Otherwise
// a new UUID v4 is generated. The value is also set on req.id so downstream code
// (loggers, error handlers) can reference it without re-parsing the response.
//
// Security: we truncate any caller-supplied value to 128 characters to prevent
// header-inflation attacks and strip non-printable ASCII.

const MAX_ID_LENGTH = 128;
const SAFE_ID_PATTERN = /^[\x20-\x7E]{1,128}$/;

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();

    const incoming = req.headers['x-request-id'];
    const raw = Array.isArray(incoming) ? incoming[0] : incoming;

    const requestId =
      typeof raw === 'string' && SAFE_ID_PATTERN.test(raw.slice(0, MAX_ID_LENGTH))
        ? raw.slice(0, MAX_ID_LENGTH)
        : crypto.randomUUID();

    req.id = requestId;
    res.setHeader('X-Request-ID', requestId);

    return next.handle();
  }
}
