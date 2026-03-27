import * as net from 'net';
import * as dns from 'dns/promises';
import { registerDecorator, ValidationOptions } from 'class-validator';

// ─── WebhookUrlValidator ────────────────────────────────────────────────────────
// Two-stage SSRF protection for customer-supplied webhook destination URLs.
//
// Stage 1 — syntactic (registration time, sync):
//   Called by @IsWebhookUrl() in DTOs and by WebhookService directly.
//   Rejects obviously unsafe URLs without a network round-trip:
//     - Non-HTTPS scheme
//     - IP address literals in the hostname (no legitimate webhook uses a raw IP)
//     - Bare hostnames with no dot (internal names: "api", "myservice")
//     - 'localhost' and '0.0.0.0' (explicit block; would survive require_tld anyway
//       if normalised to localhost.localdomain in some environments)
//     - Embedded credentials (user:pass@host)
//     - SMTP ports 25 / 8025 (prevents being used as a relay)
//
// Stage 2 — DNS (delivery time, async):
//   Called by WebhookService.validateUrl() which SendWebhookHandler invokes
//   before each HTTP attempt. Resolves the hostname and checks all returned
//   IPs against private/reserved ranges. Protects against:
//     - SSRF via "looks public, resolves private" domain names
//     - DNS rebinding attacks between registration and first delivery
//
// Private IPv4 ranges blocked:
//   10.0.0.0/8       RFC 1918 private
//   172.16.0.0/12    RFC 1918 private
//   192.168.0.0/16   RFC 1918 private
//   127.0.0.0/8      loopback
//   169.254.0.0/16   link-local + cloud IMDS (169.254.169.254)
//   0.0.0.0/8        unspecified
//   100.64.0.0/10    shared address space (RFC 6598)
//   240.0.0.0/4      reserved
//
// Private IPv6 ranges blocked:
//   ::1              loopback
//   fe80::/10        link-local
//   fc00::/7         unique-local (fc00:: and fd00::)
//   ::ffff:x         IPv4-mapped addresses (inner IPv4 is checked separately)

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

// ── IPv4 numeric helpers ───────────────────────────────────────────────────────

function ipv4ToNum(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number);
  // Unsigned 32-bit integer
  return ((a * 256 + b) * 256 + c) * 256 + d;
}

// Inclusive [networkStart, networkEnd] ranges.
const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [ipv4ToNum('10.0.0.0'),    ipv4ToNum('10.255.255.255')],   // RFC 1918 /8
  [ipv4ToNum('172.16.0.0'),  ipv4ToNum('172.31.255.255')],   // RFC 1918 /12
  [ipv4ToNum('192.168.0.0'), ipv4ToNum('192.168.255.255')],  // RFC 1918 /16
  [ipv4ToNum('127.0.0.0'),   ipv4ToNum('127.255.255.255')],  // loopback /8
  [ipv4ToNum('169.254.0.0'), ipv4ToNum('169.254.255.255')],  // link-local + IMDS
  [ipv4ToNum('0.0.0.0'),     ipv4ToNum('0.255.255.255')],    // unspecified /8
  [ipv4ToNum('100.64.0.0'),  ipv4ToNum('100.127.255.255')],  // shared space RFC 6598 /10
  [ipv4ToNum('240.0.0.0'),   ipv4ToNum('255.255.255.255')],  // reserved /4 (includes 255.*)
] as const;

// ── isPrivateIp ────────────────────────────────────────────────────────────────

// Returns true if the IP is in any private, loopback, link-local, or reserved range.
// Used by the DNS check to evaluate resolved addresses from customer hostnames.
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = ipv4ToNum(ip);
    return PRIVATE_IPV4_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();

    // ::1 — loopback
    if (lower === '::1') return true;

    // fe80::/10 — link-local (fe80:: through febf::)
    // First 16-bit group ranges from 0xfe80 to 0xfebf:
    //   second nibble of second byte is 8–b → fe[89ab][0-9a-f]
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;

    // fc00::/7 — unique-local (fc00:: through fdff::)
    //   first byte is 0xfc or 0xfd
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;

    // ::ffff:A.B.C.D — IPv4-mapped; check the embedded IPv4 address
    const v4Mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4Mapped?.[1]) {
      return isPrivateIp(v4Mapped[1]);
    }
  }

  return false;
}

// ── Stage 1: syntactic validation ─────────────────────────────────────────────

const BLOCKED_EXACT_HOSTNAMES = new Set(['localhost', '0.0.0.0']);
const BLOCKED_PORTS = new Set([25, 8025]); // SMTP — avoid relay abuse

export function validateWebhookUrl(url: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Webhook URLs must use HTTPS.' };
  }

  // Embedded credentials are a security anti-pattern and likely indicate misconfiguration
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Credentials embedded in webhook URLs are not allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block raw IP address literals.
  // net.isIP() returns 4 for IPv4, 6 for IPv6, 0 for non-IP.
  if (net.isIP(hostname) !== 0) {
    return {
      valid: false,
      reason:
        'IP address literals are not allowed in webhook URLs. Use a publicly routable domain name.',
    };
  }

  // Block known dangerous bare hostnames
  if (BLOCKED_EXACT_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: `The hostname '${hostname}' is not allowed.` };
  }

  // Block bare names with no dot (internal service names like "api", "myservice")
  // that only resolve inside private networks
  if (!hostname.includes('.')) {
    return {
      valid: false,
      reason: 'Webhook URL must use a publicly accessible fully qualified domain name.',
    };
  }

  // Block SMTP ports to prevent SSRF relay abuse
  if (parsed.port) {
    const port = parseInt(parsed.port, 10);
    if (BLOCKED_PORTS.has(port)) {
      return { valid: false, reason: `Port ${port} is not allowed for webhook delivery.` };
    }
  }

  return { valid: true };
}

// ── Stage 2: DNS-based validation ─────────────────────────────────────────────

// Resolves the hostname and verifies all returned addresses are in public IP space.
// Called at delivery time by WebhookService.validateUrl() → SendWebhookHandler.
//
// Design decisions:
//   - DNS resolution failure (ENOTFOUND, SERVFAIL) is treated as valid here —
//     the subsequent fetch() will fail anyway and pg-boss will retry normally.
//     Only confirmed private-IP resolution is a permanent SSRF block.
//   - resolve4 + resolve6 are checked independently so both A and AAAA records
//     are validated. An attacker cannot circumvent the check by using only AAAA.
//
// resolver parameter: injected for unit testing (avoids live DNS in tests).
export async function validateWebhookUrlDns(
  url: string,
  resolver: {
    resolve4(hostname: string): Promise<string[]>;
    resolve6(hostname: string): Promise<string[]>;
  } = dns,
): Promise<UrlValidationResult> {
  const syntaxCheck = validateWebhookUrl(url);
  if (!syntaxCheck.valid) return syntaxCheck;

  const hostname = new URL(url).hostname;
  const resolved: string[] = [];

  try {
    const v4 = await resolver.resolve4(hostname);
    resolved.push(...v4);
  } catch {
    // No A records or DNS failure — let fetch() determine reachability
  }

  try {
    const v6 = await resolver.resolve6(hostname);
    resolved.push(...v6);
  } catch {
    // No AAAA records
  }

  for (const ip of resolved) {
    if (isPrivateIp(ip)) {
      return {
        valid: false,
        reason:
          `Hostname '${hostname}' resolves to a reserved or private IP address. ` +
          `Delivery blocked (SSRF protection).`,
      };
    }
  }

  return { valid: true };
}

// ── class-validator decorator ──────────────────────────────────────────────────
//
// Replaces @IsUrl({ protocols: ['https'], require_tld: true }) in DTOs.
// Applies Stage 1 (syntactic) validation synchronously at request time.
// Stage 2 (DNS) runs at delivery time via WebhookService.validateUrl().

export function IsWebhookUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isWebhookUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return validateWebhookUrl(value).valid;
        },
        defaultMessage(): string {
          return (
            'Webhook URL must be a valid HTTPS URL with a publicly routable fully qualified ' +
            'domain name. IP address literals and internal hostnames are not permitted.'
          );
        },
      },
    });
  };
}
