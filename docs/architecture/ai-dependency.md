# AI Dependency — Architecture Document
**Date:** 2026-04-11  
**Status:** Active — maintained alongside any AI feature work

---

## Purpose

This document records the AI/LLM runtime dependencies of the OfferAccept platform,
their operational characteristics, and the architectural decisions governing their use.

---

## Phase 2 Audit Result

The differential audit (April 11, 2026) flagged `GEMINI_API_KEY` as an undocumented
runtime dependency. A full codebase search was conducted:

```bash
grep -r "GEMINI_API_KEY\|@google/generative-ai\|gemini" \
  --include="*.ts" --include="*.json" -l . | grep -v node_modules
```

**Result: No Gemini or generative-AI library found in the codebase.**

The flag was sourced from a cross-project audit template, not from live code analysis.
OfferAccept does **not** currently use Gemini or any generative AI model.

### Current AI / ML usage

| Feature | Library | Provider | Path type | Status |
|---------|---------|----------|-----------|--------|
| Analytics insights | Pure TypeScript (no AI) | None | Request path | Active |
| Certificate PDF gen | `pdf-lib` | None | Background job | Active |
| Acceptance statement | Deterministic template | None | Background job | Active |

The `AcceptanceInsightsService` produces deal intelligence (median acceptance time,
stalled deals, unopened deals) using deterministic SQL aggregations and in-process
grouping logic. It contains no AI calls.

---

## Features Using AI

**None at present.** If an AI feature is added:

1. Create the `AiService` described in Phase 3 before any AI calls reach controllers
2. Add `GEMINI_API_KEY` (or equivalent) to `scripts/verify-secrets.ts`
3. Add `AI_PROVIDER` enum to `apps/api/src/config/env.ts`
4. Update this document and `docs/ops/ai-service-runbook.md`

---

## Critical Path Analysis

Since no AI is currently in use, there is **no AI-related critical path**.

When AI is added, classify each feature as:

| Classification | Definition | Response on outage |
|---------------|------------|-------------------|
| **Critical path** | Blocks deal sending or signing | Must degrade gracefully; use feature flag |
| **Enhancement** | Enriches an existing response | Omit field; return partial response |
| **Background** | Runs in a pg-boss job | Dead-letter; alert on DLQ accumulation |

The `GET /analytics/insights` endpoint (insights from event log) is rate-limited
to 10/hour/user (Phase AI rate limit) but uses no AI today. If this endpoint is
backed by AI in future, it must fall back to the existing deterministic implementation
rather than returning a 503.

---

## Failure Modes (Forward-looking)

If AI is introduced:

| Mode | Trigger | Expected behaviour |
|------|---------|--------------------|
| API key revoked | Key deleted or expired | `AiService` throws; circuit opens |
| Rate limit hit (Google 429) | Per-minute quota exceeded | Retry with exponential backoff (Phase 4) |
| Model unavailable | Gemini incident | Circuit open; fallback response returned |
| Billing quota exhausted | Daily token limit reached | AI_DAILY_TOKEN_LIMIT guardrail blocks calls |
| Response too long | Context overflow | Hard timeout; partial result or error |
| Latency spike | Upstream degradation | Hard timeout (Phase 4); fallback triggered |

---

## Operational Risks (Forward-looking)

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Unbounded token cost | Medium | `AI_DAILY_TOKEN_LIMIT` env var; MetricsService counters |
| PII leakage via prompts | Low-Medium | Prompt templates reviewed; never include raw user content |
| Response hallucination | Medium | AI output is advisory only; never substitutes for DB records |
| Vendor lock-in | Low | `AiService` abstraction isolates calling code from SDK |
| Key rotation gap | Low | `scripts/verify-secrets.ts` validates on CI/deploy |

---

## Cost Implications (Forward-looking)

When AI is activated:

- Set `AI_DAILY_TOKEN_LIMIT` conservatively and increase only after observing real usage
- Monitor `ai_tokens_input` + `ai_tokens_output` Prometheus counters
- Set GCP billing alerts at 80% and 100% of monthly budget
- Gemini pricing reference: https://ai.google.dev/pricing (verify at activation time)
- Each `GET /analytics/insights` call should be estimated at ~2,000 tokens (input + output)
  for a medium-size org. At 10 calls/hour/user the max spend per user per day is bounded.

---

## Dependency Map (Current)

```
Browser / Mobile
    │
    ▼
NestJS API (apps/api)
    │
    ├── PostgreSQL (primary datastore) ← Required
    ├── Redis (rate limiting, caching) ← Required
    ├── Resend (transactional email)   ← Required (EMAIL_PROVIDER=resend)
    ├── Stripe (billing)               ← Required (BILLING_PROVIDER=stripe)
    ├── S3 (file storage)              ← Required (STORAGE_PROVIDER=s3)
    └── [Gemini AI]                    ← NOT YET WIRED (placeholder for future)
```
