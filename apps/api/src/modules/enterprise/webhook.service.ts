import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { JobService } from '../jobs/job.service';
import { WebhookEndpointNotFoundError } from '../../common/errors/domain.errors';

// ─── WebhookService ────────────────────────────────────────────────────────────
// Manages customer-configured webhook endpoints and dispatches outgoing events.
//
// Event catalogue:
//   offer.accepted       — fired after an offer is accepted and the acceptance
//                          record committed. Data includes offerId, recipientEmail,
//                          acceptedAt, certificateId.
//   certificate.issued   — fired after the AcceptanceCertificate is generated.
//                          Data includes offerId, certificateId, issuedAt.
//
// Delivery model:
//   For each matching (enabled + subscribed) endpoint, a send-webhook job is
//   enqueued via pg-boss. The job carries a stable webhookEventId (UUID), which
//   SendWebhookHandler uses for replay protection:
//     - Before each HTTP attempt: check for existing successful delivery with same
//       (endpointId, webhookEventId). If found → skip (already delivered).
//     - This prevents re-delivery even if pg-boss retries after a process crash
//       that occurred post-delivery but pre-acknowledgement.
//
// Signature (X-OfferAccept-Signature: sha256=<hex>):
//   HMAC-SHA256 computed over the raw request body using the endpoint's secret.
//   The body includes the webhookEventId so customers can independently verify
//   idempotency. signPayload() is also used by SendWebhookHandler.

export const ALL_WEBHOOK_EVENTS = ['offer.accepted', 'certificate.issued'] as const;
export type WebhookEvent = (typeof ALL_WEBHOOK_EVENTS)[number];

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject('PRISMA') private readonly db: PrismaClient,
    private readonly jobService: JobService,
  ) {}

  // ── Endpoint management ──────────────────────────────────────────────────────

  async createEndpoint(params: {
    organizationId: string;
    url: string;
    events: WebhookEvent[];
  }): Promise<{ id: string; url: string; events: string[]; secret: string }> {
    validateEvents(params.events);
    const secret = crypto.randomBytes(32).toString('hex');

    const endpoint = await this.db.webhookEndpoint.create({
      data: {
        organizationId: params.organizationId,
        url: params.url,
        secret,
        events: params.events,
      },
    });

    // Secret returned ONCE at creation — not re-retrievable. Customer must store it.
    return { id: endpoint.id, url: endpoint.url, events: endpoint.events, secret };
  }

  async listEndpoints(organizationId: string): Promise<EndpointListItem[]> {
    const endpoints = await this.db.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    // Secret is never returned in list responses.
    return endpoints.map((e) => ({
      id: e.id,
      url: e.url,
      events: e.events,
      enabled: e.enabled,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }

  async updateEndpoint(
    endpointId: string,
    organizationId: string,
    patch: { url?: string; events?: WebhookEvent[]; enabled?: boolean },
  ): Promise<EndpointListItem> {
    const existing = await this.db.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId },
    });
    if (!existing) throw new WebhookEndpointNotFoundError();

    if (patch.events) validateEvents(patch.events);

    const updated = await this.db.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        url: patch.url,
        events: patch.events,
        enabled: patch.enabled,
      },
    });

    return {
      id: updated.id,
      url: updated.url,
      events: updated.events,
      enabled: updated.enabled,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteEndpoint(endpointId: string, organizationId: string): Promise<void> {
    const existing = await this.db.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId },
    });
    if (!existing) throw new WebhookEndpointNotFoundError();

    await this.db.webhookEndpoint.delete({ where: { id: endpointId } });
  }

  // ── Event dispatch ───────────────────────────────────────────────────────────

  // Finds all enabled endpoints subscribed to the given event and enqueues a
  // delivery job for each. Each job gets its own stable webhookEventId (UUID).
  // Best-effort: errors from individual enqueue calls are logged, not thrown.
  async dispatchEvent(
    organizationId: string,
    event: WebhookEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.db.webhookEndpoint.findMany({
      where: { organizationId, enabled: true, events: { has: event } },
    });

    if (endpoints.length === 0) return;

    for (const endpoint of endpoints) {
      const webhookEventId = crypto.randomUUID();
      try {
        await this.jobService.send('send-webhook', {
          endpointId: endpoint.id,
          event,
          payload: data,
          attempt: 1,
          webhookEventId,
        });
        this.logger.log(
          `Webhook dispatched: event=${event} endpoint=${endpoint.id} webhookEventId=${webhookEventId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to enqueue webhook job: event=${event} endpoint=${endpoint.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  // ── Used by SendWebhookHandler ───────────────────────────────────────────────

  // Returns the endpoint record including its secret (for signing).
  // Returns null if the endpoint no longer exists.
  async getEndpoint(endpointId: string): Promise<{
    id: string;
    url: string;
    secret: string;
    enabled: boolean;
  } | null> {
    return this.db.webhookEndpoint.findUnique({
      where: { id: endpointId },
      select: { id: true, url: true, secret: true, enabled: true },
    });
  }

  // Replay protection: returns true if a successful delivery already exists for
  // this (endpointId, webhookEventId) pair. Called before each HTTP attempt.
  async isAlreadyDelivered(endpointId: string, webhookEventId: string): Promise<boolean> {
    const existing = await this.db.webhookDeliveryAttempt.findFirst({
      where: { endpointId, webhookEventId, success: true },
    });
    return existing !== null;
  }

  // Record the outcome of a delivery attempt (success or failure).
  async recordDeliveryAttempt(params: {
    endpointId: string;
    webhookEventId: string;
    event: string;
    httpStatus: number | null;
    responseBody: string | null;
    attempt: number;
    success: boolean;
  }): Promise<void> {
    await this.db.webhookDeliveryAttempt.create({
      data: {
        endpointId: params.endpointId,
        webhookEventId: params.webhookEventId,
        event: params.event,
        httpStatus: params.httpStatus,
        responseBody: params.responseBody ? params.responseBody.slice(0, 1000) : null,
        attempt: params.attempt,
        success: params.success,
      },
    });
  }

  // Compute HMAC-SHA256 signature over a raw body string using the endpoint's secret.
  // Header format: X-OfferAccept-Signature: sha256=<hex>
  signPayload(secret: string, body: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  // ── Secret rotation ──────────────────────────────────────────────────────────

  // Generates and stores a new HMAC secret for an existing endpoint.
  // The old secret is immediately invalidated — any in-flight webhook deliveries
  // signed with the old secret will fail the customer's signature verification.
  // The new secret is returned ONCE; the customer must update their handler.
  async rotateSecret(
    endpointId: string,
    organizationId: string,
  ): Promise<{ id: string; secret: string }> {
    const existing = await this.db.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId },
    });
    if (!existing) throw new WebhookEndpointNotFoundError();

    const newSecret = crypto.randomBytes(32).toString('hex');

    await this.db.webhookEndpoint.update({
      where: { id: endpointId },
      data: { secret: newSecret },
    });

    this.logger.log(`Webhook secret rotated: endpoint=${endpointId} org=${organizationId}`);

    // New secret returned ONCE — not re-retrievable. Customer must store it.
    return { id: endpointId, secret: newSecret };
  }

  // ── Test delivery ────────────────────────────────────────────────────────────

  // Enqueues a test.ping event to the specified endpoint (ignores event subscription filter).
  async testEndpoint(endpointId: string, organizationId: string): Promise<void> {
    const existing = await this.db.webhookEndpoint.findFirst({
      where: { id: endpointId, organizationId },
    });
    if (!existing) throw new WebhookEndpointNotFoundError();

    const webhookEventId = crypto.randomUUID();
    await this.jobService.send('send-webhook', {
      endpointId,
      event: 'test.ping',
      payload: { message: 'This is a test event from OfferAccept.' },
      attempt: 1,
      webhookEventId,
    });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EndpointListItem {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function validateEvents(events: string[]): void {
  const invalid = events.filter((e) => !(ALL_WEBHOOK_EVENTS as readonly string[]).includes(e));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid webhook event type(s): ${invalid.join(', ')}. ` +
      `Allowed: ${ALL_WEBHOOK_EVENTS.join(', ')}`,
    );
  }
  if (events.length === 0) {
    throw new Error('At least one event type must be subscribed.');
  }
}
