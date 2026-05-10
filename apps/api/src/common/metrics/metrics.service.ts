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

  // ── Deal lifecycle business metrics ──────────────────────────────────────────
  //   deals_sent_total              — incremented in SendOfferService when deal_sent event fires
  //   deals_accepted_total          — incremented in CertificateService after cert creation
  //   time_to_acceptance_seconds    — histogram of (acceptedAt - sentAt) per deal
  //
  // ── Certificate trust-loop metrics ───────────────────────────────────────────
  //   certificate_verifications_total — public verify endpoint calls (certificates/:id/verify)
  //   certificate_pdfs_generated_total — server-side PDF generation calls
  readonly dealsSent: Counter<string>;
  readonly dealsAccepted: Counter<string>;
  readonly timeToAcceptance: Histogram<string>;
  readonly certificateVerifications: Counter<string>;
  readonly certificatePdfsGenerated: Counter<string>;

  // ── PMF instrumentation ───────────────────────────────────────────────────────
  //
  // These metrics answer the key PMF questions:
  //   "Why do recipients stop?" — recipient funnel drop-off
  //   "Why do senders not return?" — second-send rate by time window
  //   "Is the Norwegian flow trusted?" — locale-segmented funnel
  //
  //   recipient_otp_requests_total  {locale}  — OTP code requested (post document view)
  //   recipient_otp_verifications_total {locale} — OTP code verified (post OTP entry)
  //   recipient_declines_total {locale}        — explicit decline (doc or acceptance screen)
  //   demo_completions_total {locale}          — demo flow reached certificate step
  //   second_send_total {window:24h|7d|30d}    — sender's 2nd document in time window
  //
  // Drop-off between stages = difference in counter values.
  // Alarm if (otp_requests - otp_verifications) / otp_requests > 0.25 (25% OTP failure rate).
  readonly recipientOtpRequests: Counter<string>;
  readonly recipientOtpVerifications: Counter<string>;
  readonly recipientDeclines: Counter<string>;
  readonly demoCompletions: Counter<string>;
  readonly secondSend: Counter<string>;

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

    this.dealsSent = new Counter({
      name: 'deals_sent_total',
      help: 'Total number of deals sent to recipients',
      registers: [this.registry],
    });

    this.dealsAccepted = new Counter({
      name: 'deals_accepted_total',
      help: 'Total number of deals accepted by recipients',
      registers: [this.registry],
    });

    // Buckets cover typical acceptance windows: under 1h, same-day, next-day, week
    this.timeToAcceptance = new Histogram({
      name: 'time_to_acceptance_seconds',
      help: 'Time from deal sent to deal accepted, in seconds',
      buckets: [3600, 14400, 43200, 86400, 172800, 259200, 604800],
      registers: [this.registry],
    });

    this.certificateVerifications = new Counter({
      name: 'certificate_verifications_total',
      help: 'Total public certificate verification requests (GET /certificates/:id/verify)',
      registers: [this.registry],
    });

    this.certificatePdfsGenerated = new Counter({
      name: 'certificate_pdfs_generated_total',
      help: 'Total server-side PDF certificates generated',
      registers: [this.registry],
    });

    // ── PMF counters ──────────────────────────────────────────────────────────

    this.recipientOtpRequests = new Counter({
      name: 'recipient_otp_requests_total',
      help: 'OTP codes requested by recipients. Measures reach into the verification funnel.',
      labelNames: ['locale'] as const,
      registers: [this.registry],
    });

    this.recipientOtpVerifications = new Counter({
      name: 'recipient_otp_verifications_total',
      help: 'OTP codes successfully verified. Drop-off vs requests = code delivery or UX failure.',
      labelNames: ['locale'] as const,
      registers: [this.registry],
    });

    this.recipientDeclines = new Counter({
      name: 'recipient_declines_total',
      help: 'Explicit recipient declines. High rate may indicate document quality or trust issues.',
      labelNames: ['locale'] as const,
      registers: [this.registry],
    });

    this.demoCompletions = new Counter({
      name: 'demo_completions_total',
      help: 'Demo flow reached the certificate step. Measures top-of-funnel engagement quality.',
      labelNames: ['locale'] as const,
      registers: [this.registry],
    });

    this.secondSend = new Counter({
      name: 'second_send_total',
      help: 'Senders who sent a 2nd document. Strongest PMF signal: product delivered enough value to reuse.',
      labelNames: ['window'] as const,
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

  recordDealSent(): void {
    this.dealsSent.inc();
  }

  recordDealAccepted(durationSeconds: number): void {
    this.dealsAccepted.inc();
    this.timeToAcceptance.observe(durationSeconds);
  }

  recordCertificateVerification(): void {
    this.certificateVerifications.inc();
  }

  recordCertificatePdfGenerated(): void {
    this.certificatePdfsGenerated.inc();
  }

  // ── PMF record helpers ────────────────────────────────────────────────────────

  recordRecipientOtpRequested(locale: 'en' | 'no' = 'en'): void {
    this.recipientOtpRequests.labels(locale).inc();
  }

  recordRecipientOtpVerified(locale: 'en' | 'no' = 'en'): void {
    this.recipientOtpVerifications.labels(locale).inc();
  }

  recordRecipientDeclined(locale: 'en' | 'no' = 'en'): void {
    this.recipientDeclines.labels(locale).inc();
  }

  recordDemoCompleted(locale: 'en' | 'no' = 'en'): void {
    this.demoCompletions.labels(locale).inc();
  }

  /**
   * Record a second-send event. Call from SendOfferService when an org sends
   * their second document. Pass the time delta since their first send so we can
   * label by window (24h, 7d, 30d).
   */
  recordSecondSend(secondsSinceFirst: number): void {
    const window =
      secondsSinceFirst <= 86_400 ? '24h'
      : secondsSinceFirst <= 604_800 ? '7d'
      : '30d';
    this.secondSend.labels(window).inc();
  }
}
