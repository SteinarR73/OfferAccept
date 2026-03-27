import {
  isPrivateIp,
  validateWebhookUrl,
  validateWebhookUrlDns,
} from '../../src/modules/enterprise/webhook-url.validator';

// ─── Webhook URL validator tests ───────────────────────────────────────────────
//
// Covers both stages of SSRF protection:
//
// Stage 1 — syntactic (validateWebhookUrl):
//   - HTTPS required
//   - IP literals rejected (IPv4 and IPv6)
//   - localhost and 0.0.0.0 blocked
//   - Bare hostnames (no dot) blocked
//   - Embedded credentials blocked
//   - SMTP port 25 blocked
//   - Valid HTTPS URLs with public domains accepted
//
// Stage 2 — DNS (validateWebhookUrlDns with injected resolver):
//   - Hostname resolving to private IPv4 ranges → blocked
//   - Hostname resolving to loopback → blocked
//   - Hostname resolving to link-local / IMDS → blocked
//   - Hostname resolving to public IP → allowed
//   - DNS resolution failure → allowed (delivery failure, pg-boss retries)
//
// isPrivateIp() range coverage:
//   10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8,
//   169.254.0.0/16, 0.0.0.0/8, 100.64.0.0/10, 240.0.0.0/4, ::1,
//   fe80::/10, fc00::/7, ::ffff:IPv4-mapped

// ── isPrivateIp() ──────────────────────────────────────────────────────────────

describe('isPrivateIp()', () => {
  // ── RFC1918 ──────────────────────────────────────────────────────────────────
  it('10.0.0.0/8 — start of range', () => expect(isPrivateIp('10.0.0.0')).toBe(true));
  it('10.0.0.1 — RFC1918', () => expect(isPrivateIp('10.0.0.1')).toBe(true));
  it('10.255.255.255 — end of 10/8', () => expect(isPrivateIp('10.255.255.255')).toBe(true));
  it('172.16.0.0 — RFC1918 /12 start', () => expect(isPrivateIp('172.16.0.0')).toBe(true));
  it('172.31.255.255 — RFC1918 /12 end', () => expect(isPrivateIp('172.31.255.255')).toBe(true));
  it('172.15.255.255 — just below RFC1918 /12', () => expect(isPrivateIp('172.15.255.255')).toBe(false));
  it('172.32.0.0 — just above RFC1918 /12', () => expect(isPrivateIp('172.32.0.0')).toBe(false));
  it('192.168.0.0 — RFC1918 /16', () => expect(isPrivateIp('192.168.0.0')).toBe(true));
  it('192.168.1.1 — RFC1918', () => expect(isPrivateIp('192.168.1.1')).toBe(true));
  it('192.168.255.255 — RFC1918 /16 end', () => expect(isPrivateIp('192.168.255.255')).toBe(true));

  // ── Loopback ─────────────────────────────────────────────────────────────────
  it('127.0.0.1 — loopback', () => expect(isPrivateIp('127.0.0.1')).toBe(true));
  it('127.255.255.255 — loopback end', () => expect(isPrivateIp('127.255.255.255')).toBe(true));

  // ── Link-local / IMDS ────────────────────────────────────────────────────────
  it('169.254.169.254 — AWS IMDS', () => expect(isPrivateIp('169.254.169.254')).toBe(true));
  it('169.254.0.1 — link-local start', () => expect(isPrivateIp('169.254.0.1')).toBe(true));
  it('169.254.255.255 — link-local end', () => expect(isPrivateIp('169.254.255.255')).toBe(true));

  // ── Unspecified / reserved ────────────────────────────────────────────────────
  it('0.0.0.0 — unspecified', () => expect(isPrivateIp('0.0.0.0')).toBe(true));
  it('0.255.255.255 — unspecified end', () => expect(isPrivateIp('0.255.255.255')).toBe(true));
  it('100.64.0.0 — shared address space start (RFC 6598)', () => expect(isPrivateIp('100.64.0.0')).toBe(true));
  it('100.127.255.255 — shared address space end', () => expect(isPrivateIp('100.127.255.255')).toBe(true));
  it('240.0.0.0 — reserved /4 start', () => expect(isPrivateIp('240.0.0.0')).toBe(true));

  // ── Public IPs — must return false ────────────────────────────────────────────
  it('8.8.8.8 — public (Google DNS)', () => expect(isPrivateIp('8.8.8.8')).toBe(false));
  it('1.1.1.1 — public (Cloudflare)', () => expect(isPrivateIp('1.1.1.1')).toBe(false));
  it('93.184.216.34 — public (example.com)', () => expect(isPrivateIp('93.184.216.34')).toBe(false));
  it('172.15.0.0 — just below 172.16 private range', () => expect(isPrivateIp('172.15.0.0')).toBe(false));
  it('192.167.255.255 — just below 192.168 private range', () => expect(isPrivateIp('192.167.255.255')).toBe(false));

  // ── IPv6 ─────────────────────────────────────────────────────────────────────
  it('::1 — IPv6 loopback', () => expect(isPrivateIp('::1')).toBe(true));
  it('fe80::1 — IPv6 link-local', () => expect(isPrivateIp('fe80::1')).toBe(true));
  it('fe80::dead:beef — IPv6 link-local', () => expect(isPrivateIp('fe80::dead:beef')).toBe(true));
  it('fc00::1 — IPv6 unique-local', () => expect(isPrivateIp('fc00::1')).toBe(true));
  it('fd12:3456:789a::1 — IPv6 unique-local (fd::/8)', () => expect(isPrivateIp('fd12:3456:789a::1')).toBe(true));
  it('::ffff:10.0.0.1 — IPv4-mapped private', () => expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true));
  it('::ffff:192.168.1.1 — IPv4-mapped RFC1918', () => expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true));
  it('::ffff:8.8.8.8 — IPv4-mapped public', () => expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false));
  it('2001:db8::1 — documentation range (not blocked)', () => expect(isPrivateIp('2001:db8::1')).toBe(false));
  it('2606:4700::1111 — public IPv6 (Cloudflare)', () => expect(isPrivateIp('2606:4700::1111')).toBe(false));
});

// ── validateWebhookUrl() — Stage 1 syntactic ──────────────────────────────────

describe('validateWebhookUrl() — REJECTED', () => {
  // ── Scheme ───────────────────────────────────────────────────────────────────
  it('rejects http:// scheme', () => {
    expect(validateWebhookUrl('http://example.com/hook').valid).toBe(false);
  });

  it('rejects ftp:// scheme', () => {
    expect(validateWebhookUrl('ftp://example.com/hook').valid).toBe(false);
  });

  it('rejects garbage string', () => {
    expect(validateWebhookUrl('not-a-url').valid).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateWebhookUrl('').valid).toBe(false);
  });

  // ── IPv4 literals ─────────────────────────────────────────────────────────────
  it('rejects private IPv4 literal: 192.168.1.1', () => {
    expect(validateWebhookUrl('https://192.168.1.1/hook').valid).toBe(false);
  });

  it('rejects public IPv4 literal: 8.8.8.8', () => {
    // Even public IPs are blocked — no legitimate webhook uses a raw IP
    expect(validateWebhookUrl('https://8.8.8.8/hook').valid).toBe(false);
  });

  it('rejects AWS IMDS IPv4 literal: 169.254.169.254', () => {
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data/').valid).toBe(false);
  });

  it('rejects loopback IPv4 literal: 127.0.0.1', () => {
    expect(validateWebhookUrl('https://127.0.0.1/hook').valid).toBe(false);
  });

  it('rejects 10.x.x.x IPv4 literal', () => {
    expect(validateWebhookUrl('https://10.0.0.1/hook').valid).toBe(false);
  });

  // ── IPv6 literals ─────────────────────────────────────────────────────────────
  it('rejects IPv6 loopback literal: [::1]', () => {
    expect(validateWebhookUrl('https://[::1]/hook').valid).toBe(false);
  });

  it('rejects IPv6 link-local literal: [fe80::1]', () => {
    expect(validateWebhookUrl('https://[fe80::1]/hook').valid).toBe(false);
  });

  it('rejects public IPv6 literal: [2606:4700::1111]', () => {
    // IPs are always rejected — not just private ones
    expect(validateWebhookUrl('https://[2606:4700::1111]/hook').valid).toBe(false);
  });

  // ── Known dangerous hostnames ─────────────────────────────────────────────────
  it('rejects localhost', () => {
    // require_tld would catch this too, but we block explicitly
    expect(validateWebhookUrl('https://localhost/hook').valid).toBe(false);
  });

  // ── Bare hostnames (no TLD) ────────────────────────────────────────────────────
  it('rejects bare internal name "myservice"', () => {
    expect(validateWebhookUrl('https://myservice/hook').valid).toBe(false);
  });

  it('rejects bare internal name "api"', () => {
    expect(validateWebhookUrl('https://api/hook').valid).toBe(false);
  });

  // ── Embedded credentials ───────────────────────────────────────────────────────
  it('rejects URL with username', () => {
    expect(validateWebhookUrl('https://user@example.com/hook').valid).toBe(false);
  });

  it('rejects URL with username:password', () => {
    expect(validateWebhookUrl('https://user:pass@example.com/hook').valid).toBe(false);
  });

  // ── SMTP port ─────────────────────────────────────────────────────────────────
  it('rejects port 25 (SMTP)', () => {
    expect(validateWebhookUrl('https://example.com:25/hook').valid).toBe(false);
  });

  it('rejects port 8025 (alternate SMTP)', () => {
    expect(validateWebhookUrl('https://example.com:8025/hook').valid).toBe(false);
  });
});

describe('validateWebhookUrl() — ACCEPTED', () => {
  it('accepts plain HTTPS URL', () => {
    expect(validateWebhookUrl('https://example.com/hook').valid).toBe(true);
  });

  it('accepts HTTPS URL with path and query string', () => {
    expect(validateWebhookUrl('https://hooks.example.com/webhook?version=2').valid).toBe(true);
  });

  it('accepts HTTPS URL with non-SMTP custom port', () => {
    expect(validateWebhookUrl('https://example.com:8443/hook').valid).toBe(true);
  });

  it('accepts HTTPS URL with port 443', () => {
    expect(validateWebhookUrl('https://example.com:443/hook').valid).toBe(true);
  });

  it('accepts multi-level subdomain', () => {
    expect(validateWebhookUrl('https://webhooks.api.customer.com/v1/events').valid).toBe(true);
  });

  it('returns reason string when invalid', () => {
    const result = validateWebhookUrl('http://example.com/hook');
    expect(result.valid).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason!.length).toBeGreaterThan(0);
  });
});

// ── validateWebhookUrlDns() — Stage 2 DNS ─────────────────────────────────────
//
// Uses injected mock resolvers to avoid live DNS in tests.
// The resolver parameter accepts { resolve4, resolve6 } functions.

function makeResolver(v4: string[] = [], v6: string[] = []) {
  return {
    resolve4: (_host: string) => Promise.resolve(v4),
    resolve6: (_host: string) => Promise.resolve(v6),
  };
}

function failingResolver(error = new Error('ENOTFOUND')) {
  return {
    resolve4: () => Promise.reject(error),
    resolve6: () => Promise.reject(error),
  };
}

describe('validateWebhookUrlDns() — BLOCKED: private IP resolution', () => {
  it('blocks when hostname resolves to RFC1918 10.x.x.x', async () => {
    const resolver = makeResolver(['10.0.0.1']);
    const result = await validateWebhookUrlDns('https://internal.example.com/hook', resolver);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/private|reserved/i);
  });

  it('blocks when hostname resolves to 192.168.x.x', async () => {
    const resolver = makeResolver(['192.168.1.50']);
    const result = await validateWebhookUrlDns('https://internal.example.com/hook', resolver);
    expect(result.valid).toBe(false);
  });

  it('blocks when hostname resolves to loopback 127.0.0.1', async () => {
    const resolver = makeResolver(['127.0.0.1']);
    const result = await validateWebhookUrlDns('https://redir.example.com/hook', resolver);
    expect(result.valid).toBe(false);
  });

  it('blocks when hostname resolves to IMDS address 169.254.169.254', async () => {
    const resolver = makeResolver(['169.254.169.254']);
    const result = await validateWebhookUrlDns('https://imds.example.com/hook', resolver);
    expect(result.valid).toBe(false);
  });

  it('blocks when any resolved IPv4 address is private (multiple IPs returned)', async () => {
    // First IP is public; second is private — entire check should fail
    const resolver = makeResolver(['93.184.216.34', '10.0.0.1']);
    const result = await validateWebhookUrlDns('https://example.com/hook', resolver);
    expect(result.valid).toBe(false);
  });

  it('blocks when IPv6 resolution returns a private address', async () => {
    const resolver = makeResolver([], ['fe80::1']);
    const result = await validateWebhookUrlDns('https://example.com/hook', resolver);
    expect(result.valid).toBe(false);
  });
});

describe('validateWebhookUrlDns() — ALLOWED: public IP resolution', () => {
  it('allows when hostname resolves to a public IPv4 address', async () => {
    const resolver = makeResolver(['93.184.216.34']); // example.com
    const result = await validateWebhookUrlDns('https://example.com/hook', resolver);
    expect(result.valid).toBe(true);
  });

  it('allows when both IPv4 and IPv6 resolve to public addresses', async () => {
    const resolver = makeResolver(['93.184.216.34'], ['2606:2800:220:1:248:1893:25c8:1946']);
    const result = await validateWebhookUrlDns('https://example.com/hook', resolver);
    expect(result.valid).toBe(true);
  });
});

describe('validateWebhookUrlDns() — ALLOWED: DNS failure (transient)', () => {
  it('allows when DNS resolution fails (ENOTFOUND) — let fetch() fail naturally', async () => {
    const resolver = failingResolver(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    const result = await validateWebhookUrlDns('https://nonexistent.example.com/hook', resolver);
    // DNS failure is not treated as SSRF — it's a transient delivery failure
    expect(result.valid).toBe(true);
  });
});

describe('validateWebhookUrlDns() — syntactic check is applied first', () => {
  it('blocks HTTP URLs before DNS resolution is attempted', async () => {
    // resolver should never be called — syntactic check fires first
    const resolver = {
      resolve4: () => { throw new Error('resolve4 should not be called'); },
      resolve6: () => { throw new Error('resolve6 should not be called'); },
    };
    const result = await validateWebhookUrlDns('http://example.com/hook', resolver as never);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/HTTPS/i);
  });

  it('blocks IP literals before DNS resolution is attempted', async () => {
    const resolver = {
      resolve4: () => { throw new Error('resolve4 should not be called'); },
      resolve6: () => { throw new Error('resolve6 should not be called'); },
    };
    const result = await validateWebhookUrlDns('https://192.168.1.1/hook', resolver as never);
    expect(result.valid).toBe(false);
  });
});
