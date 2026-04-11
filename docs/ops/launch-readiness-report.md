# Launch Readiness Report

**Date:** 2026-04-11  
**Prepared by:** Architecture Hardening Review (AI-assisted)  
**Verdict:** READY — no blocking issues remain

---

## Executive Summary

Seven remediation phases were executed across this session and the prior session.
The platform now meets production launch standards across security, reliability,
observability, and data lifecycle management.

---

## Phase Results

### Phase 1 — Security Posture

| Check | Status | Evidence |
|-------|--------|----------|
| `prisma/dev.db` in git history | CLEAR | `git log --all -- prisma/dev.db` → 0 commits across 62 history entries |
| `.gitignore` coverage — DB files | PASS | `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-wal`, `*.db-shm` all covered |
| `.gitignore` coverage — env files | PASS | `.env`, `.env.*`, `.env.*.local` patterns all present |
| Secret rotation runbook | DONE | `docs/security/secret-rotation-execution.md` |
| Precautionary history-rewrite toolkit | DONE | `scripts/remove-dev-db-history.sh` |
| Runtime secret validation at startup | DONE | `scripts/verify-secrets.ts` — exits 1 on missing/weak secrets |

**Risk level:** LOW. No credential exposure confirmed. Tooling is in place to detect
and respond if an exposure is discovered in future.

---

### Phase 2 — AI Dependency Documentation

| Check | Status | Evidence |
|-------|--------|----------|
| AI in codebase | NONE | `grep -r 'gemini\|openai\|anthropic' apps/` → 0 matches |
| AI architecture documented | DONE | `docs/architecture/ai-dependency.md` |
| Ops runbook pre-written | DONE | `docs/ops/ai-service-runbook.md` |

**Risk level:** LOW. No live AI dependency. Forward-looking infrastructure is in place
for when AI is introduced.

---

### Phase 3 — AI Cost Guardrails

| Check | Status | Evidence |
|-------|--------|----------|
| Central `AiService` gateway | DONE | `apps/api/src/common/ai/ai.service.ts` |
| Daily token budget with hard limit | DONE | `AI_DAILY_TOKEN_LIMIT` env var; daily cron reset |
| Audit logging of every AI call | DONE | `AuditEventType.ai_request`; migration applied |
| `@Global()` module wiring | DONE | `apps/api/src/common/ai/ai.module.ts` |

---

### Phase 4 — AI Reliability

| Check | Status | Evidence |
|-------|--------|----------|
| Call timeout | DONE | `AI_CALL_TIMEOUT_MS` (default 30 s); `AbortSignal.timeout()` |
| Retry with exponential backoff | DONE | `AI_MAX_RETRIES` (default 3); up to 4 s max delay |
| Circuit breaker | DONE | CLOSED/OPEN/HALF_OPEN; `AI_CIRCUIT_FAILURE_THRESHOLD` + `AI_CIRCUIT_COOLDOWN_MS` |
| OTel spans per AI call | DONE | `getAppTracer().startActiveSpan('ai.call', …)` |
| Metrics per AI call | DONE | `MetricsService.recordAiCall(…)` |

---

### Phase 5 — DealEvent Data Lifecycle

| Check | Status | Evidence |
|-------|--------|----------|
| `deal_events_archive` table | DONE | Migration: `20260411_deal_events_archive/migration.sql` |
| `archival_checkpoint` table | DONE | Same migration; pre-seeded with `('deal_events')` row |
| Prisma models | DONE | `DealEventArchive`, `ArchivalCheckpoint` in `schema.prisma` |
| Job type + queue config | DONE | `ArchiveDealEventsPayload` in `job.types.ts`; retryLimit 3, 5-min gaps, 1 h expiry |
| Handler implementation | DONE | `handlers/archive-deal-events.handler.ts` — batch SELECT, idempotent INSERT, DELETE, checkpoint |
| Handler wired into DI | DONE | `job.module.ts` providers |
| Worker registered | DONE | `job.worker.ts` WORKER_OPTIONS + `boss.work(…)` |
| Cron scheduled | DONE | `job.scheduler.ts` — `0 2 * * *` UTC |
| Retention policy documented | DONE | `docs/data-lifecycle/deal-event-retention.md` |

---

### Phase 6 — Repository Safety Automation

| Check | Status | Evidence |
|-------|--------|----------|
| Pre-commit hook (DB files) | DONE | `.githooks/pre-commit` — blocks `*.db`, `*.sqlite`, `*.sqlite3` |
| Pre-commit hook (env files) | DONE | Same hook — blocks `.env*` file additions |
| Pre-commit hook (key/cert files) | DONE | Same hook — blocks `.pem`, `.key`, `.p12`, etc. |
| Pre-commit hook (secret patterns) | DONE | Same hook — 4 regex rules (Stripe, AWS, JWT, generic) |
| Hook auto-activation on install | DONE | `"prepare": "git config core.hooksPath .githooks"` in root `package.json` |
| CI secret scanner | DONE | `scripts/secret-scan.ts` — `pnpm secret-scan` |
| `.gitignore` — env variants | FIXED | Added `.env.*` to cover `.env.production`, `.env.staging`, etc. |
| `.gitignore` — sqlite variants | FIXED | Added `*.sqlite`, `*.sqlite3` |

---

### Observability (from earlier session)

| Check | Status | Evidence |
|-------|--------|----------|
| Structured logging (pino) | DONE | `nestjs-pino` LoggerModule with JSON in prod, pretty in dev |
| Request correlation IDs | DONE | `RequestIdInterceptor` + `TraceContext`; ID attached to pino logs via `customProps` |
| Prometheus metrics endpoint | DONE | `GET /metrics` — 6 instruments: job duration, AI latency, AI tokens, queue depth, API errors |
| OpenTelemetry tracing | DONE | `getAppTracer()` in `instrument.ts`; spans on every job execution |
| Sentry error tracking | DONE | `instrument.ts` + `SentryInterceptor`; OTel → Sentry forwarded automatically |
| Job execution metrics | DONE | `job.worker.ts` trackAndHandle records duration + success/failure |

---

### Rate Limiting (from earlier session)

| Check | Status | Evidence |
|-------|--------|----------|
| General API: 100/min/IP | DONE | `ApiRateLimitGuard` (APP_GUARD); `api_general` profile |
| AI generation: 10/hour/user | DONE | `AiRateLimitGuard`; `ai_generation` profile |
| Redis store with memory fallback | DONE | `RateLimitService` — Redis Lua sorted-set; `MemoryRateLimiter` fallback |
| 429 with `Retry-After` header | DONE | `DomainExceptionFilter` sets header when `RateLimitExceededError` thrown |
| Admin exemption | DONE | Both guards check `ADMIN_ROLES` (`OWNER`, `INTERNAL_SUPPORT`) |

---

## Production Launch Checklist

### Security

- [x] No database files in git history
- [x] All .env variants excluded from git
- [x] Pre-commit hooks block sensitive file additions
- [x] CI secret scanner available (`pnpm secret-scan`)
- [x] Secret rotation runbook documented
- [x] Runtime secret validation at startup
- [x] JWT in HttpOnly cookies
- [x] Stripe webhook HMAC verification
- [x] CSRF origin middleware
- [x] Rate limiting (general + AI-specific)

### Reliability

- [x] All endpoints write to database before responding
- [x] pg-boss cron jobs: all major sweeps scheduled
- [x] DealEvent archival: nightly job, idempotent, checkpointed
- [x] Job tracking: claim/complete/fail lifecycle with stale-lock recovery
- [x] AI circuit breaker, timeout, and retry (pre-wired for when AI is activated)
- [x] Certificate PDF generation is async via pg-boss (not in request path)

### Observability

- [x] Structured JSON logging (pino) — no console.log in production
- [x] Request correlation IDs on every log line
- [x] Prometheus metrics at `/metrics` — scrape-ready
- [x] Distributed traces forwarded to Sentry
- [x] Archival checkpoint queryable via SQL

### Data Lifecycle

- [x] DealEvent retention policy: 18 months active
- [x] Archive table created with correct indexes
- [x] Archival job registered, scheduled, and documented
- [x] Checkpoint table seeded

### Database

- [x] PostgreSQL 16 (pg-boss, Prisma — not SQLite)
- [x] All schema changes have migration files
- [x] Immutable tables (AcceptanceRecord, OfferSnapshot, SigningEvent) have no UPDATE/DELETE paths
- [x] Cursor-based pagination on high-volume list endpoints

---

## Remaining Operational Tasks (Pre-Launch, Non-Blocking)

These items require external action or operational decisions — they are not code gaps:

| Task | Owner | Notes |
|------|-------|-------|
| Rotate all secrets before first production deploy | Ops | Follow `docs/security/secret-rotation-execution.md` |
| Activate git hooks on all developer workstations | All devs | `git config core.hooksPath .githooks` (auto after `pnpm install`) |
| Add `pnpm secret-scan` to CI pipeline | DevOps | Add as a step before build in the CI YAML |
| Configure Sentry DSN in production env | Ops | `SENTRY_DSN` must be set; errors silently drop if absent |
| Configure Prometheus scrape target | DevOps | Scrape `GET /metrics` every 15 s |
| Set `DEAL_EVENT_RETENTION_MONTHS` if 18-month default doesn't meet compliance | Legal/Eng | Default is conservative |
| Monitor `archival_checkpoint` for > 25 h gap | Ops | Alert SQL in `docs/data-lifecycle/deal-event-retention.md` |

---

## Architecture Overview (Final State)

```
apps/
  web/           Next.js 15 — App Router, Tailwind CSS v4
  api/           NestJS 11
    common/
      ai/        AiService (circuit breaker, budget, retry, OTel) — inactive until GEMINI_API_KEY set
      auth/      JWT HttpOnly cookies, admin/internal-support guards
      filters/   DomainExceptionFilter (DI-injectable, records metrics)
      metrics/   MetricsService + MetricsController (/metrics Prometheus)
      rate-limit/ RateLimitService (Redis+Lua / memory fallback), ApiRateLimitGuard, AiRateLimitGuard
      trace/     TraceContext (AsyncLocalStorage), request correlation
    modules/
      jobs/      pg-boss lifecycle; 10 handlers; 7 cron + 3 event-driven queues
      ...        auth, offers, deals, certificates, billing, webhooks, analytics

packages/
  database/      Prisma schema + migrations (PostgreSQL 16)

docs/
  architecture/  ai-dependency.md
  data-lifecycle/ deal-event-retention.md
  ops/           ai-service-runbook.md, launch-readiness-report.md (this file)
  security/      phase1-exposure-report.md, secret-rotation-execution.md

scripts/
  verify-secrets.ts      Runtime secret validation (exits 1 on weak/missing)
  secret-scan.ts         CI secret pattern scanner
  remove-dev-db-history.sh  Precautionary git-filter-repo toolkit
  audit-dev-db.ts        One-time dev.db content auditor

.githooks/
  pre-commit             Blocks DB files, .env files, key files, and secret patterns
```

---

*Report generated 2026-04-11. Classification: internal engineering.*
