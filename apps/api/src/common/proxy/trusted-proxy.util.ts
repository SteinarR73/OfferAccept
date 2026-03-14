import { Request } from 'express';

// ─── Trusted proxy IP extraction ──────────────────────────────────────────────
//
// X-Forwarded-For is only trusted when the request arrives from a known proxy.
// Blindly trusting it allows any client to forge their IP address, which breaks
// rate limiting, audit logging, and any IP-based access control.
//
// Environment variable: TRUSTED_PROXY_CIDR
//   Comma-separated list of IPv4 CIDR ranges whose X-Forwarded-For header
//   should be trusted, e.g. "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
//   Leave unset to never trust X-Forwarded-For (direct clients only).
//
// Algorithm:
//   1. Read the TCP socket's remote address (always authentic).
//   2. If that address is within a trusted CIDR range, use the leftmost IP
//      from X-Forwarded-For (the original client).
//   3. Otherwise use the socket address directly.
//
// IPv6 handling: the socket address for local traffic is often ::ffff:127.0.0.1
// or ::1. We strip the ::ffff: prefix to normalise to a dotted-quad IPv4 string.

const TRUSTED_CIDRS: Array<{ network: number; mask: number }> = parseTrustedCidrs();

export function extractClientIp(req: Request): string {
  const socketAddr = normalizeIp(req.socket?.remoteAddress ?? '');

  if (TRUSTED_CIDRS.length > 0 && isInAnyTrustedCidr(socketAddr)) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      const firstIp = forwarded.split(',')[0].trim();
      if (firstIp) return firstIp;
    }
  }

  return socketAddr || 'unknown';
}

// ── Private helpers ────────────────────────────────────────────────────────────

function normalizeIp(raw: string): string {
  // Strip IPv4-mapped IPv6 prefix: ::ffff:1.2.3.4 → 1.2.3.4
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  // Loopback IPv6
  if (raw === '::1') return '127.0.0.1';
  return raw;
}

function isInAnyTrustedCidr(ip: string): boolean {
  const ipNum = ipv4ToNum(ip);
  if (ipNum === null) return false;
  return TRUSTED_CIDRS.some(({ network, mask }) => (ipNum & mask) === (network & mask));
}

function ipv4ToNum(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  // JavaScript bitwise ops are signed 32-bit; convert to unsigned
  return num >>> 0;
}

function parseTrustedCidrs(): Array<{ network: number; mask: number }> {
  const raw = process.env.TRUSTED_PROXY_CIDR ?? '';
  if (!raw.trim()) return [];

  const results: Array<{ network: number; mask: number }> = [];

  for (const entry of raw.split(',')) {
    const cidr = entry.trim();
    if (!cidr) continue;

    const slashIdx = cidr.indexOf('/');
    if (slashIdx < 0) {
      // Treat as /32 (exact host match)
      const num = ipv4ToNum(cidr);
      if (num !== null) results.push({ network: num, mask: 0xffffffff });
      continue;
    }

    const host = cidr.slice(0, slashIdx);
    const prefixLen = parseInt(cidr.slice(slashIdx + 1), 10);

    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) continue;

    const networkNum = ipv4ToNum(host);
    if (networkNum === null) continue;

    // Build mask: prefixLen=24 → 0xffffff00
    const mask = prefixLen === 0 ? 0 : (~((1 << (32 - prefixLen)) - 1)) >>> 0;
    results.push({ network: networkNum & mask, mask });
  }

  return results;
}
