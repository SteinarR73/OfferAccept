import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { WebhookService } from '../../enterprise/webhook.service';
import type { SendWebhookPayload } from '../job.types';

// ─── SendWebhookHandler ────────────────────────────────────────────────────────
// Delivers outgoing webhook events to customer-configured endpoints.
//
// Delivery semantics:
//   - HMAC-SHA256 signature on the raw request body (X-OfferAccept-Signature header)
//   - 10-second timeout per attempt (AbortSignal.timeout)
//   - 5 retries with exponential backoff (configured on the queue in job.types.ts)
//   - Every attempt (success or failure) is logged to WebhookDeliveryAttempt
//
// Replay protection:
//   webhookEventId is a UUID stable across ALL retries of the same logical event.
//   At the START of each attempt, this handler checks WebhookDeliveryAttempt for
//   an existing row with success=true for this (endpointId, webhookEventId) pair.
//   If found → skip delivery without throwing (job completes, no retry).
//   This protects against:
//     - pg-boss retrying after a crash post-delivery but pre-acknowledgement
//     - Manual job replay by operators
//
// Payload body format (JSON, sent as request body):
//   {
//     id:        "<webhookEventId>",   // stable across retries
//     event:     "<event>",            // e.g. "offer.accepted"
//     timestamp: "<ISO 8601>",         // server-generated at delivery time
//     data:      { ... }               // event-specific payload
//   }
//
// Signature:
//   X-OfferAccept-Signature: sha256=<HMAC-SHA256(endpoint.secret, rawBody)>
//   Customers verify: hmac.new(secret, body).hexdigest() === header.split('sha256=')[1]
//
// Idempotency for customers:
//   The "id" field in the body is stable across retries. Customers should use it
//   as their own idempotency key to detect and safely ignore re-deliveries.

@Injectable()
export class SendWebhookHandler {
  private readonly logger = new Logger(SendWebhookHandler.name);

  constructor(private readonly webhookService: WebhookService) {}

  async handle(jobs: Job<SendWebhookPayload>[]): Promise<void> {
    for (const job of jobs) {
      await this.deliver(job);
    }
  }

  private async deliver(job: Job<SendWebhookPayload>): Promise<void> {
    const { endpointId, event, payload, webhookEventId, attempt, traceId } = job.data;

    // ── Replay guard ────────────────────────────────────────────────────────────
    // Skip if a successful delivery already exists for this logical event.
    // This makes the handler idempotent across pg-boss retries.
    const alreadyDelivered = await this.webhookService.isAlreadyDelivered(
      endpointId,
      webhookEventId,
    );
    if (alreadyDelivered) {
      this.logger.log(JSON.stringify({
        metric: 'webhook_replay_skipped',
        traceId,
        event,
        endpointId,
        webhookEventId,
      }));
      return;
    }

    // ── Load endpoint ───────────────────────────────────────────────────────────
    const endpoint = await this.webhookService.getEndpoint(endpointId);
    if (!endpoint) {
      this.logger.warn(JSON.stringify({
        metric: 'webhook_endpoint_deleted',
        traceId,
        event,
        endpointId,
        webhookEventId,
      }));
      // Return without throwing: no point retrying a deleted endpoint.
      return;
    }
    if (!endpoint.enabled) {
      this.logger.warn(JSON.stringify({
        metric: 'webhook_endpoint_disabled',
        traceId,
        event,
        endpointId,
        webhookEventId,
      }));
      return;
    }

    // ── SSRF protection (Stage 2 — DNS) ────────────────────────────────────────
    // Resolve the destination hostname and check all returned IPs against private
    // ranges. This is defense-in-depth on top of the syntactic check at registration.
    // It catches domain names that resolve to private IPs ("DNS rebinding" vectors).
    //
    // If blocked: record the attempt as failed and return WITHOUT throwing.
    //   - Not throwing prevents pg-boss from retrying — the URL is permanently unsafe.
    //   - The delivery attempt is recorded so operators can investigate.
    const urlCheck = await this.webhookService.validateUrl(endpoint.url);
    if (!urlCheck.valid) {
      this.logger.error(JSON.stringify({
        metric: 'webhook_ssrf_blocked',
        traceId,
        event,
        endpointId,
        webhookEventId,
        url: endpoint.url,
        reason: urlCheck.reason,
      }));
      await this.webhookService.recordDeliveryAttempt({
        endpointId,
        webhookEventId,
        event,
        httpStatus: null,
        responseBody: `SSRF_BLOCKED: ${urlCheck.reason ?? 'unsafe destination'}`,
        attempt,
        success: false,
      });
      // Return (not throw): SSRF block is permanent; retrying wastes job slots.
      return;
    }

    // ── Build signed body ───────────────────────────────────────────────────────
    const body = JSON.stringify({
      id: webhookEventId,     // customers use this as their idempotency key
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const signature = this.webhookService.signPayload(endpoint.secret, body);

    // ── HTTP delivery ───────────────────────────────────────────────────────────
    let httpStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OfferAccept-Signature': `sha256=${signature}`,
          'X-OfferAccept-Event': event,
          'X-OfferAccept-Delivery': webhookEventId,
          'User-Agent': 'OfferAccept-Webhooks/1.0',
        },
        body,
        // 10-second hard timeout per attempt — must not hang indefinitely.
        signal: AbortSignal.timeout(10_000),
      });

      httpStatus = response.status;
      responseBody = (await response.text()).slice(0, 1000);
      success = response.ok; // 2xx = success
    } catch (err) {
      // Network error, timeout, or DNS failure — record as a failed attempt.
      responseBody = err instanceof Error ? err.message : String(err);
      this.logger.warn(JSON.stringify({
        metric: 'webhook_network_error',
        traceId,
        event,
        endpointId,
        webhookEventId,
        error: responseBody,
      }));
    }

    // ── Record attempt ──────────────────────────────────────────────────────────
    await this.webhookService.recordDeliveryAttempt({
      endpointId,
      webhookEventId,
      event,
      httpStatus,
      responseBody,
      attempt,
      success,
    });

    if (success) {
      this.logger.log(JSON.stringify({
        metric: 'webhook_delivered',
        traceId,
        event,
        endpointId,
        webhookEventId,
        httpStatus,
      }));
    } else {
      // Throw so pg-boss marks this job as failed and schedules a retry.
      throw new Error(
        `Webhook delivery failed: endpoint=${endpointId} event=${event} ` +
        `webhookEventId=${webhookEventId} status=${httpStatus ?? 'connection_error'}`,
      );
    }
  }
}
