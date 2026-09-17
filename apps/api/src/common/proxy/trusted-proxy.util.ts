import { Request } from 'express';

// ─── Trusted proxy IP extraction ──────────────────────────────────────────────
//
// We rely on Express's native 'trust proxy' setting which is configured in main.ts.
// Express correctly parses X-Forwarded-For, handles IPv4/IPv6 CIDR ranges, and
// prevents IP spoofing by picking the rightmost untrusted IP.

export function extractClientIp(req: Request): string {
  // req.ip is populated by Express if 'trust proxy' is configured.
  // It falls back to req.socket.remoteAddress if no trusted proxy is used.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

