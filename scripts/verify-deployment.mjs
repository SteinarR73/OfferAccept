#!/usr/bin/env node
/**
 * Black-box checks of a running OfferAccept deployment — the executable half of the
 * [OPS] items in docs/launch-gates.md (2.8 CORS, 2.9 x-forwarded-for, 3.5 TLS/HSTS,
 * plus endpoint exposure). Uses only Node built-ins; sends no credentials.
 *
 *   node scripts/verify-deployment.mjs --api https://api.example.com --web https://app.example.com
 *   node scripts/verify-deployment.mjs --api ... --web ... --probe-rate-limit
 *
 * Options
 *   --api <url>            API origin, without /api/v1                       (required)
 *   --web <url>            Web origin; also the CORS origin that must be allowed (required)
 *   --probe-rate-limit     Test that X-Forwarded-For cannot be spoofed to dodge per-IP rate
 *                          limits. Exhausts the token_verification bucket (10 / 15 min) for
 *                          the machine running this script, so it is opt-in.
 *   --allow-http           Local testing only: skip the https / redirect / TLS-expiry checks.
 *
 * Exit code 0 = no FAIL; 1 = at least one FAIL. WARN means "look at this", not "broken".
 */
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(name);

const api = opt('--api')?.replace(/\/+$/, '');
const web = opt('--web')?.replace(/\/+$/, '');
const allowHttp = flag('--allow-http');
if (!api || !web) {
  console.error('Usage: node scripts/verify-deployment.mjs --api <url> --web <url> [--probe-rate-limit] [--allow-http]');
  process.exit(2);
}
const base = `${api}/api/v1`;
const webOrigin = new URL(web).origin;

const results = [];
const record = (status, name, detail = '') => {
  results.push(status);
  const tag = { PASS: 'PASS', FAIL: 'FAIL', WARN: 'WARN' }[status];
  console.log(`${tag}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const check = (ok, name, detail) => record(ok ? 'PASS' : 'FAIL', name, detail);

async function req(url, init = {}) {
  try {
    return await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000), ...init });
  } catch (err) {
    return { status: 0, headers: new Headers(), error: err.cause?.code ?? err.message };
  }
}

// ── Transport (gate 3.5) ──────────────────────────────────────────────────────
console.log(`\nAPI ${api}   WEB ${web}\n`);
if (!allowHttp) {
  check(api.startsWith('https://'), 'API is served over https');
  check(web.startsWith('https://'), 'Web is served over https');

  for (const [label, url] of [['API', api], ['Web', web]]) {
    const httpUrl = url.replace(/^https:/, 'http:');
    const r = await req(httpUrl);
    const loc = r.headers.get('location') ?? '';
    check([301, 302, 307, 308].includes(r.status) && loc.startsWith('https://'),
      `${label}: plain http redirects to https`, r.error ?? `HTTP ${r.status} ${loc}`);
  }

  for (const [label, url] of [['API', api], ['Web', web]]) {
    const { hostname, port } = new URL(url);
    const info = await new Promise((resolve) => {
      const s = tls.connect({ host: hostname, port: Number(port) || 443, servername: hostname }, () => {
        const cert = s.getPeerCertificate();
        resolve({ authorized: s.authorized, reason: s.authorizationError, validTo: cert.valid_to });
        s.end();
      });
      s.on('error', (e) => resolve({ authorized: false, reason: e.message }));
      s.setTimeout(10_000, () => { s.destroy(); resolve({ authorized: false, reason: 'timeout' }); });
    });
    check(info.authorized, `${label}: TLS certificate is valid and trusted`, info.reason ?? '');
    if (info.validTo) {
      const days = Math.floor((new Date(info.validTo) - Date.now()) / 86_400_000);
      if (days < 7) record('FAIL', `${label}: TLS certificate expiry`, `${days} days left`);
      else if (days < 21) record('WARN', `${label}: TLS certificate expiry`, `${days} days left — is auto-renewal working?`);
      else record('PASS', `${label}: TLS certificate expiry`, `${days} days left`);
    }
  }
}

// ── Security headers (gate 3.5) ───────────────────────────────────────────────
for (const [label, url] of [['API', `${base}/health/live`], ['Web', web]]) {
  const r = await req(url);
  const hsts = r.headers.get('strict-transport-security') ?? '';
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0);
  check(maxAge >= 31_536_000, `${label}: Strict-Transport-Security max-age >= 1 year`, hsts || 'header missing');
}
{
  const r = await req(web);
  const csp = r.headers.get('content-security-policy') ?? '';
  check(/script-src[^;]*'nonce-/.test(csp), 'Web: CSP uses a per-request script nonce', csp ? '' : 'CSP missing');
  check(!!r.headers.get('x-frame-options') || /frame-ancestors/.test(csp), 'Web: clickjacking protection header present');
}

// ── Health ────────────────────────────────────────────────────────────────────
{
  const live = await req(`${base}/health/live`);
  check(live.status === 200, 'API /health/live returns 200', live.error ?? `HTTP ${live.status}`);
  const ready = await req(`${base}/health/ready`);
  check(ready.status === 200, 'API /health/ready returns 200 (database + Redis reachable)', ready.error ?? `HTTP ${ready.status}`);
}

// ── CORS (gate 2.8) ───────────────────────────────────────────────────────────
{
  const evil = 'https://evil.example.com';
  for (const method of ['GET', 'OPTIONS']) {
    const r = await req(`${base}/health/live`, {
      method,
      headers: { Origin: evil, ...(method === 'OPTIONS' ? { 'Access-Control-Request-Method': 'POST' } : {}) },
    });
    const acao = r.headers.get('access-control-allow-origin');
    check(acao !== evil && acao !== '*', `CORS ${method}: a foreign Origin is not allowed`, `Access-Control-Allow-Origin: ${acao ?? '(none)'}`);
  }
  const r = await req(`${base}/health/live`, { headers: { Origin: webOrigin } });
  check(r.headers.get('access-control-allow-origin') === webOrigin,
    'CORS: the configured web origin IS allowed (WEB_BASE_URL matches --web)',
    `Access-Control-Allow-Origin: ${r.headers.get('access-control-allow-origin') ?? '(none)'}`);
  check(r.headers.get('access-control-allow-credentials') === 'true', 'CORS: credentials allowed for the web origin');
}

// ── Endpoint exposure ─────────────────────────────────────────────────────────
{
  const m = await req(`${base}/metrics`);
  check(m.status !== 200, '/metrics is not publicly readable', `HTTP ${m.status} (restrict by network even when enabled)`);
  for (const path of ['/offers', '/support/offers?recipientEmail=a@b.c', '/certificates/bulk-export']) {
    const r = await req(`${base}${path}`);
    check([401, 403].includes(r.status), `${path.split('?')[0]} requires authentication`, `HTTP ${r.status}`);
  }
  const v = await req(`${base}/certificates/${randomUUID()}/verify`);
  check(v.status === 404, 'Certificate verification is public (unknown id -> 404, not 401)', `HTTP ${v.status}`);
  const s = await req(`${base}/signing/oa_${randomUUID()}`);
  check(s.status === 404, 'Unknown signing token -> 404 (no enumeration signal)', `HTTP ${s.status}`);
}

// ── x-forwarded-for spoofing (gate 2.9) ───────────────────────────────────────
if (flag('--probe-rate-limit')) {
  // token_verification allows 10 requests / 15 min per client IP. If the API trusts a
  // client-supplied X-Forwarded-For, every request below lands in a fresh bucket and
  // none is ever limited.
  let limited = 0;
  for (let i = 0; i < 14; i++) {
    const r = await req(`${base}/signing/oa_${randomUUID()}`, { headers: { 'X-Forwarded-For': `203.0.113.${i + 1}` } });
    if (r.status === 429) limited++;
  }
  check(limited > 0, 'Per-IP rate limit cannot be dodged by spoofing X-Forwarded-For',
    limited > 0 ? `${limited}/14 requests limited` : '0/14 limited — spoofed headers are trusted; fix proxy / TRUSTED_PROXY_CIDR');
} else {
  record('WARN', 'x-forwarded-for spoofing not probed', 'rerun with --probe-rate-limit (uses up the 10/15min bucket for this IP)');
}

const failed = results.filter((r) => r === 'FAIL').length;
const warned = results.filter((r) => r === 'WARN').length;
console.log(`\n${results.length - failed - warned} passed, ${warned} warning(s), ${failed} failed`);
process.exit(failed ? 1 : 0);
