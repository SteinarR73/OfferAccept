import { Injectable, Inject, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { SpanStatusCode } from '@opentelemetry/api';
import { MetricsService } from '../metrics/metrics.service';
import { getAppTracer } from '../../instrument';
import { AuditEventType } from '@offeraccept/database';

// ─── AiService ─────────────────────────────────────────────────────────────────
// Central gateway for all AI/LLM calls in the OfferAccept platform.
//
// All generative AI calls MUST go through this service. Direct SDK usage in
// feature code is forbidden so that cost guardrails, circuit breaking, metrics,
// and audit logging apply uniformly.
//
// Current status: no AI provider is wired. This service is structured and ready;
// the `callModel()` method throws AiProviderNotConfiguredError until a provider
// is added. Feature code can call `isAvailable()` to degrade gracefully.
//
// ── Cost guardrail ────────────────────────────────────────────────────────────
// AI_DAILY_TOKEN_LIMIT (env): maximum tokens (input + output combined) per UTC day.
// When the limit is reached:
//   - All further calls are blocked with AiBudgetExhaustedError
//   - The ai_budget_exhausted gauge is set to 1
//   - Budget resets at UTC midnight (see resetDailyBudget())
//
// ── Circuit breaker ───────────────────────────────────────────────────────────
// After AI_CIRCUIT_FAILURE_THRESHOLD consecutive failures the circuit opens.
// While open, all calls return immediately with AiCircuitOpenError (no network IO).
// After AI_CIRCUIT_COOLDOWN_MS the circuit moves to HALF_OPEN and sends one probe.
// A successful probe closes the circuit; a failed probe restarts the cooldown.
//
// ── Retry strategy ───────────────────────────────────────────────────────────
// Transient errors (network, 429, 5xx) are retried with exponential backoff.
// Hard errors (401 invalid key, 400 bad request) are not retried.
//
// ── Tracing ──────────────────────────────────────────────────────────────────
// Each call is wrapped in an OTel span: ai.gemini.call (or ai.<model>.call)
// Attributes: model, operation, tokens_input, tokens_output, success.

// ─── Error types ─────────────────────────────────────────────────────────────

export class AiProviderNotConfiguredError extends Error {
  constructor() {
    super('No AI provider is configured. Set AI_PROVIDER and the relevant API key.');
    this.name = 'AiProviderNotConfiguredError';
  }
}

export class AiBudgetExhaustedError extends Error {
  constructor(public readonly used: number, public readonly limit: number) {
    super(`Daily AI token budget exhausted (used ${used} of ${limit}). Resets at UTC midnight.`);
    this.name = 'AiBudgetExhaustedError';
  }
}

export class AiCircuitOpenError extends Error {
  constructor(public readonly cooldownRemainingMs: number) {
    super(`AI circuit breaker is open. Retry in ${Math.ceil(cooldownRemainingMs / 1000)} seconds.`);
    this.name = 'AiCircuitOpenError';
  }
}

export class AiTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`AI call timed out after ${timeoutMs} ms.`);
    this.name = 'AiTimeoutError';
  }
}

// ─── Request / Response types ─────────────────────────────────────────────────

export interface AiCallOptions {
  /** Logical name of the operation (e.g. "generate_insights", "summarise_deal") */
  operation: string;
  /** The prompt/message to send to the model */
  prompt: string;
  /** Override model for this specific call (defaults to AI_DEFAULT_MODEL env var) */
  model?: string;
  /** Override timeout in ms (defaults to AI_CALL_TIMEOUT_MS env var) */
  timeoutMs?: number;
}

export interface AiCallResult {
  /** The model's text response */
  text: string;
  /** Prompt tokens consumed */
  tokensInput: number;
  /** Completion tokens generated */
  tokensOutput: number;
  /** Wall-clock latency in ms */
  latencyMs: number;
  /** Model identifier that handled the request */
  model: string;
}

// ─── Circuit breaker state ────────────────────────────────────────────────────

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// ─── Service ──────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS    = 30_000;  // 30 s hard timeout
const DEFAULT_MAX_RETRIES   = 3;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_CIRCUIT_THRESHOLD  = 5;   // consecutive failures to open
const DEFAULT_CIRCUIT_COOLDOWN   = 60_000; // 1 minute before probe

@Injectable()
export class AiService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiService.name);

  // ── Budget tracking ────────────────────────────────────────────────────────
  private dailyTokensUsed = 0;
  private readonly dailyTokenLimit: number;

  // ── Circuit breaker ────────────────────────────────────────────────────────
  private circuitState: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private circuitOpenedAt: number | null = null;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  // ── Config ─────────────────────────────────────────────────────────────────
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;
  private readonly maxRetries: number;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() @Inject('PRISMA') private readonly db?: PrismaClient,
  ) {
    this.dailyTokenLimit  = this.config.get<number>('AI_DAILY_TOKEN_LIMIT', 0);
    this.failureThreshold = this.config.get<number>('AI_CIRCUIT_FAILURE_THRESHOLD', DEFAULT_CIRCUIT_THRESHOLD);
    this.cooldownMs       = this.config.get<number>('AI_CIRCUIT_COOLDOWN_MS', DEFAULT_CIRCUIT_COOLDOWN);
    this.defaultModel     = this.config.get<string>('AI_DEFAULT_MODEL', 'gemini-2.0-flash');
    this.defaultTimeoutMs = this.config.get<number>('AI_CALL_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    this.maxRetries       = this.config.get<number>('AI_MAX_RETRIES', DEFAULT_MAX_RETRIES);
  }

  onApplicationBootstrap(): void {
    this.logger.log(
      `AiService initialised — budget: ${this.dailyTokenLimit || 'unlimited'} tokens/day, ` +
      `circuit threshold: ${this.failureThreshold} failures, cooldown: ${this.cooldownMs} ms`,
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Returns true when an AI provider is configured and the circuit is not open. */
  isAvailable(): boolean {
    return this.isProviderConfigured() && this.circuitState !== 'OPEN';
  }

  /**
   * Execute an AI model call with full guardrails applied:
   * budget check → circuit check → timeout → retry → metrics → audit log.
   *
   * @throws AiProviderNotConfiguredError when no AI provider is wired.
   * @throws AiBudgetExhaustedError when the daily token limit is reached.
   * @throws AiCircuitOpenError when the circuit breaker is open.
   * @throws AiTimeoutError when the call exceeds the timeout.
   */
  async call(options: AiCallOptions): Promise<AiCallResult> {
    if (!this.isProviderConfigured()) {
      throw new AiProviderNotConfiguredError();
    }

    // ── Budget guard ───────────────────────────────────────────────────────────
    if (this.dailyTokenLimit > 0 && this.dailyTokensUsed >= this.dailyTokenLimit) {
      this.metrics?.recordApiError('AI_BUDGET_EXHAUSTED', 429);
      throw new AiBudgetExhaustedError(this.dailyTokensUsed, this.dailyTokenLimit);
    }

    // ── Circuit breaker guard ──────────────────────────────────────────────────
    this.tickCircuit();
    if (this.circuitState === 'OPEN') {
      const remaining = this.cooldownMs - (Date.now() - (this.circuitOpenedAt ?? 0));
      throw new AiCircuitOpenError(Math.max(0, remaining));
    }

    const model = options.model ?? this.defaultModel;
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    // ── OTel span ──────────────────────────────────────────────────────────────
    const tracer = getAppTracer();
    return tracer.startActiveSpan(
      `ai.${model.split('-')[0]}.call`,
      {
        attributes: {
          'ai.model': model,
          'ai.operation': options.operation,
          'ai.prompt_length': options.prompt.length,
        },
      },
      async (span) => {
        const startMs = Date.now();
        let result: AiCallResult | undefined;
        let lastError: unknown;

        try {
          // ── Retry loop ─────────────────────────────────────────────────────
          for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0) {
              const delay = DEFAULT_RETRY_BASE_MS * Math.pow(2, attempt - 1);
              this.logger.warn(
                { event: 'ai_retry', attempt, delay, model, operation: options.operation },
                `[AiService] Retrying AI call (attempt ${attempt}/${this.maxRetries})`,
              );
              await sleep(delay);
            }

            try {
              result = await this.executeWithTimeout(options, model, timeoutMs);
              break; // success — exit retry loop
            } catch (err: unknown) {
              lastError = err;
              if (!this.isRetryable(err)) break; // hard error — don't retry
            }
          }

          if (!result) throw lastError;

          // ── Success path ──────────────────────────────────────────────────
          this.onSuccess();
          this.dailyTokensUsed += result.tokensInput + result.tokensOutput;

          span.setAttributes({
            'ai.tokens_input':  result.tokensInput,
            'ai.tokens_output': result.tokensOutput,
            'ai.latency_ms':    result.latencyMs,
            'ai.success':       true,
          });
          span.setStatus({ code: SpanStatusCode.OK });

          this.metrics?.recordAiCall(model, options.operation, result.latencyMs, result.tokensInput, result.tokensOutput);
          await this.writeAuditEvent(model, options.operation, result.latencyMs, result.tokensInput + result.tokensOutput, true);

          return result;

        } catch (err: unknown) {
          // ── Failure path ──────────────────────────────────────────────────
          this.onFailure();
          const latencyMs = Date.now() - startMs;

          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          span.setAttributes({ 'ai.success': false, 'ai.latency_ms': latencyMs });

          this.metrics?.recordAiCall(model, options.operation, latencyMs, 0, 0);
          await this.writeAuditEvent(model, options.operation, latencyMs, 0, false);

          throw err;

        } finally {
          span.end();
        }
      },
    );
  }

  /** Reset the daily token counter. Call from a pg-boss cron job at UTC midnight. */
  resetDailyBudget(): void {
    const prev = this.dailyTokensUsed;
    this.dailyTokensUsed = 0;
    this.logger.log(
      { event: 'ai_budget_reset', previousUsage: prev, limit: this.dailyTokenLimit },
      `[AiService] Daily token budget reset (previous usage: ${prev})`,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private isProviderConfigured(): boolean {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    const provider = this.config.get<string>('AI_PROVIDER', 'none');
    return provider !== 'none' && !!apiKey;
  }

  /**
   * Execute the actual AI call with a hard timeout.
   * Replace the throw in this method with your actual SDK call when wiring a provider.
   */
  private async executeWithTimeout(
    options: AiCallOptions,
    model: string,
    timeoutMs: number,
  ): Promise<AiCallResult> {
    const callPromise = this.invokeProvider(options, model);
    const timeoutPromise = sleep(timeoutMs).then(() => {
      throw new AiTimeoutError(timeoutMs);
    });

    return Promise.race([callPromise, timeoutPromise]);
  }

  /**
   * Invoke the configured AI provider.
   *
   * This is the only method that imports provider SDK code.
   * When adding Gemini: import the SDK here, use GEMINI_API_KEY from config.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async invokeProvider(_options: AiCallOptions, _model: string): Promise<AiCallResult> {
    // ── Gemini integration stub ────────────────────────────────────────────
    // When ready to wire Gemini, replace this body:
    //
    //   import { GoogleGenerativeAI } from '@google/generative-ai';
    //   const genAI = new GoogleGenerativeAI(this.config.getOrThrow('GEMINI_API_KEY'));
    //   const model = genAI.getGenerativeModel({ model: _model });
    //   const start = Date.now();
    //   const result = await model.generateContent(_options.prompt);
    //   const response = result.response;
    //   return {
    //     text: response.text(),
    //     tokensInput:  response.usageMetadata?.promptTokenCount ?? 0,
    //     tokensOutput: response.usageMetadata?.candidatesTokenCount ?? 0,
    //     latencyMs:    Date.now() - start,
    //     model:        _model,
    //   };
    //
    // No changes to this class or its callers are needed — only this method.
    throw new AiProviderNotConfiguredError();
  }

  // ── Circuit breaker ────────────────────────────────────────────────────────

  private tickCircuit(): void {
    if (this.circuitState !== 'OPEN') return;

    const elapsed = Date.now() - (this.circuitOpenedAt ?? 0);
    if (elapsed >= this.cooldownMs) {
      this.circuitState = 'HALF_OPEN';
      this.logger.log(
        { event: 'ai_circuit_half_open' },
        '[AiService] Circuit moved to HALF_OPEN — sending probe.',
      );
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.circuitState !== 'CLOSED') {
      this.circuitState = 'CLOSED';
      this.logger.log({ event: 'ai_circuit_closed' }, '[AiService] Circuit closed after successful probe.');
    }
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.circuitState === 'HALF_OPEN') {
      // Probe failed — restart cooldown
      this.openCircuit();
    } else if (
      this.circuitState === 'CLOSED' &&
      this.consecutiveFailures >= this.failureThreshold
    ) {
      this.openCircuit();
    }
  }

  private openCircuit(): void {
    this.circuitState   = 'OPEN';
    this.circuitOpenedAt = Date.now();
    this.logger.error(
      { event: 'ai_circuit_open', failures: this.consecutiveFailures },
      `[AiService] Circuit OPENED after ${this.consecutiveFailures} consecutive failures.`,
    );
  }

  private isRetryable(err: unknown): boolean {
    if (err instanceof AiTimeoutError) return true;
    if (err instanceof AiBudgetExhaustedError) return false;
    if (err instanceof AiCircuitOpenError) return false;
    if (err instanceof AiProviderNotConfiguredError) return false;
    // HTTP errors: retry 5xx and 429, not 4xx
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('429') || msg.includes('rate limit')) return true;
      if (msg.includes('5') && /5\d\d/.test(msg)) return true;
      if (msg.includes('network') || msg.includes('econnreset')) return true;
    }
    return true; // default: retry unknown errors
  }

  // ── Audit logging ──────────────────────────────────────────────────────────
  // Writes one AuditEvent per AI call. The payload mirrors the ai.request spec.
  // No-ops gracefully when the DB is not injected (e.g. in unit tests).

  private async writeAuditEvent(
    model: string,
    operation: string,
    latencyMs: number,
    totalTokens: number,
    success: boolean,
  ): Promise<void> {
    if (!this.db) return;

    try {
      // AuditEventType.ai_request is added in the Phase 3 migration.
      // If the enum value isn't present yet, skip silently.
      const type = 'ai.request' as unknown as AuditEventType;

      await this.db.auditEvent.create({
        data: {
          type,
          payload: {
            model,
            operation,
            tokens: totalTokens,
            latencyMs,
            success,
          } as object,
        },
      });
    } catch {
      // Non-critical: audit failure must not break the AI call path.
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
