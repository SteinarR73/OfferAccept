// ─── Trusted proxy IP extraction tests ────────────────────────────────────────
//
// Verifies that extractClientIp() only trusts X-Forwarded-For when the TCP
// socket's remote address is in the configured TRUSTED_PROXY_CIDR range.
// Untrusted sources must always use the socket address directly.

// The utility reads TRUSTED_PROXY_CIDR at module load time, so we need to
// set it BEFORE requiring the module. We use jest.isolateModules() to reload
// the module with different env variables per test group.

describe('extractClientIp() — trusted proxy CIDR validation', () => {
  const makeReq = (
    socketAddr: string,
    xForwardedFor?: string,
  ): { socket: { remoteAddress: string }; headers: Record<string, string> } => ({
    socket: { remoteAddress: socketAddr },
    headers: xForwardedFor ? { 'x-forwarded-for': xForwardedFor } : {},
  });

  describe('with TRUSTED_PROXY_CIDR = 10.0.0.0/8', () => {
    let extractClientIp: (req: { socket: { remoteAddress: string }; headers: Record<string, string> }) => string;

    beforeAll(() => {
      process.env.TRUSTED_PROXY_CIDR = '10.0.0.0/8';
      // We have to clear the module registry to force a fresh load with the new env
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      extractClientIp = require('../../src/common/proxy/trusted-proxy.util').extractClientIp;
    });

    afterAll(() => {
      delete process.env.TRUSTED_PROXY_CIDR;
      jest.resetModules();
    });

    it('uses X-Forwarded-For first IP when socket is in trusted CIDR', () => {
      const req = makeReq('10.0.1.5', '203.0.113.42, 10.0.1.5');
      expect(extractClientIp(req)).toBe('203.0.113.42');
    });

    it('uses socket address when socket is NOT in trusted CIDR', () => {
      const req = makeReq('198.51.100.7', '203.0.113.42, 198.51.100.7');
      expect(extractClientIp(req)).toBe('198.51.100.7');
    });

    it('uses socket address when no X-Forwarded-For header present', () => {
      const req = makeReq('10.0.0.1');
      expect(extractClientIp(req)).toBe('10.0.0.1');
    });

    it('normalises IPv4-mapped IPv6 loopback from socket', () => {
      const req = makeReq('::ffff:10.0.0.1', '1.2.3.4');
      // ::ffff:10.0.0.1 normalises to 10.0.0.1, which is in 10.0.0.0/8
      expect(extractClientIp(req)).toBe('1.2.3.4');
    });

    it('normalises ::1 (IPv6 loopback) to 127.0.0.1 and does NOT trust XFF (not in trusted CIDR)', () => {
      const req = makeReq('::1', '1.2.3.4');
      // 127.0.0.1 is NOT in 10.0.0.0/8 → should use socket (normalised)
      expect(extractClientIp(req)).toBe('127.0.0.1');
    });
  });

  describe('with TRUSTED_PROXY_CIDR unset (default — never trust XFF)', () => {
    let extractClientIp: (req: { socket: { remoteAddress: string }; headers: Record<string, string> }) => string;

    beforeAll(() => {
      delete process.env.TRUSTED_PROXY_CIDR;
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      extractClientIp = require('../../src/common/proxy/trusted-proxy.util').extractClientIp;
    });

    afterAll(() => {
      jest.resetModules();
    });

    it('always uses socket address regardless of X-Forwarded-For', () => {
      const req = makeReq('10.0.0.1', '203.0.113.42');
      expect(extractClientIp(req)).toBe('10.0.0.1');
    });
  });

  describe('with multiple CIDRs: TRUSTED_PROXY_CIDR = 10.0.0.0/8,172.16.0.0/12', () => {
    let extractClientIp: (req: { socket: { remoteAddress: string }; headers: Record<string, string> }) => string;

    beforeAll(() => {
      process.env.TRUSTED_PROXY_CIDR = '10.0.0.0/8,172.16.0.0/12';
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      extractClientIp = require('../../src/common/proxy/trusted-proxy.util').extractClientIp;
    });

    afterAll(() => {
      delete process.env.TRUSTED_PROXY_CIDR;
      jest.resetModules();
    });

    it('trusts XFF when socket is in first CIDR range', () => {
      const req = makeReq('10.5.0.1', '8.8.8.8');
      expect(extractClientIp(req)).toBe('8.8.8.8');
    });

    it('trusts XFF when socket is in second CIDR range', () => {
      const req = makeReq('172.20.0.1', '8.8.4.4');
      expect(extractClientIp(req)).toBe('8.8.4.4');
    });

    it('uses socket address for IPs outside all trusted CIDRs', () => {
      const req = makeReq('192.168.1.1', '8.8.8.8');
      expect(extractClientIp(req)).toBe('192.168.1.1');
    });
  });
});
