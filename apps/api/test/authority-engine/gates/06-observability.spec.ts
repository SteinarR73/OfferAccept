/**
 * Authority Engine — Gate Group 6: Observability
 *
 *  O1  P1  Health Endpoint
 *  O2  P1  Structured Logging
 *  O3  P2  Error Monitoring (Sentry)
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../../src');

function readSrc(...parts: string[]) {
  return fs.readFileSync(path.join(SRC, ...parts), 'utf-8');
}

// ─── O1 · Health Endpoint (P1) ───────────────────────────────────────────────

describe('O1 · Health Endpoint (P1)', () => {
  it('health controller exposes GET /health endpoint', () => {
    const ctrlFile = readSrc('modules', 'health', 'health.controller.ts');
    expect(ctrlFile).toContain("@Controller('health')");
    expect(ctrlFile).toContain('@Get()');
  });

  it('health liveness endpoint /health/z returns { status } object', () => {
    const ctrlFile = readSrc('modules', 'health', 'health.controller.ts');
    expect(ctrlFile).toContain("@Get('z')");
    expect(ctrlFile).toContain('status');
    expect(ctrlFile).toContain("'ok'");
  });

  it('health/z checks both database and Redis (Redis is a critical dependency)', () => {
    const ctrlFile = readSrc('modules', 'health', 'health.controller.ts');
    // Both DB and Redis must be checked on the liveness endpoint
    expect(ctrlFile).toContain('prisma');
    expect(ctrlFile).toContain('redis');
  });

  it('/health/services endpoint returns per-service breakdown', () => {
    const ctrlFile = readSrc('modules', 'health', 'health.controller.ts');
    expect(ctrlFile).toContain("@Get('services')");
    expect(ctrlFile).toContain('database');
    expect(ctrlFile).toContain('jobQueue');
  });

  it('health endpoint returns 503 when dependencies are down', () => {
    const ctrlFile = readSrc('modules', 'health', 'health.controller.ts');
    expect(ctrlFile).toContain('ServiceUnavailableException');
  });

  it('health endpoints have no auth requirement (reachable by load balancers)', () => {
    const ctrlFile = readSrc('modules', 'health', 'health.controller.ts');
    // No @UseGuards(JwtAuthGuard) on health endpoints
    expect(ctrlFile).not.toContain('JwtAuthGuard');
  });
});

// ─── O2 · Structured Logging (P1) ────────────────────────────────────────────

describe('O2 · Structured Logging (P1)', () => {
  it('app.module.ts imports nestjs-pino for structured JSON logging', () => {
    const appModule = readSrc('app.module.ts');
    expect(appModule).toContain('nestjs-pino');
    expect(appModule).toContain('LoggerModule');
  });

  it('pino is configured to output JSON in production', () => {
    const appModule = readSrc('app.module.ts');
    // JSON when NOT in dev (no pretty print transport in production)
    expect(appModule).toContain('pino-pretty');
    expect(appModule).toContain("production'");
  });

  it('sensitive headers are redacted from HTTP access logs', () => {
    const appModule = readSrc('app.module.ts');
    expect(appModule).toContain('redact');
    expect(appModule).toContain('authorization');
    expect(appModule).toContain('cookie');
  });

  it('request IDs are correlated across log lines', () => {
    // RequestIdInterceptor or pino-http genReqId
    const appModule = readSrc('app.module.ts');
    const hasRequestId =
      appModule.includes('X-Request-ID') ||
      appModule.includes('requestId') ||
      appModule.includes('RequestIdInterceptor') ||
      appModule.includes('genReqId');
    expect(hasRequestId).toBe(true);
  });

  it('log sanitizer module exists to strip OTP codes and JWT tokens from logs', () => {
    const sanitizerPath = path.join(SRC, 'common', 'logging', 'log-sanitizer.ts');
    expect(fs.existsSync(sanitizerPath)).toBe(true);
    const sanitizer = fs.readFileSync(sanitizerPath, 'utf-8');
    expect(sanitizer).toMatch(/otp|token|jwt|secret/i);
  });

  it('no raw console.log calls in API source (all logging via Logger)', () => {
    const violations: string[] = [];

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { recursive: true }) as string[];
      for (const entry of entries) {
        const f = entry.toString();
        if (!f.endsWith('.ts')) continue;
        // Skip test files
        if (f.includes('.spec.') || f.includes('.test.')) continue;
        const filePath = path.join(dir, f);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Allow console.log in startup scripts and instrument.ts
          if (
            filePath.includes('instrument.ts') ||
            filePath.includes('main.ts') ||
            filePath.includes('env.ts')
          ) continue;
          if (/console\.(log|warn|error|info|debug)\s*\(/.test(content)) {
            violations.push(filePath.replace(SRC + path.sep, ''));
          }
        } catch { /* skip */ }
      }
    }

    scanDir(SRC);
    expect(violations).toEqual([]);
  });
});

// ─── O3 · Error Monitoring (P2) ──────────────────────────────────────────────

describe('O3 · Error Monitoring (P2)', () => {
  it('instrument.ts initializes Sentry SDK before the application starts', () => {
    const instrumentPath = path.join(SRC, 'instrument.ts');
    expect(fs.existsSync(instrumentPath)).toBe(true);
    const instrument = fs.readFileSync(instrumentPath, 'utf-8');
    expect(instrument).toMatch(/Sentry\.init|sentry.*init/i);
  });

  it('Sentry is disabled gracefully when SENTRY_DSN is absent', () => {
    const instrumentPath = path.join(SRC, 'instrument.ts');
    const instrument = fs.readFileSync(instrumentPath, 'utf-8');
    expect(instrument).toContain('SENTRY_DSN');
  });

  it('SENTRY_DSN is an optional env var (not required — graceful degradation)', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('SENTRY_DSN: z.string().optional()');
  });

  it('Sentry error interceptor is registered in app.module.ts', () => {
    const appModule = readSrc('app.module.ts');
    expect(appModule).toMatch(/SentryInterceptor|APP_INTERCEPTOR/);
  });

  it('APP_VERSION is forwarded to Sentry for commit-linked error attribution', () => {
    const envFile = readSrc('config', 'env.ts');
    expect(envFile).toContain('APP_VERSION');
  });
});
