import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

// ─── MetricsService ────────────────────────────────────────────────────────────
// Central Prometheus registry for the application.
//
// All instruments are created once at module init and shared across the app.
// Callers inject MetricsService and call the typed record* methods — they never
// interact with prom-client directly.
//
// Registry is not the default global registry so we can isolate metrics in tests.
//
// ── Metric catalogue ──────────────────────────────────────────────────────────
//
//   job_duration_ms       Histogram  {job_name, status:success|failure}
//     Total execution time of a pg-boss job handler from claim to complete/fail.
//
//   ai_latency_ms         Histogram  {model, operation}
//     Wall-clock time for a single AI model call (request → first byte of response).
//     Record when an AI SDK call completes.
//
//   ai_tokens_input       Counter    {model, operation}
//     Tokens consumed in the prompt. Pulled from the AI SDK response object.
//
//   ai_tokens_output      Counter    {model, operation}
//     Tokens in the model's completion. Pulled from the AI SDK response object.
//
//   queue_depth           Gauge      {job_name, status}
//     Active (PENDING + RUNNING) job count per queue, updated on each /metrics scrape.
//     Use this to alert on growing backlogs.
//
//   api_error_rate        Counter    {code, status_code}
//     Incremented by DomainExceptionFilter for every handled domain error.
//     'code' is the machine-readable error code (e.g. RATE_LIMITED, OFFER_NOT_FOUND).
//     Alert threshold: > 50/min sustained for RATE_LIMITED; any occurrence for 5xx.

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry: Registry;

  readonly jobDuration: Histogram<string>;
  readonly aiLatency: Histogram<string>;
  readonly aiTokensInput: Counter<string>;
  readonly aiTokensOutput: Counter<string>;
  readonly queueDepth: Gauge<string>;
  readonly apiErrors: Counter<string>;

  constructor() {
    this.registry = new Registry();

    // Default process metrics (memory, CPU, event loop lag, GC pauses, etc.)
    collectDefaultMetrics({ register: this.registry });

    this.jobDuration = new Histogram({
      name: 'job_duration_ms',
      help: 'Job handler execution time in milliseconds',
      labelNames: ['job_name', 'status'] as const,
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [this.registry],
    });

    this.aiLatency = new Histogram({
      name: 'ai_latency_ms',
      help: 'AI model call latency in milliseconds',
      labelNames: ['model', 'operation'] as const,
      buckets: [100, 250, 500, 1000, 2000, 5000, 10000, 30000],
      registers: [this.registry],
    });

    this.aiTokensInput = new Counter({
      name: 'ai_tokens_input',
      help: 'Total tokens consumed in AI prompts',
      labelNames: ['model', 'operation'] as const,
      registers: [this.registry],
    });

    this.aiTokensOutput = new Counter({
      name: 'ai_tokens_output',
      help: 'Total tokens in AI completions',
      labelNames: ['model', 'operation'] as const,
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'queue_depth',
      help: 'Number of active jobs (PENDING + RUNNING) per queue',
      labelNames: ['job_name', 'status'] as const,
      registers: [this.registry],
    });

    this.apiErrors = new Counter({
      name: 'api_error_rate',
      help: 'Count of handled domain errors by error code and HTTP status code',
      labelNames: ['code', 'status_code'] as const,
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    // Registry and instruments are initialised in the constructor.
    // Nothing to do here — hook retained for future lazy init if needed.
  }

  // ── Typed record helpers ──────────────────────────────────────────────────────

  recordJobDuration(jobName: string, durationMs: number, success: boolean): void {
    this.jobDuration.labels(jobName, success ? 'success' : 'failure').observe(durationMs);
  }

  recordAiCall(
    model: string,
    operation: string,
    latencyMs: number,
    tokensIn: number,
    tokensOut: number,
  ): void {
    this.aiLatency.labels(model, operation).observe(latencyMs);
    this.aiTokensInput.labels(model, operation).inc(tokensIn);
    this.aiTokensOutput.labels(model, operation).inc(tokensOut);
  }

  setQueueDepth(jobName: string, status: 'PENDING' | 'RUNNING', count: number): void {
    this.queueDepth.labels(jobName, status).set(count);
  }

  recordApiError(code: string, statusCode: number): void {
    this.apiErrors.labels(code, String(statusCode)).inc();
  }
}
