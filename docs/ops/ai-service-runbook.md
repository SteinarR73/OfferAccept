# AI Service Operations Runbook
**Applies to:** Any generative AI integration in OfferAccept  
**Date:** 2026-04-11  
**Status:** Pre-emptive — no AI is currently wired in production

> **Note:** As of April 11, 2026, OfferAccept does not call any AI/LLM API.
> This runbook is written proactively so it is ready when AI features are activated.

---

## 1. API Outage Handling

### Detection

| Signal | How to detect |
|--------|--------------|
| HTTP 5xx from Gemini | `ai_errors_total` counter spike (Prometheus alert) |
| Circuit open | Application logs: `event=ai_circuit_open` |
| Response timeout | `ai_latency_ms` P99 > timeout threshold |

### Immediate response (< 5 minutes)

1. Check Google Cloud status: https://status.cloud.google.com
2. Check `GET /api/v1/metrics` for `ai_errors_total` and `ai_circuit_open` gauge
3. If Gemini is down, the circuit breaker (Phase 4) will have already opened —
   AI-backed responses return the configured fallback automatically.
4. **No manual intervention is required** while the circuit is open.
   AI-dependent features return degraded but safe fallback responses.

### Escalation (> 15 minutes outage)

1. Post incident in `#incidents` Slack channel with:
   - Time first detected
   - Features affected
   - Current circuit status
2. If the outage exceeds `AI_CIRCUIT_COOLDOWN_MS` (default: 60 s), the circuit
   will probe and re-close automatically when Gemini recovers.
3. If you need to manually reset the circuit: restart the API pod.

### Recovery verification

```bash
# Confirm AI metrics are recovering:
curl https://api.yourdomain.com/api/v1/metrics | grep ai_errors_total
curl https://api.yourdomain.com/api/v1/metrics | grep ai_latency_ms

# Confirm circuit is closed:
# Application logs should show: event=ai_circuit_closed
```

---

## 2. Rate Limit Handling

### Gemini quotas

| Quota type | Default | Where to raise |
|-----------|---------|----------------|
| Requests per minute (RPM) | Model-dependent | GCP Console → Quotas |
| Tokens per minute (TPM) | Model-dependent | GCP Console → Quotas |
| Daily token budget | `AI_DAILY_TOKEN_LIMIT` env var | Secrets manager |

### When rate limited (HTTP 429 from Gemini)

The `AiService` retry strategy (Phase 4) handles transient 429s with exponential
backoff. Sustained 429s indicate quota exhaustion:

1. Check `ai_tokens_total` counter — compare against `AI_DAILY_TOKEN_LIMIT`
2. If budget exhausted: the guardrail has blocked further calls for the day.
   Budget resets at UTC midnight.
3. To raise the budget immediately: increase `AI_DAILY_TOKEN_LIMIT` in the secrets
   manager and restart pods.
4. To raise the Google quota: GCP Console → APIs & Services → Gemini API → Quotas.
   Quota increases are typically approved within 24 hours.

### Alert thresholds

| Metric | Alert threshold |
|--------|----------------|
| `ai_tokens_total` (daily) | 80% of `AI_DAILY_TOKEN_LIMIT` |
| `ai_errors_total` | > 5 in 1 minute |
| `ai_latency_ms` P99 | > 10,000 ms |

---

## 3. Cost Monitoring

### Daily routine

```bash
# Current token usage vs budget:
curl https://api.yourdomain.com/api/v1/metrics | grep -E 'ai_tokens|ai_requests'
```

### Monthly review

1. Pull `ai_tokens_input_total` and `ai_tokens_output_total` from Prometheus/Grafana
2. Multiply by current Gemini per-token pricing
3. Compare against GCP billing invoice
4. If > 10% discrepancy: investigate for token counting bugs in `AiService`

### Budget controls

```bash
# Set daily token budget (example: 1 million tokens = ~$0.50/day at Gemini Flash rates)
AI_DAILY_TOKEN_LIMIT=1000000
```

When the limit is reached:
- `AiService.checkBudget()` throws `AiBudgetExhaustedError`
- AI-dependent endpoints return the safe fallback response
- `ai_budget_exhausted` gauge is set to 1 (triggers Prometheus alert)
- Counter resets at UTC midnight (pg-boss cron job)

---

## 4. Safe Shutdown Strategy

### Graceful shutdown (planned maintenance)

1. Set `AI_PROVIDER=disabled` in the environment (if the env var is supported)
2. Restart pods — the circuit is opened immediately at startup, forcing all
   AI calls to use fallback responses
3. Confirm fallbacks are working by checking error logs for unexpected 500s
4. Perform maintenance
5. Re-enable: remove `AI_PROVIDER=disabled` and restart

### Emergency shutdown (billing runaway / security incident)

1. Revoke the `GEMINI_API_KEY` in Google AI Studio immediately
2. All AI calls will fail with 401 — the circuit will open within seconds
3. Users see fallback responses, not errors
4. Update `scripts/verify-secrets.ts` to mark `GEMINI_API_KEY` as required=false
   until a new key is provisioned

### Circuit breaker states

```
CLOSED → (failure threshold exceeded) → OPEN → (cooldown elapsed) → HALF_OPEN
  ↑                                                                      │
  └────────────────────── (probe succeeds) ───────────────────────────────┘
```

| State | Behaviour | Duration |
|-------|-----------|---------|
| CLOSED | Normal — calls pass through | Indefinite |
| OPEN | All calls return fallback immediately | `AI_CIRCUIT_COOLDOWN_MS` (default: 60 s) |
| HALF_OPEN | One probe call sent | Until probe result |

---

## 5. Incident Post-mortem Template

```markdown
## AI Service Incident — [DATE]

**Severity:** P0/P1/P2  
**Duration:** HH:MM  
**Features affected:**  

### Timeline
- HH:MM — First alert triggered
- HH:MM — On-call acknowledged
- HH:MM — Root cause identified
- HH:MM — Mitigation applied
- HH:MM — Service restored

### Root cause
...

### Impact
- Users affected:
- Fallback activated: yes/no
- Revenue impact:

### Action items
- [ ] Fix: ...
- [ ] Monitoring: ...
- [ ] Process: ...
```
