import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

// ─── TraceContext ──────────────────────────────────────────────────────────────
// Propagates a traceId (= the request's X-Request-ID) through every async hop
// in a request lifecycle without threading it through function arguments.
//
// Usage:
//   Interceptor: traceContext.run(requestId, () => next.handle().subscribe(s))
//   Service / handler: traceContext.get() → string | undefined
//
// Background jobs have no HTTP context. Handlers that generate their own traceId
// (cron sweeps) call randomUUID() and include it in every structured log line
// manually. Job payloads carry traceId as an optional string so origin-request
// context is available when the job handler runs.

@Injectable()
export class TraceContext {
  private readonly storage = new AsyncLocalStorage<string>();

  /** Run `fn` with `traceId` as the active trace context for this async subtree. */
  run<T>(traceId: string, fn: () => T): T {
    return this.storage.run(traceId, fn);
  }

  /** Returns the active traceId, or undefined when called outside a request context. */
  get(): string | undefined {
    return this.storage.getStore();
  }
}
